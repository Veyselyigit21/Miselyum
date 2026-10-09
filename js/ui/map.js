/* Şematik ağ haritası (internet ya da harita servisi yokken): her lokasyon, uç noktalarının durumunu gösteren bir halka olarak çizilir */
(function (SK) {
  'use strict';
  const h = SK.h, s = SK.s, F = SK.fmt;

  SK.STATE_LABEL = Object.assign({ Available: 'Müsait', Charging: 'Şarjda', Faulted: 'Arızalı', Unavailable: 'Olaydan etkilenen', Offline: 'Çevrimdışı' }, SK.company.stateLabels || {});
  SK.STATE_VAR = { Available: '--st-ok', Charging: '--st-charge', Faulted: '--st-warn', Unavailable: '--st-crit', Offline: '--st-off' };

  function arcPath(cx, cy, r0, r1, a0, a1) {
    const p = (r, a) => (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2);
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    return 'M' + p(r1, a0) + ' A' + r1 + ' ' + r1 + ' 0 ' + large + ' 1 ' + p(r1, a1) +
      ' L' + p(r0, a1) + ' A' + r0 + ' ' + r0 + ' 0 ' + large + ' 0 ' + p(r0, a0) + ' Z';
  }

  function connState(c) { return c.compromised ? 'Unavailable' : c.state; }
  SK.connState = connState;

  SK.countStates = function (conns) {
    const out = { Available: 0, Charging: 0, Faulted: 0, Unavailable: 0, Offline: 0 };
    conns.forEach(c => { out[connState(c)]++; });
    return out;
  };

  SK.stateLegend = function () {
    const box = h('div', { class: 'legend', 'aria-label': SK.T('stateTitle') });
    const items = {};
    Object.keys(SK.STATE_LABEL).forEach(k => {
      if (k === 'Offline') return;
      const b = h('b', null, '0');
      items[k] = b;
      box.appendChild(h('span', { class: 'legend-item' },
        h('span', { class: 'legend-sw', style: { background: 'var(' + SK.STATE_VAR[k] + ')' } }), SK.STATE_LABEL[k], b));
    });
    return {
      el: box,
      update(conns) {
        const n = SK.countStates(conns);
        Object.keys(items).forEach(k => { items[k].textContent = F.n(n[k]); });
      }
    };
  };

  SK.createMap = function (opts) {
    opts = opts || {};
    const twin = SK.twin, G = SK.geo;
    const svg = s('svg', { class: 'map-svg', viewBox: G.viewBox || '150 14 850 616', role: 'group', 'aria-label': SK.company.short + ' ağının şematik haritası' });
    svg.appendChild(s('rect', { class: 'land', x: 0, y: 0, width: 1000, height: 640, rx: 8 }));

    G.cities.forEach(c => svg.appendChild(s('circle', { class: 'city', cx: c.x, cy: c.y, r: c.r })));
    G.roads.forEach(r => {
      const d = 'M' + r.pts.map(p => p.join(' ')).join(' L');
      svg.appendChild(s('path', { class: 'road-edge', d }));
      svg.appendChild(s('path', { class: 'road', d }));
    });
    G.roads.forEach((r, i) => { const L = (G.roadLabels || [])[i]; if (L) svg.appendChild(s('text', { class: 'road-label', x: L[0], y: L[1], 'text-anchor': L[2] || 'middle', text: r.name })); });
    G.cities.forEach(c => svg.appendChild(s('text', { class: 'city-label', x: c.x, y: c.y - c.r - 12, 'text-anchor': 'middle', text: c.name })));
    Object.keys(G.roadside).map(name => ({ name, x: G.roadside[name][0], y: G.roadside[name][1] })).forEach(d => {
      const right = (G.roadsideRight || []).indexOf(d.name) >= 0;
      svg.appendChild(s('text', { class: 'district-label', x: d.x + (right ? 20 : 0), y: d.y + (right ? 4 : 26), 'text-anchor': right ? 'start' : 'middle', text: d.name }));
    });

    // Merkeze (bulut CSMS) bağlantılar
    const cloud = G.cloud, hq = G.hq;
    const uplinks = [];
    const linkFrom = (x, y) => {
      const mx = (x + cloud.x) / 2, my = Math.min(y, cloud.y) - 30;
      const p = s('path', { class: 'uplink', d: 'M' + x + ' ' + y + ' Q' + mx + ' ' + my + ' ' + (cloud.x - 8) + ' ' + (cloud.y + 24) });
      uplinks.push(p);
      svg.appendChild(p);
    };
    G.cities.forEach(c => linkFrom(c.x, c.y));
    Object.keys(G.roadside).forEach(k => linkFrom(G.roadside[k][0], G.roadside[k][1]));
    linkFrom(hq.x, hq.y);

    function nodeBox(x, y, w, hgt, label, sub) {
      const g = s('g', null);
      const box = s('rect', { class: 'node-box', x: x - w / 2, y: y - hgt / 2, width: w, height: hgt, rx: 5 });
      g.appendChild(box);
      g.appendChild(s('text', { class: 'node-label', x, y: sub ? y - 2 : y + 4, 'text-anchor': 'middle', text: label }));
      if (sub) g.appendChild(s('text', { class: 'node-sub', x, y: y + 12, 'text-anchor': 'middle', text: sub }));
      svg.appendChild(g);
      return box;
    }
    const cloudBox = nodeBox(cloud.x - 8, cloud.y, 170, 48, cloud.label, cloud.sub);
    const vendorBox = nodeBox(cloud.x - 8, 152, 170, 44, G.vendors.label, G.vendors.sub);
    svg.appendChild(s('path', { class: 'uplink', d: 'M' + (cloud.x - 8) + ' 94 L' + (cloud.x - 8) + ' 130' }));
    const hqBox = nodeBox(hq.x, hq.y, 112, 30, hq.label);

    // Lokasyonlar
    const siteEls = {};
    twin.sites.forEach(site => {
      const conns = [];
      site.units.forEach(u => u.connectors.forEach(c => conns.push(c)));
      const n = conns.length;
      const r1 = 8.5 + Math.sqrt(n) * 2.1, r0 = r1 - 5.5;
      const g = s('g', { class: 'site', tabindex: opts.compact ? null : '0', role: opts.compact ? null : 'button', 'aria-label': site.name });
      const halo = s('circle', { class: 'attack-halo', cx: site.x, cy: site.y, r: r1 + 3 });
      halo.style.display = 'none';
      g.appendChild(halo);
      g.appendChild(s('circle', { class: 'site-hit', cx: site.x, cy: site.y, r: r1 + 6 }));
      g.appendChild(s('circle', { class: 'site-ring', cx: site.x, cy: site.y, r: r1 + 1.5 }));
      const gap = n > 1 ? 0.16 : 0;
      const segs = conns.map((c, i) => {
        const a0 = -Math.PI / 2 + i * 2 * Math.PI / n + gap / 2;
        const a1 = a0 + 2 * Math.PI / n - gap;
        const p = s('path', { class: 'seg-' + connState(c), d: n === 1 ? arcPath(site.x, site.y, r0, r1, 0, 2 * Math.PI - 0.001) : arcPath(site.x, site.y, r0, r1, a0, a1) });
        g.appendChild(p);
        return p;
      });
      if (opts.onSelect) {
        g.addEventListener('click', () => opts.onSelect(site.id));
        g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onSelect(site.id); } });
      }
      SK.tip.bind(g, () => {
        const cnt = SK.countStates(conns);
        return h('div', null, h('b', null, site.name), h('br'),
          site.code + ' · ' + site.units.length + ' ' + SK.T('unit') + ' · ' + n + ' ' + SK.T('endpoint'), h('br'),
          Object.keys(cnt).filter(k => cnt[k]).map(k => SK.STATE_LABEL[k] + ': ' + cnt[k]).join(' · '));
      });
      svg.appendChild(g);
      siteEls[site.id] = { g, segs, conns, halo, cls: conns.map(connState) };
    });

    function update() {
      const A = SK.state.attack;
      Object.keys(siteEls).forEach(id => {
        const e = siteEls[id];
        let attacked = false;
        e.conns.forEach((c, i) => {
          const st = connState(c);
          if (st === 'Unavailable') attacked = true;
          if (e.cls[i] !== st) { e.cls[i] = st; e.segs[i].setAttribute('class', 'seg-' + st); }
        });
        e.g.classList.toggle('is-attacked', attacked);
        e.halo.style.display = attacked && !SK.reducedMotion ? '' : 'none';
        e.g.classList.toggle('is-selected', SK.state.selectedSite === id && !opts.compact);
      });
      const hotCsms = !!(A && A.hit.csms);
      cloudBox.classList.toggle('is-hot', hotCsms);
      uplinks.forEach(u => u.classList.toggle('is-hot', hotCsms));
      vendorBox.classList.toggle('is-hot', !!(A && A.hit.vendor));
      hqBox.classList.toggle('is-hot', !!(A && A.hit.hq.size));
    }
    update();
    return { el: svg, update };
  };
})(window.SK);

