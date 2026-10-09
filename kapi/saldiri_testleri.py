"""Miselyum Kapısı · savunma doğrulama testleri.

Kendi test örneğini başlatır (127.0.0.1:8771, geçici veri klasörü, ayrı OCPP portları) ve yalnız ona istek gönderir;
asıl Kapı'ya, veritabanına ve demo hesaplarına dokunmaz. Her test bir saldırı isteği gönderir ve beklenen savunmanın
(durum kodu, kural numarası, oturumun silinmesi vb.) gerçekten gerçekleştiğini doğrular. Bazı testlerde olumlu kontrol
de vardır (izinli işlem gerçekten çalışıyor mu), böylece testlerin "her şeyi reddettiği için" geçmediği görülür.

Test örneğinde süreler kısaltılır: boşta kalma 10 sn, kritik işlem için iki adımlı doğrulama tazeliği 2 sn, giriş denemesi
penceresi 6 sn. Kurallar ve sınır sayıları üretimdekiyle aynıdır.

Çalıştırma:  python kapi/saldiri_testleri.py
Çıktı:       js/data/guvenlik-testleri.js (panelde Güvenlik merkezi) ve kapi/TEST-RAPORU.md
"""
import asyncio
import base64
import http.client
import json
import os
import re
import shutil
import sqlite3
import ssl
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime

import websockets

KAPI = os.path.dirname(os.path.abspath(__file__))
KOK = os.path.dirname(KAPI)
sys.path.insert(0, KAPI)
from guvenlik import Totp  # noqa: E402

HEDEF, PORT = '127.0.0.1', 8771                    # sabit: yalnız bu bilgisayardaki test örneği
OCPP = (9180, 9543, 9544)
BOSTA, MFA_SURE, PENCERE = 10, 2, 6
KOKEN = 'http://%s:%d' % (HEDEF, PORT)
VERI = tempfile.mkdtemp(prefix='miselyum-test-')
TESTLER, SONUC = [], []


# ---------------------------------------------------------------- HTTP istemcisi
class Istemci:
    def __init__(self, ua='Miselyum-Test/1.0'):
        self.cerez, self.ua, self.csrf = {}, ua, None

    def istek(self, yontem, yol, govde=None, basliklar=None, ham=None):
        c = http.client.HTTPConnection(HEDEF, PORT, timeout=20)
        h = {'Host': '%s:%d' % (HEDEF, PORT), 'Origin': KOKEN, 'User-Agent': self.ua}
        if self.cerez:
            h['Cookie'] = '; '.join(k + '=' + v for k, v in self.cerez.items())
        if self.csrf:
            h['X-CSRF'] = self.csrf
        veri = None
        if govde is not None:
            veri, h['Content-Type'] = json.dumps(govde).encode(), 'application/json'
        if ham is not None:
            veri = ham
        h.update(basliklar or {})
        h = {k: v for k, v in h.items() if v is not None}
        c.request(yontem, yol, body=veri, headers=h)
        r = c.getresponse()
        b = r.read()
        for sc in r.headers.get_all('Set-Cookie') or []:
            k, v = sc.split(';')[0].split('=', 1)
            if v in ('', '""') or 'Max-Age=0' in sc:
                self.cerez.pop(k, None)
            else:
                self.cerez[k] = v
        try:
            j = json.loads(b)
        except Exception:
            j = None
        return r.status, r.headers, j, b


def hesaplar():
    t = open(os.path.join(VERI, 'demo-hesaplar.txt'), encoding='utf-8').read()
    return dict(re.findall(r'^(\w+)\s+parola: (\S+)', t, re.M))


def totp_sir(ad):
    with sqlite3.connect(os.path.join(VERI, 'miselyum.db')) as c:
        return c.execute('SELECT totp FROM kullanicilar WHERE ad = ?', (ad,)).fetchone()[0]


_girisler = []


def giris_hizi():
    """Test örneği de IP başına PENCERE saniyede 5 giriş denemesine izin verir; testler bu sınıra takılmasın."""
    simdi = time.time()
    while len([t for t in _girisler if simdi - t < PENCERE]) >= 4:
        time.sleep(0.5)
        simdi = time.time()
    _girisler.append(simdi)


_son_kod = {}


def taze_kod(ad, canli=None):
    """Aynı kod ikinci kez kabul edilmez (tekrar oynatma engeli); gerekirse bir sonraki 30 sn'lik kodu bekle."""
    sir = totp_sir(ad)
    while Totp.kod(sir) == _son_kod.get(ad):
        if canli:
            canli.istek('GET', '/api/oturum')
        time.sleep(2)
    _son_kod[ad] = Totp.kod(sir)
    return _son_kod[ad]


_onbellek = {}


