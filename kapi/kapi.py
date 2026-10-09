"""Miselyum Kapısı: Miselyum panelinin önündeki güvenli kapı ve OCPP merkezi (CSMS).

Çalıştırma:   python kapi/kapi.py          (ya da kök klasördeki baslat-miselyum-kapi.bat)
Panel:        http://127.0.0.1:8770        (demo hesapları: kapi/veri/demo-hesaplar.txt)

Ne yapar
  1. Paneli yalnız giriş yapmış kullanıcılara sunar (oturum, rol, şirket yetkisi).
  2. Her isteği sırayla denetler: ana bilgisayar adı → istek sınırı → WAF → oturum → CSRF → rol → şirket yetkisi.
  3. Sanal şarj cihazlarını gerçek OCPP 1.6J ile bağlar: Profil 1 (şifresiz, 9080), Profil 2 (TLS + parola, 9443),
     Profil 3 (karşılıklı TLS sertifikası, 9444). Cihaz olaylarını panele canlı (WebSocket) iletir.
  4. Her güvenlik olayını SQLite denetim kaydına yazar (bütün sorgular parametreli).
  5. Seviye 3 dijital ikiz (ikiz3.py): ikiz sahadan okur, kendisi karar verip cihaza OCPP komutu gönderir ve sonucu
     cihazın sonraki mesajıyla doğrular (kendini onarma, emniyet kilidi, güvenlik karantinası, yük yönetimi, fren).

Ağ yapılandırması (üretim önerisi): Kapı bir DMZ'de, önünde nginx + ModSecurity (OWASP CRS 4) ve TLS 1.3; cihazlar ayrı VLAN
veya özel APN'den yalnız 9443/9444'e erişir; veritabanı ağının internete çıkışı yoktur. Burada hepsi 127.0.0.1'de çalışır.
"""
import asyncio
import base64
import hashlib
import hmac
import html
import http
import json
import os
import re
import secrets
import socket
import sqlite3
import ssl
import subprocess
import sys
import time
from datetime import datetime, timezone

import aiohttp
from aiohttp import web, WSMsgType
from aiohttp.abc import AbstractResolver
import websockets
from ocpp.routing import on
from ocpp.v16 import ChargePoint as OcppCihaz
from ocpp.v16 import call, call_result
from ocpp.v16.enums import Action, AuthorizationStatus, RegistrationStatus

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guvenlik import IstekSiniri, Oturumlar, Parola, Totp, Waf, guvenli_url, guvenlik_basliklari  # noqa: E402
import ikiz3  # noqa: E402
import ikiz_veri  # noqa: E402
import sertifika  # noqa: E402

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERI = os.environ.get('MISELYUM_VERI') or os.path.join(KOK, 'kapi', 'veri')   # testler ayrı klasör kullanır
PORT = int(os.environ.get('MISELYUM_PORT', '8770'))
OCPP_P1, OCPP_P2, OCPP_P3 = (int(p) for p in os.environ.get('MISELYUM_OCPP_PORTLAR', '9080,9443,9444').split(','))
KOKENLER = {'http://127.0.0.1:%d' % PORT, 'http://localhost:%d' % PORT}
HOSTLAR = {'127.0.0.1:%d' % PORT, 'localhost:%d' % PORT}
BOSTA = int(os.environ.get('MISELYUM_BOSTA', str(15 * 60)))   # testlerde kısaltılabilir
MFA_SURE = int(os.environ.get('MISELYUM_MFA_SURE', '300'))     # kritik işlem için iki adımlı doğrulamanın tazeliği (sn)
GIRIS_PENCERE = int(os.environ.get('MISELYUM_GIRIS_PENCERE', '60'))   # giriş denemesi sınırı: bu sürede IP başına 5

ROLLER = {
    'izleyici': {'goruntule'},
    'analist': {'goruntule', 'kontrol_degistir', 'senaryo_calistir'},
    'yonetici': {'goruntule', 'kontrol_degistir', 'senaryo_calistir', 'cihaz_komutu', 'guvenlik_goruntule', 'oturum_yonet', 'denetim_goruntule'}
}
KRITIK = {'cihaz_komutu'}          # son 5 dakikada iki adımlı doğrulama şart
SIRKETLER = {'akimyolu', 'kivilcim'}

# Yalnız bu yollar sunulur (izin listesi); kapi/ klasörü, veritabanı ve sertifikalar asla sunulmaz
STATIK = re.compile(r'^/(baslat\.html|rehber\.html|giris\.html|kapi-oturum\.js|css/[\w.-]+\.css|js/(?:[\w-]+/)*[\w.-]+\.js)$')
HERKESE_ACIK = {'/giris.html', '/css/giris.css', '/js/giris.js'}
TUR = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8'}

oturumlar = Oturumlar(bosta=BOSTA)
sinir = IstekSiniri()
waf = Waf()
bekleyen_mfa: dict[str, dict] = {}


# ================================================================ Veritabanı (bütün sorgular parametreli)
def db():
    c = sqlite3.connect(os.path.join(VERI, 'miselyum.db'))
    c.row_factory = sqlite3.Row
    return c


