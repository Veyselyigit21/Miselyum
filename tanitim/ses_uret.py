"""Miselyum ses paketi: sunum ve video için telifsiz sesler (hepsi burada, numpy ile sentezlenir).

  odak_muzigi(yol, sure)   92 BPM, hafif ritimli odak müziği: elektrik piyano akorları (Re majör 9'lu), yumuşak bas,
                           kısık davul ve fırça benzeri hi-hat; dikkati dağıtmayacak düzeyde, konuşmanın altında kalır.
  gecis()   yumuşak "vuuş" (0,7 sn)    slayt geçişi
  tik()     kısa tık (0,05 sn)         tıklamayla açılan öğe
  vurgu()   cam çan (1,4 sn)           önemli sayı ya da sonuç
  acilis()  yükselen akor (4 sn)       kapak slaydı
  kapanis() çözülen akor (3,5 sn)      teşekkür slaydı

Doğrudan çalıştırınca tanitim/ses-paketi/ klasörünü üretir:  python tanitim/ses_uret.py
"""
import os
import subprocess
import wave

import numpy as np

SR = 44100
AKORLAR = [[146.83, 220.00, 277.18, 329.63, 369.99],   # Dmaj9
           [123.47, 185.00, 220.00, 277.18, 293.66],   # Bm9
           [98.00, 146.83, 185.00, 220.00, 246.94],    # Gmaj9
           [110.00, 164.81, 185.00, 246.94, 277.18]]   # A6/9


