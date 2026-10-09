"""Sahne sahne müzik ve efekt kurgusu.

tanitim/muzik/ klasöründeki parçaları videonun bölümlerine göre yerleştirir:
  her bölümün kendi duygusu (rol) vardır; rol değişirken parçalar 2,5 sn'de birbirine geçer, aynı rol sürerse parça kesilmeden devam eder;
  bölüm kartlarından hemen önce yükselme (riser), kart açılırken geçiş ve vuruş; imleç tıklamalarında tık; saldırıda glitch; başarı anlarında çan.
Konuşma başladığında müzik kendiliğinden kısılır (kayit.py'deki sidechain), efektler kısılmaz.

Klasördeki dosya adları (uzantı mp3, wav, ogg, m4a, flac olabilir):
  muzik/acilis      sinematik giriş            muzik/gizem       sakin, merak uyandıran
  muzik/gerilim     hafif gerilim, nabız       muzik/enerjik     canlı, teknolojik ritim
  muzik/odak        sade, kurumsal teknoloji   muzik/karanlik    karanlık siber gerilim
  muzik/surukleyici hızlı, sürükleyici         muzik/final       yükselen, umut veren final
  muzik/sfx/gecis   vuuş (whoosh)              muzik/sfx/yukselis yükselme (riser), 2–4 sn
  muzik/sfx/vurus   vuruş (impact, boom)       muzik/sfx/tik      arayüz tıklaması
  muzik/sfx/glitch  dijital bozulma            muzik/sfx/basari   başarı çanı
Eksik bir rol için en yakın rol kullanılır; klasör boşsa bilgisayarda üretilen odak müziğine dönülür.
"""
import glob
import os
import subprocess

import numpy as np

KLASOR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'muzik')
SR = 48000
UZANTI = ('.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac')

# Bölüm → rol. Bölüm adları kayit.py'deki işaretlerle aynıdır ("3 · Canlı saha").
ROL = {'Açılış': 'acilis', 'Giriş': 'gizem', 'Ağ ve sorun': 'gerilim', 'Canlı saha': 'enerjik', 'İki yönlü ikiz': 'surukleyici', 'Tesis': 'enerjik',
       'Riskler': 'odak', 'Önlemler': 'odak', 'Senaryolar': 'karanlik', 'Güvenlik': 'surukleyici',
       'İkinci şirket': 'enerjik', 'Asistan': 'odak', 'Belgeler ve gelecek': 'final', 'Kapanış': 'final'}
YEDEK = {'acilis': ['final', 'gizem', 'odak'], 'gizem': ['odak', 'acilis'], 'gerilim': ['karanlik', 'gizem', 'odak'],
         'enerjik': ['surukleyici', 'odak'], 'odak': ['gizem', 'enerjik'], 'karanlik': ['gerilim', 'surukleyici', 'odak'],
         'surukleyici': ['enerjik', 'karanlik', 'odak'], 'final': ['acilis', 'enerjik', 'odak']}
# Efekt düzeyleri (tepe değere göre, dB)
SFX_DB = {'gecis': -9, 'yukselis': -11, 'vurus': -7, 'tik': -20, 'glitch': -13, 'basari': -12}


def dosya(ad, alt=''):
    for u in UZANTI:
        yol = os.path.join(KLASOR, alt, ad + u)
        if os.path.exists(yol):
            return yol
    bulunan = [y for y in glob.glob(os.path.join(KLASOR, alt, ad + '*')) if y.lower().endswith(UZANTI)]
    return bulunan[0] if bulunan else None


