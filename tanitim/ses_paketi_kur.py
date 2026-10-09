"""Sunum ses paketini tanitim/muzik/ klasöründeki seçilmiş parçalardan kurar (tanitim/ses-paketi/).

  odak-muzigi.mp3   sunum boyunca arka planda: "odak" (yoksa "gizem") parçası, konuşmanın altında kalacak düzeyde (-24 LUFS)
  acilis.wav        kapak: "acilis" parçasının ilk 8 saniyesi, yumuşak bitiş
  gecis.wav         bölüm başı slaytları: sfx/gecis
  tik.wav           tıklamayla açılan öğeler: sfx/tik
  vurgu.wav         büyük sayı ve sonuç: sfx/basari (yoksa sfx/vurus)
  kapanis.wav       teşekkür slaydı: "final" parçasından 8 saniye, yumuşak giriş ve bitiş
PowerPoint geçiş ve animasyon sesleri yalnız WAV kabul ettiği için efektler WAV'a çevrilir.
"""
import os
import shutil
import subprocess
import sys

import imageio_ffmpeg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kurgu  # noqa: E402

FF = imageio_ffmpeg.get_ffmpeg_exe()
HEDEF = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ses-paketi')


def calistir(*a):
    subprocess.run([FF, '-y', '-v', 'error'] + list(a), check=True)


def main():
    os.makedirs(HEDEF, exist_ok=True)
    yapilan = []
    odak = kurgu.dosya('odak') or kurgu.dosya('gizem')
    if odak:
        calistir('-i', odak, '-af', 'loudnorm=I=-24:TP=-3:LRA=9', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', os.path.join(HEDEF, 'odak-muzigi.mp3'))
        yapilan.append('odak-muzigi.mp3')
    acilis = kurgu.dosya('acilis')
    if acilis:
        calistir('-i', acilis, '-t', '8', '-af', 'loudnorm=I=-18:TP=-2,afade=t=in:d=0.3,afade=t=out:st=5.5:d=2.5', '-ar', '44100', os.path.join(HEDEF, 'acilis.wav'))
        yapilan.append('acilis.wav')
    final = kurgu.dosya('final')
    if final:
        calistir('-ss', '20', '-i', final, '-t', '8', '-af', 'loudnorm=I=-18:TP=-2,afade=t=in:d=1.5,afade=t=out:st=5:d=3', '-ar', '44100', os.path.join(HEDEF, 'kapanis.wav'))
        yapilan.append('kapanis.wav')
    for cikis, adaylar in (('gecis', ['gecis']), ('tik', ['tik']), ('vurgu', ['basari', 'vurus'])):
        kaynak = next((kurgu.dosya(a, 'sfx') for a in adaylar if kurgu.dosya(a, 'sfx')), None)
        if kaynak:
            # Kısa efektlerde ses düzeyi ölçümü güvenilir değil; tepe değere göre (-3 dBFS) eşitlenir
            a = kurgu.coz(kaynak, FF, normalize=False)
            kurgu._yaz(os.path.join(HEDEF, cikis + '.wav'), a / max(1e-6, float(abs(a).max())) * 0.7)
            yapilan.append(cikis + '.wav')
    kaynaklar = os.path.join(kurgu.KLASOR, 'KAYNAKLAR.txt')
    if os.path.exists(kaynaklar):
        shutil.copy(kaynaklar, os.path.join(HEDEF, 'KAYNAKLAR.txt'))
    print('Ses paketi güncellendi:', ', '.join(yapilan) if yapilan else 'tanitim/muzik/ boş, değişiklik yok')


if __name__ == '__main__':
    main()
