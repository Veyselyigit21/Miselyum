"""Miselyum tanıtım videosu ve sunum ekran görüntüleri.

Kendi Miselyum Kapısı örneğini (geçici veri klasörü, ayrı portlar) ve 95 sanal OCPP şarj cihazını başlatır; uygulamayı
görünmez bir Microsoft Edge penceresinde açıp giriş ekranından başlayarak bölüm bölüm gezer. Ekrana altyazı ve imleç
ekleyerek MP4 kaydeder (1536 × 864, %125 ölçek); aynı turda sunum için 1920 × 1080 ekran görüntüleri alır.
Videodaki her rakam uygulamanın kendisinden okunur, elle yazılmaz. Demo hesapları yalnız geçici klasörde oluşur ve
kayıttan sonra silinir; parola ekranda maskeli görünür.

Seslendirme: her altyazı Microsoft'un Türkçe nöral sesiyle (edge-tts) okunur; altyazı sesi bitene kadar ekranda kalır.
Altına, konuşma sırasında kendiliğinden kısılan, burada üretilen telifsiz bir odak müziği eklenir (ses_uret.py).

Kullanım:     python tanitim/kayit.py
              SK_SES=ahmet python tanitim/kayit.py   (erkek ses; varsayılan emel, SK_SES=yok: sessiz)
Gerekenler:   python -m pip install playwright imageio-ffmpeg edge-tts numpy   (+ kapi/gereksinimler.txt; Edge kurulu olmalı)
Çıktılar:     tanitim/Miselyum-tanitim.mp4 (sesli) · tanitim/Miselyum-tanitim-sessiz.mp4
              tanitim/bolumler.txt · tanitim/ekranlar/*.png · tanitim/ses/ (seslendirme önbelleği)
"""
import asyncio
import base64
import hashlib
import http.client
import os
import queue
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import wave

import imageio_ffmpeg
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tanitim')
sys.path.insert(0, OUT)
sys.path.insert(0, os.path.join(ROOT, 'kapi'))
from ses_uret import odak_muzigi  # noqa: E402
from guvenlik import Totp  # noqa: E402
import eleven  # noqa: E402
import kurgu  # noqa: E402
import json  # noqa: E402

SHOTS = os.path.join(OUT, 'ekranlar')
VIDEO = os.path.join(OUT, 'Miselyum-tanitim.mp4')
SILENT = os.path.join(OUT, 'Miselyum-tanitim-sessiz.mp4')
VOICE_DIR = os.path.join(OUT, 'ses')
VOICES = {'emel': 'tr-TR-EmelNeural', 'ahmet': 'tr-TR-AhmetNeural'}
SECIM = eleven.secim()   # tanitim/ses-secimi.json: ElevenLabs anlatıcısı (eleven_ornek.py --sec ile)
SES = os.environ.get('SK_SES', 'eleven' if SECIM else 'emel').lower()
SESLI = SES in VOICES or SES == 'eleven'
KURGU = os.path.join(VOICE_DIR, '_kurgu.json')   # sonradan yalnız müziği yeniden kurgulamak için
KURGU_ELEVEN = os.path.join(VOICE_DIR, '_kurgu-eleven.json')   # aynı kayıt, ElevenLabs sesiyle (--eleven-ses)
RATE = '+6%'  # konuşma hızı
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
FPS = 30
HIZ = float(os.environ.get('SK_HIZ', '1'))  # deneme turu için altyazı ve kart sürelerini kısaltır (ör. SK_HIZ=0.3)
EKRAN = os.environ.get('SK_EKRAN', '1') != '0'  # SK_EKRAN=0: yalnız video, ekran görüntüleri yeniden alınmaz
W, H, DPR = 1536, 864, 1.25  # arayüz %125 ölçekte; ekran görüntüleri 1920 × 1080, video kareleri 1536 × 864

KAPI_PORT, KAPI_OCPP = 8772, (9380, 9743, 9744)
BASE = 'http://127.0.0.1:%d' % KAPI_PORT

CHAPTERS = ['Giriş', 'Ağ ve sorun', 'Canlı saha', 'İki yönlü ikiz', 'Tesis', 'Riskler', 'Önlemler', 'Senaryolar', 'Güvenlik', 'İkinci şirket', 'Asistan', 'Belgeler ve gelecek']


