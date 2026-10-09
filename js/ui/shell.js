/* Uygulama kabuğu: üst çubukta hap menü (5 ana ekran, alt ekranlar sekme), Miselyum ağ göstergesi (bağlı şirket ve
   bağlantı durumu, şirket seçici), olay durumu, gece/gündüz teması; canlı gösterge şeridi, alt bilgi, klavye kısayolları */
(function (SK) {
  'use strict';
  const h = SK.h, s = SK.s, F = SK.fmt;

  SK.views = {};
  SK.registerView = function (id, def) { SK.views[id] = def; };

  // Ana ekranlar ve sekmeleri. Harf: PUKÖ adımı (P planla, U uygula, K kontrol et, Ö önlem al)
  const NAV = [
    { id: 'genel', title: 'Genel bakış', icon: 'genel', phases: [], tabs: ['genel'] },
    { id: 'ikiz', title: 'Dijital ikiz', icon: 'saha', phases: ['K'], tabs: ['saha', 'merkez'] },
    { id: 'risk', title: 'Riskler', icon: 'riskler', phases: ['P'], tabs: ['riskler', 'varliklar', 'sektor'] },
    { id: 'onlem', title: 'Önlemler', icon: 'kontroller', phases: ['U', 'Ö'], tabs: ['kontroller', 'sigorta', 'uyum'] },
    { id: 'saldiri', title: 'Senaryolar', icon: 'saldiri', phases: ['K'], tabs: ['saldiri'] }
  ];
  const EXTRA = [
    { id: 'yontem', title: 'Yöntem', icon: 'yontem', tabs: ['yontem'], hint: 'Yöntem ve kaynaklar' },
    { id: 'guvenlik', title: 'Güvenlik', icon: 'kilit', tabs: ['guvenlik'], hint: 'Güvenlik merkezi: Miselyum Kapısı' }
  ];
  const TAB = {
    saha: ['Saha haritası', 'K'], merkez: ['Merkez tesis', 'K'],
    riskler: ['Risk kaydı', 'P'], varliklar: ['Varlıklar', 'P'], sektor: ['Sektör bağlamı', 'P'],
    kontroller: ['Kontroller', 'U'], sigorta: ['Sigorta', 'Ö'], uyum: ['Uyum', 'Ö']
  };
  if (SK.hq && SK.hq.title) TAB.merkez[0] = SK.hq.title; // sekme adı bağlı şirketin tesisinden (ör. Üretim tesisi)
  const LIVE = ['saha', 'merkez', 'saldiri']; // canlı gösterge şeridinin göründüğü ekranlar
  const DEFAULT_VIEW = 'genel';
  const GROUPS = NAV.concat(EXTRA);
  SK.nav = NAV;
  SK.navOrder = NAV.map(g => g.id).concat(EXTRA.map(g => g.id));
  SK.navGroupOf = id => GROUPS.find(g => g.id === id || g.tabs.indexOf(id) >= 0);
  SK.tabLabel = id => (TAB[id] ? TAB[id][0] : (SK.views[id] ? SK.views[id].title : id));
  SK.phaseChip = L => h('span', { class: 'ph ph-' + (L === 'Ö' ? 'O' : L), title: { P: 'Planla', U: 'Uygula', K: 'Kontrol et', 'Ö': 'Önlem al' }[L] }, L);

  // İkonlar (24 × 24, çizgi)
  const ICONS = {
    genel: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5h4v5',
    sektor: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    varliklar: 'M12 3 3 7.5l9 4.5 9-4.5L12 3ZM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5',
    riskler: 'M12 3 2 20h20L12 3Zm0 6v5m0 3v.5',
    kontroller: 'M4 7h10m4 0h2M4 17h4m4 0h8M14 4v6M8 14v6',
    saha: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    merkez: 'M3 21h18M5 21V7l7-4 7 4v14M9 10h1m4 0h1M9 14h1m4 0h1M10 21v-4h4v4',
    saldiri: 'M3 12h4l3-8 4 16 3-8h4',
    sigorta: 'M12 3a9 9 0 0 0-9 9h18a9 9 0 0 0-9-9Zm0 9v6a2 2 0 0 0 4 0',
    uyum: 'M12 3 4 6v6c0 4.6 3.4 8.1 8 9 4.6-.9 8-4.4 8-9V6l-8-3Zm-3.5 9 2.5 2.5 4.5-5',
    yontem: 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17ZM4 19.5A2.5 2.5 0 0 1 6.5 17H20',
    rehber: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14m0 3v.5',
    asistan: 'M4 5h16v11H9l-5 4V5Zm4 5h.01M12 10h.01M16 10h.01',
    ag: 'M12 13v8M12 13 5 8M12 13l7-5M5 8 4 3M19 8l1-5M12 21l-4 1M12 21l4 1',
    asagi: 'M6 9l6 6 6-6',
    kilit: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
    ay: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
    gunes: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-14v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    kapat: 'M6 6l12 12M18 6 6 18',
    ayar: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'
  };
  SK.icon = function (name, cls) {
    return s('svg', { class: 'ico ' + (cls || ''), viewBox: '0 0 24 24', 'aria-hidden': 'true' },
      s('path', { d: ICONS[name] || ICONS.rehber, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  };

  // ---- Tema ----
  SK.theme = function () { return document.documentElement.dataset.theme || 'light'; };
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    SK.store.set('theme', t);
    if (SK.refreshPalette) SK.refreshPalette();
  }
  applyTheme(SK.store.get('theme', 'light'));

  // ---- İpucu kutusu ----
  let tipEl = null;
  SK.tip = {
    show(ev, content) {
      if (!tipEl) { tipEl = h('div', { class: 'tip', role: 'tooltip' }); document.body.appendChild(tipEl); }
      SK.clear(tipEl);
      if (typeof content === 'string') tipEl.textContent = content; else tipEl.appendChild(content);
      tipEl.hidden = false;
      SK.tip.move(ev);
    },
    move(ev) {
      if (!tipEl || tipEl.hidden) return;
      const x = ev.clientX, y = ev.clientY;
      const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
      let left = x + 14, top = y + 14;
      if (left + w > window.innerWidth - 8) left = x - w - 14;
      if (top + hh > window.innerHeight - 8) top = y - hh - 14;
      tipEl.style.left = Math.max(8, left) + 'px';
      tipEl.style.top = Math.max(8, top) + 'px';
    },
    hide() { if (tipEl) tipEl.hidden = true; },
    bind(node, fn) {
      node.addEventListener('mouseenter', e => SK.tip.show(e, fn()));
      node.addEventListener('mousemove', e => SK.tip.move(e));
      node.addEventListener('mouseleave', () => SK.tip.hide());
    }
  };

  // Logo: elektrik yeşili kare içinde dallanan miselyum ağı (merkez düğüm, hifler, uç düğümler)
  const MARK_PATH = 'M16 17.5V25.5M16 17.5 9 12.5M16 17.5l7-5.5M16 17.5l8.5 3M9 12.5 7.5 7M9 12.5l-3.5 2.5M23 12l-1-5M16 25.5l-5 1.5M16 25.5l5 1.5';
  const MARK_NODES = [[7.5, 7], [5.5, 15], [22, 7], [24.5, 20.5], [11, 27], [21, 27]];
  SK.brandMark = function (cls) {
    return s('svg', { class: cls || 'brand-mark', viewBox: '0 0 32 32', 'aria-hidden': 'true' },
      s('rect', { x: 1, y: 1, width: 30, height: 30, rx: 9, fill: 'var(--volt)' }),
      s('path', { d: MARK_PATH, fill: 'none', stroke: '#111210', 'stroke-width': 2.1, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      s('circle', { cx: 16, cy: 17.5, r: 3.1, fill: '#111210' }),
      MARK_NODES.map(([x, y]) => s('circle', { cx: x, cy: y, r: 1.7, fill: '#111210' })));
  };

  // ---- Miselyum ağ göstergesi: hangi şirketin ağa bağlı olduğu, bağlantı durumu ve şirket seçici ----
  const LINK_LABEL = { sim: 'Simülasyon', canli: 'Canlı bağlantı', kopuk: 'Bağlantı koptu' };
  function buildNet() {
    const t = SK.tenant;
    const dot = h('span', { class: 'net-dot', 'aria-hidden': 'true' });
    const sub = h('small');
    const btn = h('button', { type: 'button', class: 'net-pill', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
      dot, h('span', { class: 'net-txt' }, h('b', null, t.short), sub), SK.icon('asagi', 'net-caret'));
    const menu = h('div', { class: 'net-menu', role: 'menu', hidden: true });
    function sync() {
      const L = SK.link, tw = SK.twin;
      const count = tw ? tw.sites.length + ' düğüm' : '';
      dot.dataset.mode = L.mode;
      sub.textContent = LINK_LABEL[L.mode] + (L.mode === 'canli' ? ' · ' + L.devices + ' cihaz' : count ? ' · ' + count : '');
      btn.title = 'Miselyum ağına bağlı şirket: ' + t.name + ' · ' + LINK_LABEL[L.mode] + (tw ? ' · ' + tw.sites.length + ' düğüm, ' + tw.connectors.length + ' uç nokta' : '');
      SK.clear(menu).appendChild(h('div', { class: 'net-head' }, SK.brandMark('net-mark'),
        h('div', null, h('b', null, 'Miselyum ağı'), h('span', null, SK.tenants.length + ' şirket bağlı · bir şirket seçin'))));
      SK.tenants.forEach(x => {
        const here = x.id === SK.tenantId;
        menu.appendChild(h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(here), class: 'net-item' + (here ? ' is-here' : ''),
          onclick: () => { if (!here) SK.switchTenant(x.id); close(); } },
          h('span', { class: 'net-item-t' }, h('b', null, x.name), h('span', null, x.sector + ' · bağlayıcı: ' + x.connector)),
          h('span', { class: 'net-item-s' }, here ? 'Bağlı' : 'Bağlan')));
      });
      menu.appendChild(h('p', { class: 'net-foot' }, L.mode === 'canli'
        ? 'Veri, Miselyum Kapısı üzerinden bağlı cihazlardan anlık geliyor.'
        : 'Veri bu bilgisayarda simüle ediliyor. Canlı bağlantı için uygulamayı Miselyum Kapısı ile açın.'));
    }
    function open() { sync(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
    function close() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', ev => { ev.stopPropagation(); if (menu.hidden) open(); else close(); });
    document.addEventListener('click', ev => { if (!menu.hidden && !menu.contains(ev.target)) close(); });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !menu.hidden) { close(); btn.focus(); } });
    SK.on('link', sync);
    SK.on('route', sync);
    sync();
    return h('div', { class: 'net' }, btn, menu);
  }

  // ---- Üst çubuk ----
  const navLinks = {};
  function buildTopbar() {
    const nav = h('nav', { class: 'nav', 'aria-label': 'Bölümler' });
    NAV.forEach((g, i) => {
      const a = h('a', { class: 'nav-item', href: '#' + g.id, title: g.title + ' (kısayol: ' + (i + 1) + ')' },
        SK.icon(g.icon), h('span', null, g.title),
        g.phases.length ? h('span', { class: 'nav-phases' }, g.phases.map(SK.phaseChip)) : null);
      navLinks[g.id] = a;
      nav.appendChild(a);
    });
    EXTRA.forEach((g, j) => {
      const a = h('a', { class: 'nav-item nav-small', href: '#' + g.id, title: g.hint + ' (kısayol: ' + (NAV.length + j + 1) + ')' }, SK.icon(g.icon), h('span', null, g.title));
      navLinks[g.id] = a;
      nav.appendChild(a);
    });

    const flag = h('a', { class: 'attack-flag', href: '#saldiri' }, h('span', { class: 'dot' }), h('span', { class: 'txt' }, 'Olay yok'));
    const themeBtn = h('button', { type: 'button', class: 'icon-btn', onclick: () => { applyTheme(SK.theme() === 'dark' ? 'light' : 'dark'); syncTheme(); rerender(); } });
    function syncTheme() {
      const d = SK.theme() === 'dark';
      SK.clear(themeBtn).appendChild(SK.icon(d ? 'gunes' : 'ay'));
      themeBtn.setAttribute('aria-label', d ? 'Gündüz görünümü' : 'Gece görünümü');
      themeBtn.title = d ? 'Gündüz görünümü' : 'Gece görünümü';
    }
    syncTheme();
    function syncFlag() {
      const A = SK.state.attack;
      flag.classList.toggle('is-on', !!A && A.status !== 'blocked');
      flag.classList.toggle('is-blocked', !!A && A.status === 'blocked');
      const txt = flag.querySelector('.txt');
      if (!A) txt.textContent = 'Olay yok';
      else {
        const scn = SK.scenarioMap[A.id];
        txt.textContent = A.status === 'blocked' ? 'Durduruldu: ' + scn.title
          : A.status === 'done' ? 'Etkisi sürüyor: ' + scn.title : 'Olay sürüyor: ' + scn.title;
      }
      flag.title = txt.textContent;
    }
    SK.on('attack', syncFlag);

    return h('header', { class: 'topbar' }, h('div', { class: 'topbar-in' },
      h('a', { class: 'brand', href: '#genel', 'aria-label': 'Miselyum genel bakış' }, SK.brandMark(),
        h('div', null, h('div', { class: 'brand-name' }, 'Miselyum'), h('div', { class: 'brand-sub' }, 'BGYS dijital ikiz ağı'))),
      nav,
      h('div', { class: 'topbar-spacer' }),
      buildNet(),
      SK.userMenu ? SK.userMenu() : null,
      flag,
      themeBtn));
  }

  function buildFoot() {
    return h('footer', { class: 'app-foot' },
      h('p', { class: 'grow' }, SK.company.disclaimer),
      h('a', { href: 'rehber.html', target: '_blank', rel: 'noopener' }, 'Rehberi aç'),
      h('button', { type: 'button', onclick: () => SK.assist && SK.assist.open() }, 'Asistana sor'),
      h('a', { href: '#yontem' }, 'Yöntem ve kaynaklar'),
      h('span', null, 'Kısayollar: 1–7 ekranlar · ? asistan'));
  }

  // ---- Canlı gösterge şeridi (ikiz ve saldırı ekranlarında) ----
  let ribbon = null;
  function buildRibbon() {
    const clock = h('span', { class: 'clock', 'aria-live': 'off' }, '09:00');
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Simülasyon hızı' });
    const pause = h('button', { type: 'button', id: 'sim-pause', onclick: () => SK.sim.toggle() }, 'Duraklat');
    seg.appendChild(pause);
    [2, 10, 30].forEach(v => seg.appendChild(h('button', { type: 'button', id: 'sim-speed-' + v, 'data-speed': v, onclick: () => SK.sim.setSpeed(v), title: 'Simülasyonda 1 saniye = ' + v + ' dakika' }, v + '×')));
    function syncSim() {
      const S = SK.sim.S;
      pause.textContent = S.running ? 'Duraklat' : 'Sürdür';
      pause.setAttribute('aria-pressed', String(!S.running));
      seg.querySelectorAll('[data-speed]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.speed === S.speed && S.running)));
    }
    SK.on('simstate', syncSim);
    SK.on('tick', S => {
      clock.textContent = F.clock(S.minute);
      clock.appendChild(h('small', null, SK.simDate().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })));
    });
    syncSim();
    const box = h('div', { class: 'ribbon', role: 'region', 'aria-label': 'Canlı göstergeler' });
    const title = h('b', null, 'Canlı simülasyon'), speedNote = h('span', { class: 'note' }, 'Hız');
    const liveNote = h('span', { class: 'note live-src', hidden: true });
    const wrap = h('section', { class: 'live' },
      h('div', { class: 'live-head' }, h('span', { class: 'live-dot', 'aria-hidden': 'true' }), title, clock,
        h('span', { class: 'topbar-spacer' }), liveNote, speedNote, seg),
      box);
    // Miselyum Kapısı'na bağlıyken veri cihazlardan gelir: hız düğmeleri yerine kaynak gösterilir
    function syncLink() {
      const L = SK.link, live = L.mode === 'canli';
      title.textContent = live ? 'Canlı bağlantı' : L.mode === 'kopuk' ? 'Bağlantı koptu · simülasyon' : 'Canlı simülasyon';
      wrap.classList.toggle('is-linked', live);
      seg.hidden = speedNote.hidden = live;
      liveNote.hidden = !live;
      if (live) liveNote.textContent = 'Miselyum Kapısı · ' + L.devices + ' cihaz OCPP ile bağlı · Seviye 3 ikiz · 1 sn = 1 dk';
    }
    SK.on('link', syncLink);
    const make = (label, view, hint) => {
      const v = h('span', { class: 'm-value' }, '–'), n = h('span', { class: 'm-note' }, ' ');
      const k = h('a', { class: 'metric', href: '#' + view, title: hint }, h('span', { class: 'm-label' }, label), v, n);
      box.appendChild(k);
      return { k, v, n };
    };
    const online = make(SK.T('onlineLabel'), 'saha', 'Saha haritasına git'),
      charging = make(SK.T('busyLabel'), 'saha', 'Saha haritasına git'),
      revenue = make(SK.T('revenueLabel'), 'saha', 'Saha haritasına git'),
      ale = make('Yıllık beklenen zarar', 'riskler', 'Risk kaydına git'),
      ready = make('Mevzuata hazırlık', 'uyum', 'Uyum ekranına git'),
      ctl = make('Açık önlem', 'kontroller', 'Kontrollere git');

    SK.on('tick', S => {
      if (wrap.hidden) return;
      const k = S.kpi;
      online.v.textContent = F.n(k.online) + ' / ' + F.n(k.total);
      online.n.textContent = k.attacked ? F.n(k.attacked) + ' olaydan etkilendi' : F.n(k.faulted) + ' arızalı';
      online.k.classList.toggle('is-alert', k.attacked > 0);
      charging.v.textContent = F.n(k.charging) + ' ' + SK.T('busyCount');
      charging.n.textContent = F.n(k.power) + ' kW';
      revenue.v.textContent = F.tlShort(S.dayRevenue);
      revenue.n.textContent = F.n(S.dayEnergy) + ' ' + SK.T('energyNote');
    });
    function syncRisk() {
      const sm = SK.risk.summary(SK.state.enabled);
      ale.v.textContent = F.tlShort(sm.aleRes);
      ale.n.textContent = 'önlemsiz ' + F.tlShort(sm.aleIn);
      ready.v.textContent = F.pct(SK.risk.readiness(SK.state.enabled));
      ready.n.textContent = SK.frameworks.reduce((a, f) => a + f.reqs.length, 0) + ' yasal gereklilik';
      ctl.v.textContent = SK.state.enabled.size + ' / ' + SK.controls.length;
      ctl.n.textContent = F.tlShort(sm.cost) + ' / yıl';
    }
    SK.on('controls', syncRisk);
    syncRisk();
    return wrap;
  }

  // ---- Yönlendirme ----
  let current = null, cleanup = null, main = null;
  function resolve(hash) {
    let id = (hash || '').replace('#', '');
    const g = GROUPS.find(x => x.id === id);
    if (g && !SK.views[id]) id = g.tabs[0];
    return SK.views[id] ? id : DEFAULT_VIEW;
  }
  function render(view) {
    if (cleanup) { try { cleanup(); } catch (e) { /* görünüm kapanırken hata */ } }
    SK.disposeCharts();
    current = view;
    SK.currentView = view;
    const g = SK.navGroupOf(view);
    Object.keys(navLinks).forEach(k => navLinks[k].removeAttribute('aria-current'));
    if (g && navLinks[g.id]) navLinks[g.id].setAttribute('aria-current', 'page');
    ribbon.hidden = LIVE.indexOf(view) < 0;
    SK.clear(main);
    SK.tip.hide();
    SK._help = null;
    if (g && g.tabs.length > 1) {
      main.appendChild(h('nav', { class: 'tabs', 'aria-label': g.title + ' sekmeleri' }, g.tabs.map(t =>
        h('a', { class: 'tab', href: '#' + t, 'aria-current': t === view ? 'page' : null }, TAB[t] ? SK.phaseChip(TAB[t][1]) : null, SK.tabLabel(t)))));
    }
    cleanup = SK.views[view].mount(main) || null;
    // Yardım düğmesini başlık satırına taşı
    const head = main.querySelector(':scope > .view-head'), help = main.querySelector(':scope > .help-btn');
    if (head && help) {
      let act = head.querySelector(':scope > .view-actions');
      if (!act) { act = h('div', { class: 'view-actions' }); head.appendChild(act); }
      act.insertBefore(help, act.firstChild);
    }
    document.title = (g ? g.title : SK.views[view].title) + ' · ' + SK.tenant.short + ' · Miselyum';
    window.scrollTo({ top: 0 });
    SK.emit('route', view);
  }
  function route() {
    const view = resolve(location.hash);
    if ((SK.company.hideViews || []).indexOf(view) >= 0) { location.hash = '#genel'; return; }
    if (view === current) return;
    render(view); // geçiş hissini CSS'teki kademeli belirme verir
  }
  function rerender() { const v = current; current = null; render(v); }
  SK.go = function (view) {
    const target = resolve('#' + view);
    if (target === current) { rerender(); return; }
    location.hash = '#' + view;
  };

  // Klavye: 1–5 ana ekranlar, 6 yöntem, 7 güvenlik, ? asistan
  function onKey(e) {
    const t = e.target;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === '?') { e.preventDefault(); if (SK.assist) SK.assist.toggle(); return; }
    const i = '1234567'.indexOf(e.key);
    if (i >= 0 && SK.navOrder[i]) SK.go(SK.navOrder[i]);
  }

  SK.mountShell = function (root) {
    // Şirket paketinde olmayan ekranlar (ör. sektör verisi yalnızca şarj ağında var) menüden çıkar
    const hide = SK.company.hideViews || [];
    GROUPS.forEach(g => { g.tabs = g.tabs.filter(t => hide.indexOf(t) < 0); });
    main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
    ribbon = buildRibbon();
    root.appendChild(buildTopbar());
    root.appendChild(h('div', { class: 'workspace' }, ribbon, main));
    root.appendChild(buildFoot());
    window.addEventListener('hashchange', route);
    document.addEventListener('keydown', onKey);
    route();
  };

  // Görünüm başlığı: üst satırdaki PUKÖ adı renkli harfle gösterilir
  const PH_OF = { 'Planla': 'P', 'Uygula': 'U', 'Kontrol et': 'K', 'Önlem al': 'Ö' };
  SK.viewHead = function (eyebrow, title, lead, actions) {
    const ph = Object.keys(PH_OF).find(k => eyebrow.indexOf(k) === 0);
    return h('div', { class: 'view-head' },
      h('div', { class: 'view-titles' },
        h('div', { class: 'eyebrow' }, ph ? SK.phaseChip(PH_OF[ph]) : null, eyebrow),
        h('h1', null, title), lead ? h('p', { class: 'lead' }, lead) : null),
      h('div', { class: 'view-actions' }, actions || null));
  };
})(window.SK);
