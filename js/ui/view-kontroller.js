/* Kontroller: aç/kapa, maliyet, azalttığı kayıp, yatırım getirisi ve otomatik öneri */
(function (SK) {
  'use strict';
  const h = SK.h, F = SK.fmt, R = SK.risk;
  const THEMES = ['Kurumsal', 'İnsan', 'Fiziksel', 'Teknolojik'];

  SK.registerView('kontroller', {
    title: 'Kontroller',
    count: () => SK.state.enabled.size + ' / ' + SK.controls.length,
    mount(main) {
      const statsBox = h('div', { class: 'stat-row' });
      const tbody = h('tbody');
      const presets = h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onclick: () => SK.setEnabled(SK.defaultEnabled) }, 'Bugünkü durum'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => SK.setEnabled(SK.plans.faz1) }, 'Faz 1 planı (' + SK.plans.faz1.size + ')'),
        h('button', { type: 'button', class: 'btn', onclick: () => SK.setEnabled(SK.plans.all) }, 'Faz 2 · tümü (' + SK.plans.all.size + ')'),
        h('button', { type: 'button', class: 'btn', onclick: () => SK.setEnabled(SK.plans.fin), title: 'Yalnız maliyet-fayda hesabının seçtiği set' }, 'Yalnız maliyet-fayda (' + SK.plans.fin.size + ')'),
        h('button', { type: 'button', class: 'btn', onclick: () => SK.setEnabled([]) }, 'Hepsini kapat'));

      function renderStats() {
        const sm = R.summary(SK.state.enabled);
        SK.clear(statsBox);
        [['Açık kontrol', SK.state.enabled.size + ' / ' + SK.controls.length, 'Faz 1 planı: ' + SK.plans.faz1.size + ' kontrol'],
         ['Yıllık kontrol maliyeti', F.tlShort(sm.cost), 'Varsayımsal piyasa fiyatları'],
         ['Azaltılan yıllık kayıp', F.tlShort(sm.aleIn - sm.aleRes), F.tlShort(sm.aleIn) + ' → ' + F.tlShort(sm.aleRes)],
         ['Net fayda', F.tlShort(sm.net), sm.cost ? 'Yatırım getirisi ' + F.pct(sm.rosi) : 'Kontrol açık değil']]
          .forEach(([l, v, n]) => statsBox.appendChild(h('div', { class: 'stat' }, h('div', { class: 'label' }, l), h('div', { class: 'big-num' }, v), h('div', { class: 'note' }, n))));
      }

      function renderTable() {
        SK.clear(tbody);
        THEMES.forEach(t => {
          const list = SK.controls.filter(c => c.theme === t);
          if (!list.length) return;
          tbody.appendChild(h('tr', { class: 'theme-row' }, h('td', { colspan: 7 }, t + ' kontroller (Ek A.' + { Kurumsal: 5, İnsan: 6, Fiziksel: 7, Teknolojik: 8 }[t] + ')')));
          list.forEach(c => {
            const on = SK.state.enabled.has(c.key);
            const m = R.marginal(c.key, SK.state.enabled);
            const id = 'ctl-' + c.key;
            const covered = SK.risks.filter(r => r.controls.indexOf(c.key) >= 0).map(r => r.id);
            tbody.appendChild(h('tr', null,
              h('td', null, h('label', { class: 'switch', for: id, title: on ? 'Kapat' : 'Aç' },
                h('input', { type: 'checkbox', id, checked: on, onchange: e => SK.toggleControl(c.key, e.target.checked), 'aria-label': c.title }), h('span'))),
              h('td', { class: 'mono' }, c.iso),
              h('td', null, h('div', { class: 'cell-title' }, c.title), h('div', { class: 'cell-sub' }, c.desc),
                h('div', { class: 'cell-sub', style: { marginTop: '3px' } }, (c.kind === 'L' ? 'Olasılığı' : 'Etkiyi') + ' %' + Math.round(c.eff * 100) + ' azaltır · ' + covered.length + ' risk: ' + covered.join(', '))),
              h('td', { class: 'r' }, F.tlShort(c.cost)),
              h('td', { class: 'r' }, F.tlShort(m.benefit)),
              h('td', { class: 'r' }, h('span', { style: { color: m.net >= 0 ? 'var(--ink)' : 'var(--muted)' } }, (m.net >= 0 ? '+' : '') + F.tlShort(m.net))),
              h('td', null, (ph => SK.chip(ph === 'Mevcut' ? 'info' : ph === 'Faz 1' ? 'ok' : 'warn', ph))(SK.phaseOf(c.key)))));
          });
        });
      }

      const scEl = h('div', { class: 'chart is-tall' });
      let sc = null;
      function scatterOption() {
        const pts = SK.controls.map(c => {
          const m = R.marginal(c.key, SK.state.enabled);
          const on = SK.state.enabled.has(c.key), rec = SK.recommended.has(c.key);
          return { name: c.title, value: [c.cost, Math.max(m.benefit, 1000)], key: c.key, on, rec, iso: c.iso };
        });
        const maxV = Math.max.apply(null, pts.map(p => Math.max(p.value[0], p.value[1]))) * 1.15;
        const group = (f, name, color, symbol) => ({
          name, type: 'scatter', symbol, symbolSize: 14, data: pts.filter(f),
          itemStyle: { color, borderColor: SK.PAL.surface, borderWidth: 1.5 },
          emphasis: { scale: 1.5, label: { show: true, formatter: p => p.data.name, color: SK.PAL.ink, position: 'top' } }
        });
        return {
          grid: { left: 64, right: 110, top: 40, bottom: 44 },
          legend: { top: 0 },
          tooltip: { trigger: 'item', formatter: p => '<b>' + p.data.name + '</b> (' + p.data.iso + ')<br>Yıllık maliyet: ' + F.tl(p.value[0]) + '<br>Azalttığı kayıp: ' + F.tl(p.value[1]) + '<br>' + (p.value[1] > p.value[0] ? 'Faydası maliyetinden yüksek' : 'Maliyeti faydasından yüksek') },
          xAxis: { type: 'log', min: 10000, max: maxV, name: 'Yıllık maliyet (TL)', nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: SK.PAL.muted }, axisLabel: { formatter: SK.axisTL }, splitLine: { lineStyle: { color: SK.PAL.grid } } },
          yAxis: { type: 'log', min: 1000, max: maxV * 4, name: 'Azalttığı yıllık kayıp (TL)', nameTextStyle: { color: SK.PAL.muted, align: 'left' }, axisLabel: { formatter: SK.axisTL } },
          series: [
            group(p => p.on, 'Açık', SK.PAL.u, 'circle'),
            group(p => !p.on && p.rec, 'Faz 1 · kapalı', SK.PAL.k, 'diamond'),
            group(p => !p.on && !p.rec, 'Faz 2 · kapalı', SK.PAL.muted, 'circle'),
            { type: 'line', silent: true, symbol: 'none', data: [[10000, 10000], [maxV, maxV]], lineStyle: { color: SK.PAL.ink2, type: 'dashed', width: 1 },
              endLabel: { show: true, formatter: 'fayda = maliyet', color: SK.PAL.ink2 }, name: 'Başabaş çizgisi' }
          ]
        };
      }
      function render() {
        const focusId = document.activeElement && document.activeElement.id;
        renderStats(); renderTable();
        if (sc) sc.set(scatterOption(), true);
        if (focusId) { const el = document.getElementById(focusId); if (el) el.focus(); }
      }

      main.appendChild(SK.viewHead('Uygula · kontroller', 'Güvenlik kontrolleri',
        'Her kontrol ISO/IEC 27001:2022 Ek A\'daki bir kontrole karşılık gelir. Bir kontrolü açtığınızda risk kaydı, senaryo sonuçları, sigorta ve uyum ekranları anında güncellenir. "Azalttığı kayıp", o kontrolün bugünkü duruma eklediği yıllık faydadır.', presets));
      main.appendChild(SK.help('kontroller', [
        '<b>Ne işe yarar?</b> Şirketin alabileceği 33 güvenlik önlemini (kontrolü) açıp kapatırsınız. Her biri ISO 27001 Ek A\'daki bir maddeye karşılık gelir.',
        '<b>Grafik:</b> Her nokta bir kontroldür. Sarı kesikli çizginin <b>üstündekiler</b> maliyetinden fazla kayıp önler; yani kârlıdır. Mavi elmaslar Faz 1 planında olup henüz açılmamış kontrollerdir.',
        '<b>Faz 1 planı</b> düğmesi, risk raporundaki ilk fazın 26 kontrolünü tek tıkla açar. <b>Faz 2 · tümü</b> 33 kontrolün hepsini açar. Sonra Risk kaydı ve Senaryolar ekranlarında farkı görün.']));
      main.appendChild(statsBox);
      main.appendChild(h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', null, 'Maliyet ve fayda'), h('span', { class: 'note' }, 'logaritmik eksen · noktanın üzerine gelin')), scEl));
      main.appendChild(h('p', { class: 'callout' },
        'Faz 1 planı iki adımda seçilir. Önce araç, net faydası en yüksek kontrolü ekler ve net fayda pozitif kaldıkça bunu tekrarlar (' + SK.plans.fin.size + ' kontrol). Sonra mevzuatın tek tek saydığı ama bu hesaba girmeyen kontroller ve ISO/IEC 27001 md. 7.3 gereği farkındalık eğitimi eklenir. Faz 2, ortalama kayıp hesabında kendini ödemeyen ama nadir ve ağır olayları durduran kontrollerdir.'));
      main.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, 'Durum'), h('th', null, 'Ek A'), h('th', null, 'Kontrol'), h('th', { class: 'r' }, 'Yıllık maliyet'), h('th', { class: 'r' }, 'Azalttığı kayıp'), h('th', { class: 'r' }, 'Net'), h('th', null, 'Plan'))),
        tbody)));
      sc = SK.chart(scEl, scatterOption());
      render();
      return SK.on('controls', render);
    }
  });
})(window.SK);