def oturum(ad, ua='Miselyum-Test/1.0', yeni=False):
    """Rolün oturumunu döndürür; yeni=False ise hâlâ geçerli olan önceki oturum yeniden kullanılır."""
    if not yeni and ad in _onbellek and _onbellek[ad].istek('GET', '/api/oturum')[0] == 200:
        return _onbellek[ad]
    i = Istemci(ua)
    giris_hizi()
    d, _, j, _ = i.istek('POST', '/api/giris', {'kullanici': ad, 'parola': hesaplar()[ad]})
    if j and j.get('mfa'):
        giris_hizi()
        d, _, j, _ = i.istek('POST', '/api/giris/mfa', {'gecici': j['gecici'], 'kod': taze_kod(ad)})
    if d != 200:
        raise RuntimeError('%s girişi başarısız: %s %s' % (ad, d, j))
    i.csrf = i.istek('GET', '/api/oturum')[2]['csrf']
    if not yeni:
        _onbellek[ad] = i
    return i


def test(grup, ad, beklenen):
    def sar(f):
        TESTLER.append((grup, ad, beklenen, f))
        return f
    return sar


# ================================================================ Başlıklar ve yüzey
@test('basliklar', 'Güvenlik başlıkları', 'CSP, nosniff, DENY, no-referrer, COOP, no-store')
def _():
    _, h, _, _ = Istemci().istek('GET', '/giris.html')
    csp = h.get('Content-Security-Policy', '')
    eksik = [k for k, v in [('X-Content-Type-Options', 'nosniff'), ('X-Frame-Options', 'DENY'), ('Referrer-Policy', 'no-referrer'),
                            ('Cross-Origin-Opener-Policy', 'same-origin'), ('Cache-Control', 'no-store')] if h.get(k) != v]
    ok = not eksik and "object-src 'none'" in csp and "frame-ancestors 'none'" in csp
    return ok, 'tamam' if ok else 'eksik: ' + ', '.join(eksik)


@test('basliklar', 'Sunucu sürüm bilgisi', 'Server başlığında yazılım sürümü yok')
def _():
    s = Istemci().istek('GET', '/giris.html')[1].get('Server', '')
    return not re.search(r'\d+\.\d+', s), s or 'yok'


@test('basliklar', 'Bilinmeyen ana bilgisayar adı (DNS yeniden bağlama)', '421')
def _():
    d = Istemci().istek('GET', '/giris.html', basliklar={'Host': 'saldirgan.example'})[0]
    return d == 421, str(d)


@test('basliklar', 'Kaynak kod ve veritabanı dosyaları', '/kapi/… ve /.git/ sunulmaz (404)')
def _():
    i = Istemci()
    d = [i.istek('GET', y)[0] for y in ('/kapi/veri/miselyum.db', '/kapi/kapi.py', '/.git/config', '/kapi/veri/demo-hesaplar.txt')]
    return all(x == 404 for x in d), ' '.join(map(str, d))


@test('basliklar', 'Yol geçişi', '/js/../kapi/kapi.py ve %2e%2e: WAF 930100 (403)')
def _():
    i = Istemci()
    a, _, j1, _ = i.istek('GET', '/js/../kapi/kapi.py')
    b, _, j2, _ = i.istek('GET', '/js/%2e%2e/kapi/kapi.py')
    ok = a == 403 and b == 403 and '930100' in (j1 or {}).get('kurallar', []) and '930100' in (j2 or {}).get('kurallar', [])
    return ok, '%d %d' % (a, b)


@test('basliklar', 'İzin verilmeyen HTTP yöntemi', 'PUT ve TRACE: 403 (911100)')
def _():
    i = Istemci()
    d = [i.istek(m, '/api/kontroller')[0] for m in ('PUT', 'TRACE')]
    return d == [403, 403], ' '.join(map(str, d))


@test('basliklar', 'Aşırı büyük istek gövdesi', '40 KB gövde: 403 (920400)')
def _():
    d, _, j, _ = Istemci().istek('POST', '/api/giris', ham=b'{"kullanici":"' + b'a' * 40000 + b'"}', basliklar={'Content-Type': 'application/json'})
    return d == 403 and '920400' in (j or {}).get('kurallar', []), str(d)


# ================================================================ Oturum (hayalet oturum)
@test('oturum', 'Oturum çerezinin öznitelikleri', '__Host- öneki, Secure, HttpOnly, SameSite=Strict, Path=/')
def _():
    i = Istemci()
    giris_hizi()
    c = http.client.HTTPConnection(HEDEF, PORT, timeout=20)
    c.request('POST', '/api/giris', body=json.dumps({'kullanici': 'izleyici', 'parola': hesaplar()['izleyici']}),
              headers={'Host': '%s:%d' % (HEDEF, PORT), 'Origin': KOKEN, 'Content-Type': 'application/json', 'User-Agent': i.ua})
    r = c.getresponse()
    r.read()
    sc = r.headers.get('Set-Cookie', '')
    ok = sc.startswith('__Host-miselyum=') and all(x in sc for x in ('Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/')) and 'Domain' not in sc
    return ok, 'tamam' if ok else sc[:80]


@test('oturum', 'Girişsiz API ve sayfa erişimi', 'API 401, sayfa giriş ekranına yönlenir (302)')
def _():
    i = Istemci()
    a = i.istek('GET', '/api/oturum')[0]
    b, h, _, _ = i.istek('GET', '/baslat.html')
    return a == 401 and b == 302 and h.get('Location', '').endswith('/giris.html'), '%d %d' % (a, b)


