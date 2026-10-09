"""ElevenLabs ile Türkçe seslendirme.

API anahtarı şu iki yerden birinden okunur (ikisi de yalnız bu bilgisayarda kalır; kod anahtarı hiçbir yere yazmaz, ekrana basmaz):
  1. ELEVENLABS_API_KEY ortam değişkeni
  2. %USERPROFILE%\\.miselyum\\elevenlabs-anahtar.txt dosyası (tek satır)

Ses seçimi tanitim/ses-secimi.json dosyasındadır: {"voice_id": "...", "ad": "...", "model": "eleven_multilingual_v2"}
"""
import json
import os
import time
import urllib.error
import urllib.request

API = 'https://api.elevenlabs.io/v1'
ANAHTAR_DOSYASI = os.path.join(os.path.expanduser('~'), '.miselyum', 'elevenlabs-anahtar.txt')
SECIM = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ses-secimi.json')
VARSAYILAN_MODEL = 'eleven_multilingual_v2'


class AnahtarYok(RuntimeError):
    pass


def anahtar():
    a = os.environ.get('ELEVENLABS_API_KEY', '').strip()
    if not a and os.path.exists(ANAHTAR_DOSYASI):
        a = open(ANAHTAR_DOSYASI, encoding='utf-8').read().strip()
    if not a:
        raise AnahtarYok('ElevenLabs anahtarı bulunamadı. Anahtarı %s dosyasına tek satır olarak kaydedin '
                         '(ya da ELEVENLABS_API_KEY ortam değişkenine yazın).' % ANAHTAR_DOSYASI)
    return a


def _istek(yol, veri=None, deneme=5):
    url = API + yol
    govde = json.dumps(veri).encode('utf-8') if veri is not None else None
    for i in range(deneme):
        r = urllib.request.Request(url, data=govde, method='POST' if govde else 'GET')
        r.add_header('xi-api-key', anahtar())
        r.add_header('Accept', 'audio/mpeg' if govde else 'application/json')
        if govde:
            r.add_header('Content-Type', 'application/json')
        try:
            with urllib.request.urlopen(r, timeout=120) as y:
                return y.read()
        except urllib.error.HTTPError as e:
            ayrinti = e.read()[:300].decode('utf-8', 'replace')
            if e.code in (429, 500, 502, 503) and i < deneme - 1:
                time.sleep(3 + 4 * i)   # oran sınırı ya da geçici hata: bekleyip yeniden dene
                continue
            if e.code == 401:
                raise RuntimeError('ElevenLabs anahtarı reddedildi (401). Anahtarın doğru ve etkin olduğunu kontrol edin.')
            raise RuntimeError('ElevenLabs hatası %d: %s' % (e.code, ayrinti))
        except urllib.error.URLError:
            if i < deneme - 1:
                time.sleep(3)
                continue
            raise


def sesler():
    """Hesaptaki sesler: hazır sesler ve sizin eklediğiniz (ör. kütüphaneden Türkçe) sesler."""
    v = json.loads(_istek('/voices'))
    return [{'voice_id': s['voice_id'], 'ad': s['name'], 'kategori': s.get('category', ''),
             'etiket': s.get('labels') or {}, 'onizleme': s.get('preview_url')} for s in v.get('voices', [])]


def kota():
    """Abonelikteki karakter hakkı: (kullanılan, toplam). Kota harcamaz."""
    v = json.loads(_istek('/user/subscription'))
    return v.get('character_count', 0), v.get('character_limit', 0)


def secim():
    if os.path.exists(SECIM):
        return json.load(open(SECIM, encoding='utf-8'))
    return None


def seslendir(metin, voice_id, cikis, model=None, ayar=None, onceki=None, sonraki=None):
    """Metni mp3 olarak kaydeder. ayar: stability, similarity_boost, style, speed (0–1 arası; speed 0,7–1,2)."""
    model = model or VARSAYILAN_MODEL
    veri = {'text': metin, 'model_id': model,
            'voice_settings': dict({'stability': 0.5, 'similarity_boost': 0.8, 'style': 0.25, 'use_speaker_boost': True}, **(ayar or {}))}
    if onceki:
        veri['previous_text'] = onceki   # cümleler arası tonlama sürekliliği
    if sonraki:
        veri['next_text'] = sonraki
    if model.startswith(('eleven_turbo_v2_5', 'eleven_flash_v2_5')):
        veri['language_code'] = 'tr'
    ses = _istek('/text-to-speech/%s?output_format=mp3_44100_128' % voice_id, veri)
    with open(cikis, 'wb') as f:
        f.write(ses)
    return cikis
