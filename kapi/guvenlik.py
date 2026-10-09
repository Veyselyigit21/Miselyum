"""Miselyum Kapısı · güvenlik çekirdeği.

Bu modül Kapı'nın bütün güvenlik kararlarını tek yerde toplar. Her sınıf bir korumaya karşılık gelir:

  Parola        scrypt ile özet (bellek-yoğun, tuzlu), sabit süreli karşılaştırma        ISO 27001 Ek A 5.17, 8.5
  Totp          RFC 6238 iki adımlı doğrulama kodu                                        8.5
  Oturumlar     sunucuda tutulan oturum; boşta ve mutlak süre, en fazla 2 eş zamanlı,
                girişte yenileme, tarayıcı değişirse iptal (hayalet oturum engeli)      8.5, 5.18
  IstekSiniri   kayan pencere (IP başına) + hesap kilidi (katlanan bekleme)             8.6, 8.16
  Waf           OWASP CRS'ten esinlenen anomali puanlı kurallar (SQLi, XSS, SSRF,
                yol geçişi, komut enjeksiyonu, tarayıcı araçları)                       8.20, 8.23
  guvenli_url   SSRF: yalnız izinli alan adı, yalnız HTTPS, iç ağ adreslerine çıkış yok  8.20, 8.23

Üretimde bu katmanların önüne nginx + ModSecurity (OWASP CRS 4) konur; buradaki WAF ikinci savunma hattıdır.
"""
import base64
import hashlib
import hmac
import ipaddress
import re
import secrets
import socket
import struct
import time
import urllib.parse
from collections import defaultdict, deque


# ---------------------------------------------------------------- Parola
class Parola:
    """scrypt (n=2^14, r=8, p=1): her denemede ~16 MB bellek ister; GPU ile kaba kuvveti pahalılaştırır."""
    N, R, P = 2 ** 14, 8, 1

    @classmethod
    def ozet(cls, parola: str) -> str:
        tuz = secrets.token_bytes(16)
        h = hashlib.scrypt(parola.encode('utf-8'), salt=tuz, n=cls.N, r=cls.R, p=cls.P, dklen=32)
        return 'scrypt$%s$%s' % (base64.b64encode(tuz).decode(), base64.b64encode(h).decode())

    @classmethod
    def dogrula(cls, parola: str, kayit: str | None) -> bool:
        # Kullanıcı yoksa da aynı işi yap: yanıt süresinden kullanıcı adı tahmin edilemesin
        if not kayit:
            kayit = 'scrypt$' + base64.b64encode(b'0' * 16).decode() + '$' + base64.b64encode(b'0' * 32).decode()
        try:
            _, tuz, ozet = kayit.split('$')
            h = hashlib.scrypt(parola.encode('utf-8'), salt=base64.b64decode(tuz), n=cls.N, r=cls.R, p=cls.P, dklen=32)
            return hmac.compare_digest(h, base64.b64decode(ozet))
        except Exception:
            return False