# ---------- Miselyum Kapısı (bu kayıt için ayrı örnek) ----------
class Kapi:
    def __init__(self):
        self.veri = tempfile.mkdtemp(prefix='miselyum-video-')
        self.env = dict(os.environ, MISELYUM_VERI=self.veri, MISELYUM_PORT=str(KAPI_PORT), MISELYUM_OCPP_PORTLAR=','.join(map(str, KAPI_OCPP)),
                        MISELYUM_MFA_SURE='120', MISELYUM_GIRIS_PENCERE='20', PYTHONIOENCODING='utf-8')
        self.kapi = subprocess.Popen([sys.executable, os.path.join(ROOT, 'kapi', 'kapi.py'), '--sanal-yok'], env=self.env,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(80):
            try:
                c = http.client.HTTPConnection('127.0.0.1', KAPI_PORT, timeout=1)
                c.request('GET', '/giris.html', headers={'Host': '127.0.0.1:%d' % KAPI_PORT})
                c.getresponse().read()
                break
            except OSError:
                time.sleep(0.5)
        self.saha = subprocess.Popen([sys.executable, os.path.join(ROOT, 'kapi', 'sanal_saha.py')], env=self.env,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self._son = None

    def parola(self, ad):
        t = open(os.path.join(self.veri, 'demo-hesaplar.txt'), encoding='utf-8').read()
        return dict(re.findall(r'^(\w+)\s+parola: (\S+)', t, re.M))[ad]

    def kod(self, ad='yonetici'):
        """Geçerli iki adımlı kod; aynı kod ikinci kez kabul edilmediği için gerekirse sıradakini bekler."""
        with sqlite3.connect(os.path.join(self.veri, 'miselyum.db')) as c:
            sir = c.execute('SELECT totp FROM kullanicilar WHERE ad = ?', (ad,)).fetchone()[0]
        while Totp.kod(sir) == self._son:
            time.sleep(1)
        self._son = Totp.kod(sir)
        return self._son

    async def taze_bekle(self, ad='yonetici'):
        """Son kullanılan kod geçersizleşene (yeni 30 sn penceresi) kadar bekler; kayıt sırasında bekleme olmasın."""
        with sqlite3.connect(os.path.join(self.veri, 'miselyum.db')) as c:
            sir = c.execute('SELECT totp FROM kullanicilar WHERE ad = ?', (ad,)).fetchone()[0]
        while Totp.kod(sir) == self._son:
            await asyncio.sleep(1)

    def kapat(self):
        for p in (self.saha, self.kapi):
            p.terminate()
            try:
                p.wait(timeout=10)
            except Exception:
                p.kill()
        shutil.rmtree(self.veri, ignore_errors=True)


async def bekle(page, ifade, timeout=30000):
    """Koşul doğru olana kadar bekler. Playwright'ın wait_for_function'ı sayfada eval kullanır; Kapı'nın CSP'si
    (script-src, unsafe-eval yok) bunu engellediği için koşul CDP üzerinden page.evaluate ile yoklanır."""
    son = time.time() + timeout / 1000
    while True:
        try:
            if await page.evaluate('() => !!(' + ifade + ')'):
                return
        except Exception:
            pass   # sayfa yenilenirken bağlam değişebilir
        if time.time() > son:
            raise TimeoutError('Beklenen koşul gerçekleşmedi: ' + ifade)
        await page.wait_for_timeout(250)


# ---------- Kayıt: CDP ekran yayını → sabit 30 fps → ffmpeg (H.264) ----------
class Recorder:
    def __init__(self, path):
        self.q = queue.Queue()
        self.proc = subprocess.Popen(
            [FFMPEG, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg',
             '-framerate', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
             '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path],
            stdin=subprocess.PIPE)
        self.t0 = None
        self.n = 0
        self.last = None
        self.paused = False
        self.offset = 0.0
        self.pause_at = 0.0
        self.marks = []
        self.th = threading.Thread(target=self._run, daemon=True)
        self.th.start()

    def push(self, ts, data):
        if not self.paused:
            self.q.put((ts - self.offset, data))

    def pause(self):
        self.paused = True
        self.pause_at = time.time()

    def resume(self):
        self.offset += time.time() - self.pause_at
        self.paused = False

    def now(self):
        return 0.0 if self.t0 is None else time.time() - self.offset - self.t0

    def mark(self, title):
        self.marks.append((self.now(), title))

    def _fill(self, ts):
        target = int((ts - self.t0) * FPS)
        while self.last is not None and self.n < target:
            self.proc.stdin.write(self.last)
            self.n += 1

    def _run(self):
        while True:
            item = self.q.get()
            if item is None:
                break
            ts, data = item
            if self.t0 is None:
                self.t0 = ts
            self._fill(ts)
            self.last = data

    def close(self):
        end = time.time() - self.offset
        self.q.put(None)
        self.th.join()
        if self.t0 is not None:
            self._fill(end)
        self.proc.stdin.close()
        self.proc.wait()


# ---------- Ekrana eklenen katman: altyazı, bölüm kartı, imleç ----------
OVERLAY = r"""
(() => {
  try { localStorage.setItem('miselyum:aiMode', '"kb"'); localStorage.setItem('miselyum:theme', '"light"'); localStorage.setItem('miselyum:tasindi', '1'); } catch (e) {}
  const css = `
  #rec-cap{position:fixed;left:50%;bottom:28px;transform:translate(-50%,14px);z-index:2147483000;width:max-content;max-width:min(1080px,calc(100vw - 96px));
    padding:15px 24px 20px;border-radius:18px;background:rgba(17,18,16,.95);color:#f3f4ef;font:500 21px/1.45 Archivo,"Segoe UI",sans-serif;
    box-shadow:0 18px 50px -16px rgba(0,0,0,.55);opacity:0;transition:opacity .35s,transform .35s;pointer-events:none}
  #rec-cap.on{opacity:1;transform:translate(-50%,0)}
  #rec-cap .k{display:flex;align-items:center;gap:8px;font:600 13.5px/1 Archivo,sans-serif;color:#c8f031;margin-bottom:8px}
  #rec-cap .k i{width:8px;height:8px;border-radius:50%;background:#c8f031}
  #rec-cap .bar{position:absolute;left:24px;right:24px;bottom:9px;height:3px;border-radius:3px;background:rgba(255,255,255,.13);overflow:hidden}
  #rec-cap .bar b{display:block;height:100%;width:0;background:#c8f031}
  #rec-card{position:fixed;inset:0;z-index:2147483001;display:flex;flex-direction:column;justify-content:center;padding:0 9vw;background:#111210;color:#f3f4ef;
    opacity:0;transition:opacity .5s;pointer-events:none;font-family:Archivo,"Segoe UI",sans-serif}
  #rec-card.on{opacity:1}
  #rec-card .logo{position:absolute;left:9vw;top:8vh;display:flex;align-items:center;gap:12px;font:700 24px Archivo,sans-serif}
  #rec-card .logo svg{width:38px;height:38px}
  #rec-card .ck{display:flex;align-items:center;gap:12px;font:600 19px/1 Archivo,sans-serif;color:#c8f031;margin-bottom:24px}
  #rec-card .ck span{display:inline-grid;place-items:center;min-width:36px;height:36px;padding:0 9px;border-radius:10px;background:#c8f031;color:#111210;font-weight:700}
  #rec-card h1{font:700 72px/1.06 Archivo,sans-serif;letter-spacing:-.03em;margin:0;max-width:20ch}
  #rec-card h1 em{font-style:normal;color:#c8f031}
  #rec-card p{font:400 25px/1.5 Archivo,sans-serif;color:#a9ada3;margin:24px 0 0;max-width:62ch}
  #rec-card .items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:34px;max-width:1120px}
  #rec-card .items div{display:flex;align-items:center;gap:14px;padding:15px 18px;border-radius:14px;background:#1b1c19;font:600 21px Archivo,sans-serif}
  #rec-card .items b{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:9px;background:#c8f031;color:#111210;font-size:17px;flex:none}
  #rec-card .cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;margin-top:30px}
  #rec-card .col{padding:24px 26px;border-radius:18px;background:#1b1c19}
  #rec-card .col h2{font:700 25px/1.2 Archivo,sans-serif;margin:0 0 4px}
  #rec-card .col .s{font:500 16px Archivo,sans-serif;color:#c8f031;margin-bottom:14px}
  #rec-card .col ol{margin:0;padding-left:22px;columns:2;column-gap:26px;font:400 16.5px/1.6 Archivo,sans-serif;color:#c9ccc2}
  #rec-card .net{position:absolute;right:7vw;top:50%;transform:translateY(-50%);width:34vw;opacity:.9}
  #rec-card .net path{fill:none;stroke:#c8f031;stroke-width:1.6;stroke-linecap:round;opacity:.5;stroke-dasharray:600;stroke-dashoffset:600;animation:recgrow 2.6s cubic-bezier(.2,.7,.2,1) forwards}
  #rec-card .net circle{fill:#c8f031}
  @keyframes recgrow{to{stroke-dashoffset:0}}
  #rec-card .steps{position:absolute;left:9vw;right:9vw;bottom:8vh;display:flex;gap:8px}
  #rec-card .steps i{flex:1;height:5px;border-radius:5px;background:#2a2c27}
  #rec-card .steps i.done{background:#5d6150}
  #rec-card .steps i.on{background:#c8f031}
  #rec-cur{position:fixed;z-index:2147483002;left:50vw;top:60vh;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;
    background:rgba(200,240,49,.45);border:2.5px solid #111210;box-shadow:0 0 0 2px #fff,0 4px 12px rgba(0,0,0,.3);
    transition:left .75s cubic-bezier(.3,.7,.2,1),top .75s cubic-bezier(.3,.7,.2,1),opacity .3s;pointer-events:none}
  #rec-cur.click::after{content:"";position:absolute;inset:-14px;border-radius:50%;border:3px solid #c8f031;animation:recping .6s ease-out}
  @keyframes recping{from{transform:scale(.3);opacity:1}to{transform:scale(1.3);opacity:0}}
  html.rec-hide #rec-cap, html.rec-hide #rec-cur{visibility:hidden}
  html.rec-card-on #rec-cur{opacity:0}`;
  const LOGO = '<svg viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="9" fill="#c8f031"/><path d="M16 17.5V25.5M16 17.5 9 12.5M16 17.5l7-5.5M16 17.5l8.5 3M9 12.5 7.5 7M9 12.5l-3.5 2.5M23 12l-1-5M16 25.5l-5 1.5M16 25.5l5 1.5" fill="none" stroke="#111210" stroke-width="2.1" stroke-linecap="round"/><circle cx="16" cy="17.5" r="3.1" fill="#111210"/></svg>';
  const NET = '<svg class="net" viewBox="0 0 520 300"><path d="M260 150C220 120 170 110 110 70M260 150C300 118 352 104 410 62M260 150C224 182 176 204 116 236M260 150C300 184 350 204 404 240M260 150V40M260 150V266M110 70 70 40M110 70 62 96M410 62l44-26M410 62l50 30M116 236l-46 18M404 240l50 16M260 40l-30-22M260 40l30-22"/><circle cx="260" cy="150" r="12"/><circle cx="110" cy="70" r="6"/><circle cx="410" cy="62" r="6"/><circle cx="116" cy="236" r="6"/><circle cx="404" cy="240" r="6"/><circle cx="260" cy="40" r="4"/><circle cx="260" cy="266" r="4"/></svg>';
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function boot() {
    if (document.getElementById('rec-cap')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const cap = document.createElement('div'); cap.id = 'rec-cap'; document.body.appendChild(cap);
    const card = document.createElement('div'); card.id = 'rec-card'; document.body.appendChild(card);
    const cur = document.createElement('div'); cur.id = 'rec-cur'; document.body.appendChild(cur);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.__rec = {
    cap(k, t, secs) {
      const el = document.getElementById('rec-cap');
      el.innerHTML = '<div class="k"><i></i>' + esc(k) + '</div><div class="t">' + esc(t) + '</div><div class="bar"><b></b></div>';
      el.classList.add('on');
      const b = el.querySelector('.bar b');
      b.style.transition = 'none'; b.style.width = '0';
      setTimeout(() => { b.style.transition = 'width ' + secs + 's linear'; b.style.width = '100%'; }, 30);
    },
    capOff() { const el = document.getElementById('rec-cap'); if (el) el.classList.remove('on'); },
    card(o) {
      const el = document.getElementById('rec-card');
      let html = '<div class="logo">' + LOGO + 'Miselyum</div>';
      if (o.net) html += NET;
      if (o.kicker) html += '<div class="ck">' + (o.n ? '<span>' + o.n + '</span>' : '') + esc(o.kicker) + '</div>';
      html += '<h1>' + o.title + '</h1>';
      if (o.sub) html += '<p>' + esc(o.sub) + '</p>';
      if (o.items) html += '<div class="items">' + o.items.map((t, i) => '<div><b>' + (i + 1) + '</b>' + esc(t) + '</div>').join('') + '</div>';
      if (o.cols) html += '<div class="cols">' + o.cols.map(c => '<div class="col"><h2>' + esc(c.title) + '</h2><div class="s">' + esc(c.sub) + '</div><ol>' + c.items.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol></div>').join('') + '</div>';
      if (o.total) html += '<div class="steps">' + Array.from({ length: o.total }, (_, i) => '<i class="' + (i + 1 < o.n ? 'done' : i + 1 === o.n ? 'on' : '') + '"></i>').join('') + '</div>';
      el.innerHTML = html;
      el.classList.add('on');
      document.documentElement.classList.add('rec-card-on');
      this.capOff();
    },
    cardOff() { document.getElementById('rec-card').classList.remove('on'); document.documentElement.classList.remove('rec-card-on'); },
    cur(x, y) { const c = document.getElementById('rec-cur'); c.style.left = x + 'px'; c.style.top = y + 'px'; },
    click() { const c = document.getElementById('rec-cur'); c.classList.remove('click'); void c.offsetWidth; c.classList.add('click'); },
    hide(on) { document.documentElement.classList.toggle('rec-hide', on); }
  };
})();
"""

FACTS = r"""
(() => {
  const R = SK.risk, F = SK.fmt, today = new Set(SK.defaultEnabled), f1 = SK.plans.faz1, all = SK.plans.all;
  const major = set => SK.risks.filter(r => R.eval(r, set).band.major).length;
  const blocked = set => SK.scenarios.filter(s => SK.scenario.calc(s, set).blocked).length;
  const sm = R.summary(today), s1 = R.summary(f1);
  const out = {
    days: SK.daysToDeadline(), sites: SK.twin.sites.length, sockets: SK.twin.connectors.length, employees: SK.company.employees,
    risks: SK.risks.length, controls: SK.controls.length, scenarios: SK.scenarios.length,
    aleToday: F.tlShort(sm.aleRes), aleF1: F.tlShort(s1.aleRes), costF1: F.tlShort(s1.cost),
    majorToday: major(today), readyToday: F.pct(R.readiness(today)), readyF1: F.pct(R.readiness(f1)),
    f1n: f1.size, todayn: today.size, blkToday: blocked(today), blkF1: blocked(f1),
    frameworks: SK.frameworks.map(f => f.short).join(', '), reqs: SK.frameworks.reduce((a, f) => a + f.reqs.length, 0),
    hqM2: F.n(SK.hq.plot.m2), floors: SK.hq.building.floors,
    devices: SK.link.devices, p1: SK.link.ozet ? SK.link.ozet.profil[1] : 0,
    tests: SK.securityTests ? SK.securityTests.ozet.gecti + '/' + SK.securityTests.ozet.toplam : ''
  };
  if (SK.scenarioMap.csms) {
    const mfa = new Set(today); mfa.add('mfa');
    const a = SK.scenario.calc(SK.scenarioMap.csms, today), b = SK.scenario.calc(SK.scenarioMap.csms, mfa);
    Object.assign(out, { csmsToday: F.tlShort(a.total), csmsMfa: F.tlShort(b.total), csmsSockets: a.affected.length, csmsMfaAt: b.at + 1 });
  }
  return out;
})()
"""


# ---------- Seslendirme ----------
SIRA = {'1': 'birinci', '2': 'ikinci', '3': 'üçüncü', '4': 'dördüncü', '5': 'beşinci'}


def konusma(t):
    """Altyazıyı okunacak metne çevirir: kısaltmalar, para birimi, yüzde ve sıra sayıları."""
    s = t
    for a, b in [('OpenStreetMap', 'Open Street Map'), ('OpenRouter', 'Open Router'), ('ISO/IEC ', 'ISO '), ('ISO/SAE ', 'ISO SAE '),
                 ('3B ', 'üç boyutlu '), ('m² ', 'metrekare '), ('SQL', 'es kü el'), ('SSRF', 'es es ar ef'), ('XSS', 'iks es es'),
                 ('CSRF', 'si es ar ef'), ('TLS', 'te le se'), ('UNECE', 'BM Avrupa Ekonomik Komisyonu'), ('1.6J', 'bir nokta altı'),
                 ('kapi/saldiri_testleri.py', 'saldırı testleri dosyası'), ('OCPP', 'o se pe pe'), ('EPDK', 'e pe de ke'),
                 ('KVKK', 'ka ve ka ka'), ('BGYS', 'be ge ye se'), ('MFA', 'em ef a'), ('WAF', 'vaf'), ('OTA', 'o te a'),
                 ('CSMS', 'si es em es'), ('ISO 27001', 'ISO yirmi yedi bin bir'),
                 ('→', ','), (' · ', ', '), ('—', ','), ('(', ', '), (')', ',')]:
        s = s.replace(a, b)
    s = re.sub(r'(\d+),0 (mn|bin|mlr) TL', r'\1 \2 TL', s)
    s = re.sub(r'(\d) mn TL', r'\1 milyon lira', s)
    s = re.sub(r'(\d) mlr TL', r'\1 milyar lira', s)
    s = s.replace(' bin TL', ' bin lira').replace(' TL', ' lira')
    s = re.sub(r'%(\d+)', r'yüzde \1', s)
    s = re.sub(r'(\d+)/(\d+) ', r'\1 üzerinden \2 ', s)
    s = re.sub(r'\b([1-5])\. adım', lambda m: SIRA[m.group(1)] + ' adım', s)
    s = re.sub(r',\s*,', ',', s)
    s = re.sub(r'\s+([,.;:])', r'\1', s)
    s = re.sub(r'\s{2,}', ' ', s)
    return s.strip(' ,')


def wav_len(path):
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()


# Bölüme göre anlatım tonu (ElevenLabs): açılış ve finalde sıcak ve vurgulu, senaryo ve güvenlikte gergin ve tempolu,
# teknik bölümlerde sakin ve net. stability düştükçe ifade artar; style vurguyu, speed hızı ayarlar.
TON = {'acilis': {'stability': 0.38, 'style': 0.45, 'speed': 0.97}, 'sicak': {'stability': 0.42, 'style': 0.4, 'speed': 1.0},
       'enerjik': {'stability': 0.45, 'style': 0.35, 'speed': 1.04}, 'gergin': {'stability': 0.42, 'style': 0.42, 'speed': 1.05},
       'net': {'stability': 0.55, 'style': 0.2, 'speed': 1.0}}
BOLUM_TONU = {'Miselyum': 'acilis', 'Kapanış': 'acilis', 'Belgeler ve gelecek': 'sicak', 'Giriş': 'net', 'Ağ ve sorun': 'gergin',
              'Canlı saha': 'enerjik', 'İki yönlü ikiz': 'enerjik', 'Tesis': 'net', 'Riskler': 'net', 'Önlemler': 'net', 'Senaryolar': 'gergin',
              'Güvenlik': 'gergin', 'İkinci şirket': 'enerjik', 'Asistan': 'sicak'}


def ton(bolum):
    return TON[BOLUM_TONU.get((bolum or 'Miselyum').split(' · ', 1)[-1], 'net')]


async def seslendir(texts, bolum=None):
    """Her metni bir kez seslendirir (önbellekli); metin → (wav yolu, süre)."""
    if SES == 'eleven':
        return await seslendir_eleven(texts, bolum or {})
    import edge_tts
    os.makedirs(VOICE_DIR, exist_ok=True)
    sem = asyncio.Semaphore(4)
    out = {}

    async def one(t):
        spoken = konusma(t)
        key = hashlib.sha1((VOICES[SES] + RATE + spoken).encode('utf-8')).hexdigest()[:16]
        wav = os.path.join(VOICE_DIR, key + '.wav')
        if not os.path.exists(wav):
            mp3 = wav[:-4] + '.mp3'
            async with sem:
                for attempt in range(4):
                    try:
                        await edge_tts.Communicate(spoken, VOICES[SES], rate=RATE).save(mp3)
                        break
                    except Exception:
                        if attempt == 3:
                            raise
                        await asyncio.sleep(2 + attempt * 2)
            subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', mp3, '-ar', '24000', '-ac', '1', wav], check=True)
            os.remove(mp3)
        out[t] = (wav, wav_len(wav))

    await asyncio.gather(*(one(t) for t in dict.fromkeys(texts)))
    return out


async def seslendir_eleven(texts, bolum):
    """ElevenLabs ile seslendirir; komşu cümleler tonlama sürekliliği için modele bağlam olarak verilir."""
    os.makedirs(VOICE_DIR, exist_ok=True)
    sira = list(dict.fromkeys(texts))
    sem = asyncio.Semaphore(2)
    out = {}
    loop = asyncio.get_running_loop()

    async def one(i, t):
        spoken = konusma(t)
        ayar = ton(bolum.get(t))
        anahtar_metni = json.dumps([SECIM['voice_id'], SECIM.get('model'), ayar, spoken], ensure_ascii=False)
        key = 'el-' + hashlib.sha1(anahtar_metni.encode('utf-8')).hexdigest()[:16]
        wav = os.path.join(VOICE_DIR, key + '.wav')
        if not os.path.exists(wav):
            mp3 = wav[:-4] + '.mp3'
            onceki = konusma(sira[i - 1]) if i else None
            sonraki = konusma(sira[i + 1]) if i + 1 < len(sira) else None
            async with sem:
                await loop.run_in_executor(None, lambda: eleven.seslendir(spoken, SECIM['voice_id'], mp3, SECIM.get('model'), ayar, onceki, sonraki))
            subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', mp3, '-ar', '44100', '-ac', '1', wav], check=True)
            os.remove(mp3)
        out[t] = (wav, wav_len(wav))

    await asyncio.gather(*(one(i, t) for i, t in enumerate(sira)))
    return out


def ses_izi(placements, total, path):
    """Seslendirme parçalarını videodaki zamanlarına yerleştirir (mono; örnekleme hızı parçalardan)."""
    import numpy as np
    sr = 24000
    if placements:
        with wave.open(placements[0][1]) as w:
            sr = w.getframerate()
    buf = np.zeros(int((total + 2) * sr), np.int32)
    for x in placements:
        t, wav = x[0], x[1]
        with wave.open(wav) as w:
            a = np.frombuffer(w.readframes(w.getnframes()), np.int16)
        i = max(0, int(t * sr))
        j = min(len(buf), i + len(a))
        buf[i:j] += a[:j - i]
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(np.clip(buf, -32768, 32767).astype(np.int16).tobytes())


def karistir(silent, voice, music, out, sfx=None, muzik_duzey=0.8):
    """Görüntüye seslendirme, fon müziği ve efektleri ekler. Konuşurken müzik kısılır (sidechain); efektler kısılmaz.
    Sonuç -16 LUFS (YouTube ve sunum için standart düzey)."""
    fc = ('[1:a]aresample=48000,pan=stereo|c0=c0|c1=c0,asplit=2[v][sc];'
          '[2:a]aresample=48000,volume=%.2f[m];'
          '[m][sc]sidechaincompress=threshold=0.02:ratio=8:attack=25:release=650[md];' % muzik_duzey)
    girdiler = ['-i', silent, '-i', voice, '-i', music]
    if sfx:
        girdiler += ['-i', sfx]
        fc += '[3:a]aresample=48000[fx];[v][md][fx]amix=inputs=3:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]'
    else:
        fc += '[v][md]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]'
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error'] + girdiler + ['-filter_complex', fc,
                    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
                    '-shortest', '-movflags', '+faststart', out], check=True)


def miksaj(veri):
    """Kayıttan kalan bilgiyle (zamanlar, bölüm işaretleri, olaylar) sesi yeniden kurar: konuşma + sahne müziği + efektler."""
    total = veri['total']
    tmp_v, tmp_m, tmp_s = (os.path.join(VOICE_DIR, a) for a in ('_konusma.wav', '_muzik.wav', '_efekt.wav'))
    ses_izi([tuple(x) for x in veri['placements']], total, tmp_v)
    sahne = kurgu.kurgu([tuple(x) for x in veri['marks']], [tuple(x) for x in veri['olaylar']], total, FFMPEG, tmp_m, tmp_s)
    if not sahne:
        odak_muzigi(tmp_m, total)
        print('tanitim/muzik/ boş: bilgisayarda üretilen odak müziği kullanıldı', flush=True)
    karistir(SILENT, tmp_v, tmp_m, VIDEO, tmp_s if sahne else None, muzik_duzey=0.6 if sahne else 0.8)
    for y in (tmp_v, tmp_m, tmp_s):
        if os.path.exists(y):
            os.remove(y)


def eleven_karakter(veri):
    """Kayıttaki metinlerin ElevenLabs'a gidecek hâli: (metin listesi, toplam karakter)."""
    metinler = list(dict.fromkeys(x[2] for x in veri['placements']))
    return metinler, sum(len(konusma(t)) for t in metinler)


async def eleven_ses(veri):
    """Videoyu yeniden kaydetmeden ElevenLabs sesini aynı zamanlara yerleştirir. Yeni parça kendi yerine sığmazsa
    en çok %25 hızlandırılır (atempo; perde değişmez). Sonuç _kurgu-eleven.json olarak saklanır, video yeniden karıştırılır."""
    if not SECIM:
        raise SystemExit('Önce anlatıcıyı seçin: python tanitim/eleven_ornek.py --sec "Ad"')
    pl = sorted((list(x) for x in veri['placements']), key=lambda x: x[0])
    if not pl or any(len(x) < 4 for x in pl):
        raise SystemExit('Bu kayıtta metinler saklanmamış; videoyu bir kez yeniden kaydedin (python tanitim/kayit.py).')
    yeni = await seslendir_eleven([x[2] for x in pl], {x[2]: x[3] for x in pl})
    out, hizli = [], []
    for i, (t, _, metin, k) in enumerate(pl):
        wav, sure = yeni[metin]
        son = pl[i + 1][0] - 0.25 if i + 1 < len(pl) else veri['total'] - 0.3
        yer = max(0.8, son - t)
        if sure > yer:
            oran = min(1.25, sure / yer)
            hiz = wav[:-4] + '-x%d.wav' % round(oran * 100)
            if not os.path.exists(hiz):
                subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', wav, '-filter:a', 'atempo=%.3f' % oran, '-ar', '44100', '-ac', '1', hiz], check=True)
            hizli.append((metin[:50], round(oran, 2), round(sure - yer * oran, 1)))
            wav = hiz
        out.append([t, wav, metin, k])
    veri = dict(veri, placements=out, ses=SECIM.get('ad'))
    json.dump(veri, open(KURGU_ELEVEN, 'w', encoding='utf-8'), ensure_ascii=False)
    return veri, hizli


class Film:
    def __init__(self, page, rec, voice=None, kapi=None):
        self.page, self.rec, self.kapi = page, rec, kapi
        self.k = 'Miselyum'
        self.voice = voice or {}
        self.placements = []
        self.olaylar = []   # (videodaki saniye, efekt adı): tik, gecis, yukselis, vurus, glitch, basari

    def olay(self, ad, gecikme=0.0):
        self.olaylar.append((round(self.rec.now() + gecikme, 3), ad))

    async def wait(self, secs):
        await self.page.wait_for_timeout(int(secs * 1000))

    async def js(self, code, arg=None):
        return await self.page.evaluate(code, arg)

    async def ready(self):
        """Sayfa yenilendikten (giriş, şirket değişimi) sonra panelin kurulmasını bekler."""
        await bekle(self.page, 'window.SK && SK.plans && document.querySelector(".main") && window.__rec', timeout=30000)
        await self.page.evaluate('document.fonts.ready')
        await self.wait(1.5)

    async def cap(self, text, secs=None):
        if secs is None:
            secs = max(4.5, round(len(text.split()) / 2.7 + 1.8, 1))
        clip = self.voice.get(text)
        if clip:
            secs = max(secs, clip[1] + 0.8)
        secs = round(secs * HIZ, 2)
        await self.js('([k, t, s]) => __rec.cap(k, t, s)', [self.k, text, secs])
        if clip:
            self.placements.append((self.rec.now() + 0.2, clip[0], text, self.k))
        await self.wait(secs)

    async def card(self, title, sub=None, kicker=None, n=None, total=None, items=None, cols=None, secs=5.0, during=None, say=None, net=False):
        clip = self.voice.get(say) if say else None
        if clip:
            secs = max(secs, clip[1] + 1.6)
        secs *= HIZ
        self.olay('yukselis')                 # yükselme kart açılırken biter
        self.olay('gecis')
        self.olay('vurus', 0.45)
        await self.js('o => __rec.card(o)', {'title': title, 'sub': sub, 'kicker': kicker, 'n': n, 'total': total, 'items': items, 'cols': cols, 'net': net})
        await self.wait(0.6)
        if clip:
            self.placements.append((self.rec.now() + 0.1, clip[0], say, self.k))
        t = time.time()
        if during:
            await during()
        await self.wait(max(0.5, secs - (time.time() - t)))
        await self.js('__rec.cardOff()')
        await self.wait(0.6)

    async def chapter(self, n, title, sub, view=None, secs=5.0, prep=None, say=None):
        self.k = str(n) + ' · ' + CHAPTERS[n - 1]
        self.rec.mark(self.k)

        async def during():
            if prep:
                await self.js(prep)
            if view:
                await self.js('v => { SK.go(v); scrollTo(0, 0); }', view)
            await self.wait(1.2)
        await self.card(title, sub, kicker=CHAPTERS[n - 1], n=n, total=len(CHAPTERS), secs=secs, during=during, say=say)

    async def scroll(self, selector, offset=-100):
        await self.js('__rec.capOff()')
        await self.js('''([s, o]) => { const el = document.querySelector(s); if (!el) return;
          scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + scrollY + o), behavior: 'smooth' }); }''', [selector, offset])
        await self.wait(1.0)

    async def point(self, selector, click=True, settle=0.4):
        await self.js('__rec.capOff()')
        loc = self.page.locator(selector).first
        await loc.evaluate('''el => { const r = el.getBoundingClientRect();
          if (r.top < 90 || r.bottom > innerHeight - 20) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }''')
        await self.wait(0.8)
        box = await loc.bounding_box()
        await self.js('([x, y]) => __rec.cur(x, y)', [box['x'] + box['width'] / 2, box['y'] + box['height'] / 2])
        await self.wait(0.85)
        if click:
            self.olay('tik')
            await self.js('__rec.click()')
            try:
                await loc.click(timeout=2500)
            except Exception:
                await loc.evaluate("el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))")
            await self.page.mouse.move(W * 0.7, 6)
        await self.wait(settle)

    async def type(self, selector, text, delay=70):
        await self.point(selector, settle=0.2)
        await self.page.locator(selector).first.press_sequentially(text, delay=delay)
        await self.wait(0.3)

    async def ask(self, text):
        box = self.page.locator('.a-input')
        await box.click()
        await box.press_sequentially(text, delay=45)
        await self.wait(0.3)
        await box.press('Enter')
        await self.wait(1.4)

    async def shot(self, name):
        if not EKRAN:
            return
        self.rec.pause()
        await self.js('__rec.hide(true)')
        await self.wait(0.15)
        await self.page.screenshot(path=os.path.join(SHOTS, name + '.png'))
        await self.js('__rec.hide(false)')
        await self.wait(0.2)
        self.rec.resume()

    async def harita(self):
        """Harita stili yüklenene kadar bekler (yükleniyor katmanı kalkınca)."""
        try:
            await bekle(self.page, "!document.querySelector('.geo-loading') || document.querySelector('.geo-loading').classList.contains('is-ready')", timeout=15000)
        except Exception:
            pass
        await self.wait(1.2)

    async def tenant(self, tid):
        """Üst çubuktaki ağ göstergesinden şirket değiştirir (sayfa o şirketin paketiyle yeniden açılır)."""
        await self.point('.net-pill', settle=0.8)
        async with self.page.expect_navigation():
            await self.point('.net-item:has-text("%s")' % tid, settle=0.2)
        await self.ready()


class _Yok:
    def __getattr__(self, name):
        return self

    def __call__(self, *a, **k):
        return None


class _Klavye:
    async def press(self, *a, **k):
        return None


class Toplayici(Film):
    """Filmi tarayıcı açmadan oynatır ve seslendirilecek metinleri sırayla toplar."""
    def __init__(self):
        super().__init__(_Yok(), _Yok())
        self.page = type('P', (), {'keyboard': _Klavye()})()
        self.texts = []
        self.bolum = {}   # metin → bölüm (anlatım tonu için)

    def olay(self, *a, **k):
        return None

    async def wait(self, secs):
        return None

    async def js(self, code, arg=None):
        return None

    async def ready(self):
        return None

    async def cap(self, text, secs=None):
        self.texts.append(text)
        self.bolum.setdefault(text, self.k)

    async def card(self, title, sub=None, say=None, **kw):
        if say:
            self.texts.append(say)
            self.bolum.setdefault(say, kw.get('kicker') and self.k or self.k)

    async def scroll(self, *a, **k):
        return None

    async def point(self, *a, **k):
        return None

    async def type(self, *a, **k):
        return None

    async def ask(self, *a, **k):
        return None

    async def shot(self, *a, **k):
        return None

    async def tenant(self, *a, **k):
        return None

    async def harita(self):
        return None


async def giris(f: Film, yanlis=True):
    """Kapı'nın giriş ekranı: (isteğe bağlı) yanlış parola, doğru parola, iki adımlı kod."""
    if isinstance(f, Toplayici):
        return
    await f.type('#kullanici', 'yonetici')
    if yanlis:
        await f.type('#parola', 'yanlis-parola-123')
        await f.point('#gonder', settle=1.6)
    return True


async def film(f: Film, d: dict, dk: dict):
    P = f.page
    toplama = isinstance(f, Toplayici)
    # ---- Açılış ----
    f.rec.mark('Açılış')
    await f.card('Şirketlerin dağınık sistemlerini <em>tek bir risk ağına</em> bağlıyoruz.',
                 'Miselyum: ISO/IEC 27001 odaklı bilgi güvenliği dijital ikiz ağı. Örnek şirketler kurgusaldır: Akımyolu (şarj ağı) ve Kıvılcım Otomotiv (elektrikli otomobil üretimi).',
                 kicker='BGYS dijital ikiz ağı', secs=8, net=True,
                 say='Miselyum. Şirketlerin dağınık yazılımlarını ve cihazlarını tek bir risk ağına bağlayan, ISO 27001 odaklı bir bilgi güvenliği dijital ikiz ağı.')
    await f.card('Neden <em>Miselyum</em>?',
                 'Miselyum, mantarın toprak altındaki lif ağıdır: ağaçları birbirine bağlar, aralarında su, besin ve tehlike sinyali taşır. Toprağın üstünde gördüğümüz mantar, ağın yalnız küçük bir parçasıdır.',
                 kicker='Adın hikâyesi', items=['Hif ajanları: cihazların dilini konuşur', 'Miselyum ağı: şifreli olay akışı', 'Çekirdek: Kapı, ikiz ve risk motoru',
                                               'Mantar: panel, ağın görünen yüzü', 'Şirket paketi: her sektöre uyar', 'Kanıt: canlı cihaz ve saldırı testleri'],
                 secs=14, net=True,
                 say='Neden Miselyum? Miselyum, mantarın toprak altındaki lif ağıdır. Ağaçları birbirine bağlar, aralarında su, besin ve tehlike sinyali taşır. Biz de şirketlerin birbirinden kopuk sistemlerini dipten bağlayıp risk haritasını canlı veriyle besliyoruz. Toprağın üstünde gördüğünüz panel, bu ağın yalnız görünen yüzü.')
    await f.card('On iki bölümde bütün proje', kicker='Bu videoda', items=CHAPTERS, secs=7,
                 say='Bu videoda projeyi on iki bölümde, giriş ekranından başlayarak gösteriyoruz.')

    # ---- 1. Giriş ----
    await f.chapter(1, 'Panel artık bir <em>güvenlik kapısının</em> arkasında', 'Miselyum Kapısı · oturum, rol, iki adımlı doğrulama, istek sınırı, WAF, denetim kaydı',
                    say='Birinci bölüm: giriş. Panel artık bir güvenlik kapısının arkasında.')
    await f.cap('Miselyum Kapısı paneli yalnız giriş yapmış kullanıcıya açar. Her deneme, başarılı ya da başarısız, denetim kaydına yazılır.')
    await f.shot('01-giris')
    await giris(f, yanlis=True)
    await f.cap('Yanlış parolada cevap hep aynıdır; kullanıcı adının doğru olup olmadığı anlaşılmaz. Beş hatalı denemede hesap on beş dakika kilitlenir.')
    if not toplama:
        await P.locator('#parola').fill('')
        await f.type('#parola', f.kapi.parola('yonetici'), delay=55)
        await f.point('#gonder', settle=1.4)
    await f.cap('Yönetici hesabında ikinci adım var: telefondaki kimlik doğrulayıcının ürettiği, otuz saniyede bir değişen altı haneli kod.')
    await f.shot('02-iki-adim')
    if not toplama:
        await f.type('#kod', f.kapi.kod('yonetici'), delay=120)
        await P.wait_for_url('**/baslat.html**', timeout=20000)
        await f.ready()
        await bekle(P, "SK.link.mode === 'canli'", timeout=30000)
        await f.wait(2.5)
    await f.cap('Oturum yalnız sunucuda tutulur: çerez betikle okunamaz, başka sitelere gönderilmez. On beş dakika işlem yapılmazsa oturum kendiliğinden kapanır.')

    # ---- 2. Ağ ve sorun ----
    await f.chapter(2, 'Miselyum ağı ve sorun', f"Bağlı şirket: Akımyolu · EPDK son tarihine {d['days']} gün", view='genel',
                    say='İkinci bölüm: ağ ve sorun.')
    await f.point('.net-pill', settle=0.8)
    await f.cap(f"Üst çubuktaki yeşil düğme, hangi şirketin Miselyum ağına bağlı olduğunu gösterir. Şu an Akımyolu bağlı ve veri canlı geliyor: {d['devices']} cihaz OCPP ile bağlı.")
    await f.shot('03-ag-menusu')
    await P.keyboard.press('Escape')
    await f.point('.hero-side', click=False)
    await f.cap(f"Akımyolu'nun sorunu gerçek: EPDK yönetmeliği şarj ağlarına ISO 27001'i zorunlu yaptı. Son tarih 23 Mart 2027; {d['days']} gün kaldı.")
    await f.shot('04-genel-bakis')
    await f.scroll('.stat-row', -110)
    await f.cap(f"Bugünkü tablo: yıllık beklenen zarar {d['aleToday']}, {d['majorToday']} major risk, mevzuata hazırlık yalnızca {d['readyToday']}.")
    await f.scroll('.plan-cmp', -150)
    await f.cap(f"Dört plan yan yana. Önerilen Faz 1: {d['f1n']} önlem, yılda {d['costF1']}. Beklenen zarar {d['aleF1']} seviyesine iner, hazırlık {d['readyF1']} olur.")
    await f.shot('05-planlar')
    await f.scroll('.twin-level', -150)
    await f.cap("İkiz artık Seviye 3'te: cihazlar gerçek OCPP protokolüyle bağlı, durumları ikize kendiliğinden akıyor; ikiz de bu veriye bakıp sahaya kendisi komut gönderiyor ve sonucu doğruluyor.")
    await f.shot('06-ikiz-seviyesi')

    # ---- 3. Canlı saha ----
    await f.chapter(3, 'Canlı saha ikizi', f"{d['sites']} gerçek lokasyon · {d['sockets']} soket · {d['devices']} sanal cihaz OCPP 1.6J ile bağlı", view='saha',
                    say=f"Üçüncü bölüm: canlı saha. {d['sites']} gerçek lokasyon, {d['sockets']} soket.")
    await f.cap(f"Akımyolu'nun {d['sites']} lokasyonu OpenStreetMap'teki gerçek yerlerinde. Soketlerin durumu artık simülasyondan değil, Kapı'ya bağlı {d['devices']} sanal şarj cihazından geliyor.")
    await f.point('.live', click=False)
    await f.cap('Canlı şerit: bağlı cihaz sayısı, şarjdaki araçlar ve anlık güç. Sahada bir dakika, ekranda bir saniyeye sıkıştırıldı.')
    await f.scroll('.geo-wrap', -130)
    if not toplama:
        await bekle(P, "!document.querySelector('.geo-loading') || document.querySelector('.geo-loading').classList.contains('is-ready')", timeout=20000)
    await f.wait(1.0)
    await f.shot('07-saha-canli')
    await f.point('.geo-tools button:has-text("Ankara")', settle=2.0)
    await f.point('.mk[aria-label^="Armada AVM 1"]', settle=2.2)
    await f.scroll('.geo-wrap', -130)
    await f.cap('Bir lokasyona tıklayınca harita sokağa iner: 3B binalar, gerçek adres, merkezden sürüş süresi ve en yakın itfaiye.')
    await f.shot('08-lokasyon-3b')
    await f.point('.geo-tools button[data-b="koyu"]', settle=1.0)
    await f.harita()
    await f.cap('Harita hazır olana kadar yükleniyor göstergesi çıkar; üç görünümü var: açık, gece için koyu ve uydu.', 5)
    await f.shot('09-harita-koyu')
    await f.point('.geo-tools button[data-b="uydu"]', settle=1.0)
    await f.harita()
    await f.wait(2.0)
    await f.point('.geo-tools button[data-b="acik"]', settle=1.0)
    await f.harita()
    await f.scroll('.log', -260)
    await f.cap('Akan mesajlar gerçek OCPP 1.6J mesajları: açılış bildirimi, durum değişikliği, şarj başlangıcı ve sayaç değerleri.')
    await f.shot('10-ocpp-akisi')

    # ---- 4. İki yönlü ikiz (Seviye 3) ----
    await f.chapter(4, 'İkiz artık sahaya <em>kendisi yazıyor</em>', 'Seviye 3 · sahadan oku → ikizde karar ver → cihaza komut gönder → cihazın cevabıyla doğrula', view='saha',
                    say='Dördüncü bölüm: iki yönlü ikiz. İkiz artık yalnız izlemiyor; sahaya kendisi yazıyor.')
    await f.scroll('#seviye3', -90)
    await f.cap("Seviye 2'de veri yalnız cihazdan ikize akıyordu. Seviye 3'te ikiz bu veriye bakıp kendisi karar veriyor, cihaza OCPP komutu gönderiyor ve komutun gerçekten uygulandığını cihazın bir sonraki mesajından doğruluyor.")
    await f.shot('10a-seviye3')
    await f.scroll('#seviye3 .rules', -120)
    await f.cap('Beş kural çalışıyor. Yazılımsal bir arıza on beş saniyede geçmezse ikiz soketi yeniden başlatıyor; kendiliğinden düzelmesi ortalama doksan saniye sürüyordu. Topraklama arızasında ise soketi kilitleyip saha ekibine iş emri açıyor.')
    await f.scroll('#seviye3 .l3-log', -150)
    await f.cap('Eylem kaydında her kararın nedeni, gönderilen OCPP komutu, cihazın yanıtı ve doğrulama süresi var. Diğer sokette şarj sürüyorsa ikiz üniteyi değil yalnız arızalı soketi yeniden başlatıyor; o şarj kesilmiyor.')
    await f.shot('10b-eylem-kaydi')
    await f.scroll('#seviye3 .l3-grid', -110)
    await f.cap('Şebeke talebi: dağıtım şirketi puant saatinde yükü yüzde otuz azaltmamızı istiyor. Talebi uygulamak kritik bir işlem; Kapı iki adımlı kodu yeniden soruyor.')
    await f.point('#seviye3 button:has-text("Talebi uygula")', settle=1.2)
    if not toplama:
        await f.type('.mfa-in', f.kapi.kod('yonetici'), delay=120)
        await bekle(P, "SK.ikiz3 && SK.ikiz3.ozet && SK.ikiz3.ozet.talep && SK.ikiz3.ozet.talep.ulasildi != null", timeout=20000)
        await f.wait(1.0)
    f.olay('basari')
    await f.cap('İkiz gücü aktif şarjlara orantılı paylaştırdı: her şarja ayrı bir güç profili gitti, ağ yükü saniyeler içinde hedefe indi ve cihazların ölçümü bunu doğruladı. Hiçbir şarj kesilmedi, yalnız yavaşladı.')
    await f.shot('10c-sebeke-talebi')
    await f.scroll('.chart', -170)
    await f.wait(1.5)
    await f.cap('Yük grafiğindeki kesik çizgi talep hedefi; ikiz ağı bu çizginin altında tutuyor. Talep bitince sınırlar kademeli kalkıyor, yük birden sıçramıyor.')
    await f.scroll('#seviye3 .l3-grid', -110)
    await f.cap('Şimdi bir saldırı tatbikatı: bir şarj ünitesine imzasız yazılım paketi gönderiyoruz. İmzalı yazılım doğrulaması henüz açık değil, yani cihaz paketi kabul edecek.')
    await f.point('#seviye3 button:has-text("İmzasız yazılım gönder")', settle=0.4)
    f.olay('glitch')
    if not toplama:
        await bekle(P, "SK.ikiz3 && SK.ikiz3.ozet && SK.ikiz3.ozet.karantina['AKY-ANK-01-1']", timeout=20000)
        await f.wait(1.5)
    await f.cap('Cihaz oynanmış yazılımla yeniden açıldı. İkiz açılış mesajındaki sürümü tanıdı ve üniteyi saniyeler içinde karantinaya aldı: şarj başlatılamıyor, olay denetim kaydına yazıldı.')
    await f.shot('10d-karantina')
    await f.point('#seviye3 button:has-text("Onaylı yazılımı yükle")', settle=0.6)
    if not toplama:
        await bekle(P, "SK.ikiz3 && SK.ikiz3.ozet && !SK.ikiz3.ozet.karantina['AKY-ANK-01-1']", timeout=30000)
        await f.wait(1.0)
    f.olay('basari')
    await f.cap('Geri dönüşü yönetici başlatıyor: onaylı yazılım kablosuz yüklendi, cihaz onaylı sürümle açıldı ve ikiz karantinayı kendiliğinden kaldırdı. Faz 2\'deki imzalı yazılım doğrulaması açılınca cihaz bu paketi kendisi reddediyor.')
    await f.cap('Bir de fren var: ikiz bir dakikada en fazla on cihazı durdurabilir. Sahte mesajlarla ikizi kendi ağını kapatmaya zorlamak bu yüzden mümkün değil.')

    # ---- 5. Tesis ----
    await f.chapter(5, 'Merkez tesis', f"OSTİM, Ankara · {d['hqM2']} m² arsa · {d['floors']} katlı bina · {d['employees']} çalışan", view='merkez',
                    say=f"Beşinci bölüm: tesis. Ankara OSTİM'deki merkez bina ve {d['employees']} çalışan.")
    await f.point('.view-head .seg button[data-id="arsa"]', settle=0.8)
    await f.cap('Vaziyet planı: çevre çiti, tek giriş, güvenlik kulübesi, kameralar ve görüş alanları, jeneratör ve test şarj noktaları.')
    await f.shot('11-vaziyet-plani')
    await f.point('.view-head .seg button[data-id="kat1"]', settle=0.8)
    await f.point('svg.plan-svg g[aria-label="Operasyon merkezi (7/24)"]', settle=0.8)
    await f.cap('Bir odaya tıklayınca içindeki varlıklar, kimlerin çalıştığı ve odaya bağlı riskler açılır. Kat planı şirket paketinden gelir; her şirketin kendi planı vardır.')
    await f.shot('12-kat-plani')

    # ---- 6. Riskler ----
    await f.chapter(6, f"{d['risks']} risk, liraya çevrildi", 'Olasılık × etki · yıllık beklenen kayıp = tek olay kaybı × yıllık sıklık', view='riskler',
                    say=f"Altıncı bölüm: riskler. {d['risks']} risk, liraya çevrildi.")
    await f.cap('Her risk iki soruyla ölçülür: bir kez olursa kaç lira kaybettirir, yılda kaç kez olur? Çarpımı yıllık beklenen kayıptır.')
    await f.scroll('.heat', -170)
    await f.cap('Isı haritası olasılık ve etkiyi birden beşe kadar gösterir. Skoru on ve üzeri olanlar major risk, altındakiler minör.')
    await f.shot('13-isi-haritasi')
    await f.scroll('table.data', -170)
    await f.point('table.data tr.clickable', settle=0.8)
    await f.cap('Her riskin tehdidi, zafiyeti, sahibi, onu azaltan önlemler ve devredilebileceği sigorta tek satırda açılır.')
    await f.shot('14-risk-kaydi')

    # ---- 7. Önlemler ----
    await f.chapter(7, f"{d['controls']} önlem, maliyet ve faydasıyla", 'ISO/IEC 27001:2022 Ek A eşlemesi · iki fazlı risk işleme planı', view='kontroller',
                    say=f"Yedinci bölüm: önlemler. {d['controls']} önlem, maliyeti ve faydasıyla.")
    await f.cap(f"Her önlem ISO 27001 Ek A'daki bir kontrole karşılık gelir. Bugün yalnız {d['todayn']} tanesi açık. Kapı ile açıldığında değişiklik önce sunucuya sorulur: izleyici rolü önlem değiştiremez.")
    await f.shot('15-onlemler')
    await f.point('button:has-text("Faz 1 planı")', settle=1.5)
    await f.cap(f"Faz 1 planı tek tıkla uygulanır: {d['f1n']} önlem, yılda {d['costF1']}. Beklenen zarar {d['aleF1']}, mevzuata hazırlık {d['readyF1']}.")
    await f.shot('16-faz1')
    await f.js("SK.go('saha')")
    await f.wait(1.5)
    await f.scroll('.log', -260)
    await f.cap(f"Faz 1'deki önlemlerden biri OCPP güvenlik profili geçişi. Önlem açıldığı anda Kapı şifresiz bağlantıları kapattı; {d['p1']} cihaz birkaç saniyede TLS ile yeniden bağlandı.")
    await f.shot('17-profil-gecisi')
    await f.js("SK.go('sigorta'); scrollTo(0, 0)")
    await f.wait(1.2)
    await f.cap('Kalan riskin bir kısmı sigortayla devredilir; poliçe şartları önlemlerle eşleştirilir.')
    await f.shot('18-sigorta')
    await f.js("SK.go('uyum'); scrollTo(0, 0)")
    await f.wait(1.2)
    await f.cap(f"Uyum ekranı {d['frameworks']} gerekliliklerini önlemlere bağlar ve boşlukları gösterir.")
    await f.shot('18b-uyum')

    # ---- 8. Senaryolar ----
    await f.chapter(8, 'Ne olursa? Olay senaryoları', f"{d['scenarios']} senaryo · siber, fiziksel, çevresel, tedarikçi ve insan kaynaklı",
                    view='saldiri', prep="SK.setEnabled(SK.defaultEnabled); SK.store.set('scenario', 'csms');",
                    say=f"Sekizinci bölüm: ne olursa? {d['scenarios']} olay senaryosu.")
    await f.cap('Bilgi güvenliği yalnız siber saldırı değil: yangın, sel, elektrik kesintisi, binaya sızan biri ya da hesabı kapatılmamış eski bir çalışan da bilgiyi ve hizmeti etkiler.')
    await f.shot('19-senaryolar')
    await f.point('#scn-run', settle=0.6)
    f.olay('glitch', 0.4)
    await f.scroll('.attack-grid .grid-even', -96)
    await f.cap('Merkezi yönetim sistemine saldırı: oltalama e-postası, çalınan parola, yönetici yetkisi ve bütün ağa durdurma komutu.', 7.5)
    await f.cap(f"Bugünkü önlemlerle saldırı hiçbir adımda durmuyor: {d.get('csmsSockets', 0)} soketin hepsi kırmızı, tek olay kaybı {d.get('csmsToday', '')}.")
    await f.shot('20-csms-saldirisi')
    await f.point('.stage-ctl button:has-text("Çok faktörlü")', settle=0.8)
    await f.point('#scn-run', settle=0.6)
    await f.scroll('.attack-grid .grid-even', -96)
    await f.wait(3.2)
    await f.cap(f"İkinci doğrulama adımı açılıp tekrar çalıştırınca saldırı {d.get('csmsMfaAt', 2)}. adımda duruyor. Kayıp {d.get('csmsToday', '')} yerine {d.get('csmsMfa', '')}.")
    f.olay('basari', -6)
    await f.shot('21-mfa-durdurdu')
    await f.js("SK.scenario.reset(); SK.setEnabled(SK.defaultEnabled)")
    await f.wait(0.8)
    await f.point('.scn-item:has-text("Kargo görevlisi")', settle=0.6)
    await f.point('#scn-run', settle=0.6)
    await f.scroll('.attack-grid .grid-even', -96)
    await f.cap('Fiziksel bir olay: kargo görevlisi kılığındaki biri bir çalışanın arkasından binaya giriyor. İzi merkez binanın kat planında adım adım görünüyor.', 6.5)
    await f.shot('22-binaya-sizma')
    await f.point('.scn-item:has-text("Teknik odada yangın")', settle=0.6)
    await f.point('#scn-run', settle=0.6)
    await f.scroll('.attack-grid .grid-even', -96)
    await f.cap('Teknik odada yangın hiçbir önlemle durmaz: yedekleme ve iş sürekliliği kaybı azaltır, kalanı sigortaya devredilir.', 6)
    await f.shot('22b-yangin')
    await f.js('SK.scenario.reset()')

    # ---- 9. Güvenlik ----
    await f.chapter(9, 'Güvenlik merkezi', 'Hayalet oturum · yetki yükseltme · XSS · SSRF · SQL enjeksiyonu · istek sınırı · WAF', view='guvenlik',
                    say='Dokuzuncu bölüm: güvenlik merkezi. İkiz yalnız risk hesaplamıyor, kendisi de korunuyor.')
    await f.cap('Bir isteğin yolculuğu: ana bilgisayar adı, istek sınırı, WAF, oturum, CSRF belirteci, rol ve şirket yetkisi. İstek ilk takıldığı yerde durur.')
    await f.shot('23-guvenlik')
    await f.scroll('.threats', -150)
    await f.cap('Her tehdidin karşısında somut korumalar ve ISO 27001 Ek A kontrolleri var: hayalet oturum, yetki yükseltme, XSS, SSRF, SQL enjeksiyonu, kaba kuvvet, CSRF, sahte cihaz ve oynanmış cihaz yazılımı.')
    await f.shot('24-tehditler')
    await f.scroll('.ocpp-bars', -200)
    await f.cap('Cihaz bağlantıları canlı: Profil 1 kapandığı için bütün cihazlar şifreli bağlı. Sahadaki bir cihaza komut göndermek ise kritik bir işlem.')
    await f.point('button:has-text("Hizmet dışı al")', settle=1.4)
    await f.cap('Komut yalnız yöneticiye açık ve son birkaç dakikada kimliğin yeniden doğrulanmasını ister. Kapı iki adımlı kodu yeniden soruyor.')
    await f.shot('25-kritik-islem')
    if not toplama:
        await f.type('.mfa-in', f.kapi.kod('yonetici'), delay=120)
        await f.wait(2.0)
    f.olay('basari')
    await f.cap('Kod doğrulanınca komut gerçek bir OCPP mesajı olarak cihaza gitti; cihaz kabul etti, ikiz de cihazın bir sonraki mesajıyla uygulandığını doğruladı.', 6)
    await f.point('button:has-text("Hizmete al")', settle=1.5)
    await f.point('button:has-text("Meta veri adresi")', settle=1.6)
    await f.cap('SSRF denemesi: sunucuyu bulut meta veri adresine istek atmaya zorlamak. WAF istek işlenmeden durduruyor; izinli bir alan adına ise yalnız HTTPS ile gidiliyor.')
    await f.point('button:has-text("İzinli: EPDK")', settle=3.5)
    await f.shot('26-ssrf')
    await f.point('button:has-text("SQLi: WAF yakalar")', settle=1.4)
    await f.cap('SQL enjeksiyonu denemesi WAF kuralına takılıyor ve veritabanına hiç ulaşmıyor.', 5)
    await f.point('button:has-text("atlatır")', settle=1.4)
    await f.cap('WAF\'ı atlatan bir girdi bile SQL olarak çalışmıyor: sorgu parametreli, sonuç sıfır kayıt.', 5.5)
    await f.shot('27-sqli')
    await f.js("const i = document.querySelector('input[type=search]'); i.value = ''; i.dispatchEvent(new Event('input'))")
    await f.wait(1.2)
    await f.scroll('.table-scroll', -220)
    await f.cap('Bütün bu denemeler denetim kaydında: kim, ne zaman, hangi adresten ve sonuç ne. Reddedilenler kırmızı.')
    await f.shot('28-denetim-kaydi')
    await f.js("[...document.querySelectorAll('.panel h2')].find(h => h.textContent === 'Saldırı testleri').scrollIntoView({ behavior: 'smooth', block: 'start' })")
    await f.wait(1.0)
    f.olay('basari', 0.3)
    await f.cap(f"Kanıt: kapi/saldiri_testleri.py kendi test örneğini açıp her korumayı gerçek saldırı istekleriyle sınıyor. {d['tests']} test geçti.")
    await f.shot('29-saldiri-testleri')
    await f.js('scrollTo({ top: 0, behavior: "smooth" })')
    await f.point('.user-pill', settle=1.2)
    await f.cap('Kullanıcı kendi açık oturumlarını görür ve kapatabilir; kapanan oturumun canlı veri akışı da anında kesilir.')
    await f.shot('30-oturumlar')
    await P.keyboard.press('Escape')

    # ---- 10. İkinci şirket ----
    await f.chapter(10, 'Aynı çekirdek, <em>başka bir sektör</em>', 'Kurgusal Kıvılcım Otomotiv · elektrikli otomobil üretimi · OPC UA ve OTA',
                    say='Onuncu bölüm: ikinci şirket. Aynı çekirdek, başka bir sektör.')
    await f.tenant('Kıvılcım')
    await f.cap(f"Kurgusal elektrikli otomobil üreticisi Kıvılcım Otomotiv: {dk['sites']} lokasyon, {dk['risks']} risk, {dk['scenarios']} senaryo. Lokasyonlar, fabrika planı, riskler ve mevzuat şirket paketinden geliyor.")
    await f.shot('31-kivilcim-genel')
    await f.js("SK.go('merkez'); scrollTo(0, 0)")
    await f.wait(1.5)
    await f.point('.view-head .seg button[data-id="uretim"]', settle=1.0)
    await f.cap('Fabrika planı: kaynak, boya, batarya, montaj ve hat sonu istasyonları; vardiyadaki personel ve kameralar.')
    await f.shot('32-kivilcim-fabrika')
    await f.js("SK.go('saldiri'); scrollTo(0, 0)")
    await f.wait(1.2)
    await f.point('.scn-item:has-text("OTA altyapısı")', settle=0.6)
    await f.point('#scn-run', settle=0.6)
    await f.scroll('.attack-grid .grid-even', -96)
    await f.cap('Senaryolar da sektöre özgü: araç filosuna kablosuz güncelleme altyapısı ele geçirilirse zararlı yazılım binlerce araca gidebilir.', 6.5)
    await f.shot('33-kivilcim-ota')
    await f.js("SK.scenario.reset(); SK.go('uyum'); scrollTo(0, 0)")
    await f.wait(1.2)
    await f.cap(f"Mevzuat da değişti: {dk['frameworks']}. Bugünkü hazırlık {dk['readyToday']}, Faz 1 ile {dk['readyF1']}.")
    await f.shot('34-kivilcim-uyum')
    await f.tenant('Akımyolu')

    # ---- 11. Asistan ----
    await f.chapter(11, 'Asistan', 'İnternetsiz bilgi tabanı · isteğe bağlı OpenRouter ya da bilgisayardaki yerel açık kaynak model', view='genel',
                    say='On birinci bölüm: asistan.')
    await f.point('.assist-fab', settle=0.6)
    await f.ask('Neden Miselyum?')
    await f.cap('Asistan bağlı şirketin verisiyle cevap verir; bilgi tabanı internetsiz çalışır, istenirse açık modellerle ya da bilgisayardaki yerel modelle konuşur.')
    await f.ask('Hayalet oturum nedir?')
    await f.wait(1.0)
    await f.cap('Güvenlik kavramlarını da açıklar ve cevabın altındaki düğmeyle ilgili ekrana götürür.', 5.5)
    await f.shot('35-asistan')
    await f.js("const c = document.querySelector('.a-close'); if (c) c.click();")

    # ---- 12. Belgeler ve gelecek ----
    f.k = '12 · ' + CHAPTERS[11]
    f.rec.mark(f.k)
    await f.card('Yazılı belgeler: politika ve risk raporu', kicker=CHAPTERS[11], n=12, total=len(CHAPTERS), secs=11,
                 say=f"On ikinci bölüm: belgeler ve gelecek. BGYS politikası ISO 27001'in yapısını izliyor. Risk analizi raporunda {d['risks']} risk, {d['controls']} önlem, {d['scenarios']} senaryo ve 93 kontrollük uygulanabilirlik bildirgesi var.",
                 cols=[
        {'title': 'BGYS Politikası', 'sub': 'ISO/IEC 27001:2022 · 15 bölüm',
         'items': ['Amaç', 'Kapsam', 'Kuruluşun bağlamı', 'Tanımlar', 'Politika beyanı', 'Hedefler', 'Roller ve sorumluluklar', 'Risk yönetimi',
                   'PUKÖ döngüsü', 'Konu bazlı politikalar', 'Yasal uyum', 'Farkındalık ve eğitim', 'İzleme ve iç denetim', 'İhlaller ve istisnalar', 'Gözden geçirme ve onay']},
        {'title': 'Risk Analizi Raporu', 'sub': f"{d['risks']} risk · {d['controls']} önlem · {d['scenarios']} senaryo · 93 kontrollük SoA",
         'items': ['Yönetici özeti', 'Yöntem', 'Varlık envanteri', 'Tehdit ortamı', 'Risk kaydı', 'Major riskler', 'Minör ve gözden kaçan riskler', 'Risk işleme planı',
                   'Sigorta ve risk devri', 'Senaryo analizleri', 'Artık risk ve kabul', 'Uyum boşluk analizi', 'İzleme', 'Uygulanabilirlik Bildirgesi']}])
    await f.card('Gelecek mimari ve entegrasyon', kicker='Sıradaki adımlar', secs=10,
                 items=['SIEM ve olay akışı (Wazuh)', 'OPC UA ve Modbus hif ajanları', 'Gerçek şarj yazılımı: EVerest', 'Kurumsal tek oturum: OIDC, SAML',
                        'Şirket başına anahtar: HSM', 'Yerel yapay zekâ ile belge taslağı'],
                 say='Sıradaki adımlar: SIEM ile olay akışı, OPC UA ve Modbus için yeni hif ajanları, açık kaynak EVerest ile gerçek şarj yazılımı, kurumsal tek oturum açma, şirket başına donanım güvenlik modülünde anahtar ve yerel yapay zekâyla belge taslağı.')
    await f.js("SK.go('yontem'); scrollTo(0, 0)")
    await f.wait(1.0)
    await f.cap('Belgelerdeki her sayı bu ikizde yeniden üretilebilir. Yöntem ekranı gerçek veriyi, gerçeğe kalibre edilen modeli, kurgusal şirketi ve varsayımları ayrı ayrı gösterir.')
    await f.shot('36-yontem')

    # ---- Kapanış ----
    f.k = 'Kapanış'
    f.rec.mark('Kapanış')
    await f.js("SK.go('genel'); scrollTo(0, 0)")
    await f.wait(0.8)
    await f.point('.topbar-in > .icon-btn', settle=1.2)
    await f.cap('Gece görünümü de var; sunum salonuna göre seçilebilir.', 4.5)
    await f.shot('37-gece-gorunumu')
    await f.point('.topbar-in > .icon-btn', settle=0.6)
    await f.card('Teşekkürler. <em>Miselyum</em>',
                 'Akımyolu Şarj Hizmetleri A.Ş. ve Kıvılcım Otomotiv Teknolojileri A.Ş. kurgusal şirketlerdir; lokasyonlar, pazar verileri ve mevzuat gerçektir.',
                 kicker='Kapanış', secs=7, net=True,
                 say='Şirketleri tek bir risk ağına bağlayan Miselyum’u izlediğiniz için teşekkürler.')


async def bilgiler(browser, kapi):
    """Kayıttan önce ayrı bir oturumla panelden rakamları okur (Akımyolu ve Kıvılcım)."""
    ctx = await browser.new_context(viewport={'width': W, 'height': H}, locale='tr-TR', timezone_id='Europe/Istanbul')
    page = await ctx.new_page()
    await page.goto(BASE + '/')
    await page.fill('#kullanici', 'yonetici')
    await page.fill('#parola', kapi.parola('yonetici'))
    await page.click('#gonder')
    await page.wait_for_selector('#kod:visible')
    await page.fill('#kod', kapi.kod('yonetici'))
    await page.wait_for_url('**/baslat.html**', timeout=20000)
    await bekle(page, "window.SK && SK.plans && SK.link.mode === 'canli'", timeout=40000)
    await page.wait_for_timeout(1500)
    d = await page.evaluate(FACTS)
    await page.evaluate("SK.switchTenant('kivilcim')")
    await page.wait_for_load_state('load')
    await bekle(page, "window.SK && SK.plans && SK.tenantId === 'kivilcim'", timeout=30000)
    dk = await page.evaluate(FACTS)
    await page.evaluate("SK.switchTenant('akimyolu')")
    await page.wait_for_load_state('load')
    await bekle(page, "window.SK && SK.plans && SK.tenantId === 'akimyolu'", timeout=30000)
    await ctx.close()
    return d, dk


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    if '--karakter' in sys.argv or '--eleven-ses' in sys.argv:
        veri = json.load(open(KURGU, encoding='utf-8'))
        metinler, n = eleven_karakter(veri)
        print('ElevenLabs: %d metin, %d karakter (önbellekteki parçalar yeniden üretilmez)' % (len(metinler), n), flush=True)
        try:
            kul, top = eleven.kota()
            print('Hesap kotası: %d / %d karakter kullanılmış, kalan %d' % (kul, top, top - kul), flush=True)
        except Exception as e:
            print('Kota okunamadı (%s); anahtarın "User" okuma izni yoksa normaldir.' % type(e).__name__, flush=True)
        if '--eleven-ses' not in sys.argv:
            return
        veri, hizli = await eleven_ses(veri)
        miksaj(veri)
        print('ElevenLabs sesi yerleştirildi:', VIDEO, '·', len(hizli), 'parça hafifçe hızlandırıldı', flush=True)
        for m, o, artan in hizli:
            print('   ×%.2f  %s%s' % (o, m, '  (yine de %.1f sn taşıyor)' % artan if artan > 0.05 else ''))
        return
    if '--miksaj' in sys.argv:   # yalnız sesi yeniden kur (müzik ya da efekt değişince); kayıt gerekmez
        yol = KURGU_ELEVEN if os.path.exists(KURGU_ELEVEN) and '--emel' not in sys.argv else KURGU
        miksaj(json.load(open(yol, encoding='utf-8')))
        print('Yeniden karıştırıldı:', VIDEO, '(%s)' % ('ElevenLabs sesi' if yol == KURGU_ELEVEN else 'kayıttaki ses'))
        return
    if EKRAN:
        eski = os.path.join(OUT, 'eski-ekranlar')
        for ad in os.listdir(SHOTS):
            if ad.endswith('.png'):
                os.makedirs(eski, exist_ok=True)
                os.replace(os.path.join(SHOTS, ad), os.path.join(eski, ad))
    kapi = Kapi()
    sesli = SESLI
    rec = None
    try:
        await asyncio.sleep(8)   # sanal cihazların bağlanması
        async with async_playwright() as p:
            browser = await p.chromium.launch(channel='msedge', headless=True,
                                              args=['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--hide-scrollbars'])
            d, dk = await bilgiler(browser, kapi)
            print('Rakamlar okundu:', d['devices'], 'cihaz,', d['risks'], 'risk; Kıvılcım', dk['risks'], 'risk', flush=True)
            voice = {}
            if sesli:
                top = Toplayici()
                await film(top, d, dk)
                print('Seslendiriliyor:', len(dict.fromkeys(top.texts)), 'metin,', SECIM['ad'] + ' (ElevenLabs)' if SES == 'eleven' else VOICES[SES], flush=True)
                voice = await seslendir(top.texts, top.bolum)
            await kapi.taze_bekle()
            ctx = await browser.new_context(viewport={'width': W, 'height': H}, device_scale_factor=DPR, locale='tr-TR', timezone_id='Europe/Istanbul')
            await ctx.add_init_script(OVERLAY)
            page = await ctx.new_page()
            await page.goto(BASE + '/')
            await page.wait_for_selector('#kullanici')
            await page.evaluate('document.fonts.ready')
            await page.wait_for_timeout(2500)
            rec = Recorder(SILENT if sesli else VIDEO)
            cdp = await ctx.new_cdp_session(page)

            def on_frame(params):
                rec.push(params['metadata']['timestamp'], base64.b64decode(params['data']))
                asyncio.ensure_future(cdp.send('Page.screencastFrameAck', {'sessionId': params['sessionId']}))

            cdp.on('Page.screencastFrame', on_frame)
            await cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 92, 'maxWidth': round(W * DPR), 'maxHeight': round(H * DPR)})
            await page.wait_for_timeout(500)
            f = Film(page, rec, voice, kapi)
            try:
                await film(f, d, dk)
            finally:
                try:
                    await cdp.send('Page.stopScreencast')
                except Exception:
                    pass
                await browser.close()
    finally:
        kapi.kapat()
        if rec:
            rec.close()
    total = rec.n / FPS
    if sesli:
        veri = {'total': total, 'placements': f.placements, 'marks': rec.marks, 'olaylar': f.olaylar}
        json.dump(veri, open(KURGU, 'w', encoding='utf-8'), ensure_ascii=False)
        if os.path.exists(KURGU_ELEVEN):
            os.remove(KURGU_ELEVEN)
        miksaj(veri)
    with open(os.path.join(OUT, 'bolumler.txt'), 'w', encoding='utf-8') as fh:
        fh.write('Miselyum tanıtım videosu · bölümler\n\n')
        for sec, title in rec.marks:
            fh.write('%d:%02d  %s\n' % (int(sec) // 60, int(sec) % 60, title))
        fh.write('\nToplam süre: %d:%02d\n' % (int(total) // 60, int(total) % 60))
        if sesli:
            fh.write('Seslendirme: %s · müzik: tanitim/muzik/ (yoksa ses_uret.py)\n' % (SECIM['ad'] + ' (ElevenLabs)' if SES == 'eleven' else VOICES[SES]))
    print('Video:', VIDEO, '(%.0f sn)' % total)


if __name__ == '__main__':
    asyncio.run(main())