def coz(yol, ffmpeg, normalize=True):
    """Dosyayı 48 kHz stereo float32 diziye çevirir; müzik parçaları aynı algılanan ses düzeyine getirilir."""
    af = ['-af', 'loudnorm=I=-20:TP=-2:LRA=11'] if normalize else []
    p = subprocess.run([ffmpeg, '-v', 'error', '-i', yol] + af + ['-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.float32).reshape(-1, 2).copy()


def rol_bul(rol, mevcut):
    if rol in mevcut:
        return rol
    for r in YEDEK.get(rol, []):
        if r in mevcut:
            return r
    return next(iter(mevcut)) if mevcut else None


def rampa(n, yukari=True):
    t = np.linspace(0, 1, max(1, n), dtype=np.float32)
    e = np.sin(t * np.pi / 2) ** 2
    return e if yukari else e[::-1]


def parca_al(kaynak, bas, uzunluk, xf):
    """kaynak[bas:bas+uzunluk]; parça biterse 3 sn çapraz geçişle başa sarar."""
    out = np.zeros((uzunluk, 2), np.float32)
    i, j = 0, bas % len(kaynak)
    while i < uzunluk:
        al = min(uzunluk - i, len(kaynak) - j)
        out[i:i + al] += kaynak[j:j + al]
        i += al
        j = 0
        if i < uzunluk and xf:
            # başa sarma yumuşak olsun: son 3 sn ile ilk 3 sn karışır
            n = min(xf, i, uzunluk - i, len(kaynak))
            out[i - n:i] *= rampa(n, False)[:, None]
            out[i - n:i] += kaynak[:n] * rampa(n)[:, None]
            j = n
    return out


def kurgu(marks, olaylar, total, ffmpeg, muzik_yolu, sfx_yolu):
    """marks: [(sn, "3 · Canlı saha"), ...]; olaylar: [(sn, "tik"), ...]. İki wav yazar (müzik, efekt). Müzik yoksa False döner."""
    mevcut = {}
    for r in set(ROL.values()):
        y = dosya(r)
        if y:
            mevcut[r] = coz(y, ffmpeg)
    if not mevcut:
        return False
    n = int((total + 2) * SR)
    yatak = np.zeros((n, 2), np.float32)
    xf = int(2.5 * SR)
    bolumler = []
    for k, (t, ad) in enumerate(marks):
        bolum = ad.split(' · ', 1)[-1]
        bitis = marks[k + 1][0] if k + 1 < len(marks) else total
        bolumler.append((t, bitis, rol_bul(ROL.get(bolum, 'odak'), mevcut)))
    # Aynı rol art arda geliyorsa birleştir: parça kesilmeden sürsün
    birlesik = []
    for b in bolumler:
        if birlesik and birlesik[-1][2] == b[2]:
            birlesik[-1] = (birlesik[-1][0], b[1], b[2])
        else:
            birlesik.append(b)
    konum = {}   # her rol kaldığı yerden devam eder
    for k, (bas, bit, rol) in enumerate(birlesik):
        i0 = max(0, int(bas * SR) - (xf if k else 0))
        i1 = min(n, int(bit * SR) + xf)
        uz = i1 - i0
        src = mevcut[rol]
        p = parca_al(src, konum.get(rol, 0), uz, int(3 * SR))
        konum[rol] = (konum.get(rol, 0) + uz) % len(src)
        if k:
            p[:xf] *= rampa(xf)[:, None]
        if k + 1 < len(birlesik):
            p[-xf:] *= rampa(xf, False)[:, None]
        yatak[i0:i1] += p
    son = int(total * SR)
    fo = int(5 * SR)
    yatak[son - fo:son] *= rampa(fo, False)[:, None]
    yatak[son:] = 0
    yatak[:int(1.5 * SR)] *= rampa(int(1.5 * SR))[:, None]
    _yaz(muzik_yolu, yatak)

    efekt = np.zeros((n, 2), np.float32)
    sfx = {}
    for ad in SFX_DB:
        y = dosya(ad, 'sfx')
        if y:
            a = coz(y, ffmpeg, normalize=False)
            a = a / max(1e-6, float(np.abs(a).max()))
            sfx[ad] = a * (10 ** (SFX_DB[ad] / 20))
    for t, ad in olaylar:
        a = sfx.get(ad)
        if a is None:
            continue
        i0 = int(t * SR) - (len(a) if ad == 'yukselis' else 0)   # yükselme, olay anında biter
        if i0 < 0:
            a, i0 = a[-i0:], 0
        i1 = min(n, i0 + len(a))
        efekt[i0:i1] += a[:i1 - i0]
    _yaz(sfx_yolu, efekt)
    return True


def _yaz(yol, x):
    import wave
    x = np.clip(x, -1, 1)
    with wave.open(yol, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
