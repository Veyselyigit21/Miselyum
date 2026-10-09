/* Sigorta ve finans: yıllık beklenen kayıp, risk işleme kararları, poliçe önerileri */
(function (SK) {
  'use strict';
  const h = SK.h, F = SK.fmt, R = SK.risk, P = SK.PAL;

  function niceCeil(v) {
    if (v <= 0) return 0;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const m = v / p;
    const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
    return step * p;
  }

  function barOption(top) {
    return {
      grid: { left: 250, right: 70, top: 36, bottom: 24 },
      legend: { top: 0, right: 0 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: ps => {
        const r = top[ps[0].dataIndex];
        return '<b>' + r.id + ' · ' + r.title + '</b><br>Kalan: ' + F.tl(r.res) + ' / yıl<br>Kontrolsüz: ' + F.tl(r.inh) + ' / yıl<br>' +
          (r.ins.length ? 'Sigorta: ' + r.ins.map(k => SK.policyMap[k].title).join(', ') : 'Sigortalanamaz: kontrol veya kabul');
      } },
      xAxis: { type: 'value', axisLabel: { formatter: SK.axisTL } },
      yAxis: { type: 'category', inverse: true, data: top.map(r => r.id + '  ' + (r.title.length > 32 ? r.title.slice(0, 31) + '…' : r.title)), axisLabel: { color: P.ink2, fontSize: 12 } },
      series: [
        { name: 'Kontrolsüz', type: 'bar', barGap: '-100%', barWidth: 14, data: top.map(r => Math.round(r.inh)), itemStyle: { color: 'transparent', borderColor: SK.PAL.axis, borderType: 'dashed', borderWidth: 1, borderRadius: [0, 4, 4, 0] }, z: 1 },
        { name: 'Kalan (şu anki kontrollerle)', type: 'bar', barWidth: 14, data: top.map(r => Math.round(r.res)), z: 2,
          itemStyle: { color: SK.PAL.k, borderRadius: [0, 3, 3, 0] },
          label: { show: true, position: 'right', color: P.ink, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, formatter: p => F.tlShort(p.value) } }
      ]
    };
  }

  function treemapOption(rows) {
    const cats = {};
    rows.forEach(x => { const c = x.r.cat; (cats[c] = cats[c] || []).push(x); });
    const data = Object.keys(cats).map((c, i) => ({
      name: c, itemStyle: { color: P.series[SK.riskCats.indexOf(c) % 8] },
      children: cats[c].filter(x => x.res > 0).map(x => ({ name: x.id, value: Math.round(x.res), title: x.title }))
    }));
    return {
      tooltip: { formatter: p => p.data && p.data.title ? '<b>' + p.data.name + '</b> ' + p.data.title + '<br>' + F.tl(p.value) + ' / yıl' : '<b>' + p.name + '</b><br>' + F.tl(p.value) + ' / yıl' },
      series: [{
        type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false }, top: 4, left: 4, right: 4, bottom: 4,
        label: { show: true, formatter: p => p.data.title ? p.name + '\n' + F.tlShort(p.value) : p.name, color: '#fff', fontSize: 11, lineHeight: 14 },
        upperLabel: { show: true, height: 22, color: '#fff', fontWeight: 700, formatter: p => p.name + '  ' + F.tlShort(p.value) },
        itemStyle: { borderColor: SK.PAL.surface, borderWidth: 2, gapWidth: 2 },
        levels: [{ itemStyle: { borderWidth: 3, gapWidth: 3, borderColor: SK.PAL.surface } }, { colorSaturation: [0.35, 0.6], itemStyle: { borderColorSaturation: 0.4, gapWidth: 1 } }],
        data
      }]
    };
  }

  SK.registerView('sigorta', {
    title: 'Sigorta ve finans',
    mount(main) {
      const body = h('div', { class: 'stack', style: { gap: '18px' } });
      const barEl = h('div', { class: 'chart is-tall' }), treeEl = h('div', { class: 'chart is-tall' });
      let bar = null, tree = null;
      const statsBox = h('div', { class: 'stat-row' }), trBox = h('div'), polBox = h('div', { class: 'grid-even' });

      function render() {
        const en = SK.state.enabled;
        const rows = SK.risks.map(r => ({ id: r.id, title: r.title, ins: r.ins, inh: R.inherent(r).ale, res: R.eval(r, en).ale, ev: R.eval(r, en), r }));
        const sm = R.summary(en);
        const insurable = rows.filter(x => x.ins.length).reduce((a, x) => a + x.res, 0);
        SK.clear(statsBox);
        [['Kontrolsüz yıllık kayıp', F.tlShort(sm.aleIn), 'Hiç kontrol yokken'],
         ['Kalan yıllık kayıp', F.tlShort(sm.aleRes), 'Şu anki ' + en.size + ' kontrolle'],
         ['Sigortaya devredilebilir', F.tlShort(insurable), 'Kalan kayıp içindeki payı: ' + F.pct(sm.aleRes ? insurable / sm.aleRes : 0)],
         ['Sigortalanamaz kalan', F.tlShort(sm.aleRes - insurable), 'Cezalar, dolandırıcılık, mevzuat']]
          .forEach(([l, v, n]) => statsBox.appendChild(h('div', { class: 'stat' }, h('div', { class: 'label' }, l), h('div', { class: 'big-num' }, v), h('div', { class: 'note' }, n))));

        const top = rows.slice().sort((a, b) => b.res - a.res).slice(0, 12);
        if (bar) bar.set(barOption(top), true); else bar = SK.chart(barEl, barOption(top));
        if (tree) tree.set(treemapOption(rows), true); else tree = SK.chart(treeEl, treemapOption(rows));

        const tr = {};
        rows.forEach(x => { const t = R.treatment(x.r, x.ev); (tr[t.label] = tr[t.label] || []).push(x.id); });
        SK.clear(trBox).appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, h('th', null, 'Karar'), h('th', { class: 'r' }, 'Risk sayısı'), h('th', null, 'Riskler'))),
          h('tbody', null, Object.keys(tr).map(k => h('tr', null, h('td', { class: 'cell-title' }, k), h('td', { class: 'r' }, tr[k].length),
            h('td', null, h('div', { class: 'ctl-row' }, tr[k].map(id => h('span', { class: 'tag', title: SK.riskMap[id].title }, id))))))))));

        SK.clear(polBox);
        SK.policies.forEach(p => {
          const linked = rows.filter(x => x.ins.indexOf(p.key) >= 0);
          const limit = niceCeil(Math.max.apply(null, linked.map(x => x.ev.sle).concat([0])));
          const covered = linked.reduce((a, x) => a + x.res, 0);
          polBox.appendChild(h('div', { class: 'panel policy' },
            h('h3', null, p.title),
            h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'flex-end' } },
              h('div', null, h('div', { class: 'label' }, 'Önerilen teminat limiti'), h('div', { class: 'big-num' }, limit ? F.tlShort(limit) : 'Bedel üzerinden')),
              h('div', { style: { textAlign: 'right' } }, h('div', { class: 'label' }, 'Kapsadığı kalan kayıp'), h('div', { class: 'num' }, F.tlShort(covered) + ' / yıl'))),
            h('p', { class: 'cell-sub' }, p.covers),
            h('div', { class: 'ctl-row' }, linked.map(x => h('span', { class: 'tag', title: x.title }, x.id))),
            h('div', null, h('div', { class: 'label' }, 'Dikkat'), h('ul', { class: 'plain cell-sub' }, p.excl.map(e => h('li', null, e))))));
        });
      }

      main.appendChild(SK.viewHead('Önlem al · finans', 'Sigorta ve finans',
        'Riskler TL olarak hesaplanır: hangi riski kontrolle azaltmak, hangisini sigortaya devretmek daha ekonomik, burada görünür. Teminat limiti, poliçeye bağlı risklerin en büyük tek seferlik kaybından önerilir.'));
      main.appendChild(SK.help('sigorta', [
        '<b>Yıllık beklenen kayıp</b> = tek seferlik kayıp × yılda kaç kez olduğu. Örneğin 6,5 mn TL\'lik bir olay 7 yılda bir oluyorsa yıllık maliyeti yaklaşık 0,9 mn TL\'dir.',
        '<b>Çubuk grafik:</b> Kesikli çerçeve kontrol yokken, dolu çubuk şu anki kontrollerle kalan kayıptır. Aradaki fark, kontrollerin kazandırdığıdır.',
        '<b>Kutu grafik:</b> Kalan kaybın hangi risk türünden geldiğini gösterir. Büyük kutular önce ele alınmalıdır.',
        '<b>Poliçe kartları:</b> Hangi sigortanın hangi riskleri karşıladığı ve dikkat edilmesi gereken istisnalar.']));
      main.appendChild(body);
      body.appendChild(statsBox);
      body.appendChild(h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', null, 'En pahalı 12 risk'), h('span', { class: 'note' }, 'yıllık beklenen kayıp')), barEl));
      body.appendChild(h('div', { class: 'grid-even' },
        h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', null, 'Kalan kaybın dağılımı'), h('span', { class: 'note' }, 'risk kategorisine göre')), treeEl),
        h('div', { class: 'panel stack' }, h('h2', null, 'Risk işleme kararları'),
          h('p', { class: 'note' }, 'ISO 27001\'e göre her risk için dört yoldan biri seçilir: azalt, devret (sigorta), kaçın, kabul et. Karar kalan risk seviyesine göre otomatik önerilir.'), trBox)));
      body.appendChild(h('div', { class: 'stack' }, h('div', { class: 'label' }, 'Poliçe önerileri'), polBox));
      body.appendChild(h('p', { class: 'callout is-crit' },
        SK.company.ui.insuranceNote));
      render();
      return SK.on('controls', render);
    }
  });
})(window.SK);
