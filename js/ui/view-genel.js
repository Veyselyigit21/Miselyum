/* Genel bakış: projeyi tek ekranda anlatır — son tarih, temel göstergeler, plan karşılaştırması, canlı ağ,
   PUKÖ adımları ve ikizin olgunluk seviyesi (ikiz prototipi → canlı veri bağlantısı → iki yönlü ikiz) */
(function (SK) {
  'use strict';
  const h = SK.h, F = SK.fmt;
  // Gerçek takvime göre sayar (simülasyon saati hızlandırılsa da son tarihe kalan gün değişmez). Tarih şirket paketinden gelir.
  SK.daysToDeadline = function () {
    const dl = SK.company.ui.deadline.date, d = new Date();
    return Math.max(0, Math.ceil((new Date(dl[0], dl[1], dl[2]) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5));
  };

  SK.registerView('genel', {
    title: 'Genel bakış',
    mount(main) {
      const R = SK.risk, U = SK.company.ui;
      const nums = {};
      const big = (key, label) => {
        const v = h('div', { class: 'big-num' }, '–'), n = h('div', { class: 'note' }, ' ');
        nums[key] = { v, n };
        return h('div', { class: 'stat' }, h('div', { class: 'label' }, label), v, n);
      };

      // Üst bölüm
      main.appendChild(h('section', { class: 'hero' },
        h('div', { class: 'hero-main' },
          h('div', { class: 'view-head' }, h('div', { class: 'view-titles' },
            h('div', { class: 'eyebrow' }, SK.company.name + ' · ' + U.heroEyebrow))),
          h('h1', null, U.heroTitle[0], h('em', null, U.heroTitle[1]), U.heroTitle[2]),
          h('p', { class: 'lead' }, U.heroLead),
          h('div', { class: 'cta-row' },
            h('a', { class: 'btn btn-primary', href: '#saldiri' }, SK.icon('saldiri'), 'Senaryoları dene'),
            h('a', { class: 'btn', href: '#saha' }, 'Dijital ikizi aç'),
            h('button', { type: 'button', class: 'btn', onclick: () => SK.assist && SK.assist.open() }, 'Asistana sor'))),
        h('div', { class: 'hero-side' },
          h('div', { class: 'label' }, U.deadline.label),
          h('div', { class: 'big-num' }, SK.daysToDeadline() + ' gün'),
          h('p', null, U.deadline.text))));

      // Temel göstergeler
      main.appendChild(h('section', { class: 'stat-row', 'aria-label': 'Temel göstergeler' },
        big('ale', 'Yıllık beklenen zarar'), big('major', 'Major risk'), big('ready', 'Mevzuata hazırlık'), big('ctl', 'Açık önlem')));

      // Plan karşılaştırması + canlı ağ
      const planBody = h('tbody');
      const mapHost = h('div');
      const live = h('div', { class: 'kv', style: { marginTop: '12px' } });
      main.appendChild(h('div', { class: 'grid-2' },
        h('section', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('h2', null, 'Dört plan, dört sonuç'), h('span', { class: 'note' }, 'Bir satıra basınca o plan uygulanır')),
          h('div', { class: 'table-scroll' }, h('table', { class: 'plan-cmp' },
            h('thead', null, h('tr', null, h('th', null, 'Plan'), h('th', null, 'Yıllık maliyet'), h('th', null, 'Beklenen zarar'), h('th', null, 'Hazırlık'), h('th', null, ''))),
            planBody)),
          h('p', { class: 'note', style: { marginTop: '10px' } }, U.planNote)),
        h('section', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('h2', null, 'Ağ şu anda'), h('a', { href: '#saha', class: 'note' }, 'Haritayı büyüt →')),
          mapHost, live)));

      // PUKÖ adımları
      const step = (L, name, text, href, go) => h('a', { class: 'puko-step', href },
        h('div', { class: 'row' }, SK.phaseChip(L), h('span', { class: 'label' }, name)),
        h('h3', null, text[0]), h('p', null, text[1]), h('span', { class: 'go' }, go + ' →'));
      main.appendChild(h('section', null,
        h('div', { class: 'panel-head' }, h('h2', { style: { font: '600 22px/1.25 var(--font-display)' } }, 'Proje, ISO 27001\'in PUKÖ döngüsünü izliyor')),
        h('div', { class: 'puko' },
          step('P', 'Planla', ['Neyi koruyoruz, ne kadar risk var?', SK.assets.length + ' varlık ve ' + SK.risks.length + ' risk; her riskin yıllık beklenen zararı lira olarak.'], '#riskler', 'Riskler'),
          step('U', 'Uygula', ['Hangi önlem parasına değer?', SK.controls.length + ' önlemin maliyeti ve önlediği zarar; Faz 1 ve Faz 2 planları.'], '#kontroller', 'Önlemler'),
          step('K', 'Kontrol et', ['Önlemler gerçekten işe yarıyor mu?', SK.scenarios.length + ' olay senaryosu ikizde adım adım çalışıyor: siber saldırı, fiziksel olay, çevresel olay, tedarikçi ve içeriden tehdit.'], '#saldiri', 'Senaryolar'),
          step('Ö', 'Önlem al', ['Kalan riskle ne yapacağız?', 'Sigortaya devret, mevzuatı izle, ders çıkar ve döngüyü yeniden başlat.'], '#sigorta', 'Sigorta ve uyum'))));

      // İkizin seviyesi
      // Seviye 2: Miselyum Kapısı üzerinden canlı veri. Seviye 3: Kapı'daki ikiz cihaza kendisi komut gönderip sonucu doğrular
      const levelBox = h('div', { class: 'twin-level' });
      function renderLevels() {
        const live = SK.link.mode === 'canli', I = live && SK.ikiz3 && SK.ikiz3.ozet, kapili = SK.tenantId === 'akimyolu';
        SK.clear(levelBox).append(
          h('div', { class: live ? '' : 'is-here' }, h('div', { class: 'lvl' }, 'SEVİYE 1'), h('b', null, 'İkiz prototipi'), h('span', null, 'Gerçek yerler, gerçek pazar verisi ve simülasyonla kurulmuş ikiz. Saldırılar ve önlemler burada denenir.'), h('div', { class: 'here' }, live ? 'Tamamlandı' : 'Miselyum bugün burada')),
          h('div', { class: live && !I ? 'is-here' : '' }, h('div', { class: 'lvl' }, 'SEVİYE 2'), h('b', null, 'Canlı veri bağlantısı'), h('span', null, U.level2), h('div', { class: 'here' }, live ? (I ? 'Tamamlandı · ' : 'Şu an bağlı: ') + SK.link.devices + ' cihaz' : kapili ? 'Miselyum Kapısı ile' : 'Hedef')),
          h('a', { class: I ? 'is-here' : '', href: '#saha' }, h('div', { class: 'lvl' }, 'SEVİYE 3'), h('b', null, 'İki yönlü ikiz'), h('span', null, U.level3), h('div', { class: 'here' }, I
            ? 'Şu an: ' + F.n(I.say.otomatik) + ' otomatik komut' + (I.dogrulama_orani != null ? ', ' + F.pct(I.dogrulama_orani) + ' doğrulandı' : '')
            : kapili ? 'Miselyum Kapısı ile' : 'Hedef')));
      }
      renderLevels();
      main.appendChild(h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', null, 'Dijital ikizin olgunluk seviyesi'),
          h('span', { class: 'note' }, 'Kavramlar: Grieves ve Vickers 2017 · Kritzinger vd. 2018')),
        levelBox,
        h('p', { class: 'note', style: { marginTop: '12px' } }, U.twinNote)));

      // Canlı mini harita
      const map = SK.mountMap(mapHost, { compact: true, onSelect: id => { SK.state.selectedSite = id; SK.go('saha'); } });

      const PLANS = [
        ['Bugün', SK.defaultEnabled, SK.defaultEnabled.length + ' önlem'],
        ['Yalnız maliyet-fayda', SK.plans.fin, SK.plans.fin.size + ' önlem'],
        ['Faz 1', SK.plans.faz1, SK.plans.faz1.size + ' önlem · ' + U.faz1When],
        ['Faz 2', SK.plans.all, SK.plans.all.size + ' önlem · ' + U.faz2When]
      ];
      const same = (a, b) => { const A = new Set(a), B = new Set(b); return A.size === B.size && [...A].every(k => B.has(k)); };
      function renderPlans() {
        SK.clear(planBody);
        PLANS.forEach(([name, set, sub]) => {
          const sm = R.summary(new Set(set)), now = same(set, SK.state.enabled);
          planBody.appendChild(h('tr', { class: now ? 'is-now' : '' },
            h('td', null, h('div', { class: 'cell-title' }, name), h('div', { class: 'cell-sub' }, sub)),
            h('td', { class: 'v' }, F.tlShort(sm.cost)),
            h('td', { class: 'v' }, F.tlShort(sm.aleRes)),
            h('td', { class: 'v' }, F.pct(R.readiness(new Set(set)))),
            h('td', null, now ? h('span', { class: 'chip chip-ok' }, 'Şu an') : h('button', { type: 'button', class: 'btn btn-sm', onclick: () => SK.setEnabled(set) }, 'Uygula'))));
        });
      }
      function renderNums() {
        const sm = R.summary(SK.state.enabled);
        const major = SK.risks.filter(r => R.eval(r, SK.state.enabled).band.major).length;
        SK.countUp(nums.ale.v, sm.aleRes, v => F.tlShort(v));
        nums.ale.n.textContent = 'önlemsiz ' + F.tlShort(sm.aleIn);
        SK.countUp(nums.major.v, major, v => String(Math.round(v)));
        nums.major.n.textContent = SK.risks.length + ' riskten · skor 10 ve üzeri';
        SK.countUp(nums.ready.v, R.readiness(SK.state.enabled), v => F.pct(v));
        nums.ready.n.textContent = U.readyNote;
        SK.countUp(nums.ctl.v, SK.state.enabled.size, v => Math.round(v) + ' / ' + SK.controls.length);
        nums.ctl.n.textContent = F.tlShort(sm.cost) + ' / yıl';
      }
      function renderLive() {
        const S = SK.sim.S, k = S.kpi;
        SK.clear(live);
        live.append(h('dt', null, 'Çevrimiçi'), h('dd', { class: 'num' }, F.n(k.online) + ' / ' + F.n(k.total) + ' ' + SK.T('endpoint')),
          h('dt', null, SK.T('busy')), h('dd', { class: 'num' }, F.n(k.charging) + ' ' + SK.T('busyCount') + ' · ' + F.n(k.power) + ' kW'),
          h('dt', null, SK.T('revenueLabel')), h('dd', { class: 'num' }, F.tlShort(S.dayRevenue)));
      }
      renderPlans(); renderNums(); renderLive();
      let tick = 0;
      const off1 = SK.on('controls', () => { renderPlans(); renderNums(); });
      const off2 = SK.on('tick', () => { if (++tick % 3 === 0) { renderLive(); map.update(); } });
      const off3 = SK.on('attack', () => map.update());
      const off4 = SK.on('link', renderLevels);
      let lv = 0;
      const off5 = SK.on('ikiz3', () => { if (++lv % 3 === 1) renderLevels(); });
      return () => { off1(); off2(); off3(); off4(); off5(); map.destroy(); };
    }
  });
})(window.SK);
