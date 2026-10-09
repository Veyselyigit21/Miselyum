"""ElevenLabs API anahtarını bu bilgisayara kaydeder. Yazarken ekranda görünmez; dosyaya yazılır, hiçbir yere gönderilmez.

  python tanitim/eleven_anahtar.py         anahtarı sorar, %USERPROFILE%\\.miselyum\\elevenlabs-anahtar.txt dosyasına yazar
                                           ve ElevenLabs'a bağlanıp hesaptaki ses sayısını söyler (anahtarın çalıştığını gösterir)
  python tanitim/eleven_anahtar.py --sil   iş bitince dosyayı siler (anahtarı ElevenLabs sitesinden de iptal edin)
"""
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import eleven  # noqa: E402


def main():
    if '--sil' in sys.argv:
        if os.path.exists(eleven.ANAHTAR_DOSYASI):
            os.remove(eleven.ANAHTAR_DOSYASI)
            print('Anahtar dosyası silindi. Anahtarı ElevenLabs › Profile › API Keys sayfasından da silmeyi unutmayın.')
        else:
            print('Silinecek anahtar dosyası yok.')
        return
    a = getpass.getpass('ElevenLabs API anahtarını yapıştırıp Enter\'a basın (ekranda görünmez): ').strip()
    if not a:
        print('Anahtar girilmedi; hiçbir şey kaydedilmedi.')
        return
    os.makedirs(os.path.dirname(eleven.ANAHTAR_DOSYASI), exist_ok=True)
    with open(eleven.ANAHTAR_DOSYASI, 'w', encoding='utf-8') as f:
        f.write(a)
    print('Kaydedildi:', eleven.ANAHTAR_DOSYASI)
    try:
        n = len(eleven.sesler())
        print('Anahtar çalışıyor: hesapta %d ses var. Claude\'a "hazır" yazabilirsiniz.' % n)
    except Exception as e:      # anahtarı yazdırmadan yalnız hata türünü göster
        print('Anahtar kaydedildi ama ElevenLabs\'a bağlanılamadı (%s). Anahtarın "Voices" okuma izni olduğundan emin olun.' % type(e).__name__)


if __name__ == '__main__':
    main()