def kur():
    os.makedirs(VERI, exist_ok=True)
    with db() as c:
        c.executescript('''
          CREATE TABLE IF NOT EXISTS kullanicilar (ad TEXT PRIMARY KEY, ad_soyad TEXT, parola TEXT, rol TEXT, sirketler TEXT, totp TEXT, aktif INTEGER DEFAULT 1);
          CREATE TABLE IF NOT EXISTS denetim (id INTEGER PRIMARY KEY AUTOINCREMENT, zaman INTEGER, kullanici TEXT, ip TEXT, olay TEXT, ayrinti TEXT, sonuc TEXT);
          CREATE TABLE IF NOT EXISTS kontroller (sirket TEXT PRIMARY KEY, anahtarlar TEXT, guncelleyen TEXT, zaman INTEGER);
          CREATE TABLE IF NOT EXISTS cihazlar (kimlik TEXT PRIMARY KEY, parola TEXT, profil INTEGER);
        ''')
        if not c.execute('SELECT 1 FROM kullanicilar LIMIT 1').fetchone():
            hesaplar = [
                ('yonetici', 'Bilgi güvenliği yöneticisi', 'yonetici', ['akimyolu', 'kivilcim'], True),
                ('analist', 'Risk analisti · yalnız Akımyolu', 'analist', ['akimyolu'], False),
                ('izleyici', 'Denetçi · salt okunur', 'izleyici', ['akimyolu', 'kivilcim'], False)
            ]
            satirlar = ['Miselyum Kapısı · demo hesapları (yalnız bu bilgisayardaki demo içindir; gerçek parola kullanmayın)', '']
            for ad, ad_soyad, rol, sirketler, mfa in hesaplar:
                parola = secrets.token_urlsafe(9)
                sir = Totp.yeni_sir() if mfa else None
                c.execute('INSERT INTO kullanicilar (ad, ad_soyad, parola, rol, sirketler, totp) VALUES (?, ?, ?, ?, ?, ?)',
                          (ad, ad_soyad, Parola.ozet(parola), rol, json.dumps(sirketler), sir))
                satirlar.append('%-9s parola: %s   rol: %s   şirketler: %s' % (ad, parola, rol, ', '.join(sirketler)))
                if sir:
                    satirlar.append('          iki adımlı doğrulama anahtarı: %s' % sir)
                    satirlar.append('          kimlik doğrulayıcı uygulamaya ekleyin ya da kod için: python kapi/totp.py')
            with open(os.path.join(VERI, 'demo-hesaplar.txt'), 'w', encoding='utf-8') as f:
                f.write('\n'.join(satirlar) + '\n')
        # Sanal cihaz parolaları (OCPP Profil 1 ve 2 temel kimlik doğrulaması); özetleri veritabanında
        if not c.execute('SELECT 1 FROM cihazlar LIMIT 1').fetchone():
            parolalar = {}
            for u in ikiz_veri.uniteler():
                p = secrets.token_urlsafe(18)
                parolalar[u['kimlik']] = p
                c.execute('INSERT INTO cihazlar (kimlik, parola, profil) VALUES (?, ?, ?)', (u['kimlik'], cihaz_ozet(p), u['profil']))
            with open(os.path.join(VERI, 'cihaz-parolalari.json'), 'w', encoding='utf-8') as f:
                json.dump(parolalar, f)


def cihaz_ozet(parola):
    tuz = secrets.token_bytes(16)
    return base64.b64encode(tuz).decode() + '$' + hashlib.pbkdf2_hmac('sha256', parola.encode(), tuz, 50000).hex()


def cihaz_dogrula(kimlik, parola):
    with db() as c:
        r = c.execute('SELECT parola FROM cihazlar WHERE kimlik = ?', (kimlik,)).fetchone()
    if not r:
        return False
    tuz, ozet = r['parola'].split('$')
    return hmac.compare_digest(hashlib.pbkdf2_hmac('sha256', parola.encode(), base64.b64decode(tuz), 50000).hex(), ozet)


def denetim(kullanici, ip, olay, ayrinti='', sonuc='ok'):
    with db() as c:
        c.execute('INSERT INTO denetim (zaman, kullanici, ip, olay, ayrinti, sonuc) VALUES (?, ?, ?, ?, ?, ?)',
                  (int(time.time()), kullanici or '-', ip or '-', olay, str(ayrinti)[:300], sonuc))


# ================================================================ Yardımcılar
def ip_of(req):
    return req.remote or '-'


def js(veri, durum=200, **ek):
    r = web.json_response(veri, status=durum, dumps=lambda o: json.dumps(o, ensure_ascii=False))
    for k, v in ek.items():
        r.headers[k] = v
    return r


def oturum_al(req):
    sid = req.cookies.get(Oturumlar.CEREZ)
    s, neden = oturumlar.getir(sid, req.headers.get('User-Agent', ''))
    if sid and not s:
        denetim('-', ip_of(req), 'oturum_reddedildi', neden, 'red')
    return s


def yetki(s, eylem):
    return s is not None and eylem in ROLLER.get(s['rol'], set())


# ================================================================ Ara katman: her istek bu sırayla denetlenir
@web.middleware
async def guvenlik_katmani(req, handler):
    ip = ip_of(req)
    # 1) Ana bilgisayar adı (DNS yeniden bağlama saldırısına karşı)
    if req.headers.get('Host') not in HOSTLAR:
        return web.Response(status=421, text='Bilinmeyen ana bilgisayar')
    # 2) Genel istek sınırı (IP başına 10 saniyede 300)
    ok, bekle = sinir.izin('genel:' + ip, 300, 10)
    if not ok:
        denetim('-', ip, 'istek_siniri', 'genel', 'red')
        return js({'hata': 'Çok fazla istek'}, 429, **{'Retry-After': str(bekle)})
    # 3) WAF: yol, sorgu, gövde ve tarayıcı kimliği
    govde = ''
    if req.method == 'POST' and req.can_read_body:
        ham = await req.content.read(Waf.EN_BUYUK_GOVDE + 1)
        govde = ham.decode('utf-8', 'replace')
        req['govde'] = ham
    gecti, kurallar = waf.incele(req.method, req.path, req.query_string, govde, req.headers.get('User-Agent', ''))
    if not gecti:
        denetim('-', ip, 'waf_engelledi', ', '.join(k + ' ' + a for k, a in kurallar) + ' · ' + req.path, 'red')
        return js({'hata': 'İstek güvenlik kuralına takıldı', 'kurallar': [k for k, _ in kurallar]}, 403)
    try:
        resp = await handler(req)
    except web.HTTPException as e:   # yönlendirme ve hata yanıtları da güvenlik başlıklarını alsın
        resp = web.Response(status=e.status, text=e.text if e.status >= 400 else None, headers={k: v for k, v in e.headers.items() if k == 'Location'})
    # 4) Güvenlik başlıkları
    for k, v in guvenlik_basliklari().items():
        resp.headers.setdefault(k, v)
    resp.headers['Server'] = 'Miselyum-Kapi'
    return resp