/* Harita seçici: önce gerçek haritayı (MapLibre) dener, olmazsa şematik haritaya düşer */
(function (SK) {
  'use strict';
  const h = SK.h;
  SK.mountMap = function (host, opts) {
    let impl = null;
    const proxy = {
      kind: '',
      update() { if (impl) impl.update(); },
      flyToSite(id) { if (impl && impl.flyToSite) impl.flyToSite(id); },
      destroy() { if (impl && impl.destroy) impl.destroy(); impl = null; }
    };
    function schematic(reason) {
      if (impl && impl.destroy) impl.destroy();
      if (!host.isConnected && proxy.kind) return;
      SK.clear(host);
      impl = SK.createMap(opts);
      host.appendChild(impl.el);
      if (reason) host.appendChild(h('p', { class: 'note', style: { marginTop: '8px' } },
        'Gerçek sokak haritası yüklenemedi (' + reason + '). Şematik görünüm gösteriliyor; internet bağlantısı varken sayfayı yenileyin.'));
      proxy.kind = 'schematic';
    }
    const geo = SK.createGeoMap ? SK.createGeoMap(Object.assign({}, opts, { onFail: r => schematic(r) })) : null;
    if (geo) { impl = geo; host.appendChild(geo.el); proxy.kind = 'geo'; proxy.map = geo.map; SK._map = geo.map; }
    else schematic('harita bileşenleri yüklenemedi');
    return proxy;
  };
})(window.SK);
