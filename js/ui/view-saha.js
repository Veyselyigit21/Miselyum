/* Saha ikizi: gerçek sokak haritası, canlı grafikler, lokasyon ayrıntısı ve cihaz mesaj akışı (şarj ağında OCPP).
   Bütün sözcükler ve şirkete özgü notlar şirket paketinden (SK.company.terms / ui) gelir. */
(function (SK) {
  'use strict';
  const h = SK.h, F = SK.fmt, P = SK.PAL;

  function osmUrl(osm) {
    if (!osm) return null;
    const t = { N: 'node', W: 'way', R: 'relation' }[osm.charAt(0)];
    return t ? 'https://www.openstreetmap.org/' + t + '/' + osm.slice(1) : null;
  }

  // Saha müdahalesi: merkezden gerçek sürüş süreleri (OSRM) ve en yakın itfaiye (Overpass)
  function responseBox() {
    const sites = SK.twin.sites.filter(x => x.extra);
    if (!sites.length) return null;
    const groups = Object.keys(SK.cityNames).map(c => [c, SK.cityNames[c]]).map(([c, l]) => {
      const g = sites.filter(x => x.city === c);
      const mins = g.map(x => x.extra.driveMin);
      return { l, n: g.length, lo: Math.min.apply(null, mins), hi: Math.max.apply(null, mins) };
    }).filter(g => g.n);
    const far = sites.filter(x => x.extra.driveMin > 120).length;
    const noFire = sites.filter(x => x.extra.fireKm > 30).length;
    const dur = m => m >= 60 ? Math.floor(m / 60) + ' sa ' + (m % 60) + ' dk' : m + ' dk';
    return h('div', null, h('div', { class: 'label' }, 'Saha müdahale süresi · merkezden sürüş'),
      h('dl', { class: 'kv', style: { marginTop: '8px' } }, groups.map(g => [h('dt', null, g.l + ' (' + g.n + ')'), h('dd', { class: 'num' }, g.lo === g.hi ? dur(g.lo) : dur(g.lo) + ' – ' + dur(g.hi))])),
      SK.company.ui.responseNote ? h('p', { class: 'callout', style: { marginTop: '10px' } }, SK.company.ui.responseNote(far, noFire)) : null,
      h('p', { class: 'note' }, 'Kaynak: OpenStreetMap yol ağı üzerinde OSRM ve Overpass API, 8 Ekim 2026.'));
  }

  function networkSummary() {
    const twin = SK.twin, C = SK.company;
    const byProfile = {};
    Object.keys(SK.profiles).forEach(p => { byProfile[p] = 0; });
    twin.units.forEach(u => { byProfile[SK.models[u.model].profile]++; });
    const links = {};
    Object.keys(SK.links).forEach(k => { links[k] = 0; });
    twin.sites.forEach(x => { links[x.link]++; });
    const byCity = {};
    twin.sites.forEach(x => { byCity[x.city] = (byCity[x.city] || 0) + 1; });
    const kinds = Object.keys(twin.econ.byKind).filter(k => twin.econ.byKind[k].n);
    const callout = C.ui.sahaCallout ? C.ui.sahaCallout({ byProfile, links }) : null;

    return h('div', { class: 'panel stack' },
      h('div', { class: 'panel-head' }, h('h2', null, 'Ağ özeti'), h('span', { class: 'note' }, 'Haritada bir halkaya tıklayın')),
      h('dl', { class: 'kv' },
        h('dt', null, 'Lokasyon'), h('dd', { class: 'num' }, twin.sites.length + ' (' + Object.keys(SK.cityNames).filter(c => byCity[c]).map(c => SK.cityNames[c] + ' ' + byCity[c]).join(', ') + ')'),
        h('dt', null, SK.T('unitTitle')), h('dd', { class: 'num' }, F.n(twin.units.length)),
        h('dt', null, SK.T('endpointTitle')), h('dd', { class: 'num' }, F.n(twin.connectors.length) + (kinds.length > 1 ? ' (' + kinds.map(k => twin.econ.byKind[k].n + ' ' + (C.kindNames ? C.kindNames[k] : k)).join(', ') + ')' : '')),
        C.revenueMode !== 'job' ? h('dt', null, 'Fiyat') : null,
        C.revenueMode !== 'job' ? h('dd', { class: 'num' }, 'AC ' + F.n2(C.prices.AC) + ' · DC ' + F.n2(C.prices.DC) + ' TL/kWh ', SK.chip('info', 'piyasa medyanı', 'chip-real')) : null,
        h('dt', null, SK.T('revenueTitle')), h('dd', { class: 'num' }, F.tlShort(twin.econ.dailyRevenue) + ' / gün · ' + F.tlShort(twin.econ.annualRevenue) + ' / yıl')),
      h('div', null, h('div', { class: 'label' }, SK.T('profileTitle')),
        h('div', { class: 'stack', style: { gap: '6px', marginTop: '8px' } }, Object.keys(SK.profiles).map(p => h('div', { class: 'row', style: { justifyContent: 'space-between' } },
          SK.profiles[p].weak ? SK.chip('crit', SK.profiles[p].label) : SK.chip('ok', SK.profiles[p].label),
          h('span', { class: 'cell-sub', style: { flex: '1', minWidth: '0' } }, SK.profiles[p].desc),
          h('span', { class: 'num' }, byProfile[p] + ' ' + SK.T('unit')))))),
      h('dl', { class: 'kv' }, Object.keys(SK.links).map(k => [h('dt', null, SK.links[k].label), h('dd', { class: 'num' }, links[k] + ' lokasyon')])),
      responseBox(),
      callout ? h('p', { class: 'callout is-crit' }, callout, h('a', { href: '#riskler' }, 'Riskleri gör')) : null
    );
  }

  function siteDetail(site, onClose) {
    const cells = [];
    const url = osmUrl(site.osm);
    const body = h('div', { class: 'panel stack' },
      h('div', { class: 'panel-head' },
        h('div', null, h('div', { class: 'label' }, site.code + ' · ' + SK.siteTypes[site.type].label), h('h2', null, site.name)),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: onClose }, 'Kapat')),
      h('dl', { class: 'kv' },
        h('dt', null, 'Gerçek konum'), h('dd', null, site.poi + (site.street ? ', ' + site.street : '') + (site.district ? ' · ' + site.district : '') + ' / ' + (site.road || SK.cityNames[site.city])),
        h('dt', null, 'Koordinat'), h('dd', { class: 'mono' }, site.lat.toFixed(5) + ', ' + site.lon.toFixed(5)),
        h('dt', null, 'Kaynak'), h('dd', null, url ? h('a', { href: url, target: '_blank', rel: 'noopener' }, 'OpenStreetMap kaydı ' + site.osm) : (site.src || 'OpenStreetMap')),
        site.extra ? h('dt', null, 'Merkezden sürüş') : null, site.extra ? h('dd', { class: 'num' }, F.n(site.extra.driveMin) + ' dk · ' + F.n1(site.extra.driveKm) + ' km', h('span', { class: 'note' }, ' (OSRM, trafiksiz)')) : null,
        site.extra && site.extra.fireKm != null ? h('dt', null, 'En yakın itfaiye') : null,
        site.extra && site.extra.fireKm != null ? h('dd', null, site.extra.fireKm > 30 ? 'OpenStreetMap\'te 30 km içinde kayıt yok (veri eksik olabilir)' : site.extra.fireName + ' · ' + F.n1(site.extra.fireKm) + ' km kuş uçuşu') : null,
        h('dt', null, SK.T('hostLabel')), h('dd', null, site.host),
        h('dt', null, 'Bağlantı'), h('dd', null, SK.links[site.link].label)),
      site.units.map(u => {
        const m = SK.models[u.model];
        const prof = SK.profiles[m.profile];
        const kar = h('span');
        cells.push({ unit: u, kar });
        return h('div', { class: 'stack', style: { gap: '6px', borderTop: '1px solid var(--line)', paddingTop: '10px' } },
          h('div', { class: 'row', style: { justifyContent: 'space-between' } },
            h('span', { class: 'row' }, h('span', { class: 'cell-title mono' }, u.id), kar),
            h('span', { class: 'row' }, h('span', { class: 'tag' }, m.label), h('span', { class: 'tag' }, m.protocol || 'OCPP ' + m.ocpp),
              prof.weak ? SK.chip('crit', prof.label + ' · ' + SK.T('weakNote')) : SK.chip('ok', prof.label))),
          h('div', { class: 'cell-sub' }, m.vendor + ' · firmware ' + u.fw + (m.ble ? ' · Bluetooth açık' : '') + (m.note ? ' · ' + m.note : '')),
          u.connectors.map(c => {
            const st = h('span', null), info = h('span', { class: 'cell-sub num' });
            cells.push({ c, st, info });
            return h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'mono' }, SK.T('endpointTitle') + ' ' + c.id.split('/')[1]), st, info);
          }));
      }),
      h('p', { class: 'note' }, SK.company.ui.siteNote));
    function update() {
      cells.forEach(x => {
        if (x.unit) {
          const q = !!x.unit.connectors[0].quarantine;
          if (x.kar.dataset.q !== String(q)) { SK.clear(x.kar); if (q) x.kar.appendChild(SK.chip('crit', 'Karantina · ikiz')); x.kar.dataset.q = String(q); }
          return;
        }
        const state = SK.connState(x.c);
        const key = { Available: 'ok', Charging: 'info', Faulted: 'warn', Unavailable: 'crit', Offline: 'off' }[state];
        if (x.st.dataset.s !== state) { SK.clear(x.st).appendChild(SK.chip(key, SK.STATE_LABEL[state])); x.st.dataset.s = state; }
        const se = x.c.session;
        x.info.textContent = !se ? ' ' : SK.company.revenueMode === 'job' ? F.n(se.kw) + ' kW · iş #' + se.id + ' · ' + Math.max(0, Math.round(se.left)) + ' dk kaldı'
          : F.n(se.kw) + ' kW · ' + F.n1(se.kwh) + ' kWh · ' + F.tl(se.tl) + (x.c.limitKw ? ' · sınır ' + F.n1(x.c.limitKw) + ' kW' : '');
      });
    }
    update();
    return { el: body, update };
  }

  function loadOption() {
    const S = SK.sim.S;
    const talep = SK.ikiz3 && SK.ikiz3.ozet && SK.link.mode === 'canli' ? SK.ikiz3.ozet.talep : null;
    return {
      grid: { left: 48, right: 64, top: 20, bottom: 28 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: P.axis } },
        valueFormatter: v => F.n(v) + ' kW' },
      xAxis: { type: 'category', boundaryGap: false, data: S.series.map(x => F.clock(x.t)), axisLabel: { interval: 17 } },
      yAxis: { type: 'value', axisLabel: { formatter: v => F.n(v) } },
      series: [{
        name: 'Anlık güç', type: 'line', smooth: 0.35, showSymbol: false, data: S.series.map(x => x.power),
        lineStyle: { width: 2, color: P.charge },
        areaStyle: { color: SK.alpha(P.charge, 0.12) },
        endLabel: { show: true, formatter: p => F.n(p.value) + ' kW', color: P.ink, fontWeight: 700 },
        // Seviye 3: şebeke talebi sürerken ikizin indirdiği hedef
        markLine: talep ? { symbol: 'none', silent: true, lineStyle: { color: P.accent, type: 'dashed', width: 1.5 },
          label: { formatter: 'Talep hedefi ' + F.n(talep.hedef) + ' kW', position: 'insideStartTop', color: P.ink },
          data: [{ yAxis: talep.hedef }] } : undefined
      }]
    };
  }

  function hourlyOption() {
    const S = SK.sim.S, cur = Math.floor((S.minute % 1440) / 60);
    return {
      grid: { left: 48, right: 10, top: 20, bottom: 28 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: v => F.tl(v) },
      xAxis: { type: 'category', data: S.hourly.map((_, i) => String(i).padStart(2, '0')), axisLabel: { interval: 3 } },
      yAxis: { type: 'value', axisLabel: { formatter: SK.axisTL } },
      series: [{
        name: SK.T('hourlySeries'), type: 'bar', barWidth: '62%',
        data: S.hourly.map((v, i) => ({ value: Math.round(v), itemStyle: { color: i === cur ? P.accent : SK.alpha(P.p, 0.55), borderRadius: [4, 4, 0, 0] } }))
      }]
    };
  }

  function stateOption() {
    const n = SK.countStates(SK.twin.connectors);
    const data = [['Available', P.ok], ['Charging', P.charge], ['Faulted', P.warn], ['Unavailable', P.crit]]
      .map(([k, c]) => ({ name: SK.STATE_LABEL[k], value: n[k], itemStyle: { color: c } }));
    return {
      tooltip: { trigger: 'item', valueFormatter: v => v + ' ' + SK.T('endpoint') },
      legend: { bottom: 0, itemGap: 10, textStyle: { fontSize: 11 } },
      series: [{
        type: 'pie', radius: ['56%', '78%'], center: ['50%', '44%'], padAngle: 2, itemStyle: { borderRadius: 3, borderColor: P.surface, borderWidth: 2 },
        label: { show: true, position: 'center', formatter: () => F.n(SK.sim.S.kpi.charging) + '\n' + SK.T('busy').toLocaleLowerCase('tr-TR'), color: P.ink, fontSize: 18, fontWeight: 700, lineHeight: 22 },
        data
      }]
    };
  }

  SK.registerView('saha', {
    title: 'Saha ikizi',
    count: () => SK.twin.sites.length + ' nokta',
    mount(main) {
      let detail = null;
      const side = h('div', { class: 'stack' });
      const legend = SK.stateLegend();
      const mapHost = h('div');
      const map = SK.mountMap(mapHost, {
        onSelect: id => {
          SK.state.selectedSite = SK.state.selectedSite === id ? null : id;
          if (SK.state.selectedSite) map.flyToSite(id);
          renderSide(); map.update();
        }
      });

      function renderSide() {
        SK.clear(side);
        detail = null;
        const site = SK.state.selectedSite && SK.twin.siteMap[SK.state.selectedSite];
        if (site) {
          detail = siteDetail(site, () => { SK.state.selectedSite = null; renderSide(); map.update(); });
          side.appendChild(detail.el);
        } else side.appendChild(networkSummary());
      }

      const onlyAlerts = h('input', { type: 'checkbox', id: 'log-alerts' });
      const logBox = h('div', { class: 'log', role: 'log', 'aria-label': SK.T('logTitle'), tabindex: '0' });
      let lastN = 0;
      function line(e) {
        return h('div', { class: 'log-line' + (e.kind ? ' is-' + e.kind : '') },
          h('span', { class: 't' }, F.clock(e.t)), h('span', { class: 'd' }, e.dir),
          h('span', { class: 'w' }, e.who), h('span', { class: 'm' }, e.msg));
      }
      function renderLog(full) {
        const L = SK.sim.S.log;
        const filt = e => !onlyAlerts.checked || e.kind === 'attack' || e.kind === 'warn' || e.kind === 'ok';
        const nearBottom = logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 40;
        if (full) { SK.clear(logBox); lastN = 0; }
        L.forEach(e => { if (e.n > lastN && filt(e)) logBox.appendChild(line(e)); });
        if (L.length) lastN = L[L.length - 1].n;
        while (logBox.childNodes.length > 220) logBox.removeChild(logBox.firstChild);
        if (nearBottom || full) logBox.scrollTop = logBox.scrollHeight;
      }
      onlyAlerts.addEventListener('change', () => renderLog(true));

      const c1 = h('div', { class: 'chart' }), c2 = h('div', { class: 'chart' }), c3 = h('div', { class: 'chart' });

      main.appendChild(SK.viewHead('Kontrol et · dijital ikiz', 'Saha ikizi', SK.company.ui.sahaLead(SK.twin.sites.length)));
      main.appendChild(SK.help('saha', SK.company.ui.sahaHelp));
      main.appendChild(h('div', { class: 'grid-2' },
        h('div', { class: 'panel stack' }, mapHost, legend.el),
        side));
      // Seviye 3 · iki yönlü ikiz (canlı şarj ağı: Akımyolu)
      const L3 = SK.tenantId === 'akimyolu' && SK.ikiz3Panel ? SK.ikiz3Panel() : null;
      if (L3) main.appendChild(L3.el);
      main.appendChild(h('div', { class: 'grid-3' },
        h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', null, SK.T('loadTitle')), h('span', { class: 'note' }, 'son 24 saat, kW')), c1),
        h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', null, SK.T('hourlyTitle'))), c2),
        h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', null, SK.T('stateTitle'))), c3)));
      main.appendChild(h('div', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', null, SK.T('logTitle')),
          h('label', { class: 'row note', for: 'log-alerts' }, onlyAlerts, 'Yalnızca uyarı ve saldırılar')),
        logBox,
        h('p', { class: 'note', style: { marginTop: '8px' } }, SK.company.ui.logNote)));

      renderSide();
      legend.update(SK.twin.connectors);
      renderLog(true);
      const ch1 = SK.chart(c1, loadOption()), ch2 = SK.chart(c2, hourlyOption()), ch3 = SK.chart(c3, stateOption());
      let lastChart = 0;
      const off1 = SK.on('tick', S => {
        map.update(); legend.update(SK.twin.connectors); if (detail) detail.update(); renderLog(false);
        const now = Date.now();
        if (now - lastChart > 1000) { lastChart = now; ch1.set(loadOption()); ch2.set(hourlyOption()); ch3.set(stateOption()); }
      });
      const off2 = SK.on('attack', () => map.update());
      return () => { off1(); off2(); map.destroy(); if (L3) L3.destroy(); };
    }
  });
})(window.SK);