def yaz_wav(yol, x, sr=SR):
    x = np.asarray(x, np.float32)
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    with wave.open(yol, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def _zarf(n, a, d, sr=SR):
    t = np.arange(n) / sr
    e = np.exp(-t / d)
    k = max(1, int(a * sr))
    e[:k] *= np.linspace(0, 1, k)
    return e.astype(np.float32)


def _alcak(x, kesim, sr=SR):
    """Tek kutuplu alçak geçiren süzgeç (yumuşatma)."""
    a = np.exp(-2 * np.pi * kesim / sr)
    y = np.empty_like(x)
    p = 0.0
    for i in range(len(x)):
        p = (1 - a) * x[i] + a * p
        y[i] = p
    return y


def _alcak_hizli(x, kesim, sr=SR):
    """Alçak geçiren süzgeç (FFT ile; uzun sinyallerde hızlı)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / sr)
    X *= 1 / np.sqrt(1 + (f / kesim) ** 4)
    return np.fft.irfft(X, len(x)).astype(np.float32)


def _epiyano(f, sure, hiz=0.8, sr=SR):
    """FM ile elektrik piyano tınısı: tını vuruşta parlak, sonra yumuşar."""
    n = int(sure * sr)
    t = np.arange(n) / sr
    indeks = 1.6 * np.exp(-t / 0.35) * hiz
    mod = np.sin(2 * np.pi * f * t)
    ses = np.sin(2 * np.pi * f * t + indeks * mod) + 0.18 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.5)
    return (ses * _zarf(n, 0.004, 1.3)).astype(np.float32)


def odak_muzigi(yol, sure, bpm=92, tohum=11, sr=SR):
    rng = np.random.default_rng(tohum)
    n = int((sure + 1) * sr)
    out = np.zeros((n, 2), np.float32)
    vurus = 60.0 / bpm
    olcu = 4 * vurus
    olcu_say = int(sure / olcu) + 2

    def ekle(i0, x, pan=0.5, kazanc=1.0):
        if i0 >= n:
            return
        i1 = min(n, i0 + len(x))
        out[i0:i1, 0] += x[:i1 - i0] * (1 - pan) * kazanc
        out[i0:i1, 1] += x[:i1 - i0] * pan * kazanc

    # Hazır sesler
    davul_n = int(0.32 * sr)
    td = np.arange(davul_n) / sr
    frek = 46 + 70 * np.exp(-td / 0.035)
    davul = (np.sin(2 * np.pi * np.cumsum(frek) / sr) * _zarf(davul_n, 0.002, 0.12)).astype(np.float32)
    hat_n = int(0.06 * sr)
    gurultu = rng.standard_normal(hat_n).astype(np.float32)
    hat = (np.diff(np.concatenate([[0], gurultu])) * _zarf(hat_n, 0.001, 0.018)).astype(np.float32)
    rim_n = int(0.12 * sr)
    rim = ((rng.standard_normal(rim_n) * 0.5 + np.sin(2 * np.pi * 330 * np.arange(rim_n) / sr)) * _zarf(rim_n, 0.001, 0.03)).astype(np.float32)

    for m in range(olcu_say):
        t0 = m * olcu
        akor = AKORLAR[(m // 2) % 4]
        bolum = m // 4   # 4 ölçüde bir yeni katman
        # Elektrik piyano: 1. vuruşta ve 2'nin "ve"sinde (hafif senkop)
        for vur, hiz in ((0.0, 0.7), (1.5, 0.55), (3.0, 0.45)):
            if vur == 3.0 and m % 2 == 0:
                continue
            for j, f in enumerate(akor[1:]):
                x = _epiyano(f * 2, 2.2, hiz)
                ekle(int((t0 + vur * vurus + j * 0.012) * sr), x, 0.3 + 0.4 * j / 3, 0.055)
        # Bas: 1 ve 3. vuruş
        if bolum >= 1:
            for vur in (0, 2):
                bn = int(vurus * 1.6 * sr)
                tb = np.arange(bn) / sr
                bas = (np.sin(2 * np.pi * akor[0] / 2 * tb) * _zarf(bn, 0.01, 0.6)).astype(np.float32)
                ekle(int((t0 + vur * vurus) * sr), bas, 0.5, 0.11)
        # Davul: 1 ve 3; rim: 2 ve 4 (çok kısık)
        if bolum >= 2:
            for vur in (0, 2):
                ekle(int((t0 + vur * vurus) * sr), davul, 0.5, 0.17)
            for vur in (1, 3):
                ekle(int((t0 + vur * vurus) * sr), rim, 0.55, 0.035)
        # Hi-hat: sekizlik, hafif swing
        if bolum >= 1:
            for k in range(8):
                kay = 0.08 * vurus if k % 2 else 0.0
                ekle(int((t0 + k * vurus / 2 + kay) * sr), hat, 0.62 if k % 2 else 0.4, 0.05 if k % 2 else 0.08)
    # Pad: çok kısık uzun akorlar (sıcaklık)
    T = 2 * olcu
    for k in range(int(sure / T) + 2):
        akor = AKORLAR[k % 4]
        i0 = int(k * T * sr)
        L = min(n - i0, int(T * 1.3 * sr))
        if L <= 0:
            break
        t = np.arange(L) / sr
        pencere = np.sin(np.pi * np.clip(t / (T * 1.3), 0, 1)) ** 2
        pad = sum(np.sin(2 * np.pi * f * t) + np.sin(2 * np.pi * f * 1.003 * t + 1.1) for f in akor[1:4]).astype(np.float32)
        ekle(i0, pad * pencere.astype(np.float32), 0.5, 0.018)
    # 40 Hz altını kes (hoparlörde duyulmaz, yalnız düzeyi şişirir)
    for c in (0, 1):
        out[:, c] -= _alcak_hizli(out[:, c], 40, sr)
    # Davula göre hafif "nefes" (pompa) ve giriş-çıkış
    t = np.arange(n) / sr
    pompa = 1 - 0.12 * np.exp(-((t % (2 * vurus)) / 0.18))
    out *= pompa.astype(np.float32)[:, None]
    fi, fo = int(4 * sr), int(7 * sr)
    out[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)[:, None]
    son = int(sure * sr)
    out[son - fo:son] *= np.linspace(1, 0, fo, dtype=np.float32)[:, None]
    out[son:] = 0
    out *= 0.5 / max(1e-6, float(np.abs(out).max()))
    yaz_wav(yol, out[:son + int(0.2 * sr)], sr)


def gecis(sr=SR):
    n = int(0.75 * sr)
    t = np.arange(n) / sr
    g = np.random.default_rng(3).standard_normal(n).astype(np.float32)
    kesim = 400 + 5200 * np.sin(np.pi * t / t[-1]) ** 2
    y = np.zeros(n, np.float32)
    p = 0.0
    for i in range(n):
        a = np.exp(-2 * np.pi * kesim[i] / sr)
        p = (1 - a) * g[i] + a * p
        y[i] = p
    zarf = np.sin(np.pi * t / t[-1]) ** 1.5
    y = y * zarf.astype(np.float32)
    pan = t / t[-1]
    st = np.stack([y * (1 - 0.6 * pan), y * (0.4 + 0.6 * pan)], 1)
    return st / np.abs(st).max() * 0.5


def tik(sr=SR):
    n = int(0.05 * sr)
    t = np.arange(n) / sr
    y = np.sin(2 * np.pi * 1850 * t) * np.exp(-t / 0.006) + 0.3 * np.random.default_rng(5).standard_normal(n) * np.exp(-t / 0.0015)
    return (y / np.abs(y).max() * 0.35).astype(np.float32)


def vurgu(sr=SR):
    n = int(1.4 * sr)
    t = np.arange(n) / sr
    y = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, a, d in ((1174.7, 1.0, 0.55), (1760.0, 0.45, 0.35), (2349.3, 0.2, 0.22)))
    y[:int(0.003 * sr)] *= np.linspace(0, 1, int(0.003 * sr))
    return (y / np.abs(y).max() * 0.4).astype(np.float32)


def _akor_kabarma(akor, sure, yukselen=True, sr=SR):
    n = int(sure * sr)
    t = np.arange(n) / sr
    y = np.zeros(n, np.float32)
    for j, f in enumerate(akor):
        y += (np.sin(2 * np.pi * f * t) + 0.6 * np.sin(2 * np.pi * f * 1.004 * t + j)).astype(np.float32)
    parilti = sum(np.sin(2 * np.pi * f * 4 * t) for f in akor[2:]) * 0.08
    y += parilti.astype(np.float32)
    if yukselen:
        zarf = np.clip(t / (sure * 0.75), 0, 1) ** 2 * np.clip((sure - t) / (sure * 0.25), 0, 1)
    else:
        zarf = np.clip(t / 0.4, 0, 1) * np.exp(-t / (sure * 0.45))
    y *= zarf.astype(np.float32)
    return y / np.abs(y).max() * 0.45


def acilis(sr=SR):
    return _akor_kabarma([73.42] + AKORLAR[0], 4.0, True, sr)


def kapanis(sr=SR):
    return _akor_kabarma([73.42, 146.83, 220.00, 293.66, 369.99, 440.00], 3.5, False, sr)


def paket(klasor, ffmpeg=None):
    os.makedirs(klasor, exist_ok=True)
    for ad, f in (('gecis', gecis), ('tik', tik), ('vurgu', vurgu), ('acilis', acilis), ('kapanis', kapanis)):
        yaz_wav(os.path.join(klasor, ad + '.wav'), f())
    ham = os.path.join(klasor, '_odak.wav')
    odak_muzigi(ham, 8 * 60)
    if ffmpeg:
        # Arka plan için -22 LUFS (konuşmanın altında kalır), MP3
        subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-i', ham, '-af', 'loudnorm=I=-22:TP=-2:LRA=9', '-ar', '44100',
                        '-c:a', 'libmp3lame', '-b:a', '192k', os.path.join(klasor, 'odak-muzigi.mp3')], check=True)
        os.remove(ham)
    else:
        os.replace(ham, os.path.join(klasor, 'odak-muzigi.wav'))


if __name__ == '__main__':
    try:
        import imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        ff = None
    hedef = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ses-paketi')
    paket(hedef, ff)
    print('Ses paketi:', hedef, sorted(os.listdir(hedef)))