async def govde_json(req):
    try:
        ham = req.get('govde')
        return json.loads(ham.decode('utf-8')) if ham else {}
    except Exception:
        raise web.HTTPBadRequest(text='Geçersiz JSON')


def csrf_denetle(req, s):
    """Durum değiştiren her istekte: Origin aynı köken olmalı ve X-CSRF başlığı oturumun belirteciyle eşleşmeli."""
    if req.headers.get('Origin') not in KOKENLER:
        return False
    return s is not None and hmac.compare_digest(req.headers.get('X-CSRF', ''), s['csrf'])


# ================================================================ Statik dosyalar (izin listesi + şirket yetkisi)
async def statik(req):
    yol = req.path
    if yol == '/':
        raise web.HTTPFound('/baslat.html')
    if not STATIK.match(yol):
        raise web.HTTPNotFound()
    s = None
    if yol not in HERKESE_ACIK:
        s = oturum_al(req)
        if not s:
            if yol.endswith('.html'):
                raise web.HTTPFound('/giris.html')
            return web.Response(status=401, text='Giriş gerekli')
    if yol == '/kapi-oturum.js':
        bilgi = {'kullanici': s['kullanici'], 'rol': s['rol'], 'sirketler': s['sirketler'], 'csrf': s['csrf'],
                 'yetkiler': sorted(ROLLER[s['rol']]), 'bosta_sn': BOSTA}
        metin = 'window.MISELYUM_OTURUM = ' + json.dumps(bilgi, ensure_ascii=True).replace('<', '\\u003c') + ';\n'
        return web.Response(text=metin, content_type='text/javascript', charset='utf-8')
    # Şirket paketi: yalnız o şirkete yetkili kullanıcıya (kiracılar arası ayrım)
    m = re.match(r'^/js/tenants/([\w-]+)\.js$', yol)
    if m and s and m.group(1) not in s['sirketler']:
        denetim(s['kullanici'], ip_of(req), 'sirket_erisim_reddedildi', m.group(1), 'red')
        return web.Response(status=403, text='Bu şirkete yetkiniz yok')
    dosya = os.path.normpath(os.path.join(KOK, yol.lstrip('/')))
    if not dosya.startswith(KOK + os.sep) or not os.path.isfile(dosya):
        raise web.HTTPNotFound()
    with open(dosya, 'rb') as f:
        veri = f.read()
    r = web.Response(body=veri)
    r.headers['Content-Type'] = TUR[os.path.splitext(dosya)[1]]
    return r


# ================================================================ Giriş, iki adımlı doğrulama, çıkış
GENEL_HATA = 'Kullanıcı adı veya parola hatalı'