@test('oturum', 'Uydurma oturum kimliği', '401')
def _():
    i = Istemci()
    i.cerez['__Host-miselyum'] = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('=')
    d = i.istek('GET', '/api/oturum')[0]
    return d == 401, str(d)


@test('oturum', 'Oturum sabitleme', 'Her girişte yeni oturum kimliği verilir')
def _():
    a, b = oturum('izleyici', yeni=True), oturum('izleyici', yeni=True)
    ok = a.cerez['__Host-miselyum'] != b.cerez['__Host-miselyum']
    return ok, 'kimlikler farklı' if ok else 'aynı kimlik'


@test('oturum', 'Çalınan çerez başka tarayıcıda', 'Tarayıcı imzası değişince 401 ve oturum silinir')
def _():
    a = oturum('izleyici', yeni=True)
    b = Istemci('SaldirganTarayici/9.9')
    b.cerez = dict(a.cerez)
    d1 = b.istek('GET', '/api/oturum')[0]
    d2 = a.istek('GET', '/api/oturum')[0]       # asıl sahibinde de artık geçersiz
    return d1 == 401 and d2 == 401, '%d %d' % (d1, d2)


@test('oturum', 'Çıkıştan sonra eski çerez', 'Çıkış oturumu sunucudan siler: eski çerez 401')
def _():
    a = oturum('izleyici', yeni=True)
    eski = dict(a.cerez)
    a.istek('POST', '/api/cikis', {})
    b = Istemci()
    b.cerez = eski
    d = b.istek('GET', '/api/oturum')[0]
    return d == 401, str(d)


@test('oturum', 'Eş zamanlı oturum sınırı', 'Üçüncü girişte en eski oturum kapanır (en fazla 2)')
def _():
    a, b, c = oturum('izleyici', yeni=True), oturum('izleyici', yeni=True), oturum('izleyici', yeni=True)
    d = [x.istek('GET', '/api/oturum')[0] for x in (a, b, c)]
    return d == [401, 200, 200], ' '.join(map(str, d))


@test('oturum', 'Boşta kalan oturum', '%d sn işlemsiz kalınca 401 (üretimde 15 dk)' % BOSTA)
def _():
    a = oturum('izleyici', yeni=True)
    time.sleep(BOSTA + 1.5)
    d = a.istek('GET', '/api/oturum')[0]
    return d == 401, str(d)


@test('oturum', 'Yöneticinin oturum kapatması', 'Kapatılan oturumun çerezi hemen 401 olur')
def _():
    hedef = oturum('analist', yeni=True)
    yon = oturum('yonetici')
    kisa = hedef.cerez['__Host-miselyum'][:8]
    d1 = yon.istek('DELETE', '/api/oturumlar/' + kisa)[0]
    d2 = hedef.istek('GET', '/api/oturum')[0]
    return d1 == 200 and d2 == 401, '%d %d' % (d1, d2)


# ================================================================ Yetki yükseltme ve kiracı ayrımı
@test('yetki', 'İzleyici önlem değiştirir', '403 (rol izleyici)')
def _():
    i = oturum('izleyici')
    d = i.istek('POST', '/api/kontroller', {'sirket': 'akimyolu', 'anahtarlar': ['edr']})[0]
    return d == 403, str(d)


@test('yetki', 'İzleyici gövdeye rol yazar', '{"rol":"yonetici"} yok sayılır: 403')
def _():
    i = oturum('izleyici')
    d = i.istek('POST', '/api/kontroller', {'sirket': 'akimyolu', 'anahtarlar': ['edr'], 'rol': 'yonetici', 'yetkiler': ['kontrol_degistir']})[0]
    return d == 403, str(d)


@test('yetki', 'İzleyici senaryo çalıştırır', '403')
def _():
    d = oturum('izleyici').istek('POST', '/api/senaryo', {'sirket': 'akimyolu', 'id': 'csms'})[0]
    return d == 403, str(d)


@test('yetki', 'İzleyici denetim kaydını okur', '403')
def _():
    d = oturum('izleyici').istek('GET', '/api/denetim')[0]
    return d == 403, str(d)


@test('yetki', 'Analist yetkisiz şirketin verisini okur', 'Kıvılcım önlemleri: 403')
def _():
    d = oturum('analist').istek('GET', '/api/kontroller?sirket=kivilcim')[0]
    return d == 403, str(d)


@test('yetki', 'Analist yetkisiz şirketin paketini indirir', '/js/tenants/kivilcim.js: 403 (izleyicide 200)')
def _():
    a = oturum('analist').istek('GET', '/js/tenants/kivilcim.js')[0]
    b = oturum('izleyici').istek('GET', '/js/tenants/kivilcim.js')[0]
    return a == 403 and b == 200, 'analist %d, izleyici %d' % (a, b)


@test('yetki', 'Analist cihaza komut gönderir', '403 (yalnız yönetici)')
def _():
    d = oturum('analist').istek('POST', '/api/cihaz/komut', {'cp': 'AKY-ANK-01-1', 'komut': 'durdur', 'konnektor': 1})[0]
    return d == 403, str(d)


