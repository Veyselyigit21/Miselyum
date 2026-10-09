/* Gerçek harita: MapLibre GL + OpenStreetMap vektör altlığı. Altlık seçilebilir: Açık (CARTO Positron), Koyu (Dark Matter),
   Uydu (Esri görüntüsü + koyu etiketler). Harita; altlık, döşemeler ve katmanlar tamamen yüklenene kadar yükleniyor ekranının
   arkasında bekler. 3B binalar, lokasyon halkaları, OSM'deki diğer şarj noktaları ve saldırı yayılım çizgileri.
   Yüklenemezse şematik haritaya düşer. */
(function (SK) {
  'use strict';
  const h = SK.h, s = SK.s;
  const POSITRON = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
  const DARKMATTER = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
  const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  // Altlık seçenekleri. Seçim tarayıcıda hatırlanır; seçilmemişse uygulamanın gece/gündüz temasını izler.
  const BASE = {
    acik: { label: 'Açık', url: POSITRON, dark: false, credit: '© OpenStreetMap katkıcıları, © CARTO' },
    koyu: { label: 'Koyu', url: DARKMATTER, dark: true, credit: '© OpenStreetMap katkıcıları, © CARTO' },
    uydu: { label: 'Uydu', url: DARKMATTER, dark: true, sat: true, credit: 'Uydu: Esri, Maxar, Earthstar Geographics · etiketler © OSM, © CARTO' }
  };
  function baseOf() {
    const b = SK.store.get('basemap', '');
    return BASE[b] ? b : (document.documentElement.dataset.theme === 'dark' ? 'koyu' : 'acik');
  }
  const STATE_COLOR = new Proxy({}, { get: (o, k) => ({ Available: SK.PAL.ok, Charging: SK.PAL.charge, Faulted: SK.PAL.warn, Unavailable: SK.PAL.crit, Offline: SK.PAL.off })[k] });
  // Hızlı geçiş düğmeleri: şirket paketindeki şehirler
  const VIEWS = () => Object.assign({ all: { label: 'Tüm ağ' } }, SK.company.mapViews || {});

  function arc(r0, r1, a0, a1) {
    const p = (r, a) => (r * Math.cos(a)).toFixed(2) + ' ' + (r * Math.sin(a)).toFixed(2);
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    return 'M' + p(r1, a0) + ' A' + r1 + ' ' + r1 + ' 0 ' + large + ' 1 ' + p(r1, a1) + ' L' + p(r0, a1) + ' A' + r0 + ' ' + r0 + ' 0 ' + large + ' 0 ' + p(r0, a0) + ' Z';
  }

  function siteConns(site) { const out = []; site.units.forEach(u => u.connectors.forEach(c => out.push(c))); return out; }

  function bounds(sites) {
    let w = 180, e = -180, n = -90, so = 90;
    sites.forEach(x => { w = Math.min(w, x.lon); e = Math.max(e, x.lon); n = Math.max(n, x.lat); so = Math.min(so, x.lat); });
    return [[w, so], [e, n]];
  }

  SK.createGeoMap = function (opts) {
    opts = opts || {};
    if (!window.maplibregl) return null;
    // Harita stil dosyası yüklenmemişse (çevrimdışı veya engelli ortam) işaretler doğru konumlanamaz: şematik haritaya geç
    const probe = document.createElement('div');
    probe.className = 'maplibregl-marker';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    const cssOk = getComputedStyle(probe).position === 'absolute';
    probe.remove();
    if (!cssOk) return null;
    const ml = window.maplibregl;
    const twin = SK.twin;
    const wrap = h('div', { class: 'geo-wrap' + (opts.compact ? ' is-compact' : '') });
    const mapEl = h('div', { class: 'geo-map', role: 'region', 'aria-label': 'Gerçek sokak haritası üzerinde şarj ağı' });
    const status = h('div', { class: 'geo-status' }, 'Harita yükleniyor…');
    // Yükleniyor ekranı: altlık, döşemeler ve katmanlar hazır olana kadar haritayı örter
    const stepEls = ['Altlık', 'Döşemeler', 'Katmanlar'].map(t => h('li', null, t));
    const loading = h('div', { class: 'geo-loading', role: 'status', 'aria-live': 'polite' },
      h('div', { class: 'geo-loading-in' }, SK.brandMark('geo-loading-mark'), h('b', null, 'Harita hazırlanıyor'), h('ol', null, stepEls)));
    wrap.appendChild(mapEl);
    wrap.appendChild(loading);
    wrap.appendChild(status);
    function progress(i) { stepEls.forEach((li, j) => li.classList.toggle('is-done', j < i)); }
    let readyTimer = null;
    function showLoading() {
      loading.classList.remove('is-ready');
      progress(0);
      clearTimeout(readyTimer);
      // Döşemelerden biri hiç gelmezse ekran sonsuza dek beklemesin
      readyTimer = setTimeout(hideLoading, 12000);
    }
    function hideLoading() { clearTimeout(readyTimer); progress(3); loading.classList.add('is-ready'); }
    // Döşemeler çizilince haber ver. Bağlantı çizgisi animasyonu ve canlı veri haritayı sürekli yeniden çizdiği için
    // MapLibre'nin 'idle' olayı gelmeyebilir; bu yüzden stil ve döşeme durumu da yoklanır, hangisi önce olursa.
    // Canlı işaretler her saniye güncellendiği için yalnız altlık kaynaklarına (vektör döşemeler, uydu) bakılır.
    function whenDrawn(cb) {
      let done = false, iv = null, ids = null;
      const finish = () => { if (done) return; done = true; clearInterval(iv); cb(); };
      map.once('idle', finish);
      iv = setInterval(() => {
        try {
          if (!ids) {
            const src = map.getStyle().sources;
            ids = Object.keys(src).filter(id => src[id].type === 'vector' || (id === 'sat' && BASE[state.base].sat));
          }
          if (ids.length && ids.every(id => map.isSourceLoaded(id))) finish();
        } catch (e) { ids = null; /* stil değişiyor */ }
      }, 250);
    }

    let map, failed = false, loaded = false, animating = false, dashStep = 0, handlers = false;
    const markers = {};
    let hqEl = null;
    const state = { base: opts.base || baseOf(), b3d: !opts.compact, osm: !opts.compact, view: 'all' };
    const isDark = () => BASE[state.base].dark;

    function fail(reason) {
      if (failed || loaded) return;
      failed = true;
      if (opts.onFail) opts.onFail(reason);
    }

    try {
      map = new ml.Map({
        container: mapEl, style: BASE[state.base].url, attributionControl: { compact: true },
        bounds: bounds(twin.sites), fitBoundsOptions: { padding: opts.compact ? 30 : 60 },
        pitch: opts.compact ? 0 : 35, bearing: 0, maxPitch: 75, cooperativeGestures: false
      });
    } catch (e) { return null; }
    // Altlık stili 15 sn içinde gelmezse şematik haritaya geç. Stil gelince süre iptal edilir (sekme arka plandayken çizim beklese bile).
    const failTimer = setTimeout(() => fail('zaman aşımı'), 15000);
    map.once('styledata', () => { clearTimeout(failTimer); progress(1); });
    showLoading();
    map.on('error', ev => { if (!loaded && !map.isStyleLoaded() && ev && ev.error && /style|Failed to fetch|NetworkError|CORS/i.test(String(ev.error.message || ev.error))) fail(String(ev.error.message || ev.error)); });
    if (!opts.compact) map.addControl(new ml.NavigationControl({ visualizePitch: true }), 'top-right');
    let ro = null;
    try { ro = new ResizeObserver(() => { try { map.resize(); } catch (e) { /* kapalı */ } }); ro.observe(wrap); } catch (e) { /* eski tarayıcı */ }

    // Lokasyon işaretleri
    twin.sites.forEach(site => {
      const conns = siteConns(site);
      const n = conns.length, r1 = 16, r0 = 10.5, gap = n > 1 ? 0.2 : 0;
      const el = h('div', { class: 'mk', role: 'button', tabindex: opts.compact ? null : '0', 'aria-label': site.name });
      const svg = s('svg', { viewBox: '-20 -20 40 40' });
      svg.appendChild(s('circle', { r: 18.5, fill: SK.PAL.surface, stroke: SK.PAL.axis, 'stroke-width': 1 }));
      const segs = conns.map((c, i) => {
        const a0 = -Math.PI / 2 + i * 2 * Math.PI / n + gap / 2, a1 = a0 + 2 * Math.PI / n - gap;
        const p = s('path', { d: arc(r0, r1, a0, a1), fill: STATE_COLOR[SK.connState(c)] });
        svg.appendChild(p);
        return p;
      });
      svg.appendChild(s('text', { y: 3.6, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 600, fill: SK.PAL.ink, 'font-family': 'Archivo, sans-serif', text: SK.siteTypes[site.type].letter || site.type.charAt(0) }));
      el.appendChild(svg);
      if (opts.onSelect) {
        el.addEventListener('click', ev => { ev.stopPropagation(); opts.onSelect(site.id); });
        el.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); opts.onSelect(site.id); } });
      }
      SK.tip.bind(el, () => {
        const cnt = SK.countStates(conns);
        return h('div', null, h('b', null, site.name), h('br'), SK.siteTypes[site.type].label + ' · ' + (site.district || SK.cityNames[site.city]),
          h('br'), site.units.length + ' ' + SK.T('unit') + ' · ' + n + ' ' + SK.T('endpoint'), h('br'),
          Object.keys(cnt).filter(k => cnt[k]).map(k => SK.STATE_LABEL[k] + ': ' + cnt[k]).join(' · '));
      });
      const mk = new ml.Marker({ element: el }).setLngLat([site.lon, site.lat]).addTo(map);
      el.setAttribute('aria-label', site.name + ', ' + SK.siteTypes[site.type].label);
      markers[site.id] = { mk, el, segs, conns, cls: conns.map(SK.connState) };
    });
    if (SK.realHq) {
      hqEl = h('div', { class: 'mk-hq' }, h('i'), SK.T('hqLabel'));
      new ml.Marker({ element: hqEl, anchor: 'left' }).setLngLat([SK.realHq.lon, SK.realHq.lat]).addTo(map);
    }

    // Altlık her yüklendiğinde (ilk açılış ve Açık/Koyu/Uydu değişimi) şirket katmanlarını yeniden ekler
    function addCustom() {
      const style = map.getStyle();
      if (!style) return;
      const firstSymbol = (style.layers.find(l => l.type === 'symbol') || {}).id;
      const dk = isDark(), sat = !!BASE[state.base].sat;
      status.textContent = 'Altlık: ' + BASE[state.base].credit;
      // Uydu görüntüsü: etiketlerin altında, tam opak
      if (!map.getSource('sat')) map.addSource('sat', { type: 'raster', tiles: [SAT], tileSize: 256, maxzoom: 19, attribution: 'Uydu: Esri, Maxar, Earthstar Geographics' });
      if (!map.getLayer('sat')) map.addLayer({ id: 'sat', type: 'raster', source: 'sat', layout: { visibility: sat ? 'visible' : 'none' }, paint: { 'raster-opacity': 1 } }, firstSymbol);
      // 3B binalar
      try {
        const src = Object.keys(style.sources).find(k => style.sources[k].type === 'vector');
        if (src && !map.getLayer('sk-3d')) {
          map.addLayer({
            id: 'sk-3d', type: 'fill-extrusion', source: src, 'source-layer': 'building', minzoom: 13.5,
            layout: { visibility: state.b3d ? 'visible' : 'none' },
            paint: {
              // Açık altlıkta binalar zeminden ayrışsın diye koyu gri tonlar; yükseldikçe koyulaşır
              'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, dk ? '#33362f' : '#cdd0c6', 40, dk ? '#464a41' : '#b3b7ab', 120, dk ? '#5c6155' : '#999e92'],
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-vertical-gradient': false,
              'fill-extrusion-opacity': sat ? 0.55 : 0.9
            }
          }, firstSymbol);
          // Yumuşak ışık: gölgedeki duvarlar kararmasın, binalar açık altlıkta da okunsun
          map.setLight({ anchor: 'viewport', color: '#ffffff', intensity: dk ? 0.35 : 0.22, position: [1.2, 200, 40] });
        }
      } catch (e) { /* bina katmanı yok */ }
      // Merkezden lokasyonlara komut hatları
      if (SK.realHq && !map.getSource('sk-links')) {
        map.addSource('sk-links', {
          type: 'geojson', data: {
            type: 'FeatureCollection',
            features: twin.sites.map(x => ({ type: 'Feature', properties: { id: x.id }, geometry: { type: 'LineString', coordinates: [[SK.realHq.lon, SK.realHq.lat], [x.lon, x.lat]] } }))
          }
        });
        map.addLayer({ id: 'sk-links', type: 'line', source: 'sk-links', paint: { 'line-color': SK.PAL.p, 'line-opacity': 0.22, 'line-width': 1 } });
      }
      // OpenStreetMap'teki diğer şarj noktaları
      if (!opts.compact && SK.osmChargers && !map.getSource('osm-ch')) {
        map.addSource('osm-ch', {
          type: 'geojson', data: {
            type: 'FeatureCollection',
            features: SK.osmChargers.map(c => ({ type: 'Feature', properties: { name: c.name, op: c.op, cap: c.cap, sockets: Object.keys(c.sockets || {}).join(', '), osm: c.osm }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } }))
          }
        });
        map.addLayer({ id: 'osm-ch', type: 'circle', source: 'osm-ch', layout: { visibility: state.osm ? 'visible' : 'none' },
          paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 14, 6], 'circle-color': SK.PAL.o, 'circle-opacity': 0.85, 'circle-stroke-color': SK.PAL.surface, 'circle-stroke-width': 1.2 } });
      }
      // Tıklama işleyicileri bir kez bağlanır (katman yeniden eklense de çalışır)
      if (!opts.compact && SK.osmChargers && !handlers) {
        handlers = true;
        map.on('click', 'osm-ch', ev => {
          const p = ev.features[0].properties;
          new ml.Popup({ offset: 8 }).setLngLat(ev.lngLat).setDOMContent(h('div', null,
            h('div', { class: 'label' }, 'OpenStreetMap · gerçek şarj noktası'),
            h('b', null, p.name || 'Adsız şarj noktası'), h('br'),
            'İşletmeci: ' + (p.op || 'belirtilmemiş'), p.cap ? h('span', null, h('br'), 'Kapasite: ' + p.cap) : null,
            p.sockets ? h('span', null, h('br'), 'Soket: ' + p.sockets) : null)).addTo(map);
        });
        map.on('mouseenter', 'osm-ch', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'osm-ch', () => { map.getCanvas().style.cursor = ''; });
      }
      progress(2);
      update();
    }

    map.on('load', () => {
      loaded = true;
      clearTimeout(failTimer);
      map.resize();
      map.fitBounds(bounds(twin.sites), { padding: opts.compact ? 30 : { top: 90, bottom: 50, left: 60, right: 60 }, pitch: opts.compact ? 0 : 35, duration: 0 });
      addCustom();
      // Bütün döşemeler çizilince haritayı göster; sonra seçili lokasyona uç
      whenDrawn(() => {
        hideLoading();
        if (!opts.compact && SK.state.selectedSite && twin.siteMap[SK.state.selectedSite]) setTimeout(() => api.flyToSite(SK.state.selectedSite), 300);
      });
    });

    // Altlık değişimi: aynı stil dosyasıysa (Koyu ↔ Uydu) yalnız katman görünürlüğü, değilse stil yeniden yüklenir
    function setBase(k) {
      if (!BASE[k] || k === state.base) return;
      const prev = state.base;
      state.base = k;
      SK.store.set('basemap', k);
      baseSegs.forEach(seg => seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.b === k))));
      if (!loaded) return;
      if (BASE[prev].url === BASE[k].url) {
        if (map.getLayer('sat')) map.setLayoutProperty('sat', 'visibility', BASE[k].sat ? 'visible' : 'none');
        if (map.getLayer('sk-3d')) map.setPaintProperty('sk-3d', 'fill-extrusion-opacity', BASE[k].sat ? 0.55 : 0.9);
        status.textContent = 'Altlık: ' + BASE[k].credit;
        showLoading();
        progress(2);
        whenDrawn(hideLoading);
        return;
      }
      showLoading();
      map.once('style.load', () => { progress(1); addCustom(); whenDrawn(hideLoading); });
      // diff:false: stil tamamen yeniden yüklenir; 'style.load' gelir ve özel katmanlar (3B, bağlantılar, uydu) yeniden eklenir
      map.setStyle(BASE[k].url, { diff: false });
    }
    const baseSegs = [];
    function baseSeg() {
      const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Harita altlığı' });
      Object.keys(BASE).forEach(k => seg.appendChild(h('button', { type: 'button', 'data-b': k, 'aria-pressed': String(k === state.base), title: BASE[k].label + ' harita', onclick: () => setBase(k) }, BASE[k].label)));
      baseSegs.push(seg);
      return seg;
    }

    // Araç çubuğu
    let api_viewSeg = null;
    if (!opts.compact) {
      const viewSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Harita görünümü' });
      const V = VIEWS();
      Object.keys(V).forEach(k => viewSeg.appendChild(h('button', { type: 'button', 'data-v': k, 'aria-pressed': String(k === 'all'), onclick: () => api.goto(k) }, V[k].label)));
      const layerSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Katmanlar' });
      const toggle = (key, label, fn) => {
        const b = h('button', { type: 'button', 'aria-pressed': String(state[key]), onclick: () => { state[key] = !state[key]; b.setAttribute('aria-pressed', String(state[key])); fn(state[key]); } }, label);
        layerSeg.appendChild(b);
      };
      const vis = (id, on) => { if (loaded && map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
      toggle('b3d', '3B binalar', on => { vis('sk-3d', on); map.easeTo({ pitch: on ? 55 : 0, duration: 800 }); });
      if (SK.osmChargers) toggle('osm', 'Diğer işletmeciler (OSM)', on => vis('osm-ch', on));
      wrap.appendChild(h('div', { class: 'geo-tools' }, viewSeg, baseSeg(), layerSeg));
      api_viewSeg = viewSeg;
    } else {
      wrap.appendChild(h('div', { class: 'geo-tools is-compact' }, baseSeg()));
    }

    function animateDash() {
      if (!animating) return;
      const seq = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
      dashStep = (dashStep + 1) % seq.length;
      if (loaded && map.getLayer('sk-links')) map.setPaintProperty('sk-links', 'line-dasharray', seq[dashStep]);
      setTimeout(() => requestAnimationFrame(animateDash), 70);
    }

    function update() {
      const A = SK.state.attack;
      Object.keys(markers).forEach(id => {
        const m = markers[id];
        let attacked = false;
        m.conns.forEach((c, i) => {
          const st = SK.connState(c);
          if (st === 'Unavailable') attacked = true;
          if (m.cls[i] !== st) { m.cls[i] = st; m.segs[i].setAttribute('fill', STATE_COLOR[st]); }
        });
        m.el.classList.toggle('is-attacked', attacked);
        m.el.classList.toggle('is-selected', !opts.compact && SK.state.selectedSite === id);
      });
      const hot = !!(A && (A.hit.csms || A.hit.vendor));
      if (hqEl) hqEl.classList.toggle('is-hot', !!(A && (A.hit.hq.size || A.hit.csms)));
      if (loaded && map.getLayer('sk-links')) {
        map.setPaintProperty('sk-links', 'line-color', hot ? SK.PAL.crit : SK.PAL.p);
        map.setPaintProperty('sk-links', 'line-opacity', hot ? 0.8 : 0.22);
        map.setPaintProperty('sk-links', 'line-width', hot ? 1.8 : 1);
        if (hot && !animating && !SK.reducedMotion) { animating = true; animateDash(); }
        if (!hot && animating) { animating = false; map.setPaintProperty('sk-links', 'line-dasharray', [1, 0]); }
      }
    }

    const api = {
      el: wrap,
      map,
      update,
      goto(k) {
        if (api_viewSeg) api_viewSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === k)));
        const V = VIEWS();
        if (k === 'all' || !V[k]) map.fitBounds(bounds(twin.sites), { padding: 60, pitch: state.b3d ? 35 : 0, duration: 1400 });
        else map.flyTo({ center: V[k].center, zoom: V[k].zoom, pitch: state.b3d ? 45 : 0, bearing: -10, duration: 1600 });
      },
      flyToSite(id) {
        const x = twin.siteMap[id];
        if (!x) return;
        map.flyTo({ center: [x.lon, x.lat], zoom: 16.4, pitch: state.b3d ? 60 : 0, bearing: -25, speed: 1.3, curve: 1.5 });
      },
      resize() { map.resize(); },
      setBase,
      destroy() { animating = false; clearTimeout(failTimer); clearTimeout(readyTimer); if (ro) ro.disconnect(); try { map.remove(); } catch (e) { /* kapalı */ } }
    };
    return api;
  };
})(window.SK);