async def giris(req):
    ip = ip_of(req)
    if req.headers.get('Origin') not in KOKENLER:
        return js({'hata': 'Geçersiz köken'}, 403)
    ok, bekle = sinir.izin('giris:' + ip, 5, GIRIS_PENCERE)
    if not ok:
        denetim('-', ip, 'istek_siniri', 'giris', 'red')
        return js({'hata': 'Çok fazla deneme. %d saniye sonra tekrar deneyin.' % bekle}, 429, **{'Retry-After': str(bekle)})
    v = await govde_json(req)
    ad = str(v.get('kullanici', ''))[:40].strip().lower()
    parola = str(v.get('parola', ''))[:200]
    kilit = sinir.kilitli(ad)
    if kilit:
        denetim(ad, ip, 'giris_kilitli', '', 'red')
        return js({'hata': 'Hesap geçici olarak kilitli. %d dakika sonra tekrar deneyin.' % (kilit // 60 + 1)}, 423)
    with db() as c:
        r = c.execute('SELECT * FROM kullanicilar WHERE ad = ? AND aktif = 1', (ad,)).fetchone()
    if not Parola.dogrula(parola, r['parola'] if r else None) or not r:
        k = sinir.hatali(ad)
        denetim(ad, ip, 'giris_hatali', 'hesap kilitlendi' if k else '', 'red')
        return js({'hata': GENEL_HATA}, 401)
    sinir.basarili(ad)
    kullanici = {'ad': r['ad'], 'rol': r['rol'], 'sirketler': json.loads(r['sirketler'])}
    if r['totp']:
        gecici = secrets.token_urlsafe(24)
        bekleyen_mfa[gecici] = {'kullanici': kullanici, 'bitis': time.time() + 120, 'deneme': 0, 'sir': r['totp']}
        return js({'mfa': True, 'gecici': gecici})
    return oturum_ac(req, kullanici)


def oturum_ac(req, kullanici):
    sid, kapanan = oturumlar.ac(kullanici, req.headers.get('User-Agent', ''), ip_of(req))
    for k in kapanan:
        denetim(kullanici['ad'], ip_of(req), 'oturum_kapatildi', 'eş zamanlı oturum sınırı: eski oturum ' + k, 'ok')
    denetim(kullanici['ad'], ip_of(req), 'giris_basarili', kullanici['rol'])
    r = js({'ok': True, 'yonlendir': '/baslat.html'})
    r.set_cookie(Oturumlar.CEREZ, sid, secure=True, httponly=True, samesite='Strict', path='/')
    return r


async def giris_mfa(req):
    ip = ip_of(req)
    if req.headers.get('Origin') not in KOKENLER:
        return js({'hata': 'Geçersiz köken'}, 403)
    ok, bekle = sinir.izin('giris:' + ip, 5, GIRIS_PENCERE)
    if not ok:
        return js({'hata': 'Çok fazla deneme. %d saniye sonra tekrar deneyin.' % bekle}, 429, **{'Retry-After': str(bekle)})
    v = await govde_json(req)
    b = bekleyen_mfa.get(str(v.get('gecici', '')))
    if not b or time.time() > b['bitis']:
        return js({'hata': 'Doğrulama süresi doldu, yeniden giriş yapın'}, 401)
    b['deneme'] += 1
    if b['deneme'] > 5:
        bekleyen_mfa.pop(str(v.get('gecici')), None)
        return js({'hata': 'Çok fazla hatalı kod, yeniden giriş yapın'}, 401)
    if not Totp.dogrula(b['sir'], str(v.get('kod', '')), b['kullanici']['ad']):
        denetim(b['kullanici']['ad'], ip, 'mfa_hatali', '', 'red')
        return js({'hata': 'Kod hatalı'}, 401)
    bekleyen_mfa.pop(str(v.get('gecici')), None)
    b['kullanici']['mfa_yapildi'] = True
    return oturum_ac(req, b['kullanici'])


async def cikis(req):
    s = oturum_al(req)
    if s and csrf_denetle(req, s):
        oturumlar.kapat(s['id'])
        denetim(s['kullanici'], ip_of(req), 'cikis')
    r = js({'ok': True})
    r.del_cookie(Oturumlar.CEREZ, path='/')
    return r


# ================================================================ API (rol ve şirket denetimli)
def api(eylem=None, durum_degistirir=False):
    def sar(f):
        async def ic(req):
            s = oturum_al(req)
            if not s:
                return js({'hata': 'Giriş gerekli'}, 401)
            ok, bekle = sinir.izin('api:' + s['id'], 30, 1)
            if not ok:
                return js({'hata': 'Çok fazla istek'}, 429, **{'Retry-After': str(bekle)})
            if durum_degistirir and not csrf_denetle(req, s):
                denetim(s['kullanici'], ip_of(req), 'csrf_reddedildi', req.path, 'red')
                return js({'hata': 'Geçersiz istek kaynağı'}, 403)
            if eylem and not yetki(s, eylem):
                denetim(s['kullanici'], ip_of(req), 'yetki_reddedildi', eylem + ' · rol ' + s['rol'], 'red')
                return js({'hata': 'Bu işlem için yetkiniz yok (' + s['rol'] + ')'}, 403)
            if eylem in KRITIK and time.time() - s['mfa'] > MFA_SURE:
                return js({'hata': 'Bu işlem için iki adımlı doğrulama gerekiyor', 'mfa_gerekli': True}, 401)
            return await f(req, s)
        return ic
    return sar


def sirket_denetle(s, sirket, req):
    if sirket not in SIRKETLER or sirket not in s['sirketler']:
        denetim(s['kullanici'], ip_of(req), 'sirket_erisim_reddedildi', str(sirket)[:20], 'red')
        return False
    return True


@api()
async def oturum_bilgi(req, s):
    return js({'kullanici': s['kullanici'], 'rol': s['rol'], 'sirketler': s['sirketler'], 'csrf': s['csrf'], 'yetkiler': sorted(ROLLER[s['rol']])})


@api()
async def oturum_listesi(req, s):
    hepsi = yetki(s, 'oturum_yonet') and req.query.get('hepsi') == '1'
    return js({'oturumlar': oturumlar.listele(None if hepsi else s['kullanici']), 'kendi': s['id'][:8]})


@api(durum_degistirir=True)
async def oturum_kapat(req, s):
    kisa = req.match_info['kisa'][:8]
    ok = oturumlar.kisa_ile_kapat(kisa, None if yetki(s, 'oturum_yonet') else s['kullanici'])
    denetim(s['kullanici'], ip_of(req), 'oturum_kapatildi', 'elle: ' + kisa, 'ok' if ok else 'red')
    return js({'ok': ok}, 200 if ok else 404)


@api()
async def kontroller_al(req, s):
    sirket = req.query.get('sirket', '')
    if not sirket_denetle(s, sirket, req):
        return js({'hata': 'Bu şirkete yetkiniz yok'}, 403)
    with db() as c:
        r = c.execute('SELECT anahtarlar, guncelleyen, zaman FROM kontroller WHERE sirket = ?', (sirket,)).fetchone()
    return js({'anahtarlar': json.loads(r['anahtarlar']) if r else None, 'guncelleyen': r['guncelleyen'] if r else None})


@api('kontrol_degistir', durum_degistirir=True)
async def kontroller_yaz(req, s):
    v = await govde_json(req)
    sirket = str(v.get('sirket', ''))
    if not sirket_denetle(s, sirket, req):
        return js({'hata': 'Bu şirkete yetkiniz yok'}, 403)
    anahtarlar = v.get('anahtarlar')
    if not isinstance(anahtarlar, list) or len(anahtarlar) > 80 or not all(isinstance(k, str) and re.fullmatch(r'[a-z_]{2,30}', k) for k in anahtarlar):
        return js({'hata': 'Geçersiz önlem listesi'}, 400)
    with db() as c:
        eski = c.execute('SELECT anahtarlar FROM kontroller WHERE sirket = ?', (sirket,)).fetchone()
        c.execute('INSERT INTO kontroller (sirket, anahtarlar, guncelleyen, zaman) VALUES (?, ?, ?, ?) '
                  'ON CONFLICT(sirket) DO UPDATE SET anahtarlar = excluded.anahtarlar, guncelleyen = excluded.guncelleyen, zaman = excluded.zaman',
                  (sirket, json.dumps(sorted(set(anahtarlar))), s['kullanici'], int(time.time())))
    once = set(json.loads(eski['anahtarlar'])) if eski else set()
    fark = sorted(set(anahtarlar) ^ once)
    denetim(s['kullanici'], ip_of(req), 'kontrol_degisti', sirket + ': ' + ', '.join(fark[:12]))
    if sirket == 'akimyolu':
        merkez.profil1_ayarla('ocpp_tls' in anahtarlar)
        eski, merkez.onlemler = merkez.onlemler, set(anahtarlar)
        ikiz.onlemler_degisti(eski, merkez.onlemler)
    return js({'ok': True})


@api('senaryo_calistir', durum_degistirir=True)
async def senaryo(req, s):
    v = await govde_json(req)
    sirket, sid = str(v.get('sirket', '')), str(v.get('id', ''))[:30]
    if not sirket_denetle(s, sirket, req):
        return js({'hata': 'Bu şirkete yetkiniz yok'}, 403)
    denetim(s['kullanici'], ip_of(req), 'senaryo', sirket + ': ' + sid)
    return js({'ok': True})


@api(durum_degistirir=True)
async def mfa_dogrula(req, s):
    v = await govde_json(req)
    with db() as c:
        r = c.execute('SELECT totp FROM kullanicilar WHERE ad = ?', (s['kullanici'],)).fetchone()
    if not r or not r['totp']:
        return js({'hata': 'Bu hesapta iki adımlı doğrulama tanımlı değil'}, 400)
    if not Totp.dogrula(r['totp'], str(v.get('kod', '')), s['kullanici']):
        denetim(s['kullanici'], ip_of(req), 'mfa_hatali', 'yeniden doğrulama', 'red')
        return js({'hata': 'Kod hatalı'}, 401)
    s['mfa'] = time.time()
    denetim(s['kullanici'], ip_of(req), 'mfa_basarili', 'yeniden doğrulama')
    return js({'ok': True})


@api('cihaz_komutu', durum_degistirir=True)
async def cihaz_komutu(req, s):
    v = await govde_json(req)
    cp, komut = str(v.get('cp', ''))[:40], str(v.get('komut', ''))
    try:
        kon = int(v.get('konnektor', 1))
        kw = float(v['kw']) if komut == 'guc_siniri' else None
    except (TypeError, ValueError, KeyError):
        return js({'hata': 'Geçersiz komut'}, 400)
    if komut not in ikiz3.KOMUTLAR or cp not in ikiz.u or not 0 <= kon <= ikiz.u[cp]['soket']:
        return js({'hata': 'Geçersiz komut'}, 400)
    if kw is not None and not 1.4 <= kw <= ikiz.u[cp]['kw']:
        return js({'hata': 'Güç sınırı 1,4 kW ile cihazın anma gücü (%s kW) arasında olmalı' % ikiz3.kw_metin(ikiz.u[cp]['kw'])}, 400)
    fren = ikiz.elle_fren(cp, komut, s['kullanici'])
    if fren:
        denetim(s['kullanici'], ip_of(req), 'toplu_komut_freni', '%s %s/%d' % (komut, cp, kon), 'red')
        return js({'hata': fren, 'fren': True}, 423)
    sonuc, e = await ikiz.elle(cp, kon, komut, kw, s['kullanici'])
    denetim(s['kullanici'], ip_of(req), 'cihaz_komutu', '%s %s/%d → %s' % (komut, cp, kon, sonuc), 'ok' if sonuc == 'Accepted' else 'red')
    return js({'sonuc': sonuc, 'eylem': e['id'] if e else None})


@api()
async def ikiz_durumu(req, s):
    return js({'ozet': ikiz.ozet(), 'eylemler': ikiz.liste()})


@api('cihaz_komutu', durum_degistirir=True)
async def ikiz_talep(req, s):
    """Şebeke talebi (puant): ağ yükünü belirli bir süre istenen oranda düşür. Süre simülasyon dakikasıdır (1 dk = 1 gerçek sn)."""
    v = await govde_json(req)
    if v.get('iptal'):
        ok = ikiz.talep_bitir('yönetici bitirdi')
        denetim(s['kullanici'], ip_of(req), 'sebeke_talebi', 'bitirildi')
        return js({'ok': ok})
    try:
        oran, sure = float(v.get('oran')), int(v.get('sure_dk', 60))
    except (TypeError, ValueError):
        return js({'hata': 'Geçersiz talep'}, 400)
    if not 0.1 <= oran <= 0.5 or not 15 <= sure <= 240:
        return js({'hata': 'Talep oranı %10 ile %50, süre 15 ile 240 dakika arasında olmalı'}, 400)
    e = ikiz.talep_baslat(oran, sure, s['kullanici'])
    t = ikiz.talep
    denetim(s['kullanici'], ip_of(req), 'sebeke_talebi', '%%%d · %d dk · %s kW → %s kW' % (round(oran * 100), sure, ikiz3.kw_metin(t['ag0']), ikiz3.kw_metin(t['hedef'])))
    return js({'ok': True, 'eylem': e['id'], 'hedef': t['hedef'], 'ag0': t['ag0']})


@api('cihaz_komutu', durum_degistirir=True)
async def ikiz_tatbikat(req, s):
    """Kırmızı takım tatbikatı: seçilen sanal cihaza imzasız yazılım paketi gönderilir; önlem ya da ikiz durdurmalı."""
    v = await govde_json(req)
    cp = str(v.get('cp', ''))[:40]
    if cp not in ikiz.u:
        return js({'hata': 'Bilinmeyen cihaz'}, 400)
    denetim(s['kullanici'], ip_of(req), 'tatbikat', 'imzasız yazılım → ' + cp)
    e = await ikiz.tatbikat_baslat(cp, s['kullanici'])
    return js({'sonuc': e['yanit'], 'eylem': e['id']})


@api('denetim_goruntule')
async def denetim_listesi(req, s):
    q = req.query.get('q', '')[:60]
    lim = max(1, min(200, int(req.query.get('limit', '50') or 50)))
    with db() as c:
        # Parametreli LIKE: arama metni asla SQL olarak çalışmaz
        rows = c.execute('SELECT zaman, kullanici, ip, olay, ayrinti, sonuc FROM denetim WHERE olay LIKE ? OR ayrinti LIKE ? OR kullanici LIKE ? '
                         'ORDER BY id DESC LIMIT ?', ('%' + q + '%', '%' + q + '%', '%' + q + '%', lim)).fetchall()
    return js({'kayitlar': [dict(r) for r in rows]})


@api('guvenlik_goruntule')
async def guvenlik_durumu(req, s):
    with db() as c:
        say = {r['olay']: r['n'] for r in c.execute('SELECT olay, COUNT(*) n FROM denetim WHERE zaman > ? GROUP BY olay', (int(time.time()) - 86400,))}
    return js({'oturum': oturumlar.sayi(), 'waf': waf.engellenen, 'waf_son': list(waf.son)[-10:], 'istek_siniri': sinir.engellenen,
               'olaylar_24s': say, 'ocpp': merkez.ozet()})


@api()
async def onizleme(req, s):
    """Kaynak önizleme (ör. Resmî Gazete başlığı). SSRF'ye karşı guvenli_url() ile korunur."""
    url = req.query.get('url', '')[:300]
    try:
        ip, host = await asyncio.get_running_loop().run_in_executor(None, guvenli_url, url)
    except Exception as e:
        denetim(s['kullanici'], ip_of(req), 'ssrf_engellendi', url[:120] + ' · ' + str(e), 'red')
        return js({'hata': 'Adres reddedildi: ' + str(e)}, 400)

    class Sabit(AbstractResolver):
        async def resolve(self, h, port=0, family=socket.AF_INET):
            return [{'hostname': h, 'host': ip, 'port': port, 'family': family, 'proto': 0, 'flags': 0}]

        async def close(self):
            pass

    try:
        async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(resolver=Sabit()), timeout=aiohttp.ClientTimeout(total=6)) as cs:
            async with cs.get(url, allow_redirects=False) as r:
                metin = (await r.content.read(200_000)).decode('utf-8', 'replace')
        m = re.search(r'<title[^>]*>(.*?)</title>', metin, re.S | re.I)
        return js({'durum': r.status, 'baslik': html.unescape(m.group(1).strip())[:200] if m else ''})
    except Exception as e:
        print('[onizleme]', url, repr(e)[:300], flush=True)
        return js({'hata': 'Kaynağa ulaşılamadı: ' + type(e).__name__}, 502)


# ================================================================ Canlı akış (panel ↔ Kapı)
istemciler: set = set()


async def canli(req):
    s = oturum_al(req)
    if not s or req.headers.get('Origin') not in KOKENLER:
        return web.Response(status=401, text='Giriş gerekli')
    ws = web.WebSocketResponse(heartbeat=25)
    await ws.prepare(req)
    ws['oturum'] = s['id']
    istemciler.add(ws)
    await ws.send_str(json.dumps({'t': 'anlik', 'durumlar': merkez.anlik(), 'ozet': merkez.ozet(),
                                  'ikiz': {'ozet': ikiz.ozet(), 'eylemler': ikiz.liste()}}, ensure_ascii=False))
    try:
        async for m in ws:
            if m.type != WSMsgType.TEXT:
                break
            # Panelden gelen tek mesaj türü: canlılık. Oturum hâlâ geçerli mi?
            if ws['oturum'] not in oturumlar._o:
                break
    finally:
        istemciler.discard(ws)
    return ws


async def yayinla(mesaj):
    if not istemciler:
        return
    veri = json.dumps(mesaj, ensure_ascii=False)
    for ws in list(istemciler):
        if ws['oturum'] not in oturumlar._o:    # oturumu kapanan istemciye artık veri gitmez
            await ws.close(code=4401, message=b'oturum kapandi')
            istemciler.discard(ws)
            continue
        try:
            await ws.send_str(veri)
        except Exception:
            istemciler.discard(ws)


# ================================================================ OCPP merkezi (CSMS)
def simdi_iso():
    return datetime.now(timezone.utc).isoformat()


class Merkez:
    def __init__(self):
        self.cihazlar: dict[str, 'Cihaz'] = {}
        self.durum: dict[str, dict] = {}
        self.islem = 5000
        self.profil1_kapali = False
        self.onlemler = set()        # Akımyolu'nda açık önlemler (ikiz bazı kuralları bunlara göre uygular)

    def ozet(self):
        p = {1: 0, 2: 0, 3: 0}
        for c in self.cihazlar.values():
            p[c.profil] += 1
        return {'bagli': len(self.cihazlar), 'profil': p, 'profil1_kapali': self.profil1_kapali}

    def anlik(self):
        return list(self.durum.values())

    def baglandi(self, c):
        eski = self.cihazlar.get(c.id)
        self.cihazlar[c.id] = c
        if eski and eski is not c:
            asyncio.ensure_future(eski._connection.close())
        asyncio.ensure_future(yayinla({'t': 'ozet', 'ozet': self.ozet()}))

    def ayrildi(self, c):
        if self.cihazlar.get(c.id) is c:
            del self.cihazlar[c.id]
            for k in [k for k in self.durum if k.startswith(c.id + '/')]:
                self.durum[k]['s'] = 'Offline'
                asyncio.ensure_future(yayinla({'t': 'durum', **self.durum[k]}))
            asyncio.ensure_future(yayinla({'t': 'ozet', 'ozet': self.ozet()}))

    def kaydet(self, cp, kon, s=None, **ek):
        k = cp + '/' + str(kon)
        d = self.durum.setdefault(k, {'cp': cp, 'k': kon, 's': 'Available', 'kw': 0, 'kwh': 0, 'tx': None})
        if s:
            d['s'] = s
        d.update(ek)
        asyncio.ensure_future(yayinla({'t': 'durum', **d}))

    def gunluk(self, cp, yon, mesaj, tur=''):
        if yon == '→':
            ikiz.okundu()
        asyncio.ensure_future(yayinla({'t': 'log', 'cp': cp, 'd': yon, 'm': mesaj, 'k': tur}))

    def profil1_ayarla(self, kapali):
        if kapali == self.profil1_kapali:
            return
        self.profil1_kapali = kapali
        if kapali:
            # Şifresiz bağlantılar kapatılır; cihazlar TLS'li profile geçmek zorunda kalır
            for c in [c for c in self.cihazlar.values() if c.profil == 1]:
                asyncio.ensure_future(c._connection.close(code=1008, reason='Profil 1 kapatildi'))
            self.gunluk('*', '!', 'OCPP Profil 1 (şifresiz) kapatıldı: cihazlar TLS ile yeniden bağlanıyor', 'ok')
        asyncio.ensure_future(yayinla({'t': 'ozet', 'ozet': self.ozet()}))



merkez = Merkez()
ikiz: ikiz3.Ikiz = None    # ana() kurar


class Cihaz(OcppCihaz):
    def __init__(self, kimlik, baglanti, profil):
        super().__init__(kimlik, baglanti)
        self.profil = profil

    @on(Action.boot_notification)
    async def acilis(self, charge_point_vendor, charge_point_model, **kw):
        fw = kw.get('firmware_version', '?')
        merkez.gunluk(self.id, '→', 'BootNotification {vendor:"%s", model:"%s", firmware:"%s", profil:%d}' % (charge_point_vendor, charge_point_model, fw, self.profil), 'dim')
        ikiz.acilis(self.id, fw)
        return call_result.BootNotification(current_time=simdi_iso(), interval=60, status=RegistrationStatus.accepted)

    @on(Action.heartbeat)
    async def nabiz(self, **kw):
        ikiz.okundu()
        return call_result.Heartbeat(current_time=simdi_iso())

    @on(Action.status_notification)
    async def durum_bildirimi(self, connector_id, error_code, status, **kw):
        st = str(getattr(status, 'value', status))
        merkez.kaydet(self.id, connector_id, st, **({} if st == 'Charging' else {'kw': 0}))
        hata = str(getattr(error_code, 'value', error_code))
        merkez.gunluk(self.id, '→', 'StatusNotification {connectorId:%d, status:"%s"%s}' % (connector_id, st, '' if hata == 'NoError' else ', errorCode:"%s"' % hata), 'warn' if st == 'Faulted' else '')
        ikiz.durum(self.id, connector_id, st, hata)
        return call_result.StatusNotification()

    @on(Action.authorize)
    async def yetkilendir(self, id_tag, **kw):
        merkez.gunluk(self.id, '→', 'Authorize {idTag:"%s"}' % id_tag)
        return call_result.Authorize(id_tag_info={'status': AuthorizationStatus.accepted})

    @on(Action.start_transaction)
    async def islem_basla(self, connector_id, id_tag, meter_start, timestamp, **kw):
        merkez.islem += 1
        tx = merkez.islem
        merkez.kaydet(self.id, connector_id, 'Charging', tx=tx, kwh=0)
        merkez.gunluk(self.id, '→', 'StartTransaction {connectorId:%d, transactionId:%d}' % (connector_id, tx))
        return call_result.StartTransaction(transaction_id=tx, id_tag_info={'status': AuthorizationStatus.accepted})

    @on(Action.stop_transaction)
    async def islem_bitir(self, meter_stop, timestamp, transaction_id, **kw):
        for d in list(merkez.durum.values()):
            if d['cp'] == self.id and d.get('tx') == transaction_id:
                merkez.kaydet(self.id, d['k'], 'Available', tx=None, kw=0)
                ikiz.islem_bitti(self.id, d['k'], transaction_id)
        merkez.gunluk(self.id, '→', 'StopTransaction {transactionId:%d, meterStop:%d Wh, reason:"%s"}' % (transaction_id, meter_stop, kw.get('reason', 'Local')))
        return call_result.StopTransaction()

    @on(Action.meter_values)
    async def olcum(self, connector_id, meter_value, **kw):
        kwv = kwh = None
        for mv in meter_value or []:
            for sv in mv.get('sampled_value', mv.get('sampledValue', [])):
                olc = sv.get('measurand', 'Energy.Active.Import.Register')
                if olc == 'Power.Active.Import':
                    kwv = float(sv['value']) / (1000 if sv.get('unit') == 'W' else 1)
                elif olc == 'Energy.Active.Import.Register':
                    kwh = float(sv['value']) / (1000 if sv.get('unit', 'Wh') == 'Wh' else 1)
        ek = {}
        if kwv is not None:
            ek['kw'] = round(kwv, 1)
        if kwh is not None:
            ek['kwh'] = round(kwh, 2)
        merkez.kaydet(self.id, connector_id, None, **ek)
        if kwh is not None:
            merkez.gunluk(self.id, '→', 'MeterValues {connectorId:%d, kW:%s, kWh:%s}' % (connector_id, ek.get('kw', '?'), ek['kwh']), 'dim')
        if kwv is not None:
            ikiz.olcum(self.id, connector_id, kwv)
        return call_result.MeterValues()

    @on(Action.firmware_status_notification)
    async def yazilim_durumu(self, status, **kw):
        st = str(getattr(status, 'value', status))
        merkez.gunluk(self.id, '→', 'FirmwareStatusNotification {status:"%s"}' % st, 'warn' if st in ('DownloadFailed', 'InstallationFailed') else '')
        return call_result.FirmwareStatusNotification()

    @on(Action.security_event_notification)
    async def guvenlik_olayi(self, type, timestamp, tech_info=None, **kw):
        merkez.gunluk(self.id, '→', 'SecurityEventNotification {type:"%s"}' % type, 'warn')
        denetim(self.id, '127.0.0.1', 'cihaz_guvenlik_olayi', '%s · %s' % (type, tech_info or ''), 'red')
        ikiz.guvenlik_olayi(self.id, type, tech_info)
        return call_result.SecurityEventNotification()


CP_YOL = re.compile(r'^/ocpp/([A-Z0-9-]{3,40})$')


def temel_kimlik(istek, kimlik):
    a = istek.headers.get('Authorization', '')
    if not a.startswith('Basic '):
        return False
    try:
        k, p = base64.b64decode(a[6:]).decode().split(':', 1)
    except Exception:
        return False
    return k == kimlik and cihaz_dogrula(kimlik, p)


def ocpp_sunucu(profil):
    def on_kontrol(baglanti, istek):
        m = CP_YOL.match(istek.path)
        if not m:
            return baglanti.respond(http.HTTPStatus.NOT_FOUND, 'Bilinmeyen yol\n')
        kimlik = m.group(1)
        if profil == 1 and merkez.profil1_kapali:
            return baglanti.respond(http.HTTPStatus.FORBIDDEN, 'Profil 1 kapatildi, TLS kullanin\n')
        if profil in (1, 2) and not temel_kimlik(istek, kimlik):
            denetim(kimlik, '127.0.0.1', 'ocpp_kimlik_reddedildi', 'profil %d' % profil, 'red')
            return baglanti.respond(http.HTTPStatus.UNAUTHORIZED, 'Yetkisiz\n')
        if profil == 3:
            sertifika_bilgi = baglanti.transport.get_extra_info('peercert') or {}
            cn = dict(x[0] for x in sertifika_bilgi.get('subject', ())).get('commonName')
            if cn != kimlik:
                denetim(kimlik, '127.0.0.1', 'ocpp_kimlik_reddedildi', 'sertifika uyuşmuyor', 'red')
                return baglanti.respond(http.HTTPStatus.UNAUTHORIZED, 'Sertifika cihazla uyusmuyor\n')
        return None

    async def baglanti_isle(baglanti):
        kimlik = CP_YOL.match(baglanti.request.path).group(1)
        c = Cihaz(kimlik, baglanti, profil)
        merkez.baglandi(c)
        try:
            await c.start()
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            merkez.ayrildi(c)

    return on_kontrol, baglanti_isle


sunucular = []


async def ocpp_baslat(yollar):
    on1, is1 = ocpp_sunucu(1)
    sunucular.append(await websockets.serve(is1, '127.0.0.1', OCPP_P1, subprotocols=['ocpp1.6'], process_request=on1))
    tls2 = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    tls2.minimum_version = ssl.TLSVersion.TLSv1_2
    tls2.load_cert_chain(yollar['sunucu'], yollar['sunucu_anahtar'])
    on2, is2 = ocpp_sunucu(2)
    sunucular.append(await websockets.serve(is2, '127.0.0.1', OCPP_P2, subprotocols=['ocpp1.6'], ssl=tls2, process_request=on2))
    tls3 = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    tls3.minimum_version = ssl.TLSVersion.TLSv1_2
    tls3.load_cert_chain(yollar['sunucu'], yollar['sunucu_anahtar'])
    tls3.load_verify_locations(yollar['ca'])
    tls3.verify_mode = ssl.CERT_REQUIRED
    on3, is3 = ocpp_sunucu(3)
    sunucular.append(await websockets.serve(is3, '127.0.0.1', OCPP_P3, subprotocols=['ocpp1.6'], ssl=tls3, process_request=on3))
    return sunucular


# ================================================================ Başlatma
async def temizlik():
    while True:
        await asyncio.sleep(30)
        n = oturumlar.temizle()
        if n:
            denetim('-', '-', 'oturum_suresi_doldu', '%d oturum kapatıldı' % n)
        for k in [k for k, b in bekleyen_mfa.items() if time.time() > b['bitis']]:
            del bekleyen_mfa[k]


async def ana():
    global ikiz
    kur()
    uniteler = ikiz_veri.uniteler()
    ikiz = ikiz3.Ikiz(merkez, yayinla, denetim, uniteler, ikiz_veri.surus())
    yollar = sertifika.hazirla([u['kimlik'] for u in uniteler if u['profil'] == 3])
    # Akımyolu önlemlerinden "OCPP güvenlik profili 2/3 geçişi" açıksa Profil 1 baştan kapalıdır
    with db() as c:
        r = c.execute('SELECT anahtarlar FROM kontroller WHERE sirket = ?', ('akimyolu',)).fetchone()
    merkez.onlemler = set(json.loads(r['anahtarlar'])) if r else set()
    merkez.profil1_kapali = 'ocpp_tls' in merkez.onlemler

    app = web.Application(middlewares=[guvenlik_katmani], client_max_size=64 * 1024)
    app.router.add_post('/api/giris', giris)
    app.router.add_post('/api/giris/mfa', giris_mfa)
    app.router.add_post('/api/cikis', cikis)
    app.router.add_get('/api/oturum', oturum_bilgi)
    app.router.add_get('/api/oturumlar', oturum_listesi)
    app.router.add_delete('/api/oturumlar/{kisa}', oturum_kapat)
    app.router.add_get('/api/kontroller', kontroller_al)
    app.router.add_post('/api/kontroller', kontroller_yaz)
    app.router.add_post('/api/senaryo', senaryo)
    app.router.add_post('/api/mfa', mfa_dogrula)
    app.router.add_post('/api/cihaz/komut', cihaz_komutu)
    app.router.add_get('/api/ikiz', ikiz_durumu)
    app.router.add_post('/api/ikiz/talep', ikiz_talep)
    app.router.add_post('/api/ikiz/tatbikat', ikiz_tatbikat)
    app.router.add_get('/api/denetim', denetim_listesi)
    app.router.add_get('/api/guvenlik', guvenlik_durumu)
    app.router.add_get('/api/onizleme', onizleme)
    app.router.add_get('/canli', canli)
    app.router.add_route('*', '/{yol:.*}', statik)

    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    await web.TCPSite(runner, '127.0.0.1', PORT).start()
    await ocpp_baslat(yollar)
    asyncio.ensure_future(temizlik())
    asyncio.ensure_future(ikiz.calis())
    denetim('-', '-', 'kapi_basladi', 'port %d · OCPP %d/%d/%d' % (PORT, OCPP_P1, OCPP_P2, OCPP_P3))
    print('Miselyum Kapısı hazır: http://127.0.0.1:%d   (demo hesapları: kapi/veri/demo-hesaplar.txt)' % PORT, flush=True)
    print('OCPP: ws://127.0.0.1:%d (Profil 1) · wss://127.0.0.1:%d (Profil 2) · wss://127.0.0.1:%d (Profil 3)' % (OCPP_P1, OCPP_P2, OCPP_P3), flush=True)
    saha = None
    if '--sanal-yok' not in sys.argv:
        saha = subprocess.Popen([sys.executable, os.path.join(KOK, 'kapi', 'sanal_saha.py')])
    try:
        await asyncio.Event().wait()
    finally:
        if saha:
            saha.terminate()


if __name__ == '__main__':
    try:
        asyncio.run(ana())
    except KeyboardInterrupt:
        pass
