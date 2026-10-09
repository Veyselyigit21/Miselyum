/* Miselyum Kapısı bağlantısı. Panel Kapı üzerinden açıldığında (window.MISELYUM_OTURUM dolu) devreye girer:
   - Oturum: kullanıcı menüsü, açık oturumlar, boşta kalma uyarısı, çıkış.
   - Yetki: önlem ve senaryo değişiklikleri önce sunucuya sorulur; sunucu reddederse ekrandaki değişiklik geri alınır.
     Arayüzdeki denetim yalnızca kolaylıktır; asıl karar sunucudadır (rol ve şirket her istekte yeniden denetlenir).
   - Canlı veri: /canli akışından OCPP cihaz durumları, sayaçları ve mesajları ikize yazılır (Seviye 2 dijital ikiz).
   - Seviye 3: Kapı'daki ikizin kendi kararları (komut, neden, cihazın yanıtı ve doğrulama) aynı akıştan gelir (SK.ikiz3).
   Kapı yoksa (dosyadan açılış) yalnız bildirim balonunu tanımlar; panel simülasyon modunda kalır. */
(function (SK) {
  'use strict';
  const h = SK.h;
  const OT = window.MISELYUM_OTURUM || null;

  // ---- Bildirim balonu (her iki modda) ----
  let toastBox = null;
  SK.toast = function (msg, kind, ms) {
    if (!toastBox) { toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastBox); }
    const t = h('div', { class: 'toast toast-' + (kind || 'info') }, msg);
    toastBox.appendChild(t);
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 300); }, ms || 4500);
  };

  const ROL = { yonetici: 'Yönetici', analist: 'Analist', izleyici: 'İzleyici' };
  const YETKI = {
    goruntule: 'Görüntüleme', kontrol_degistir: 'Önlem değiştirme', senaryo_calistir: 'Senaryo çalıştırma', cihaz_komutu: 'Cihaz komutu (iki adımlı)',
    guvenlik_goruntule: 'Güvenlik verisi', oturum_yonet: 'Oturum yönetimi', denetim_goruntule: 'Denetim kaydı'
  };
  SK.kapi = {
    aktif: !!OT, oturum: OT, ROL, YETKI,
    can: e => !!OT && (OT.yetkiler || []).indexOf(e) >= 0,
    api
  };
  if (!OT) return;

  function oturumBitti(neden) { location.replace('giris.html?neden=' + encodeURIComponent(neden || 'sure')); }

  async function api(path, opts) {
    opts = opts || {};
    const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: { 'X-CSRF': OT.csrf } };
    if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    let r;
    try { r = await fetch(path, init); } catch (e) { return { ok: false, status: 0, data: { hata: 'Miselyum Kapısı\'na ulaşılamadı' } }; }
    let data = {};
    try { data = await r.json(); } catch (e) { /* boş yanıt */ }
    if (r.status === 401 && !data.mfa_gerekli && !opts.keep401) oturumBitti('kapandi');
    return { ok: r.ok, status: r.status, data };
  }

  // ---- Yetki: önlemler sunucuda saklanır ve sunucu onaylarsa değişir ----
  const setLocal = SK.setEnabled;
  let fromServer = false;
  SK.setEnabled = function (set) {
    const prev = Array.from(SK.state.enabled);
    setLocal(set);
    if (fromServer) return;
    api('api/kontroller', { method: 'POST', body: { sirket: SK.tenantId, anahtarlar: Array.from(SK.state.enabled) } }).then(r => {
      if (r.ok) return;
      fromServer = true; setLocal(prev); fromServer = false;
      SK.toast((r.data.hata || 'Değişiklik kaydedilemedi') + '. Ekrandaki değişiklik geri alındı; deneme denetim kaydına yazıldı.', 'warn', 6500);
    });
  };

  const runLocal = SK.scenario.run;
  SK.scenario.run = function (scn) {
    api('api/senaryo', { method: 'POST', body: { sirket: SK.tenantId, id: scn.id } }).then(r => {
      if (r.ok) runLocal(scn);
      else SK.toast((r.data.hata || 'Senaryo başlatılamadı') + '. Deneme denetim kaydına yazıldı.', 'warn', 6500);
    });
  };

  // ---- Canlı veri: OCPP cihazları (bu Kapı, Akımyolu'nun şarj ağını bağlar) ----
  const MAP = { Charging: 'Charging', SuspendedEV: 'Charging', SuspendedEVSE: 'Charging', Faulted: 'Faulted', Unavailable: 'Unavailable', Offline: 'Unavailable' };
  let byId = null, ws = null, retry = 0;
  function connOf(d) {
    if (!byId) { byId = {}; SK.twin.connectors.forEach(c => { byId[c.id] = c; }); }
    return byId[d.cp + '/' + d.k];
  }
  function apply(d) {
    const c = connOf(d);
    if (!c) return;
    const st = MAP[d.s] || 'Available', ses = c.liveSession;
    if (st === 'Charging') {
      if (!ses || ses.id !== d.tx) c.liveSession = { id: d.tx, kw: d.kw || 0, kwh: d.kwh || 0, tl: 0, left: Infinity };
      else {
        if (d.kw != null) ses.kw = d.kw;
        if (d.kwh != null && d.kwh > ses.kwh) { SK.sim.liveEnergy(c, d.kwh - ses.kwh); ses.kwh = d.kwh; }
      }
    } else {
      if (ses) SK.sim.liveEnd();
      c.liveSession = null;
    }
    c.liveState = st;
    c.live = true;
    if (c.compromised) return;   // senaryo etkisi sürerken ekrandaki durum senaryonundur
    c.session = c.liveSession;
    c.state = st;
  }
  function goLive(m) {
    SK.twin.connectors.forEach(c => {
      c.live = true; c.liveState = 'Unavailable'; c.liveSession = null;
      if (!c.compromised) { c.state = 'Unavailable'; c.session = null; }
    });
    (m.durumlar || []).forEach(apply);
    if (m.ikiz) { SK.ikiz3 = { ozet: null, eylemler: m.ikiz.eylemler || [] }; ikizOzet(m.ikiz.ozet); }
    SK.setLink({ mode: 'canli', devices: m.ozet.bagli, ozet: m.ozet });
    SK.sim.setSpeed(1);
    SK.sim.log('→', 'KAPI', 'Canlı bağlantı: ' + m.ozet.bagli + ' cihaz OCPP 1.6J ile bağlı (Profil 1: ' + m.ozet.profil[1] + ', Profil 2: ' + m.ozet.profil[2] + ', Profil 3: ' + m.ozet.profil[3] + ')', 'ok');
  }
  function connect() {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/canli');
    ws.onmessage = ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'anlik') { retry = 0; goLive(m); }
      else if (m.t === 'durum') apply(m);
      else if (m.t === 'log') SK.sim.log(m.d, m.cp, m.m, m.k);
      else if (m.t === 'ozet') SK.setLink({ mode: 'canli', devices: m.ozet.bagli, ozet: m.ozet });
      else if (m.t === 'ikiz') ikizOzet(m.ozet);
      else if (m.t === 'eylem') ikizEylem(m.e);
    };
    ws.onclose = ev => {
      if (ev.code === 4401) { oturumBitti('sure'); return; }
      if (SK.link.mode === 'canli') { SK.setLink({ mode: 'kopuk' }); SK.toast('Canlı bağlantı koptu; yeniden deneniyor.', 'warn'); }
      retry = Math.min(retry + 1, 6);
      setTimeout(() => api('api/oturum').then(r => { if (r.ok) connect(); }), 1000 * retry);
    };
  }

  // ---- Seviye 3: ikizin özeti ve eylemleri. Güç sınırı ve karantina ikizdeki soketlere de işlenir (saha ayrıntısı gösterir) ----
  function ikizOzet(o) {
    const I = SK.ikiz3 = SK.ikiz3 || { ozet: null, eylemler: [] };
    I.ozet = o;
    SK.twin.connectors.forEach(c => {
      const l = [o.oto_sinir && o.oto_sinir[c.id], o.elle_sinir && o.elle_sinir[c.id]].filter(v => v != null);
      c.limitKw = l.length ? Math.min.apply(null, l) : null;
      c.quarantine = !!(o.karantina && o.karantina[c.unitId]);
    });
    SK.emit('ikiz3', I);
  }
  function ikizEylem(e) {
    const I = SK.ikiz3 = SK.ikiz3 || { ozet: null, eylemler: [] };
    const i = I.eylemler.findIndex(x => x.id === e.id);
    if (i >= 0) I.eylemler[i] = e;
    else { I.eylemler.push(e); if (I.eylemler.length > 80) I.eylemler.shift(); }
    SK.emit('eylem', e);
  }

  // ---- Oturum canlılığı: kullanıcı işlem yaptıkça sunucudaki boşta sayacı sıfırlanır ----
  let lastPing = Date.now(), lastAct = Date.now(), warned = false;
  ['pointerdown', 'keydown', 'wheel'].forEach(t => document.addEventListener(t, () => {
    lastAct = Date.now(); warned = false;
    if (Date.now() - lastPing > 60000) { lastPing = Date.now(); api('api/oturum'); }
  }, { passive: true }));
  setInterval(() => {
    const kalan = (OT.bosta_sn || 900) - (Date.now() - Math.max(lastAct, lastPing)) / 1000;
    if (kalan < 120 && !warned) { warned = true; SK.toast('İşlem yapılmazsa oturumunuz 2 dakika içinde kapanacak (hayalet oturum koruması).', 'warn', 9000); }
  }, 15000);

  // ---- Üst çubuk: kullanıcı menüsü ----
  const fmtT = sn => sn < 60 ? sn + ' sn' : Math.round(sn / 60) + ' dk';
  SK.userMenu = function () {
    const ad = OT.kullanici;
    const btn = h('button', { type: 'button', class: 'user-pill', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: ad + ' · ' + ROL[OT.rol] },
      h('span', { class: 'user-av', 'aria-hidden': 'true' }, ad.charAt(0).toUpperCase()),
      h('span', { class: 'user-txt' }, h('b', null, ad), h('small', null, ROL[OT.rol])));
    const list = h('div', { class: 'user-sessions' });
    const menu = h('div', { class: 'net-menu user-menu', role: 'menu', hidden: true },
      h('div', { class: 'net-head' }, h('span', { class: 'user-av is-lg', 'aria-hidden': 'true' }, ad.charAt(0).toUpperCase()),
        h('div', null, h('b', null, ad + ' · ' + ROL[OT.rol]), h('span', null, 'Şirketler: ' + SK.tenants.map(t => t.short).join(', ')))),
      h('div', { class: 'user-perms' }, Object.keys(YETKI).map(k => SK.chip(SK.kapi.can(k) ? 'ok' : 'off', YETKI[k]))),
      h('div', { class: 'user-sec' }, h('span', { class: 'label' }, 'Açık oturumlarım (en fazla 2)'), list),
      h('div', { class: 'user-act' },
        h('a', { class: 'btn btn-sm', href: '#guvenlik', onclick: () => close() }, SK.icon('kilit'), 'Güvenlik merkezi'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: cikis }, 'Çıkış yap')));
    async function loadSessions() {
      const r = await api('api/oturumlar');
      SK.clear(list);
      if (!r.ok) return;
      r.data.oturumlar.forEach(o => {
        const me = o.kisa === r.data.kendi;
        list.appendChild(h('div', { class: 'user-ses' + (me ? ' is-me' : '') },
          h('div', null, h('b', null, me ? 'Bu tarayıcı' : 'Diğer oturum'), h('span', { class: 'note' },
            (o.tarayici.match(/(Edg|Chrome|Firefox|Safari)\/[\d]+/) || [o.tarayici.slice(0, 24)])[0] + ' · ' + new Date(o.acilis * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) +
            ' · ' + fmtT(o.bosta_sn) + ' boşta')),
          me ? SK.chip('ok', 'Etkin') : h('button', { type: 'button', class: 'btn btn-sm', onclick: async () => {
            const k = await api('api/oturumlar/' + o.kisa, { method: 'DELETE' });
            SK.toast(k.ok ? 'Oturum sunucuda silindi; o tarayıcının canlı akışı da kesildi.' : 'Oturum kapatılamadı', k.ok ? 'ok' : 'warn');
            loadSessions();
          } }, 'Kapat')));
      });
    }
    function open() { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); loadSessions(); }
    function close() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', ev => { ev.stopPropagation(); if (menu.hidden) open(); else close(); });
    document.addEventListener('click', ev => { if (!menu.hidden && !menu.contains(ev.target)) close(); });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !menu.hidden) { close(); btn.focus(); } });
    return h('div', { class: 'net user' }, btn, menu);
  };

  async function cikis() {
    await api('api/cikis', { method: 'POST', body: {}, keep401: true });
    location.replace('giris.html?neden=cikis');
  }

  // İki adımlı doğrulama penceresi (kritik işlemlerden önce yeniden doğrulama)
  SK.kapi.mfa = function () {
    return new Promise(resolve => {
      const input = h('input', { class: 'mfa-in', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, 'aria-label': '6 haneli kod' });
      const msg = h('p', { class: 'note', role: 'alert' }, 'Kimlik doğrulayıcı uygulamanızdaki kodu girin. (Demo: python kapi/totp.py)');
      const done = ok => { back.remove(); resolve(ok); };
      const send = async () => {
        const r = await api('api/mfa', { method: 'POST', body: { kod: input.value }, keep401: true });
        if (r.ok) done(true);
        else { msg.textContent = r.data.hata || 'Kod doğrulanamadı'; input.value = ''; input.focus(); }
      };
      input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); if (input.value.length === 6) send(); });
      const back = h('div', { class: 'mfa-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'İki adımlı doğrulama' },
        h('div', { class: 'mfa-box' }, h('span', { class: 'mfa-badge' }, 'Kritik işlem'), h('h2', null, 'İki adımlı doğrulama'),
          h('p', null, 'Bu işlem sahadaki bir cihaza komut gönderir. Son 5 dakika içinde kimliğinizi yeniden doğrulamanız gerekir.'),
          input, msg,
          h('div', { class: 'cta-row tight' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: send }, 'Doğrula'),
            h('button', { type: 'button', class: 'btn', onclick: () => done(false) }, 'Vazgeç'))));
      back.addEventListener('keydown', e => { if (e.key === 'Escape') done(false); });
      document.body.appendChild(back);
      input.focus();
    });
  };

  // Kritik istek: sunucu taze iki adımlı doğrulama isterse pencereyi açar ve isteği bir kez yineler
  SK.kapi.kritik = async function (path, body) {
    let r = await api(path, { method: 'POST', body, keep401: true });
    if (r.status === 401 && r.data.mfa_gerekli) {
      if (!(await SK.kapi.mfa())) return { ok: false, iptal: true, status: 0, data: { hata: 'İki adımlı doğrulama yapılmadı; komut gönderilmedi.' } };
      r = await api(path, { method: 'POST', body, keep401: true });
    }
    return r;
  };

  // ---- Başlat: uygulama kurulduktan sonra ----
  async function start() {
    const r = await api('api/kontroller?sirket=' + encodeURIComponent(SK.tenantId));
    if (r.ok && Array.isArray(r.data.anahtarlar)) {
      fromServer = true; SK.setEnabled(r.data.anahtarlar.filter(k => SK.controlMap[k])); fromServer = false;
    } else if (r.ok && SK.kapi.can('kontrol_degistir')) {
      api('api/kontroller', { method: 'POST', body: { sirket: SK.tenantId, anahtarlar: Array.from(SK.state.enabled) } });
    }
    if (SK.tenantId === 'akimyolu') connect();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0));
  else setTimeout(start, 0);
})(window.SK);