@test('yetki', 'Olumlu kontrol: analist kendi şirketinde', 'Akımyolu önlemleri: 200')
def _():
    d = oturum('analist').istek('POST', '/api/kontroller', {'sirket': 'akimyolu', 'anahtarlar': ['edr', 'backup']})[0]
    return d == 200, str(d)


@test('yetki', 'Kritik işlemde yeniden doğrulama', 'Süre geçince 401 mfa_gerekli; kodla doğrulayınca izin')
def _():
    y = oturum('yonetici')
    time.sleep(MFA_SURE + 1)
    g = {'cp': 'AKY-ANK-01-1', 'komut': 'hizmette', 'konnektor': 1}
    d1, _, j1, _ = y.istek('POST', '/api/cihaz/komut', g)
    d2 = y.istek('POST', '/api/mfa', {'kod': taze_kod('yonetici', y)})[0]
    d3, _, j3, _ = y.istek('POST', '/api/cihaz/komut', g)
    ok = d1 == 401 and (j1 or {}).get('mfa_gerekli') and d2 == 200 and d3 == 200
    return ok, '%d → mfa %d → %d (%s)' % (d1, d2, d3, (j3 or {}).get('sonuc'))


@test('yetki', 'İki adımlı kodun tekrar kullanımı', 'Aynı kod ikinci kez: 401')
def _():
    y = oturum('yonetici')
    d = y.istek('POST', '/api/mfa', {'kod': _son_kod['yonetici']})[0]
    return d == 401, str(d)


# ================================================================ CSRF
@test('csrf', 'X-CSRF belirteci olmadan', '403')
def _():
    i = oturum('analist', yeni=True)   # önbellekteki oturumun belirtecini bozmamak için ayrı oturum
    i.csrf = None
    d = i.istek('POST', '/api/kontroller', {'sirket': 'akimyolu', 'anahtarlar': []})[0]
    return d == 403, str(d)


@test('csrf', 'Başka siteden gelen istek', 'Origin: https://saldirgan.example → 403')
def _():
    i = oturum('analist')
    d = i.istek('POST', '/api/kontroller', {'sirket': 'akimyolu', 'anahtarlar': []}, basliklar={'Origin': 'https://saldirgan.example'})[0]
    return d == 403, str(d)


@test('csrf', 'Başka siteden giriş denemesi', 'Giriş isteğinde yabancı Origin: 403')
def _():
    d = Istemci().istek('POST', '/api/giris', {'kullanici': 'izleyici', 'parola': 'x'}, basliklar={'Origin': 'https://saldirgan.example'})[0]
    return d == 403, str(d)


# ================================================================ XSS
@test('xss', 'CSP betik kaynağı', "script-src'te 'unsafe-inline' ve 'unsafe-eval' yok")
def _():
    csp = Istemci().istek('GET', '/giris.html')[1].get('Content-Security-Policy', '')
    m = re.search(r"script-src ([^;]*)", csp)
    ok = m and "'unsafe-inline'" not in m.group(1) and "'unsafe-eval'" not in m.group(1)
    return bool(ok), m.group(1) if m else 'yok'


@test('xss', 'Satır içi betik', 'Giriş, panel ve rehber sayfalarında satır içi <script> yok')
def _():
    i = oturum('izleyici')
    sayfalar = [Istemci().istek('GET', '/giris.html')[3], i.istek('GET', '/baslat.html')[3], i.istek('GET', '/rehber.html')[3]]
    satir_ici = sum(len(re.findall(rb'<script(?![^>]*\ssrc=)[^>]*>', s)) for s in sayfalar)
    return satir_ici == 0, '%d satır içi betik' % satir_ici


@test('xss', 'Betik etiketi gövdede', '<script> içeren istek: WAF 941100 (403)')
def _():
    d, _, j, _ = oturum('analist').istek('POST', '/api/senaryo', {'sirket': 'akimyolu', 'id': '<script>fetch("//x")</script>'})
    return d == 403 and '941100' in (j or {}).get('kurallar', []), str(d)


@test('xss', 'Olay özniteliği kullanıcı adında', '<img onerror> ile giriş: WAF 941110 (403)')
def _():
    d, _, j, _ = Istemci().istek('POST', '/api/giris', {'kullanici': '<img src=x onerror=alert(1)>', 'parola': 'x'})
    return d == 403 and '941110' in (j or {}).get('kurallar', []), str(d)


# ================================================================ SQL enjeksiyonu
@test('sqli', 'Mantık ifadesi', "q=' OR 1=1 -- : WAF 942110 (403)")
def _():
    d, _, j, _ = oturum('yonetici').istek('GET', '/api/denetim?q=%27%20OR%201%3D1%20--')
    return d == 403 and '942110' in (j or {}).get('kurallar', []), '%d %s' % (d, (j or {}).get('kurallar'))


@test('sqli', 'UNION ile veri çekme', 'q=1 UNION SELECT parola FROM kullanicilar: WAF 942100 (403)')
def _():
    d, _, j, _ = oturum('yonetici').istek('GET', '/api/denetim?q=1%20UNION%20SELECT%20parola%20FROM%20kullanicilar')
    return d == 403 and '942100' in (j or {}).get('kurallar', []), str(d)


