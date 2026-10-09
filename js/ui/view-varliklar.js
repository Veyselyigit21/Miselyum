/* Varlık envanteri (ISO 27001 Ek A 5.9): ikizden üretilen ve sabit bilgi varlıkları, gizlilik/bütünlük/erişilebilirlik değerleri */
(function (SK) {
  'use strict';
  const h = SK.h;
  const LV = { 1: 'Düşük', 2: 'Orta', 3: 'Yüksek' };

  function linkedRisks(a) {
    return SK.risks.filter(r => r.assets.indexOf(a.id) >= 0 || (a.unit && r.assets.indexOf('units') >= 0)).map(r => r.id);
  }

  function ciaCell(v) {
    return h('td', null, h('span', { class: 'chip ' + (v === 3 ? 'chip-yuksek' : v === 2 ? 'chip-orta' : 'chip-dusuk') }, LV[v]));
  }

  SK.registerView('varliklar', {
    title: 'Varlık envanteri',
    count: () => SK.assets.length + ' varlık',
    mount(main) {
      const types = Array.from(new Set(SK.assets.map(a => a.type)));
      const st = { type: '' };
      const tbody = h('tbody');
      const sel = h('select', { id: 'asset-type', 'aria-label': 'Varlık türü', onchange: e => { st.type = e.target.value; render(); } },
        h('option', { value: '' }, 'Tüm türler'), types.map(t => h('option', { value: t }, t)));

      function render() {
        SK.clear(tbody);
        SK.assets.filter(a => !st.type || a.type === st.type).forEach(a => {
          const risks = linkedRisks(a);
          tbody.appendChild(h('tr', null,
            h('td', null, h('div', { class: 'cell-title' }, a.name), a.detail ? h('div', { class: 'cell-sub' }, a.detail) : null),
            h('td', null, h('span', { class: 'tag' }, a.type)),
            h('td', { class: 'cell-sub' }, a.loc),
            h('td', null, a.owner),
            ciaCell(a.c), ciaCell(a.i), ciaCell(a.a),
            h('td', null, h('div', { class: 'ctl-row' }, risks.length ? risks.map(id => h('a', { class: 'tag', href: '#riskler', title: SK.riskMap[id].title }, id)) : h('span', { class: 'note' }, '–')))));
        });
      }

      const high = SK.assets.filter(a => Math.max(a.c, a.i, a.a) === 3).length;
      main.appendChild(SK.viewHead('Planla · varlıklar', 'Varlık envanteri',
        'Risk analizinin girdisi. Şarj üniteleri dijital ikizden otomatik sayılır; ikize yeni lokasyon eklendiğinde envanter ve bağlı riskler kendiliğinden güncellenir.', h('div', { class: 'filters' }, sel)));
      main.appendChild(SK.help('varliklar', [
        '<b>Ne işe yarar?</b> ISO 27001 risk analizinin ilk adımı, korunacak her şeyi (yazılım, veri, donanım, insan, bina) listelemektir.',
        '<b>Gizlilik, bütünlük, erişilebilirlik:</b> Varlığın sızması, bozulması veya kullanılamaması ne kadar zararlı? Yüksek değerli varlıklar önce korunur.',
        'Şarj üniteleri dijital ikizden otomatik sayılır. Her varlığın bir sahibi ve bağlı riskleri vardır.']));
      main.appendChild(h('div', { class: 'stat-row' },
        [['Varlık', String(SK.assets.length), types.length + ' tür'], ['Yüksek değerli', String(high), 'G, B veya E yüksek'],
         ['Sahadaki ünite', String(SK.twin.units.length), SK.twin.sites.length + ' lokasyonda'], ['Varlık sahibi rolü', String(new Set(SK.assets.map(a => a.owner)).size), 'Her varlığın bir sorumlusu var']]
          .map(([l, v, n]) => h('div', { class: 'stat' }, h('div', { class: 'label' }, l), h('div', { class: 'big-num' }, v), h('div', { class: 'note' }, n)))));
      main.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, 'Varlık'), h('th', null, 'Tür'), h('th', null, 'Konum'), h('th', null, 'Sahibi'),
          h('th', { title: 'Gizlilik' }, 'Gizlilik'), h('th', { title: 'Bütünlük' }, 'Bütünlük'), h('th', { title: 'Erişilebilirlik' }, 'Erişilebilirlik'), h('th', null, 'Bağlı riskler'))),
        tbody)));
      render();
    }
  });
})(window.SK);
