/* Sektör verileri: EPDK'nın 2026 aylık istatistikleri, fiyatlar, Ankara verisi ve modelin gerçek veriyle karşılaştırması */
(function (SK) {
  'use strict';
  const h = SK.h, F = SK.fmt, P = SK.PAL;

  function srcLinks(keys) {
    const R = SK.real.sources;
    return h('p', { class: 'src' }, 'Kaynak: ', keys.map((k, i) => [i ? ' · ' : '', h('a', { href: R[k].u, target: '_blank', rel: 'noopener' }, R[k].t)]));
  }

  function stat(label, value, note) {
    return h('div', { class: 'stat is-real' }, h('div', { class: 'label' }, label), h('div', { class: 'big-num' }, value), h('div', { class: 'note' }, note));
  }

  SK.registerView('sektor', {
    title: 'Sektör verileri',
    count: () => 'EPDK',
    mount(main) {
      const R = SK.real, M = R.months, A = R.august, cal = SK.twin.calib;
      main.appendChild(SK.viewHead('Planla · bağlam', 'Sektör verileri',
        'Riskleri gerçekçi değerlendirmek için önce pazarı tanımak gerekir. Bu ekrandaki sayıların tamamı EPDK verisine ve yayınlanmış kaynaklara dayanır; simülasyonun talep ve fiyat ayarları da bu verilerden çıkarıldı.'));
      main.appendChild(SK.help('sektor', [
        '<b>Ne gösterir?</b> Türkiye\'de elektrikli araç şarj pazarının 2026\'daki büyüklüğünü ve büyümesini. "GERÇEK VERİ" etiketli kutular doğrudan kaynaktan alınmıştır.',
        '<b>Model ile gerçek veri karşılaştırması</b> tablosu, simülasyonun ürettiği ortalamaların EPDK\'nın Ağustos 2026 ortalamalarına ne kadar yakın olduğunu gösterir. Hocanıza "rakamlar uydurma değil, gerçek veriyle kalibre edildi" derken bu tabloyu gösterin.']));

      main.appendChild(h('div', { class: 'stat-row' },
        stat('Elektrikli araç', F.n(M[7].ev), 'Ağustos 2026, TÜİK verisi'),
        stat('Şarj soketi', F.n(M[7].soket), F.n(M[7].ac) + ' AC · ' + F.n(M[7].dc) + ' DC'),
        stat('Aylık tüketim', F.n(A.tuketimMWh) + ' MWh', 'Ağustos 2026, aylık rekor'),
        stat('Şarj işlemi', F.n(A.islem), 'Ağustos 2026'),
        stat('Şarj başına enerji', F.n2(A.kwhPerSession) + ' kWh', 'Ağustos 2026 ortalaması'),
        stat('Yeşil şarj payı', F.pct(A.yekgShare), 'YEK-G belgeli istasyonlarda')));

      // Büyüme endeksi ve aylık tüketim
      const c1 = h('div', { class: 'chart' }), c2 = h('div', { class: 'chart' });
      main.appendChild(h('div', { class: 'grid-even' },
        h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', null, 'Büyüme (Ocak 2026 = 100)'), h('span', { class: 'note' }, 'Araç ve soket aynı hızda büyüyor')), c1,
          srcLinks(['beefullOcak', 'beefullMart', 'mayis', 'temmuz', 'agustos'])),
        h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', null, 'Aylık şarj tüketimi'), h('span', { class: 'note' }, 'MWh · Haziran yaklaşık')), c2,
          srcLinks(['beefullSubat', 'beefullNisan', 'temmuzTuketim', 'agustos']))));
      SK.chart(c1, {
        grid: { left: 44, right: 20, top: 30, bottom: 28 },
        tooltip: { trigger: 'axis', valueFormatter: v => F.n1(v) },
        legend: { top: 0, right: 0 },
        xAxis: { type: 'category', data: M.map(m => m.ay), boundaryGap: false },
        yAxis: { type: 'value', min: 95, axisLabel: { formatter: v => v } },
        series: [
          { name: 'Elektrikli araç', type: 'line', smooth: 0.3, symbolSize: 7, data: M.map(m => +(m.ev / M[0].ev * 100).toFixed(1)), lineStyle: { width: 2.5 } },
          { name: 'Şarj soketi', type: 'line', smooth: 0.3, symbolSize: 7, data: M.map(m => +(m.soket / M[0].soket * 100).toFixed(1)), lineStyle: { width: 2.5 } }
        ]
      });
      SK.chart(c2, {
        grid: { left: 54, right: 12, top: 24, bottom: 28 },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: ps => { const m = M[ps[0].dataIndex]; return m.ay + ' 2026<br><b>' + F.n(m.tuketim) + ' MWh</b>' + (m.approx ? '<br>Temmuz artışından geri hesaplandı' : ''); } },
        xAxis: { type: 'category', data: M.map(m => m.ay) },
        yAxis: { type: 'value', axisLabel: { formatter: v => F.n(v / 1000) + ' bin' } },
        series: [{
          type: 'bar', barWidth: '58%',
          data: M.map((m, i) => ({ value: m.tuketim, itemStyle: { borderRadius: [5, 5, 0, 0], color: m.approx ? SK.alpha(P.p, 0.3) : (i === M.length - 1 ? P.accent : P.p) } })),
          label: { show: true, position: 'top', color: P.ink2, fontSize: 10, formatter: p => F.n1(p.value / 1000) }
        }]
      });

      // Fiyatlar
      const c3 = h('div', { class: 'chart is-tall' });
      const ops = R.prices.slice().sort((a, b) => (b.dc[b.dc.length - 1]) - (a.dc[a.dc.length - 1]));
      main.appendChild(h('div', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', null, 'Şarj fiyatları (TL/kWh)'),
          h('span', { class: 'note' }, 'Akımyolu piyasa medyanını kullanıyor: AC ' + F.n2(R.acMedian) + ' · DC ' + F.n2(R.dcMedian))),
        c3, srcLinks(['fiyat'])));
      SK.chart(c3, {
        grid: { left: 110, right: 30, top: 30, bottom: 28 },
        legend: { top: 0, right: 0 },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: ps => {
          const o = ops[ps[0].dataIndex];
          return '<b>' + o.op + '</b><br>DC: ' + o.dc.map(v => F.n2(v)).join(' – ') + ' TL<br>AC: ' + (o.ac ? F.n2(o.ac) + ' TL' : 'yok');
        } },
        yAxis: { type: 'category', data: ops.map(o => o.op), inverse: true },
        xAxis: { type: 'value', min: 0, axisLabel: { formatter: v => v } },
        series: [
          { name: 'DC (hızlı)', type: 'bar', barGap: '20%', barWidth: 9, data: ops.map(o => o.dc[o.dc.length - 1]), itemStyle: { color: P.p, borderRadius: [0, 4, 4, 0] },
            markLine: { symbol: 'none', label: { formatter: 'DC medyan', color: P.ink2 }, lineStyle: { color: P.p, type: 'dashed' }, data: [{ xAxis: R.dcMedian }] } },
          { name: 'AC (yavaş)', type: 'bar', barWidth: 9, data: ops.map(o => o.ac), itemStyle: { color: P.u, borderRadius: [0, 4, 4, 0] },
            markLine: { symbol: 'none', label: { formatter: 'AC medyan', color: P.ink2, position: 'insideEndTop' }, lineStyle: { color: P.u, type: 'dashed' }, data: [{ xAxis: R.acMedian }] } }
        ]
      });

      // Model kalibrasyonu
      const rows = [
        ['Soket başına günlük şarj', F.n2(A.sessionsPerSocketDay), F.n2(cal.sessionsPerSocketDay), cal.sessionsPerSocketDay / A.sessionsPerSocketDay - 1, 'EPDK Ağustos 2026 (işlem ÷ soket ÷ 31 gün)'],
        ['Şarj başına enerji (kWh)', F.n2(A.kwhPerSession), F.n2(cal.kwhPerSession), cal.kwhPerSession / A.kwhPerSession - 1, 'EPDK Ağustos 2026'],
        ['Şarj başına süre (dakika)', F.n(A.minutesPerSession), F.n(cal.minutesPerSession), cal.minutesPerSession / A.minutesPerSession - 1, 'EPDK Ağustos 2026 (toplam süre ÷ işlem)'],
        ['Enerjide DC payı', F.pct(R.dcEnergyShareMay), F.pct(cal.dcEnergyShare), cal.dcEnergyShare / R.dcEnergyShareMay - 1, 'EPDK Mayıs 2026 (AC 12,6 · DC 64,4 GWh)'],
        ['En yoğun / en sakin saat oranı', F.n1(A.peakMWh / A.lowMWh), F.n1(Math.max.apply(null, SK.company.hourCurve) / Math.min.apply(null, SK.company.hourCurve)), (Math.max.apply(null, SK.company.hourCurve) / Math.min.apply(null, SK.company.hourCurve)) / (A.peakMWh / A.lowMWh) - 1, 'EPDK Ağustos 2026 (' + A.peakHour + ' ÷ ' + A.lowHour + ')'],
        ['Cumartesi / Salı oranı', F.n2(A.peakDayMWh / A.lowDayMWh), F.n2(SK.company.dayFactor[5] / SK.company.dayFactor[1]), (SK.company.dayFactor[5] / SK.company.dayFactor[1]) / (A.peakDayMWh / A.lowDayMWh) - 1, 'EPDK Ağustos 2026']
      ];
      main.appendChild(h('div', { class: 'panel stack' },
        h('div', { class: 'panel-head' }, h('h2', null, 'Model ile gerçek veri karşılaştırması'), h('span', { class: 'note' }, 'Fark %10\'un altındaysa model gerçeğe yakın kabul edilir')),
        h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, h('th', null, 'Ölçü'), h('th', { class: 'r' }, 'Gerçek'), h('th', { class: 'r' }, 'Simülasyon'), h('th', { class: 'r' }, 'Fark'), h('th', null, 'Kaynak'))),
          h('tbody', null, rows.map(r => h('tr', null, h('td', { class: 'cell-title' }, r[0]), h('td', { class: 'r' }, r[1]), h('td', { class: 'r' }, r[2]),
            h('td', { class: 'r' }, SK.chip(Math.abs(r[3]) < 0.1 ? 'ok' : Math.abs(r[3]) < 0.2 ? 'warn' : 'crit', (r[3] >= 0 ? '+' : '−') + '%' + F.n1(Math.abs(r[3] * 100)))),
            h('td', { class: 'cell-sub' }, r[4])))))),
        srcLinks(['agustos', 'mayis'])));

      // Ankara, işletmeciler, açık veri
      const opRows = R.operators.map(o => h('tr', null, h('td', { class: 'cell-title' }, o.op), h('td', { class: 'r' }, F.n(o.sockets)), h('td', { class: 'r' }, F.n(o.mwh)), h('td', { class: 'r' }, F.n2(o.mwh / o.sockets))));
      const share = SK.twin.connectors.length / M[7].soket;
      main.appendChild(h('div', { class: 'grid-3' },
        h('div', { class: 'panel stack' }, h('h2', null, 'Ankara'),
          h('dl', { class: 'kv' },
            h('dt', null, 'Halka açık istasyon'), h('dd', { class: 'num' }, F.n(R.ankara.stations) + ' (' + R.ankara.month + ')'),
            h('dt', null, 'Aylık tüketim'), h('dd', { class: 'num' }, F.n(R.ankara.mwh) + ' MWh (' + R.ankara.month + ')'),
            h('dt', null, '100 araca soket'), h('dd', { class: 'num' }, F.n2(R.ankara.socketsPer100Ev)),
            h('dt', null, 'Türkiye tüketim payı'), h('dd', { class: 'num' }, F.pct(R.ankara.consumptionShareMar) + ' (Mart 2026, 2. sıra)')),
          srcLinks(['ankara', 'beefullMart'])),
        h('div', { class: 'panel stack' }, h('h2', null, 'Büyük işletmeciler'),
          h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
            h('thead', null, h('tr', null, h('th', null, 'İşletmeci'), h('th', { class: 'r' }, 'Soket'), h('th', { class: 'r' }, 'MWh'), h('th', { class: 'r' }, 'MWh/soket'))),
            h('tbody', null, opRows))),
          h('p', { class: 'note' }, 'Trugo daha az soketle daha çok enerji satıyor: ağırlığı yol kenarındaki hızlı şarjda. ' + R.operatorsNote),
          srcLinks(['agustosOp', 'beefullMart'])),
        h('div', { class: 'panel stack' }, h('h2', null, 'Akımyolu pazarda nerede?'),
          h('dl', { class: 'kv' },
            h('dt', null, 'Akımyolu soketi'), h('dd', { class: 'num' }, SK.twin.connectors.length),
            h('dt', null, 'Türkiye payı'), h('dd', { class: 'num' }, '%' + F.n2(share * 100)),
            h('dt', null, 'Lisans bedeli (2026)'), h('dd', { class: 'num' }, F.tl(R.licenseFee2026)),
            h('dt', null, 'ISO 27001 son tarih'), h('dd', null, 'En erken 23 Mart 2027')),
          h('p', { class: 'note' }, 'OpenStreetMap\'te üç ilde yalnızca ' + SK.osmChargers.length + ' şarj noktası etiketli; EPDK\'ya göre yalnızca Ankara\'da ' + F.n(R.ankara.stations) + ' istasyon var. Açık harita verisi pazarın küçük bir kısmını gösteriyor; resmi kaynak EPDK\'nın serbest erişim platformudur.'),
          srcLinks(['osm', 'yonetmelik', 'lisans']))));
    }
  });
})(window.SK);