@test('sqli', 'WAF\'ı atlatan girdi', "q=x' OR 'a'<>'b: 200 ama 0 kayıt (parametreli sorgu); boş aramada kayıt var")
def _():
    y = oturum('yonetici')
    d1, _, j1, _ = y.istek('GET', '/api/denetim?q=x%27%20OR%20%27a%27%3C%3E%27b')
    d2, _, j2, _ = y.istek('GET', '/api/denetim?q=')
    n1, n2 = len((j1 or {}).get('kayitlar', [])), len((j2 or {}).get('kayitlar', []))
    return d1 == 200 and n1 == 0 and n2 > 0, '%d kayıt (boş aramada %d)' % (n1, n2)


@test('sqli', 'Giriş formunda SQL', "kullanıcı adı yonetici'-- ile giriş: 401, oturum açılmaz")
def _():
    i = Istemci()
    giris_hizi()
    d = i.istek('POST', '/api/giris', {'kullanici': "yonetici'--", 'parola': 'x'})[0]
    return d == 401 and '__Host-miselyum' not in i.cerez, str(d)


@test('sqli', 'Şirket parametresinde SQL', "sirket=akimyolu' OR '1'='1: 403")
def _():
    d = oturum('analist').istek('GET', '/api/kontroller?sirket=akimyolu%27%20OR%20%271%27%3D%271')[0]
    return d == 403, str(d)


# ================================================================ SSRF
def onizle(url):
    import urllib.parse
    return oturum('izleyici').istek('GET', '/api/onizleme?url=' + urllib.parse.quote(url, safe=''))


@test('ssrf', 'Bulut meta veri adresi', 'http://169.254.169.254/: WAF 931100 (403)')
def _():
    d, _, j, _ = onizle('http://169.254.169.254/latest/meta-data/')
    return d == 403 and '931100' in (j or {}).get('kurallar', []), str(d)


@test('ssrf', 'Kapı\'nın kendi iç adresi', 'https://127.0.0.1:…/api/denetim: 403')
def _():
    d = onizle('https://127.0.0.1:%d/api/denetim' % PORT)[0]
    return d == 403, str(d)


@test('ssrf', 'Yerel dosya', 'file:///C:/Windows/win.ini: 403')
def _():
    d = onizle('file:///C:/Windows/win.ini')[0]
    return d == 403, str(d)


@test('ssrf', 'Kullanıcı bilgisi hilesi', 'https://www.epdk.gov.tr@127.0.0.1/: 400 (gerçek ana bilgisayar 127.0.0.1)')
def _():
    d, _, j, _ = onizle('https://www.epdk.gov.tr@127.0.0.1/')
    return d == 400, '%d %s' % (d, (j or {}).get('hata', ''))


@test('ssrf', 'Benzer alan adı hilesi', 'https://www.epdk.gov.tr.saldirgan.example/: 400')
def _():
    d = onizle('https://www.epdk.gov.tr.saldirgan.example/')[0]
    return d == 400, str(d)


@test('ssrf', 'Şifresiz ya da farklı port', 'http:// ve :8443: 400')
def _():
    a, b = onizle('http://www.epdk.gov.tr/')[0], onizle('https://www.epdk.gov.tr:8443/')[0]
    return a == 400 and b == 400, '%d %d' % (a, b)


@test('ssrf', 'Olumlu kontrol: izinli adres', 'https://www.epdk.gov.tr/: 200 (internet gerekir)')
def _():
    d, _, j, _ = onizle('https://www.epdk.gov.tr/')
    if d == 502:
        return None, 'atlandı: internete ulaşılamadı'
    return d == 200, '%d %s' % (d, (j or {}).get('baslik', '')[:40])


# ================================================================ OCPP cihaz kimliği
def cihaz_parolasi(k):
    return json.load(open(os.path.join(VERI, 'cihaz-parolalari.json'), encoding='utf-8'))[k]


def ocpp_dene(profil, kimlik, parola=None, sertifika=None):
    async def calis():
        ek = {}
        if parola is not None:
            ek['Authorization'] = 'Basic ' + base64.b64encode((kimlik + ':' + parola).encode()).decode()
        tls = None
        if profil >= 2:
            tls = ssl.create_default_context(cafile=os.path.join(VERI, 'sertifikalar', 'ca.pem'))
            if sertifika:
                s = os.path.join(VERI, 'sertifikalar', 'cihaz-' + sertifika)
                tls.load_cert_chain(s + '.pem', s + '-anahtar.pem')
        url = ('ws' if profil == 1 else 'wss') + '://127.0.0.1:%d/ocpp/%s' % (OCPP[profil - 1], kimlik)
        try:
            async with websockets.connect(url, subprotocols=['ocpp1.6'], additional_headers=ek, ssl=tls, open_timeout=8):
                return 'bağlandı'
        except websockets.exceptions.InvalidStatus as e:
            return str(e.response.status_code)
        except Exception as e:
            return 'red: ' + type(e).__name__
    return asyncio.run(calis())


P1_CIHAZ, P3_A, P3_B = 'AKY-ANK-01-1', 'AKY-YOL-01-1', 'AKY-YOL-01-2'


