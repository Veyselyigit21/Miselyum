/* Uyum durumu: şirket paketindeki mevzuat ve standart gereklilikleri (şarj ağında EPDK, KVKK, 7545, PCI DSS) ve ISO 27001 Ek A kapsaması */
(function (SK) {
  'use strict';
  const h = SK.h, F = SK.fmt, R = SK.risk;

  function annexRefs(iso) {
    const out = [];
    iso.split('·').map(x => x.trim()).forEach(part => {
      if (!/^\d/.test(part)) return;
      const m = part.match(/^(\d)\.(\d+)–(\d)\.(\d+)$/);
      if (m) for (let i = +m[2]; i <= +m[4]; i++) out.push(m[1] + '.' + i);
      else out.push(part);
    });
    return out;
  }

  SK.registerView('uyum', {
    title: 'Uyum durumu',
    count: () => F.pct(R.readiness(SK.state.enabled)),
    mount(main) {
      const body = h('div', { class: 'stack', style: { gap: '18px' } });
      function render() {
        SK.clear(body);
        const en = SK.state.enabled;
        const deadline = new Date(2027, 2, 23);
        const days = Math.ceil((deadline - new Date()) / 86400000);
        body.appendChild(h('p', { class: 'callout' + (en.has('isms') ? '' : ' is-crit') },
          days > 0 ? 'Mevcut lisans sahiplerine ISO 27001 belgesi için 1 yıl süre verildi. Kaynaklar sürenin başlangıcını farklı yorumluyor: en erken bitiş 23 Mart 2027, yani ' + days + ' gün sonra; en geç 1 Temmuz 2027. '
            : 'ISO 27001 belgesi için tanınan en erken süre doldu. ',
          en.has('isms') ? 'BGYS kurulumu açık; belgelendirme denetimi planlanmalı.' : 'BGYS kurulumu kapalı: belge olmadan bu tarihe yetişmek mümkün değil.'));

        const ov = h('div', { class: 'stat-row' });
        ov.appendChild(h('div', { class: 'stat' }, h('div', { class: 'label' }, 'Genel hazırlık'), h('div', { class: 'big-num' }, F.pct(R.readiness(en))),
          h('div', { class: 'meter', style: { marginTop: '8px' } }, h('span', { style: { width: Math.round(R.readiness(en) * 100) + '%' } }))));
        SK.frameworks.forEach(f => {
          let sc = 0;
          f.reqs.forEach(r => { const st = R.reqStatus(r, en); sc += st.key === 'ok' ? 1 : st.key === 'kismen' ? 0.5 : 0; });
          const pct = sc / f.reqs.length;
          ov.appendChild(h('div', { class: 'stat' }, h('div', { class: 'label' }, f.title), h('div', { class: 'big-num' }, F.pct(pct)),
            h('div', { class: 'meter', style: { marginTop: '8px' } }, h('span', { style: { width: Math.round(pct * 100) + '%' } }))));
        });
        body.appendChild(ov);
        const radarEl = h('div', { class: 'chart is-tall' });
        body.appendChild(h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', null, 'Uyum haritası'), h('span', { class: 'note' }, 'dış çizgi tam uyum')), radarEl));
        const fw = SK.frameworks.map(f => {
          let sc = 0;
          f.reqs.forEach(r => { const st = R.reqStatus(r, en); sc += st.key === 'ok' ? 1 : st.key === 'kismen' ? 0.5 : 0; });
          return { name: f.short || f.title, v: Math.round(sc / f.reqs.length * 100) };
        });
        const annex = (function () {
          const all = {}, on = {};
          SK.controls.forEach(c => annexRefs(c.iso).forEach(ref => { all[ref] = 1; if (en.has(c.key)) on[ref] = 1; }));
          return Math.round(Object.keys(on).length / Object.keys(all).length * 100);
        })();
        fw.push({ name: 'ISO 27001 Ek A', v: annex });
        const rec = SK.recommended;
        const fwRec = SK.frameworks.map(f => {
          let sc = 0;
          f.reqs.forEach(r => { const st = R.reqStatus(r, rec); sc += st.key === 'ok' ? 1 : st.key === 'kismen' ? 0.5 : 0; });
          return Math.round(sc / f.reqs.length * 100);
        });
        const annexRec = (function () {
          const all = {}, on = {};
          SK.controls.forEach(c => annexRefs(c.iso).forEach(ref => { all[ref] = 1; if (rec.has(c.key)) on[ref] = 1; }));
          return Math.round(Object.keys(on).length / Object.keys(all).length * 100);
        })();
        if (SK._uyumRadar) SK._uyumRadar.dispose();
        SK._uyumRadar = SK.chart(radarEl, {
          legend: { bottom: 0 },
          tooltip: { trigger: 'item' },
          radar: {
            indicator: fw.map(x => ({ name: x.name, max: 100 })), radius: '64%', center: ['50%', '48%'], splitNumber: 4,
            axisName: { color: SK.PAL.ink2, fontSize: 12 },
            splitLine: { lineStyle: { color: SK.PAL.grid } }, splitArea: { areaStyle: { color: ['transparent', SK.alpha(SK.PAL.ink, 0.025)] } },
            axisLine: { lineStyle: { color: SK.PAL.grid } }
          },
          series: [{
            type: 'radar', symbolSize: 6,
            data: [
              { name: 'Faz 1 planıyla', value: fwRec.concat([annexRec]), lineStyle: { color: SK.PAL.u, type: 'dashed', width: 2 }, itemStyle: { color: SK.PAL.u }, areaStyle: { color: SK.alpha(SK.PAL.u, 0.08) } },
              { name: 'Şu anki durum', value: fw.map(x => x.v), lineStyle: { color: SK.PAL.k, width: 2.5 }, itemStyle: { color: SK.PAL.k }, areaStyle: { color: SK.alpha(SK.PAL.k, 0.16) } }
            ]
          }]
        });

        SK.frameworks.forEach(f => {
          body.appendChild(h('div', { class: 'panel stack' },
            h('div', { class: 'panel-head' }, h('div', null, h('h2', null, f.title), h('div', { class: 'note' }, f.sub)),
              f.url ? h('a', { href: f.url, target: '_blank', rel: 'noopener', class: 'note' }, 'Kaynak') : null),
            h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
              h('thead', null, h('tr', null, h('th', null, 'No'), h('th', null, 'Gereklilik'), h('th', null, 'Durum'), h('th', null, 'Eksik kontroller'))),
              h('tbody', null, f.reqs.map(r => {
                const st = R.reqStatus(r, en);
                return h('tr', null, h('td', { class: 'mono' }, r.id), h('td', null, r.text),
                  h('td', null, SK.chip(st.key === 'ok' ? 'ok' : st.key === 'kismen' ? 'warn' : 'crit', st.label)),
                  h('td', null, h('div', { class: 'ctl-row' }, st.missing.length ? st.missing.map(k => h('button', { type: 'button', class: 'chip chip-off', onclick: () => SK.toggleControl(k, true), title: 'Kontrolü aç' },
                    h('span', { class: 'chip-ic', 'aria-hidden': 'true' }, '+'), SK.controlMap[k].title)) : h('span', { class: 'note' }, '–'))));
              }))))));
        });

        // Ek A kapsaması
        const themes = {};
        SK.controls.forEach(c => annexRefs(c.iso).forEach(ref => {
          const t = { 5: 'Kurumsal', 6: 'İnsan', 7: 'Fiziksel', 8: 'Teknolojik' }[ref.charAt(0)];
          themes[t] = themes[t] || {};
          const cur = themes[t][ref] || false;
          themes[t][ref] = cur || en.has(c.key);
        }));
        const totalRefs = Object.keys(themes).reduce((a, t) => a + Object.keys(themes[t]).length, 0);
        const onRefs = Object.keys(themes).reduce((a, t) => a + Object.values(themes[t]).filter(Boolean).length, 0);
        body.appendChild(h('div', { class: 'panel stack' },
          h('div', { class: 'panel-head' }, h('h2', null, 'ISO/IEC 27001:2022 Ek A kapsaması'),
            h('span', { class: 'note' }, 'Modellenen ' + totalRefs + ' kontrolün ' + onRefs + ' tanesi uygulanıyor (Ek A\'da toplam 93 kontrol var)')),
          h('div', { class: 'grid-even' }, ['Kurumsal', 'İnsan', 'Fiziksel', 'Teknolojik'].filter(t => themes[t]).map(t =>
            h('div', null, h('div', { class: 'label', style: { marginBottom: '6px' } }, t + ' (A.' + { Kurumsal: 5, İnsan: 6, Fiziksel: 7, Teknolojik: 8 }[t] + ')'),
              h('div', { class: 'ctl-row' }, Object.keys(themes[t]).sort((a, b) => parseFloat(a.split('.')[1]) - parseFloat(b.split('.')[1])).map(ref =>
                SK.chip(themes[t][ref] ? 'ok' : 'off', ref)))))),
          SK.company.ui.uyumNote ? h('p', { class: 'note' }, SK.company.ui.uyumNote) : null));
      }
      main.appendChild(SK.viewHead('Önlem al · uyum', 'Uyum durumu',
        'Hangi yasal gerekliliğin hangi kontrolle karşılandığı burada izlenir. Eksik bir kontrolü doğrudan bu ekrandan açabilirsiniz.'));
      main.appendChild(SK.help('uyum', [
        '<b>Ne işe yarar?</b> Şirketin uymak zorunda olduğu kuralları (' + SK.frameworks.map(f => f.short || f.title).join(', ') + ') madde madde listeler ve hangi güvenlik kontrolüyle karşılandığını gösterir.',
        '<b>Radar grafik:</b> Turkuaz alan bugünkü durum, mavi kesikli çizgi Faz 1 planı uygulanınca ulaşılacak durumdur. Dış çizgiye ne kadar yakınsa uyum o kadar yüksektir.',
        '<b>Eksik kontroller</b> sütunundaki etiketlere tıklayarak o kontrolü doğrudan açabilirsiniz.']));
      main.appendChild(body);
      render();
      return SK.on('controls', render);
    }
  });
})(window.SK);
