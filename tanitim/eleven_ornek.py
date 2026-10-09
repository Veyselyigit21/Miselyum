"""ElevenLabs ses denemesi ve seçimi. Karakter kotasını korumak için varsayılan olarak az örnek üretir.

  python tanitim/eleven_ornek.py --liste            hesaptaki sesleri ve ücretsiz önizleme bağlantılarını listeler (kota harcamaz)
  python tanitim/eleven_ornek.py                    en fazla 3 sesten (önce sizin eklediğiniz Türkçe sesler) Türkçe örnek üretir
  python tanitim/eleven_ornek.py --en-fazla 5       en fazla 5 örnek
  python tanitim/eleven_ornek.py --ses "Ad"         yalnız o sesten örnek
  python tanitim/eleven_ornek.py --sec "Ad"         o sesi videonun anlatıcısı yapar (tanitim/ses-secimi.json; kota harcamaz)

Örnekler tanitim/ses-ornekleri/eleven-*.mp3 olarak kaydedilir; aynı ses için ikinci kez üretilmez. Bir örnek ~%d karakter harcar.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import eleven  # noqa: E402

KLASOR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ses-ornekleri')
METIN = ('Miselyum, şirketlerin dağınık sistemlerini tek bir risk ağına bağlıyor. '
         'İkiz artık sahaya kendisi yazıyor: arızalı soketi on yedi saniyede hizmete döndürüyor.')
__doc__ = __doc__ % len(METIN)


def dosya_adi(ad):
    return 'eleven-' + re.sub(r'[^a-z0-9]+', '-', ad.lower()).strip('-') + '.mp3'


def arg(ad, varsayilan=None):
    return sys.argv[sys.argv.index(ad) + 1] if ad in sys.argv and sys.argv.index(ad) + 1 < len(sys.argv) else varsayilan


def bul(liste, hedef):
    hedef = hedef.lower()
    return next((x for x in liste if x['ad'].lower() == hedef or x['voice_id'].lower() == hedef or x['ad'].lower().startswith(hedef)), None)


def main():
    liste = eleven.sesler()
    # Önce sizin eklediğiniz sesler (kütüphaneden Türkçe sesler burada olur), sonra hazır sesler
    sirali = sorted(liste, key=lambda x: (x['kategori'] == 'premade', x['etiket'].get('language', '') != 'tr', x['ad']))
    if '--sec' in sys.argv:
        s = bul(liste, arg('--sec', ''))
        if not s:
            sys.exit('Bu adla ses bulunamadı. Seçenekler: ' + ', '.join(x['ad'] for x in liste))
        json.dump({'voice_id': s['voice_id'], 'ad': s['ad'], 'model': eleven.VARSAYILAN_MODEL}, open(eleven.SECIM, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print('Anlatıcı seçildi:', s['ad'])
        return
    if '--liste' in sys.argv:
        for s in sirali:
            e = s['etiket']
            print('%-22s %-10s %-40s %s' % (s['ad'], s['kategori'], ', '.join(v for v in (e.get('gender'), e.get('accent'), e.get('language')) if v), s.get('onizleme') or ''))
        print('\nÖnizleme bağlantıları ücretsizdir (çoğu İngilizce). Türkçe örnek için: python tanitim/eleven_ornek.py --ses "Ad"')
        return
    if '--ses' in sys.argv:
        s = bul(liste, arg('--ses', ''))
        if not s:
            sys.exit('Bu adla ses bulunamadı. Seçenekler: ' + ', '.join(x['ad'] for x in liste))
        sirali = [s]
    else:
        sirali = sirali[:int(arg('--en-fazla', '3'))]
    os.makedirs(KLASOR, exist_ok=True)
    harcanan = 0
    for s in sirali:
        yol = os.path.join(KLASOR, dosya_adi(s['ad']))
        if not os.path.exists(yol):
            eleven.seslendir(METIN, s['voice_id'], yol)
            harcanan += len(METIN)
        e = s['etiket']
        print('%-22s %-10s %s' % (s['ad'], s['kategori'], ', '.join(v for v in (e.get('gender'), e.get('accent'), e.get('language'), e.get('description')) if v)))
    print('\nÖrnekler:', KLASOR, '· bu çalıştırmada ~%d karakter harcandı' % harcanan)
    print('Seçmek için: python tanitim/eleven_ornek.py --sec "Ad"')


if __name__ == '__main__':
    main()