@test('ocpp', 'Olumlu kontrol: doğru parola', 'Profil 1, cihazın kendi parolası: bağlanır')
def _():
    r = ocpp_dene(1, P1_CIHAZ, cihaz_parolasi(P1_CIHAZ))
    return r == 'bağlandı', r


@test('ocpp', 'Yanlış cihaz parolası', 'Profil 1: 401')
def _():
    r = ocpp_dene(1, P1_CIHAZ, 'tahmin-edilen-parola')
    return r == '401', r


@test('ocpp', 'Kayıtsız cihaz kimliği', 'Profil 2, bilinmeyen kimlik: 401')
def _():
    r = ocpp_dene(2, 'AKY-SAHTE-99-9', 'x')
    return r == '401', r


@test('ocpp', 'Kimlik bilgisi olmadan', 'Profil 2, Authorization yok: 401')
def _():
    r = ocpp_dene(2, P1_CIHAZ)
    return r == '401', r


@test('ocpp', 'Sertifikasız Profil 3', 'İstemci sertifikası yok: TLS el sıkışması reddedilir')
def _():
    r = ocpp_dene(3, P3_A)
    return r.startswith('red'), r


@test('ocpp', 'Başka cihazın sertifikası', 'A cihazının sertifikasıyla B olarak bağlanma: 401')
def _():
    r = ocpp_dene(3, P3_B, sertifika=P3_A)
    return r == '401', r


@test('ocpp', 'Olumlu kontrol: kendi sertifikası', 'Profil 3, doğru sertifika: bağlanır')
def _():
    r = ocpp_dene(3, P3_A, sertifika=P3_A)
    return r == 'bağlandı', r


@test('ocpp', 'Profil 1 kapatılınca', '"OCPP güvenlik profili geçişi" açılınca doğru parolayla bile 403')
def _():
    a = oturum('analist')
    d = a.istek('POST', '/api/kontroller', {'sirket': 'akimyolu', 'anahtarlar': ['edr', 'ocpp_tls']})[0]
    r = ocpp_dene(1, P1_CIHAZ, cihaz_parolasi(P1_CIHAZ))
    a.istek('POST', '/api/kontroller', {'sirket': 'akimyolu', 'anahtarlar': ['edr']})
    return d == 200 and r == '403', 'önlem %d, bağlantı %s' % (d, r)


# ================================================================ Seviye 3 ikiz: otomatik karar, fren ve yetki
def sahte_cihaz(kimlik, fw):
    """Profil 3 ile kendi sertifikasıyla bağlanan sahte cihaz: verilen yazılım sürümüyle açılır, merkezin gönderdiği
    ChangeAvailability komutlarını (açılıştan saniye cinsinden) kaydeder."""
    from ocpp.routing import on
    from ocpp.v16 import ChargePoint, call, call_result
    from ocpp.v16.enums import Action, AvailabilityStatus, ConfigurationStatus
    gelen = []

    class Sahte(ChargePoint):
        @on(Action.change_availability)
        async def kullanilabilirlik(self, connector_id, type, **kw):
            gelen.append((time.perf_counter(), connector_id, str(getattr(type, 'value', type))))
            return call_result.ChangeAvailability(status=AvailabilityStatus.accepted)

        @on(Action.change_configuration)
        async def yapilandir(self, key, value, **kw):
            return call_result.ChangeConfiguration(status=ConfigurationStatus.accepted)

    async def calis():
        tls = ssl.create_default_context(cafile=os.path.join(VERI, 'sertifikalar', 'ca.pem'))
        s = os.path.join(VERI, 'sertifikalar', 'cihaz-' + kimlik)
        tls.load_cert_chain(s + '.pem', s + '-anahtar.pem')
        async with websockets.connect('wss://127.0.0.1:%d/ocpp/%s' % (OCPP[2], kimlik), subprotocols=['ocpp1.6'], ssl=tls, open_timeout=8) as ws:
            c = Sahte(kimlik, ws)
            dinle = asyncio.ensure_future(c.start())
            t0 = time.perf_counter()
            await c.call(call.BootNotification(charge_point_vendor='Üretici D', charge_point_model='DC180-D', firmware_version=fw))
            for _ in range(40):
                if gelen:
                    break
                await asyncio.sleep(0.1)
            await asyncio.sleep(0.8)       # yapılandırma eşitlemesi de yanıtlansın
            dinle.cancel()
            return [(t - t0, k, tip) for t, k, tip in gelen]
    return asyncio.run(calis())


def kritik(i, yol, govde):
    """Kritik istek: iki adımlı doğrulama bayatsa taze kodla doğrulayıp bir kez yineler."""
    d, h, j, b = i.istek('POST', yol, govde)
    if d == 401 and (j or {}).get('mfa_gerekli'):
        i.istek('POST', '/api/mfa', {'kod': taze_kod('yonetici', i)})
        d, h, j, b = i.istek('POST', yol, govde)
    return d, j


