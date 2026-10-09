/* Olay senaryoları (ne olursa?): siber, fiziksel, çevresel, tedarikçi ve insan kaynaklı olayları ikizde çalıştırır;
   adım adım engelleyen kontrolleri ve TL kaybını karşılaştırır. Binada geçen olaylar kat planında, sahadakiler haritada canlanır. */
(function (SK) {
  'use strict';
  const h = SK.h, F = SK.fmt;

  function outcomeCard(title, res, current, sub) {
    const status = res.blocked
      ? SK.chip('ok', (res.at + 1) + '. adımda durdu')
      : res.affected.length ? SK.chip('crit', res.affected.length + ' ' + SK.T('endpoint') + ' · ' + F.n1(res.hours) + ' saat') : SK.chip('crit', 'Tam etki');
    return h('div', { class: 'outcome' + (current ? ' is-current' : '') },
      h('div', { class: 'label' }, title),
      h('div', { class: 'outcome-total' }, F.tlShort(res.total)),
      h('div', null, status),
      sub ? h('div', { class: 'note' }, sub) : null,
      res.blocked && res.by.length ? h('div', { class: 'note' }, 'Durduran: ' + res.by.map(k => SK.controlMap[k].title).join(', ')) : null,
      h('div', { class: 'outcome-lines' }, res.lines.map(l => h('div', null, h('span', null, l.label), h('span', null, F.tlShort(l.amount))))));
  }

  SK.registerView('saldiri', {
    title: 'Olay senaryoları',
    count: () => SK.scenarios.length + ' senaryo',
    mount(main) {
      let sel = SK.store.get('scenario', SK.scenarios[0].id);
      if (!SK.scenarioMap[sel]) sel = SK.scenarios[0].id;
      const list = h('div', { class: 'scn-list', role: 'list' });
      const detail = h('div', { class: 'stack' });
      let mini = null, stageEls = [], refs = {};

      function renderList() {
        SK.clear(list);
        SK.scenarioCats.forEach(cat => {
          const group = SK.scenarios.filter(x => x.cat === cat);
          if (!group.length) return;
          list.appendChild(h('div', { class: 'scn-cat' }, cat, h('span', null, String(group.length))));
          group.forEach(scn => list.appendChild(item(scn)));
        });
      }
      function item(scn) {
        const res = SK.scenario.calc(scn, SK.state.enabled);
        return h('button', {
          type: 'button', class: 'scn-item', 'aria-pressed': String(scn.id === sel), role: 'listitem',
          onclick: () => { sel = scn.id; SK.store.set('scenario', sel); renderList(); renderDetail(); }
        },
        h('span', { class: 't' }, scn.title),
        h('span', { class: 'm' }, h('span', { class: 'tag' }, scn.place === 'hq' ? 'Merkez bina' : 'Saha'),
          res.blocked ? SK.chip('ok', 'Durduruluyor') : SK.chip('crit', F.tlShort(res.total))));
      }

      function stageState(i, scn) {
        const A = SK.state.attack;
        if (!A || A.id !== scn.id) return '';
        if (i < A.stage) return 'is-done';
        if (i === A.stage) return A.status === 'blocked' ? 'is-blocked' : A.status === 'running' ? 'is-done is-current' : 'is-done';
        return A.status === 'blocked' ? 'is-skipped' : '';
      }

      function renderStages(scn) {
        const res = SK.scenario.calc(scn, SK.state.enabled);
        stageEls.forEach((li, i) => {
          li.className = 'stage ' + stageState(i, scn);
          const ctl = li.querySelector('.stage-ctl');
          SK.clear(ctl);
          const st = scn.stages[i];
          if (st.blockedBy && st.blockedBy.length) {
            ctl.appendChild(h('span', null, 'Durdurabilecek kontrol:'));
            st.blockedBy.forEach(k => {
              const on = SK.state.enabled.has(k);
              const b = h('button', { type: 'button', class: 'chip ' + (on ? 'chip-ok' : 'chip-off'), title: on ? 'Kapatmak için tıklayın' : 'Açmak için tıklayın', onclick: () => SK.toggleControl(k) },
                h('span', { class: 'chip-ic', 'aria-hidden': 'true' }, on ? '✓' : '○'), SK.controlMap[k].title + ' (' + SK.controlMap[k].iso + ')');
              b.style.cursor = 'pointer';
              ctl.appendChild(b);
            });
          } else ctl.appendChild(h('span', null, 'Bu adımı doğrudan durduran bir kontrol yok.'));
          if (res.blocked && res.at === i && !(SK.state.attack && SK.state.attack.id === scn.id)) ctl.appendChild(SK.chip('ok', 'Mevcut durumda burada durur'));
        });
      }

      function renderOutcomes(scn) {
        const none = SK.scenario.calc(scn, new Set());
        const cur = SK.scenario.calc(scn, SK.state.enabled);
        const rec = SK.scenario.calc(scn, SK.recommended);
        SK.clear(refs.compare);
        refs.compare.appendChild(outcomeCard('Hiç kontrol yokken', none, false));
        refs.compare.appendChild(outcomeCard('Şu anki kontrollerle', cur, true, SK.state.enabled.size + ' kontrol açık'));
        refs.compare.appendChild(outcomeCard('Faz 1 planıyla', rec, false, SK.recommended.size + ' kontrol'));
        if (refs.costChart) {
          const states = [['Hiç kontrol yok', none], ['Şu anki', cur], ['Faz 1 planı', rec]];
          const labels = [];
          states.forEach(([, r]) => r.lines.forEach(l => { const k = l.label.replace(/ \(.*\)$/, ''); if (labels.indexOf(k) < 0) labels.push(k); }));
          refs.costChart.set({
            grid: { left: 110, right: 24, top: 36, bottom: 24 },
            legend: { top: 0, type: 'scroll', textStyle: { fontSize: 11 } },
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: v => F.tl(v || 0) },
            xAxis: { type: 'value', axisLabel: { formatter: SK.axisTL } },
            yAxis: { type: 'category', data: states.map(x => x[0]), inverse: true },
            series: labels.map((lab, i) => ({
              name: lab, type: 'bar', stack: 'k', barWidth: 22,
              itemStyle: { color: SK.PAL.series[i % 8], borderColor: SK.PAL.surface, borderWidth: 1 },
              data: states.map(([, r]) => { const l = r.lines.find(x => x.label.replace(/ \(.*\)$/, '') === lab); return l ? Math.round(l.amount) : 0; })
            }))
          }, true);
        }
        SK.clear(refs.fixes);
        const fixes = SK.scenario.bestFixes(scn, SK.state.enabled);
        if (!fixes.length) refs.fixes.appendChild(h('p', { class: 'note' }, cur.blocked ? 'Bu senaryo şu anki kontrollerle durduruluyor.' : 'Bu senaryonun kaybını azaltacak başka kontrol yok; kalan kayıp sigortayla devredilebilir.'));
        fixes.slice(0, 5).forEach(f => {
          const c = SK.controlMap[f.key];
          refs.fixes.appendChild(h('div', { class: 'fix' },
            h('div', null, h('div', { class: 'cell-title' }, c.title, ' ', h('span', { class: 'tag' }, c.iso)),
              h('div', { class: 'cell-sub' }, (f.blocks ? 'Olayı durdurur · ' : 'Kaybı azaltır · ') + F.tlShort(f.saving) + ' tasarruf · yıllık maliyeti ' + F.tlShort(f.cost))),
            h('button', { type: 'button', class: 'btn btn-sm', onclick: () => SK.toggleControl(f.key, true) }, 'Kontrolü aç')));
        });
      }

      function renderDetail() {
        const scn = SK.scenarioMap[sel];
        if (mini) { mini.destroy(); mini = null; }
        if (refs.costChart) { refs.costChart.dispose(); refs.costChart = null; }
        let place = scn.place === 'hq' ? 'hq' : 'map';
        SK.clear(detail);
        const runBtn = h('button', { type: 'button', class: 'btn btn-danger', id: 'scn-run', onclick: () => SK.scenario.run(scn) }, 'Senaryoyu çalıştır');
        const resetBtn = h('button', { type: 'button', class: 'btn', id: 'scn-reset', onclick: () => SK.scenario.reset() }, 'Normale döndür');
        refs.run = runBtn; refs.reset = resetBtn;
        const ex = scn.example && SK.sources[scn.example];
        detail.appendChild(h('div', { class: 'panel stack' },
          h('div', { class: 'panel-head' },
            h('div', null, h('div', { class: 'label' }, scn.cat + ' · ' + (scn.place === 'hq' ? 'merkez binada geçer' : 'sahada geçer')), h('h2', null, scn.title)),
            h('div', { class: 'row' }, runBtn, resetBtn)),
          h('p', null, scn.summary),
          h('div', { class: 'row' }, h('span', { class: 'note' }, 'İlgili riskler:'), scn.risks.map(id => h('a', { href: '#riskler', class: 'tag', title: SK.riskMap[id].title }, id))),
          ex ? h('p', { class: 'note' }, 'Gerçek örnek: ', ex.url ? h('a', { href: ex.url, target: '_blank', rel: 'noopener' }, ex.text) : ex.text) : null));

        stageEls = scn.stages.map((st, i) => h('li', { class: 'stage' },
          h('span', { class: 'stage-n' }, String(i + 1)),
          h('div', null, h('div', { class: 'stage-title' }, st.title, ' ', st.tech ? h('span', { class: 'tag' }, st.tech) : null),
            h('div', { class: 'stage-text' }, st.text), h('div', { class: 'stage-ctl' }))));
        const miniHost = h('div');
        const miniLegend = SK.stateLegend();
        refs.miniLegend = miniLegend;
        // İkizdeki etki: saha haritası ya da merkez bina planı
        const placeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'İkiz görünümü' },
          [['map', 'Saha haritası'], ['hq', 'Merkez bina']].map(([id, t]) => h('button', { type: 'button', 'data-id': id, onclick: () => { place = id; mountImpact(); } }, t)));
        function mountImpact() {
          if (mini) { mini.destroy(); mini = null; }
          SK.clear(miniHost);
          placeSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === place)));
          miniLegend.el.style.display = place === 'map' ? '' : 'none';
          mini = place === 'hq' ? SK.hqPlan(miniHost) : SK.mountMap(miniHost, { compact: true });
        }
        detail.appendChild(h('div', { class: 'grid-even' },
          h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', null, 'Olay adımları'), h('span', { class: 'note' }, 'Siber adımlarda MITRE ATT&CK kodu')),
            h('ol', { class: 'stages' }, stageEls)),
          h('div', { class: 'panel stack' }, h('div', { class: 'panel-head', style: { marginBottom: '0' } }, h('h2', null, 'İkizdeki etki'), placeSeg), miniHost, miniLegend.el)));
        mountImpact();

        refs.compare = h('div', { class: 'compare' });
        refs.fixes = h('div');
        detail.appendChild(h('div', { class: 'panel stack' },
          h('div', { class: 'panel-head' }, h('h2', null, 'Tahmini kayıp'), h('span', { class: 'note' }, SK.T('lossNote'))),
          refs.compare, refs.costEl = h('div', { class: 'chart is-short' })));
        detail.appendChild(h('div', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('h2', null, 'Bu senaryoya karşı en etkili kontroller')), refs.fixes));
        refs.costChart = SK.chart(refs.costEl, {});
        renderStages(scn);
        renderOutcomes(scn);
        miniLegend.update(SK.twin.connectors);
        syncButtons();
      }

      function syncButtons() {
        const A = SK.state.attack;
        if (refs.run) refs.run.disabled = !!(A && A.status === 'running');
        if (refs.reset) refs.reset.disabled = !A;
      }

      main.appendChild(SK.viewHead('Kontrol et · ne olursa?', 'Olay senaryoları',
        'Bilgi güvenliği yalnızca siber saldırı değildir: yangın, sel, elektrik kesintisi, binaya sızan biri ya da hesabı kapatılmayan eski bir çalışan da bilgiyi ve hizmeti etkiler. Bir senaryo seçip çalıştırın; olay adım adım ilerler ve açık bir kontrol bir adımı durdurursa orada biter.'));
      main.appendChild(SK.help('saldiri', [
        '<b>Nasıl kullanılır?</b> Soldan bir senaryo seçin, kırmızı <b>Senaryoyu çalıştır</b> düğmesine basın. Olay adım adım ilerler. Sahada geçen olaylarda haritadaki lokasyonlar kırmızıya döner; merkez binada geçenlerde kat planı canlanır (yangın, elektrik kesintisi, içeri sızan kişinin izi).',
        '<b>Senaryo türleri:</b> siber saldırı, fiziksel olay, çevresel olay (deprem, sel, elektrik kesintisi), tedarikçi kaynaklı ve insan/süreç kaynaklı olaylar. ISO/IEC 27001 de kontrollerini kurumsal, insan, fiziksel ve teknolojik diye dörde ayırır.',
        '<b>Adımların altındaki etiketler</b> o adımı durdurabilecek kontrollerdir. Tıklayarak açıp kapatın, sonra senaryoyu yeniden çalıştırın: olay o adımda durur. Bazı olaylar (yangın, deprem) durdurulamaz; o zaman kaybı azaltan kontroller ve sigorta öne çıkar.',
        '<b>Tahmini kayıp</b> üç durumu karşılaştırır: hiç kontrol yokken, şu anki kontrollerle ve Faz 1 planıyla. Kayıp kalemleri gelir kaybı, müdahale, ceza ve itibar kaybından oluşur.',
        'İş bitince <b>Normale döndür</b> ile ikizi onarın.']));
      main.appendChild(h('div', { class: 'attack-grid' }, h('div', { class: 'panel' }, h('h2', { style: { marginBottom: '6px' } }, SK.scenarios.length + ' senaryo'), list), detail));
      renderList();
      renderDetail();

      const offs = [
        SK.on('attack', () => { renderStages(SK.scenarioMap[sel]); mini.update(); syncButtons(); }),
        SK.on('controls', () => { renderList(); renderStages(SK.scenarioMap[sel]); renderOutcomes(SK.scenarioMap[sel]); }),
        SK.on('tick', () => { mini.update(); refs.miniLegend.update(SK.twin.connectors); })
      ];
      return () => { offs.forEach(f => f()); if (mini) mini.destroy(); };
    }
  });
})(window.SK);