# ---------------------------------------------------------------- İki adımlı doğrulama
class Totp:
    """RFC 6238: 30 saniyelik, 6 haneli kod. Saat kaymasına karşı ±1 pencere kabul edilir; aynı kod ikinci kez kullanılamaz."""

    @staticmethod
    def yeni_sir() -> str:
        return base64.b32encode(secrets.token_bytes(20)).decode().rstrip('=')

    @staticmethod
    def kod(sir: str, zaman: float | None = None) -> str:
        anahtar = base64.b32decode(sir + '=' * (-len(sir) % 8))
        sayac = int((zaman if zaman is not None else time.time()) // 30)
        mac = hmac.new(anahtar, struct.pack('>Q', sayac), hashlib.sha1).digest()
        o = mac[-1] & 0x0F
        return '%06d' % ((struct.unpack('>I', mac[o:o + 4])[0] & 0x7FFFFFFF) % 1_000_000)

    _kullanilan: dict[str, float] = {}

    @classmethod
    def dogrula(cls, sir: str, kod: str, kimlik: str) -> bool:
        kod = (kod or '').strip()
        if not re.fullmatch(r'\d{6}', kod):
            return False
        simdi = time.time()
        for kayma in (-30, 0, 30):
            if hmac.compare_digest(cls.kod(sir, simdi + kayma), kod):
                anahtar = kimlik + ':' + kod
                if anahtar in cls._kullanilan:   # tekrar oynatma engeli
                    return False
                cls._kullanilan[anahtar] = simdi
                for k in [k for k, t in cls._kullanilan.items() if simdi - t > 120]:
                    del cls._kullanilan[k]
                return True
        return False


# ---------------------------------------------------------------- Oturumlar (hayalet oturum engeli)
class Oturumlar:
    """Oturum kimliği yalnız sunucuda anlamlıdır (256 bit rastgele). Tarayıcıya giden çerez:
       __Host-miselyum; Secure; HttpOnly; SameSite=Strict; Path=/
       Kurallar: boşta kalma 15 dk, mutlak 8 sa, kullanıcı başına en fazla 2 oturum (en eskisi kapanır),
       girişte her zaman yeni kimlik (oturum sabitleme engeli), tarayıcı imzası değişirse oturum iptal,
       çıkış / parola / rol değişikliğinde kullanıcının bütün oturumları silinir."""
    CEREZ = '__Host-miselyum'

    def __init__(self, bosta=15 * 60, mutlak=8 * 3600, en_fazla=2):
        self.bosta, self.mutlak, self.en_fazla = bosta, mutlak, en_fazla
        self._o: dict[str, dict] = {}

    @staticmethod
    def _imza(ua: str) -> str:
        return hashlib.sha256((ua or '').encode()).hexdigest()[:16]

    def ac(self, kullanici: dict, ua: str, ip: str) -> tuple[str, list[str]]:
        kapanan = []
        kendi = sorted((s for s in self._o.values() if s['kullanici'] == kullanici['ad']), key=lambda s: s['acilis'])
        while len(kendi) >= self.en_fazla:
            eski = kendi.pop(0)
            self._o.pop(eski['id'], None)
            kapanan.append(eski['id'][:8])
        sid = secrets.token_urlsafe(32)
        simdi = time.time()
        self._o[sid] = {'id': sid, 'kullanici': kullanici['ad'], 'rol': kullanici['rol'], 'sirketler': kullanici['sirketler'],
                        'acilis': simdi, 'son': simdi, 'csrf': secrets.token_urlsafe(24), 'ua': self._imza(ua), 'ip': ip,
                        'mfa': simdi if kullanici.get('mfa_yapildi') else 0, 'tarayici': (ua or '')[:80]}
        return sid, kapanan

    def getir(self, sid: str | None, ua: str) -> tuple[dict | None, str]:
        """Oturumu doğrular ve günceller. İkinci değer reddetme nedenidir."""
        if not sid or sid not in self._o:
            return None, 'oturum yok'
        s = self._o[sid]
        simdi = time.time()
        if simdi - s['son'] > self.bosta:
            del self._o[sid]
            return None, 'boşta kalma süresi doldu'
        if simdi - s['acilis'] > self.mutlak:
            del self._o[sid]
            return None, 'mutlak süre doldu'
        if s['ua'] != self._imza(ua):
            del self._o[sid]   # çalınmış çerez başka tarayıcıda kullanılıyor olabilir
            return None, 'tarayıcı imzası değişti'
        s['son'] = simdi
        return s, ''

    def kapat(self, sid: str) -> bool:
        return self._o.pop(sid, None) is not None

    def kullanicinin_hepsini_kapat(self, ad: str) -> int:
        ids = [k for k, s in self._o.items() if s['kullanici'] == ad]
        for k in ids:
            del self._o[k]
        return len(ids)

    def listele(self, ad: str | None = None) -> list[dict]:
        simdi = time.time()
        out = []
        for s in self._o.values():
            if ad and s['kullanici'] != ad:
                continue
            out.append({'kisa': s['id'][:8], 'kullanici': s['kullanici'], 'rol': s['rol'], 'ip': s['ip'], 'tarayici': s['tarayici'],
                        'acilis': int(s['acilis']), 'bosta_sn': int(simdi - s['son']), 'kalan_sn': int(self.bosta - (simdi - s['son']))})
        return sorted(out, key=lambda x: x['acilis'])

    def kisa_ile_kapat(self, kisa: str, ad: str | None = None) -> bool:
        for k, s in list(self._o.items()):
            if k[:8] == kisa and (ad is None or s['kullanici'] == ad):
                del self._o[k]
                return True
        return False

    def temizle(self) -> int:
        simdi = time.time()
        ids = [k for k, s in self._o.items() if simdi - s['son'] > self.bosta or simdi - s['acilis'] > self.mutlak]
        for k in ids:
            del self._o[k]
        return len(ids)

    def sayi(self) -> int:
        return len(self._o)


# ---------------------------------------------------------------- İstek sınırı ve hesap kilidi
class IstekSiniri:
    """Kayan pencere: anahtar (ör. 'giris:127.0.0.1') başına süre içinde en fazla N istek.
       Hesap kilidi: 5 hatalı girişten sonra 15 dk; her yeni kilitte süre ikiye katlanır."""

    def __init__(self):
        self._p: dict[str, deque] = defaultdict(deque)
        self._hata: dict[str, list] = {}
        self.engellenen = 0

    def izin(self, anahtar: str, sinir: int, pencere: float) -> tuple[bool, int]:
        simdi = time.time()
        q = self._p[anahtar]
        while q and simdi - q[0] > pencere:
            q.popleft()
        if len(q) >= sinir:
            self.engellenen += 1
            return False, int(pencere - (simdi - q[0])) + 1
        q.append(simdi)
        return True, 0

    def kilitli(self, hesap: str) -> int:
        k = self._hata.get(hesap)
        if not k or not k[1]:
            return 0
        kalan = int(k[1] - time.time())
        return kalan if kalan > 0 else 0

    def hatali(self, hesap: str) -> int:
        k = self._hata.setdefault(hesap, [0, 0, 0])   # hata sayısı, kilit bitişi, kilit sayısı
        k[0] += 1
        if k[0] >= 5:
            k[2] += 1
            k[1] = time.time() + 15 * 60 * (2 ** (k[2] - 1))
            k[0] = 0
            return int(k[1] - time.time())
        return 0

    def basarili(self, hesap: str):
        if hesap in self._hata:
            self._hata[hesap][0] = 0
            self._hata[hesap][1] = 0


# ---------------------------------------------------------------- WAF (uygulama içi, ikinci savunma hattı)
class Waf:
    """Her kural bir puan verir; toplam 5 ve üzeriyse istek 403 ile reddedilir (OWASP CRS anomali puanlama mantığı)."""
    KURALLAR = [
        ('942100', 'SQL enjeksiyonu: UNION/SELECT', 5, re.compile(r"(?i)\bunion\b[\s\S]{0,40}\bselect\b|\bselect\b[\s\S]{0,40}\bfrom\b")),
        ('942110', 'SQL enjeksiyonu: mantık ifadesi', 5, re.compile(r"(?i)['\"]\s*(or|and)\s*['\"\d][\s\S]{0,20}(=|like)|\bor\s+1\s*=\s*1\b")),
        ('942120', 'SQL enjeksiyonu: yorum veya zaman', 5, re.compile(r"(?i)(--|#|/\*)\s*$|\bsleep\s*\(|\bbenchmark\s*\(|\bwaitfor\s+delay\b|;\s*drop\s+table")),
        ('941100', 'XSS: betik etiketi', 5, re.compile(r"(?i)<\s*script\b|<\s*/\s*script\s*>")),
        ('941110', 'XSS: olay özniteliği veya javascript:', 5, re.compile(r"(?i)\bon(error|load|click|mouseover|focus)\s*=|javascript\s*:|<\s*(img|svg|iframe)\b[^>]*>")),
        ('930100', 'Yol geçişi', 5, re.compile(r"(\.\./|\.\.\\|%2e%2e|%252e)", re.I)),
        ('931100', 'SSRF: iç ağ veya meta veri adresi', 5, re.compile(r"(?i)(https?|gopher|file|dict)://(127\.|0\.0\.0\.0|localhost|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?)|file://")),
        ('932100', 'Komut enjeksiyonu', 5, re.compile(r"(?i)[;&|`]\s*(cat|ls|whoami|id|curl|wget|powershell|cmd)\b|\$\(.*\)")),
        ('913100', 'Tarama aracı', 5, re.compile(r"(?i)sqlmap|nikto|nessus|acunetix|dirbuster|wpscan")),
    ]
    YONTEMLER = {'GET', 'POST', 'DELETE', 'HEAD'}
    EN_BUYUK_GOVDE = 32 * 1024

    def __init__(self):
        self.engellenen = 0
        self.son: deque = deque(maxlen=50)

    def incele(self, yontem: str, yol: str, sorgu: str, govde: str, ua: str) -> tuple[bool, list[tuple[str, str]]]:
        if yontem not in self.YONTEMLER:
            return False, [('911100', 'İzin verilmeyen HTTP yöntemi')]
        if len(govde) > self.EN_BUYUK_GOVDE:
            return False, [('920400', 'İstek gövdesi çok büyük')]
        hedef = ' '.join([urllib.parse.unquote_plus(yol), urllib.parse.unquote_plus(sorgu), govde])
        puan, eslesen = 0, []
        for kimlik, ad, p, rx in self.KURALLAR:
            metin = ua if kimlik == '913100' else hedef
            if rx.search(metin):
                puan += p
                eslesen.append((kimlik, ad))
        if puan >= 5:
            self.engellenen += 1
            self.son.append({'zaman': int(time.time()), 'yol': yol[:80], 'kurallar': [k for k, _ in eslesen]})
            return False, eslesen
        return True, []


# ---------------------------------------------------------------- SSRF koruması
IZINLI_ALANLAR = ('resmigazete.gov.tr', 'epdk.gov.tr', 'openstreetmap.org', 'unece.org', 'iso.org')


def guvenli_url(url: str) -> tuple[str, str]:
    """Sunucunun dışarıya yapacağı çağrıdan önce: yalnız HTTPS, yalnız izinli alan adı, DNS sonucu iç ağ değil.
       Dönüş: (bağlanılacak IP, ana bilgisayar). Bağlantı bu IP'ye sabitlenir (DNS yeniden bağlama engeli), yönlendirme izlenmez."""
    u = urllib.parse.urlsplit(url)
    if u.scheme != 'https':
        raise ValueError('yalnız https')
    host = (u.hostname or '').lower()
    if not host or not any(host == a or host.endswith('.' + a) for a in IZINLI_ALANLAR):
        raise ValueError('alan adı izin listesinde değil')
    if u.port not in (None, 443):
        raise ValueError('yalnız 443 portu')
    adresler = {ai[4][0] for ai in socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)}
    for a in adresler:
        ip = ipaddress.ip_address(a)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise ValueError('iç ağ adresine çıkış yasak')
    return sorted(adresler)[0], host


# ---------------------------------------------------------------- Güvenlik başlıkları
def guvenlik_basliklari(nonce: str | None = None) -> dict[str, str]:
    csp = '; '.join([
        "default-src 'self'",
        "script-src 'self' https://unpkg.com https://cdn.jsdelivr.net",
        # Grafik ve harita kütüphaneleri öğe stillerini doğrudan yazar; betikler tamamen kısıtlı olduğu için risk düşüktür
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://server.arcgisonline.com",
        "connect-src 'self' ws://127.0.0.1:8770 ws://localhost:8770 https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://openrouter.ai http://127.0.0.1:11434 http://localhost:11434",
        "worker-src blob:", "child-src blob:", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'"
    ])
    return {
        'Content-Security-Policy': csp,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Cache-Control': 'no-store',
        # Üretimde (HTTPS) eklenir: Strict-Transport-Security: max-age=63072000; includeSubDomains
    }