@test('ikiz', 'Onaysız yazılımla açılan cihaz', 'Onaylı 3.2.0 yerine 3.2.0+mod ile açılış: ikiz 4 sn içinde ChangeAvailability(0, Inoperative) gönderir')
def _():
    g = sahte_cihaz(P3_A, '3.2.0+mod')
    kar = (oturum('izleyici').istek('GET', '/api/ikiz')[2] or {}).get('ozet', {}).get('karantina', {})
    ok = bool(g) and g[0][1] == 0 and g[0][2] == 'Inoperative' and g[0][0] < 4 and P3_A in kar
    return ok, ('%s ms sonra %s, ikizde karantinada' % (round(g[0][0] * 1000), g[0][2])) if g else 'komut gelmedi'


@test('ikiz', 'Onaylı yazılıma dönünce', 'Aynı cihaz 3.2.0 ile açılınca ikiz karantinayı kaldırır: ChangeAvailability(0, Operative)')
def _():
    g = sahte_cihaz(P3_A, '3.2.0')
    kar = (oturum('izleyici').istek('GET', '/api/ikiz')[2] or {}).get('ozet', {}).get('karantina', {})
    ok = bool(g) and g[0][1] == 0 and g[0][2] == 'Operative' and P3_A not in kar
    return ok, ('%s ms sonra %s' % (round(g[0][0] * 1000), g[0][2])) if g else 'komut gelmedi'


@test('ikiz', 'Toplu komut freni', '"Toplu komut ve yük koruması" açıkken 60 sn içinde 6. cihaza durdurucu komut: 423; önlem kapalıyken geçer')
def _():
    y = oturum('yonetici')
    cihazlar = ['AKY-ANK-%02d-1' % n for n in range(1, 8)]
    kapali = [kritik(y, '/api/cihaz/komut', {'cp': cp, 'komut': 'hizmet_disi', 'konnektor': 1})[0] for cp in cihazlar[:6]]
    # Analist oturumu iki adımlı kod beklenirken boşta kapanmış olabilir: her adımda geçerli oturum alınır
    acildi = oturum('analist').istek('POST', '/api/kontroller', {'sirket': 'akimyolu', 'anahtarlar': ['edr', 'load_guard']})[0]
    d, j = kritik(y, '/api/cihaz/komut', {'cp': cihazlar[6], 'komut': 'hizmet_disi', 'konnektor': 1})
    oturum('analist').istek('POST', '/api/kontroller', {'sirket': 'akimyolu', 'anahtarlar': ['edr']})
    ok = kapali == [200] * 6 and acildi == 200 and d == 423 and (j or {}).get('fren')
    return ok, 'önlem kapalı: 6 × %s · önlem açık (%d): %d' % ('/'.join(sorted(set(map(str, kapali)))), acildi, d)


@test('ikiz', 'Geçersiz şebeke talebi', 'Yönetici yükü %90 kısmak ister: 400 (en çok %50); talep başlamaz')
def _():
    y = oturum('yonetici')
    d, j = kritik(y, '/api/ikiz/talep', {'oran': 0.9, 'sure_dk': 60})
    talep = (y.istek('GET', '/api/ikiz')[2] or {}).get('ozet', {}).get('talep')
    return d == 400 and talep is None, '%d · %s' % (d, (j or {}).get('hata', '')[:48])


@test('ikiz', 'Şebeke talebi yetkisi', 'Analist rolüyle şebeke talebi: 403 (yalnız yönetici)')
def _():
    d = oturum('analist').istek('POST', '/api/ikiz/talep', {'oran': 0.3, 'sure_dk': 60})[0]
    return d == 403, str(d)


@test('ikiz', 'Tatbikat yetkisi', 'İzleyici rolüyle imzasız yazılım tatbikatı: 403')
def _():
    d = oturum('izleyici').istek('POST', '/api/ikiz/tatbikat', {'cp': P1_CIHAZ})[0]
    return d == 403, str(d)


# ================================================================ Kaba kuvvet ve istek sınırı (en sonda: hesap kilitlenir)
@test('sinir', 'Kullanıcı adı tahmini', 'Olmayan kullanıcı ve yanlış parola: aynı yanıt, yakın süre')
def _():
    def olc(ad):
        giris_hizi()
        t = time.perf_counter()
        d, _, j, _ = Istemci().istek('POST', '/api/giris', {'kullanici': ad, 'parola': 'yanlis-parola'})
        return d, (j or {}).get('hata'), time.perf_counter() - t
    a, b = olc('boyle-biri-yok'), olc('izleyici')
    oran = a[2] / b[2] if b[2] else 0
    ok = a[0] == b[0] == 401 and a[1] == b[1] and 0.5 < oran < 2
    return ok, 'yanıtlar aynı, süre oranı %.2f' % oran


@test('sinir', 'Genel istek seli', '10 sn\'de 300\'ü aşan istek: 429')
def _():
    sayac = {'429': 0, 'diger': 0}

    def gonder():
        for _ in range(40):
            d = Istemci().istek('GET', '/giris.html')[0]
            sayac['429' if d == 429 else 'diger'] += 1
    is_ = [threading.Thread(target=gonder) for _ in range(9)]
    [t.start() for t in is_]
    [t.join() for t in is_]
    time.sleep(10.5)    # pencere boşalsın
    return sayac['429'] > 0, '%d istekten %d tanesi 429' % (sum(sayac.values()), sayac['429'])


