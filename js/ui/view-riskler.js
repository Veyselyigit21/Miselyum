/* Risk kaydı: 5×5 ısı haritası, major/minör sınıflandırma, ayrıntılı tablo */
(function (SK) {
  'use strict';
  const h = SK.h, F = SK.fmt, R = SK.risk;

  function assetName(id) {
    if (id === 'units') return SK.T('allUnits');
    const a = SK.assets.find(x => x.id === id);
    return a ? a.name : id;
  }

  function controlChips(r) {
    return h('div', { class: 'ctl-row' }, r.controls.length ? r.controls.map(k => {
      const on = SK.state.enabled.has(k), c = SK.controlMap[k];
      return h('button', { type: 'button', class: 'chip ' + (on ? 'chip-ok' : 'chip-off'), title: on ? 'Açık · kapatmak için tıklayın' : 'Kapalı · açmak için tıklayın', onclick: e => { e.stopPropagation(); SK.toggleControl(k); } },
        h('span', { class: 'chip-ic', 'aria-hidden': 'true' }, on ? '✓' : '○'), c.title);
    }) : h('span', { class: 'note' }, 'Ekonomik bir kontrol yok; risk kabul edilir.'));
  }

  function detailRow(r, cols) {
    const inh = R.inherent(r), res = R.eval(r, SK.state.enabled), tr = R.treatment(r, res);
    return h('tr', { class: 'detail' }, h('td', { colspan: cols },
      h('div', { class: 'risk-detail' },
        h('div', null, h('h4', null, 'Tehdit'), h('p', null, r.threat)),
        h('div', null, h('h4', null, 'Zafiyet'), h('p', null, r.vuln)),
        h('div', null, h('h4', null, 'Etkilenen varlıklar'), h('p', null, r.assets.map(assetName).join(', ')), h('p', { class: 'note' }, 'Risk sahibi: ' + r.owner)),
        h('div', null, h('h4', null, 'Hesap'),
          h('p', { class: 'num' }, 'Kontrolsüz: ' + F.aro(inh.aro) + ' × ' + F.tlShort(inh.sle) + ' = ' + F.tlShort(inh.ale) + ' / yıl'),
          h('p', { class: 'num' }, 'Kalan: ' + F.aro(res.aro) + ' × ' + F.tlShort(res.sle) + ' = ' + F.tlShort(res.ale) + ' / yıl')),
        h('div', null, h('h4', null, 'Önerilen işlem: ' + tr.label), h('p', null, tr.why),
          r.ins.length ? h('p', { class: 'note' }, 'Sigorta: ' + r.ins.map(k => SK.policyMap[k].title).join(', ')) : h('p', { class: 'note' }, 'Bu risk için uygun sigorta ürünü yok ya da kayıp sigortalanamaz.')),
        r.example ? h('div', null, h('h4', null, 'Kaynak'), h('a', { href: r.example.url, target: '_blank', rel: 'noopener' }, r.example.text)) : null),
      h('div', { style: { marginTop: '10px' } }, h('h4', { class: 'label', style: { margin: '0 0 6px' } }, 'Kontroller'), controlChips(r))));
  }

  SK.registerView('riskler', {
    title: 'Risk kaydı',
    count: () => SK.risks.length + ' risk',
    mount(main) {
      const st = { mode: SK.store.get('riskMode', 'res'), cat: '', cls: '', hidden: false, q: '', cell: null, open: null };
      const statsBox = h('div', { class: 'stat-row' });
      const heatBox = h('div');
      const tbody = h('tbody');
      const modeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Görünüm' },
        h('button', { type: 'button', 'data-m': 'in', onclick: () => setMode('in') }, 'Kontrolsüz (doğal risk)'),
        h('button', { type: 'button', 'data-m': 'res', onclick: () => setMode('res') }, 'Şu anki kontrollerle (kalan risk)'));
      function setMode(m) { st.mode = m; SK.store.set('riskMode', m); render(); }

      const catSel = h('select', { id: 'risk-cat', 'aria-label': 'Kategori', onchange: e => { st.cat = e.target.value; renderTable(); } },
        h('option', { value: '' }, 'Tüm kategoriler'), SK.riskCats.map(c => h('option', { value: c }, c)));
      const clsSel = h('select', { id: 'risk-cls', 'aria-label': 'Sınıf', onchange: e => { st.cls = e.target.value; renderTable(); } },
        h('option', { value: '' }, 'Major ve minör'), h('option', { value: 'major' }, 'Yalnızca major'), h('option', { value: 'minor' }, 'Yalnızca minör'));
      const hidCb = h('input', { type: 'checkbox', id: 'risk-hidden', onchange: e => { st.hidden = e.target.checked; renderTable(); } });
      const q = h('input', { type: 'search', id: 'risk-q', placeholder: 'Risklerde ara', 'aria-label': 'Risklerde ara', oninput: e => { st.q = e.target.value.toLocaleLowerCase('tr-TR'); renderTable(); } });

      function evalFor(r) { return st.mode === 'in' ? R.inherent(r) : R.eval(r, SK.state.enabled); }

      function renderStats() {
        const all = SK.risks.map(r => evalFor(r));
        const major = all.filter(x => x.band.major).length;
        const sm = R.summary(SK.state.enabled);
        SK.clear(statsBox);
        [['Toplam risk', String(SK.risks.length), SK.riskCats.length + ' kategori'],
         ['Major', String(major), 'Kritik + yüksek'],
         ['Minör', String(SK.risks.length - major), 'Orta + düşük'],
         ['Az bilinen', String(SK.risks.filter(r => r.hidden).length), 'Gözden kaçması kolay riskler'],
         ['Yıllık beklenen kayıp', F.tlShort(st.mode === 'in' ? sm.aleIn : sm.aleRes), st.mode === 'in' ? 'Hiç kontrol yokken' : 'Kontrolsüz: ' + F.tlShort(sm.aleIn)]]
          .forEach(([l, v, n]) => statsBox.appendChild(h('div', { class: 'stat' }, h('div', { class: 'label' }, l), h('div', { class: 'big-num' }, v), h('div', { class: 'note' }, n))));
      }

      function renderHeat() {
        SK.clear(heatBox);
        const grid = h('div', { class: 'heat', role: 'grid', 'aria-label': 'Olasılık ve etki matrisi' });
        const cells = {};
        SK.risks.forEach(r => { const e = evalFor(r); (cells[e.L + '-' + e.I] = cells[e.L + '-' + e.I] || []).push(r.id); });
        for (let L = 5; L >= 1; L--) {
          grid.appendChild(h('div', { class: 'heat-axis' }, L + ' · ' + R.L_SCALE[L - 1].label));
          for (let I = 1; I <= 5; I++) {
            const key = L + '-' + I, b = R.band(L * I), ids = cells[key] || [];
            const cell = h('div', {
              class: 'heat-cell b-' + b.key + (st.cell === key ? ' is-active' : ''), role: 'gridcell', tabindex: '0',
              'aria-label': 'Olasılık ' + L + ', etki ' + I + ', ' + b.label + ', ' + ids.length + ' risk',
              onclick: () => { st.cell = st.cell === key ? null : key; renderHeat(); renderTable(); },
              onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.target.click(); } }
            }, h('span', { class: 'score' }, String(L * I)), ids.map(id => h('span', { class: 'heat-id' }, id)));
            SK.tip.bind(cell, () => h('div', null, h('b', null, b.label + ' (skor ' + L * I + ')'), h('br'), ids.length ? ids.map(id => id + ' ' + SK.riskMap[id].title).join('\n') : 'Risk yok'));
            grid.appendChild(cell);
          }
        }
        grid.appendChild(h('div'));
        for (let I = 1; I <= 5; I++) grid.appendChild(h('div', { class: 'heat-axis x' }, I + ' · ' + R.I_SCALE[I - 1].label));
        heatBox.appendChild(grid);
        heatBox.appendChild(h('p', { class: 'note', style: { marginTop: '8px' } }, 'Dikey eksen olasılık, yatay eksen etki. Bir hücreye tıklayarak tabloyu süzün.' + (st.cell ? ' Süzgeç açık.' : '')));
      }

      const COLS = 8;
      function renderTable() {
        SK.clear(tbody);
        const rows = SK.risks.map(r => ({ r, e: evalFor(r), inh: R.inherent(r), res: R.eval(r, SK.state.enabled) }))
          .filter(x => !st.cat || x.r.cat === st.cat)
          .filter(x => !st.cls || (st.cls === 'major') === x.e.band.major)
          .filter(x => !st.hidden || x.r.hidden)
          .filter(x => !st.cell || (x.e.L + '-' + x.e.I) === st.cell)
          .filter(x => !st.q || (x.r.id + ' ' + x.r.title + ' ' + x.r.threat).toLocaleLowerCase('tr-TR').indexOf(st.q) >= 0)
          .sort((a, b) => (b.e.score - a.e.score) || (b.e.ale - a.e.ale));
        if (!rows.length) tbody.appendChild(h('tr', null, h('td', { colspan: COLS, class: 'note' }, 'Bu süzgeçlere uyan risk yok.')));
        rows.forEach(({ r, e, inh, res }) => {
          const tr = R.treatment(r, res);
          const row = h('tr', { class: 'clickable' + (st.open === r.id ? ' is-open' : ''), tabindex: '0', 'aria-expanded': String(st.open === r.id),
            onclick: () => { st.open = st.open === r.id ? null : r.id; renderTable(); },
            onkeydown: ev => { if (ev.key === 'Enter') { st.open = st.open === r.id ? null : r.id; renderTable(); } } },
            h('td', { class: 'mono' }, r.id),
            h('td', null, h('div', { class: 'cell-title' }, r.title),
              h('div', { class: 'row', style: { marginTop: '3px' } }, h('span', { class: 'tag' }, r.cat), r.hidden ? SK.chip('info', 'Az bilinen', 'chip-hidden') : null)),
            h('td', { class: 'r' }, e.L + ' × ' + e.I),
            h('td', null, SK.chip(e.band.key, e.band.label + ' ' + e.score)),
            h('td', null, h('span', { class: 'chip ' + (e.band.major ? 'chip-major' : 'chip-minor') }, e.band.major ? 'Major' : 'Minör')),
            h('td', { class: 'r' }, F.tlShort(e.ale), st.mode === 'res' && res.ale < inh.ale ? h('div', { class: 'cell-sub' }, 'kontrolsüz ' + F.tlShort(inh.ale)) : null),
            h('td', null, tr.label),
            h('td', { class: 'cell-sub' }, r.ins.length ? r.ins.map(k => SK.policyMap[k].title).join(', ') : '–'));
          tbody.appendChild(row);
          if (st.open === r.id) tbody.appendChild(detailRow(r, COLS));
        });
      }

      function render() {
        modeSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === st.mode)));
        renderStats(); renderHeat(); renderTable();
      }

      main.appendChild(SK.viewHead('Planla · risk analizi', 'Risk kaydı',
        'Her risk için olasılık ve etki 1–5 arası puanlanır. Skor 10 ve üzeri major (kritik/yüksek), altı minör (orta/düşük) sayılır. Yıllık beklenen kayıp, tek seferlik kayıp ile yıllık gerçekleşme sıklığının çarpımıdır.', modeSeg));
      main.appendChild(SK.help('riskler', [
        '<b>Ne işe yarar?</b> Şirketin karşılaşabileceği 37 riski listeler. Her riskin olasılığı ve etkisi 1–5 arası puanlanır; ikisinin çarpımı risk skorudur.',
        '<b>Major / minör:</b> Skoru 10 ve üzeri olanlar major (kritik veya yüksek), altındakiler minör (orta veya düşük) sayılır. Hocanın istediği sınıflandırma budur.',
        '<b>Isı haritası:</b> Sağ üste doğru gidildikçe risk büyür. Bir hücreye tıklayınca tablo o hücredeki risklere süzülür.',
        '<b>Az bilinen</b> etiketi, ilk akla gelmeyen riskleri işaretler. Bir satıra tıklayınca tehdit, zafiyet, hesap ve kaynak açılır.',
        'Üstteki iki düğme ile kontrolsüz (doğal) risk ile şu anki kontrollerle kalan risk arasında geçiş yapın.']));
      main.appendChild(statsBox);
      main.appendChild(h('div', { class: 'grid-even' },
        h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', null, 'Olasılık × etki')), heatBox),
        h('div', { class: 'panel stack' }, h('h2', null, 'Puanlama ölçeği'),
          h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
            h('thead', null, h('tr', null, h('th', null, 'Puan'), h('th', null, 'Olasılık'), h('th', null, 'Etki (tek seferlik kayıp)'))),
            h('tbody', null, [5, 4, 3, 2, 1].map(v => h('tr', null, h('td', { class: 'mono' }, v),
              h('td', null, R.L_SCALE[v - 1].label, h('div', { class: 'cell-sub' }, R.L_SCALE[v - 1].rule)),
              h('td', null, R.I_SCALE[v - 1].label, h('div', { class: 'cell-sub' }, R.I_SCALE[v - 1].rule))))))),
          h('div', { class: 'row' }, ['kritik', 'yuksek', 'orta', 'dusuk'].map(k => h('span', { class: 'row', style: { gap: '4px' } }, SK.chip(k, R.BANDS[k].label), h('span', { class: 'note' }, R.BANDS[k].rule)))))));
      main.appendChild(h('div', { class: 'panel stack' },
        h('div', { class: 'panel-head' }, h('h2', null, 'Riskler'),
          h('div', { class: 'filters' }, q, catSel, clsSel, h('label', { class: 'row note', for: 'risk-hidden' }, hidCb, 'Yalnızca az bilinenler'))),
        h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, h('th', null, 'No'), h('th', null, 'Risk'), h('th', { class: 'r' }, 'O × E'), h('th', null, 'Seviye'), h('th', null, 'Sınıf'), h('th', { class: 'r' }, 'Yıllık kayıp'), h('th', null, 'Önerilen işlem'), h('th', null, 'Sigorta'))),
          tbody))));
      render();
      return SK.on('controls', render);
    }
  });
})(window.SK);