@test('sinir', 'Parola deneme (IP sınırı)', '%d sn içinde 6. deneme: 429 (üretimde 60 sn)' % PENCERE)
def _():
    time.sleep(PENCERE)
    d = []
    for _ in range(6):
        d.append(Istemci().istek('POST', '/api/giris', {'kullanici': 'analist', 'parola': 'yanlis-parola'})[0])
    return d[:5] == [401] * 5 and d[5] == 429, ' '.join(map(str, d))


@test('sinir', 'Hesap kilidi', '5 hatadan sonra doğru parola bile reddedilir: 423')
def _():
    time.sleep(PENCERE + 0.5)
    d, _, j, _ = Istemci().istek('POST', '/api/giris', {'kullanici': 'analist', 'parola': hesaplar()['analist']})
    return d == 423, '%d %s' % (d, (j or {}).get('hata', ''))


# ================================================================ Çalıştırıcı
def baslat():
    ortam = dict(os.environ, MISELYUM_VERI=VERI, MISELYUM_PORT=str(PORT), MISELYUM_OCPP_PORTLAR=','.join(map(str, OCPP)),
                 MISELYUM_BOSTA=str(BOSTA), MISELYUM_MFA_SURE=str(MFA_SURE), MISELYUM_GIRIS_PENCERE=str(PENCERE), PYTHONIOENCODING='utf-8')
    p = subprocess.Popen([sys.executable, os.path.join(KAPI, 'kapi.py'), '--sanal-yok'], env=ortam,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            http.client.HTTPConnection(HEDEF, PORT, timeout=1).request('GET', '/giris.html', headers={'Host': '%s:%d' % (HEDEF, PORT)})
            return p
        except OSError:
            time.sleep(0.5)
    p.terminate()
    raise SystemExit('Test örneği başlatılamadı')


def yaz(sure):
    gecen = [s for s in SONUC if s['gecti'] is True]
    sayilan = [s for s in SONUC if s['gecti'] is not None]
    tarih = datetime.now().strftime('%d.%m.%Y %H:%M')
    veri = {'tarih': tarih, 'sure': round(sure), 'ozet': {'gecti': len(gecen), 'toplam': len(sayilan), 'atlandi': len(SONUC) - len(sayilan)},
            'ortam': 'Test örneği 127.0.0.1:%d; boşta %d sn, MFA tazeliği %d sn, giriş penceresi %d sn' % (PORT, BOSTA, MFA_SURE, PENCERE),
            'testler': [{**s, 'gecti': bool(s['gecti']) if s['gecti'] is not None else True} for s in SONUC]}
    with open(os.path.join(KOK, 'js', 'data', 'guvenlik-testleri.js'), 'w', encoding='utf-8-sig') as f:
        f.write('/* Saldırı testlerinin son sonucu. kapi/saldiri_testleri.py çalışınca bu dosyayı yeniden yazar. */\n')
        f.write('window.SK.securityTests = ' + json.dumps(veri, ensure_ascii=False, indent=1) + ';\n')
    satir = ['# Miselyum Kapısı · savunma doğrulama testleri', '',
             '%s · %d/%d test geçti%s · %d sn' % (tarih, len(gecen), len(sayilan), ' · %d atlandı' % (len(SONUC) - len(sayilan)) if len(SONUC) != len(sayilan) else '', sure), '',
             veri['ortam'] + '. Kurallar ve sınır sayıları üretimdekiyle aynıdır.', '',
             '| Grup | Saldırı | Beklenen savunma | Sonuç | |', '|---|---|---|---|---|']
    for s in SONUC:
        isaret = '✓' if s['gecti'] else ('–' if s['gecti'] is None else '✗')
        satir.append('| %s | %s | %s | %s | %s |' % (s['grup'], s['ad'], s['beklenen'].replace('|', '/'), s['sonuc'].replace('|', '/'), isaret))
    with open(os.path.join(KAPI, 'TEST-RAPORU.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(satir) + '\n')
    return len(gecen), len(sayilan)


def main():
    t0 = time.time()
    print('Test örneği başlatılıyor (127.0.0.1:%d, geçici veri klasörü)…' % PORT, flush=True)
    p = baslat()
    try:
        for grup, ad, beklenen, f in TESTLER:
            try:
                gecti, sonuc = f()
            except Exception as e:
                gecti, sonuc = False, 'hata: %s %s' % (type(e).__name__, str(e)[:80])
            SONUC.append({'grup': grup, 'ad': ad, 'beklenen': beklenen, 'sonuc': sonuc, 'gecti': gecti})
            print('  %s %-9s %-44s %s' % ('✓' if gecti else ('–' if gecti is None else '✗'), grup, ad[:44], sonuc), flush=True)
    finally:
        p.terminate()
        p.wait(timeout=10)
        shutil.rmtree(VERI, ignore_errors=True)
    g, n = yaz(time.time() - t0)
    print('\n%d/%d test geçti · rapor: kapi/TEST-RAPORU.md · panel: Güvenlik merkezi' % (g, n))
    return 0 if g == n else 1


if __name__ == '__main__':
    sys.exit(main())
