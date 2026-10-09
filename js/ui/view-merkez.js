/* Merkez tesis ikizi: arsa (vaziyet planı), kat planları, personel yerleşimi, odalara bağlı riskler ve
   binadaki fiziksel olaylar (yangın, elektrik kesintisi, tahliye, yetkisiz kişi) */
(function (SK) {
  'use strict';
  const h = SK.h, s = SK.s, F = SK.fmt;

  // Plan ölçeği: 30 m genişliğe göre yazı ve işaret büyüklüğü (fabrika gibi büyük binalarda da okunur kalır)
  const K = () => SK.hq.scale || SK.hq.building.w / 30;

  function wrap(text, maxW, size) {
    const charW = size * 0.5;
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    words.forEach(w => {
      const next = cur ? cur + ' ' + w : w;
      if (next.length * charW > maxW && cur) { lines.push(cur); cur = w; } else cur = next;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function peopleIn(roomId) {
    return SK.personnel.filter(p => p.room === roomId);
  }

  function floorSvg(floor, state, onSelect) {
    const b = SK.hq.building, k = K();
    const svg = s('svg', { class: 'plan-svg', viewBox: (-1 * k) + ' ' + (-1.6 * k) + ' ' + (b.w + 2 * k) + ' ' + (b.h + 2.8 * k), role: 'group', 'aria-label': floor.label + ' planı', style: '--k:' + k });
    svg.appendChild(s('rect', { class: 'bldg', x: 0, y: 0, width: b.w, height: b.h }));
    svg.appendChild(s('text', { class: 'dim', x: b.w / 2, y: -0.5 * k, 'text-anchor': 'middle', text: b.w + ' m' }));
    svg.appendChild(s('text', { class: 'dim', x: b.w + 0.4 * k, y: b.h / 2, text: b.h + ' m', transform: 'rotate(90 ' + (b.w + 0.4 * k) + ' ' + (b.h / 2) + ')', 'text-anchor': 'middle' }));
    const els = {};
    const fx = s('g', { class: 'fx' });
    floor.rooms.forEach(r => {
      const g = s('g', { tabindex: r.minor ? null : '0', role: r.minor ? null : 'button', 'aria-label': r.label });
      const rect = s('rect', { class: 'room' + (r.minor ? ' is-minor' : '') + (r.access === 'Kartlı + kayıtlı' ? ' acc-high' : ''), x: r.x, y: r.y, width: r.w, height: r.h });
      g.appendChild(rect);
      const lines = wrap(r.label, r.w - 0.8 * k, 0.78 * k);
      lines.forEach((ln, i) => g.appendChild(s('text', { class: 'room-label', x: r.x + 0.4 * k, y: r.y + 1.1 * k + i * 0.95 * k, text: ln })));
      if (!r.minor) {
        wrap(F.n(r.w * r.h) + ' m² · ' + r.access, r.w - 0.8 * k, 0.62 * k).forEach((ln, i) =>
          g.appendChild(s('text', { class: 'room-sub', x: r.x + 0.4 * k, y: r.y + 1.05 * k + lines.length * 0.95 * k + i * 0.78 * k, text: ln })));
      }
      // Kişi noktaları: oda genişliğine sığdığı kadar sütun
      const ppl = peopleIn(r.id).reduce((a, p) => a + p.n, 0);
      const cols = Math.max(4, Math.min(14, Math.floor((r.w - 0.6 * k) / (0.75 * k))));
      for (let i = 0; i < ppl; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        g.appendChild(s('circle', { class: 'person', cx: r.x + 0.7 * k + col * 0.75 * k, cy: r.y + r.h - 0.7 * k - row * 0.75 * k, r: 0.26 * k }));
      }
      if (!r.minor && onSelect) {
        g.addEventListener('click', () => onSelect(r.id));
        g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.id); } });
      }
      svg.appendChild(g);
      els[r.id] = rect;
    });
    svg.appendChild(fx);
    function update() {
      const A = SK.state.attack, X = A && A.hq;
      Object.keys(els).forEach(id => {
        els[id].classList.toggle('is-selected', state.room === id);
        els[id].classList.toggle('is-hit', !!(A && A.hit.hq.has(id)));
        els[id].classList.toggle('is-fire', !!(X && X.fire.has(id)));
      });
      svg.classList.toggle('is-dark', !!(X && X.dark));
      svg.classList.toggle('is-evac', !!(X && X.evac));
      SK.clear(fx);
      if (!X) return;
      // Yangın: odanın sağ alt köşesinde alev işareti (oda adını kapatmaz)
      floor.rooms.filter(r => X.fire.has(r.id)).forEach(r => {
        fx.appendChild(s('path', { class: 'flame', transform: 'translate(' + (r.x + r.w - 1.3 * k) + ' ' + (r.y + r.h - 1.1 * k) + ') scale(' + (0.6 * k) + ')',
          d: 'M0 -3.6 c1.5 1.3 1.9 2.6 1.5 3.6 c-0.3 0.8 -0.9 1.3 -1.5 1.3 c-0.9 0 -1.6 -0.7 -1.6 -1.6 c0 -0.7 0.3 -1.1 0.6 -1.5 c-0.1 0.7 0.1 1.1 0.5 1.1 c0.3 -1.1 0.1 -2 0.5 -2.9 Z' }));
      });
      // Yetkisiz kişi: bu kattaki izi ve son konumu
      const trail = X.trail[floor.id];
      if (trail && trail.length > 1) fx.appendChild(s('polyline', { class: 'intr-path', points: trail.map(p => p.join(',')).join(' ') }));
      if (X.intruder && X.intruder.floor === floor.id && trail && trail.length) {
        const last = trail[trail.length - 1];
        fx.appendChild(s('circle', { class: 'intr-ring' + (X.caught ? ' is-caught' : ''), cx: last[0], cy: last[1], r: 1.1 * k }));
        fx.appendChild(s('circle', { class: 'intr' + (X.caught ? ' is-caught' : ''), cx: last[0], cy: last[1], r: 0.5 * k }));
      }
    }
    update();
    return { el: svg, update };
  }

  // Binadaki fiziksel durumun kısa özeti (hap etiketler)
  function hqStatus(box) {
    SK.clear(box);
    const A = SK.state.attack, X = A && A.hq;
    const label = id => { const r = SK.hq.floors.flatMap(f => f.rooms).find(x => x.id === id); return r ? r.label : id; };
    const out = [];
    if (X) {
      if (X.ups) out.push(SK.chip('ok', 'Şebeke kesildi · UPS ve jeneratör devrede'));
      if (X.dark) out.push(SK.chip('crit', 'Binada elektrik yok'));
      if (X.fire.size) out.push(SK.chip('crit', 'Yangın: ' + Array.from(X.fire).map(label).join(', ')));
      if (X.evac) out.push(SK.chip('warn', 'Bina boşaltıldı'));
      if (X.intruder) out.push(SK.chip(X.caught ? 'ok' : 'crit', 'Yetkisiz kişi: ' + label(X.intruder.room) + (X.caught ? ' · durduruldu' : '')));
      if (A.hit.hq.size) out.push(SK.chip('yuksek', A.hit.hq.size + ' oda etkilendi'));
    }
    if (!out.length) out.push(SK.chip('ok', A ? 'Bina etkilenmedi' : 'Bina normal çalışıyor'));
    out.forEach(c => box.appendChild(c));
  }

  // Küçük bina planı: kat seçici + plan; olay olan kata kendiliğinden geçer (Senaryolar ekranı)
  SK.hqPlan = function (host) {
    let floorId = SK.hq.defaultFloor || SK.hq.floors[0].id, lastFocus = null, fv = null;
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Kat seçimi' });
    const status = h('div', { class: 'row hq-status' });
    const box = h('div');
    SK.hq.floors.forEach(f => seg.appendChild(h('button', { type: 'button', 'data-id': f.id, onclick: () => { floorId = f.id; draw(); } }, f.label)));
    function draw() {
      seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === floorId)));
      SK.clear(box);
      fv = floorSvg(SK.hq.floors.find(f => f.id === floorId), { room: null }, null);
      box.appendChild(fv.el);
    }
    function update() {
      const X = SK.state.attack && SK.state.attack.hq;
      const focus = X && X.focus;
      if (focus && focus !== lastFocus) {
        lastFocus = focus;
        const fl = SK.scenario.floorOf(focus);
        if (fl && fl !== floorId) { floorId = fl; draw(); }
      }
      if (!X) lastFocus = null;
      fv.update();
      hqStatus(status);
    }
    host.appendChild(h('div', { class: 'stack' }, h('div', { class: 'row' }, seg, status), box));
    draw();
    update();
    return { update, destroy() {} };
  };

  function sitePlanSvg() {
    const P = SK.hq.plot, B = SK.hq.building, k = P.w / 50;
    const svg = s('svg', { class: 'plan-svg', viewBox: (-2 * k) + ' ' + (-2.4 * k) + ' ' + (P.w + 4 * k) + ' ' + (P.h + 4.4 * k), role: 'img', 'aria-label': 'Vaziyet planı: ' + P.m2 + ' m² arsa', style: '--k:' + k });
    svg.appendChild(s('rect', { class: 'plot', x: 0, y: 0, width: P.w, height: P.h }));
    svg.appendChild(s('text', { class: 'dim', x: P.w / 2, y: -0.8 * k, 'text-anchor': 'middle', text: P.w + ' m · arsa ' + F.n(P.m2) + ' m² · çevre çiti' }));
    svg.appendChild(s('text', { class: 'dim', x: -0.8 * k, y: P.h / 2, 'text-anchor': 'middle', transform: 'rotate(-90 ' + (-0.8 * k) + ' ' + P.h / 2 + ')', text: P.h + ' m' }));
    SK.hq.cameras.forEach(([x, y]) => {
      const ang = Math.atan2(P.h / 2 - y, P.w / 2 - x);
      const a0 = ang - 0.5, a1 = ang + 0.5, R = 9 * k;
      svg.appendChild(s('path', { class: 'cam-cone', d: 'M' + x + ' ' + y + ' L' + (x + R * Math.cos(a0)) + ' ' + (y + R * Math.sin(a0)) + ' L' + (x + R * Math.cos(a1)) + ' ' + (y + R * Math.sin(a1)) + ' Z' }));
    });
    svg.appendChild(s('rect', { class: 'bldg', x: B.x, y: B.y, width: B.w, height: B.h }));
    const bl = [SK.hq.buildingLabel || 'Merkez bina', B.floors + ' kat · taban ' + F.n(B.m2) + ' m²', 'toplam ' + F.n(B.indoorM2) + ' m² kapalı alan'];
    bl.forEach((t, i) => svg.appendChild(s('text', { class: i ? 'room-sub' : 'room-label', x: B.x + B.w / 2, y: B.y + B.h / 2 - 0.6 * k + i * 1.1 * k, 'text-anchor': 'middle', text: t, style: i ? '' : 'font-size:' + (1.1 * k) + 'px' })));
    SK.hq.sitePlan.forEach(it => {
      const cls = it.kind === 'gate' ? 'gate' : it.kind === 'park' ? 'park' : it.kind === 'equip' ? 'equip' : 'room';
      svg.appendChild(s('rect', { class: cls, x: it.x, y: it.y, width: it.w, height: it.h, rx: it.kind === 'gate' ? 0.3 : 0 }));
      if (it.kind !== 'gate') {
        const lines = wrap(it.label, it.w - 0.5 * k, 0.7 * k);
        lines.forEach((ln, i) => svg.appendChild(s('text', { class: 'room-sub', x: it.x + 0.3 * k, y: it.y + 1 * k + i * 0.85 * k, text: ln, style: 'fill:var(--ink)' })));
      }
      const slots = it.kind === 'park' && SK.hq.parkSlots && SK.hq.parkSlots[it.id];
      if (slots) {
        const [n, cols] = slots;
        for (let i = 0; i < n; i++) {
          const cx = it.x + 0.5 * k + (i % cols) * ((it.w - 1 * k) / cols), cy = it.y + it.h - (Math.floor(i / cols) + 1) * 2.4 * k;
          svg.appendChild(s('rect', { class: 'park', x: cx, y: cy, width: (it.w - 1 * k) / cols - 0.3 * k, height: 2 * k, style: 'fill:var(--surface)' }));
        }
      }
    });
    const ent = SK.hq.entrance || [0.2, 11.4];
    svg.appendChild(s('text', { class: 'room-sub', x: ent[0], y: ent[1], text: 'Giriş', style: 'fill:var(--accent);font-weight:600' }));
    SK.hq.cameras.forEach(([x, y]) => svg.appendChild(s('circle', { class: 'cam', cx: x, cy: y, r: 0.45 * k })));
    return svg;
  }

  function roomPanel(roomId) {
    const room = SK.hq.floors.flatMap(f => f.rooms.map(r => Object.assign({ floor: f.label }, r))).find(r => r.id === roomId);
    const ppl = peopleIn(roomId);
    const risks = ((SK.hq.roomRisks || {})[roomId] || []).map(id => SK.riskMap[id]).filter(Boolean);
    return h('div', { class: 'panel stack' },
      h('div', null, h('div', { class: 'label' }, room.floor), h('h2', null, room.label)),
      h('dl', { class: 'kv' },
        h('dt', null, 'Alan'), h('dd', { class: 'num' }, F.n(room.w * room.h) + ' m² (' + room.w + ' × ' + room.h + ' m)'),
        h('dt', null, 'Erişim'), h('dd', null, room.access === 'Kartlı + kayıtlı' ? SK.chip('warn', room.access) : room.access),
        h('dt', null, 'Personel'), h('dd', null, ppl.length ? ppl.map(p => p.role + ' × ' + p.n + ' (' + p.shift + ')').join(', ') : 'Sürekli çalışan yok')),
      room.assets.length ? h('div', null, h('div', { class: 'label' }, 'Bu odadaki varlıklar'), h('ul', { class: 'plain' }, room.assets.map(a => h('li', null, a)))) : null,
      risks.length ? h('div', null, h('div', { class: 'label' }, 'İlgili riskler'),
        h('ul', { class: 'plain' }, risks.map(r => h('li', null, h('span', { class: 'tag' }, r.id), ' ', r.title)))) : null);
  }

  SK.registerView('merkez', {
    title: 'Tesis',
    count: () => SK.company.employees + ' kişi',
    mount(main) {
      const H = SK.hq;
      const saved = SK.store.get('hqTab', H.defaultFloor);
      const state = { tab: saved === 'arsa' || H.floors.some(f => f.id === saved) ? saved : H.defaultFloor, room: H.defaultRoom };
      const tabs = [{ id: 'arsa', label: 'Vaziyet planı' }].concat(SK.hq.floors.map(f => ({ id: f.id, label: f.label })));
      const seg = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Plan seçimi' });
      const planBox = h('div');
      const statusBox = h('div', { class: 'row hq-status' });
      const side = h('div', { class: 'stack' });
      let floorView = null;

      function render() {
        seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === state.tab)));
        SK.clear(planBox);
        floorView = null;
        if (state.tab === 'arsa') planBox.appendChild(sitePlanSvg());
        else {
          const floor = SK.hq.floors.find(f => f.id === state.tab);
          floorView = floorSvg(floor, state, id => { state.room = id; renderSide(); floorView.update(); });
          planBox.appendChild(floorView.el);
        }
        renderSide();
      }
      function renderSide() {
        SK.clear(side);
        if (state.tab === 'arsa') {
          side.appendChild(h('div', { class: 'panel stack' }, h('h2', null, 'Fiziksel güvenlik'),
            h('ul', { class: 'plain' }, H.security.map(t => h('li', null, t))),
            H.securityNote ? h('p', { class: 'note' }, H.securityNote) : null));
        } else if (state.room) {
          const inFloor = SK.hq.floors.find(f => f.id === state.tab).rooms.some(r => r.id === state.room);
          if (!inFloor) state.room = SK.hq.floors.find(f => f.id === state.tab).rooms.find(r => !r.minor).id;
          side.appendChild(roomPanel(state.room));
        }
      }
      tabs.forEach(t => seg.appendChild(h('button', { type: 'button', 'data-id': t.id, onclick: () => { state.tab = t.id; SK.store.set('hqTab', t.id); render(); } }, t.label)));

      const total = SK.personnel.reduce((a, p) => a + p.n, 0);
      const P = SK.hq.plot, B = SK.hq.building;
      main.appendChild(SK.viewHead('Kontrol et · dijital ikiz', H.title,
        SK.company.ui.hqLead(F.n(P.m2), B.floors, total), seg));
      main.appendChild(SK.help('merkez', [
        '<b>Ne işe yarar?</b> Fiziksel dijital ikiz: arazi büyüklüğü, bina, katlar, odalar ve personelin yerleşimi. Her şirketin kat planı kendi paketinden gelir.',
        SK.company.ui.hqWhere,
        'Plan seçicisinden vaziyet planı ile katlar arasında geçin. Bir odaya tıklayınca içindeki varlıklar, çalışanlar ve ilgili riskler görünür. Noktalar çalışanları gösterir.',
        '<b>Fiziksel olaylar:</b> Senaryolar ekranında yangın, elektrik kesintisi veya binaya sızma senaryosu çalışırken plan canlanır: yanan oda alevle işaretlenir, elektrik giderse kat kararır, yetkisiz kişinin izi kırmızı kesik çizgiyle görünür. Etkilenen odalar kırmızıya döner.']));
      main.appendChild(h('div', { class: 'stat-row' },
        [['Arsa', F.n(P.m2) + ' m²', P.w + ' × ' + P.h + ' m'], ['Kapalı alan', F.n(B.indoorM2) + ' m²', B.floors + ' kat × ' + F.n(B.m2) + ' m²']]
          .concat(H.stats.map(([l, v, n]) => [l, v == null ? String(total) : v, n]), [['Kamera', String(H.cameras.length), 'çevre güvenliği']])
          .map(([l, v, n]) => h('div', { class: 'stat' }, h('div', { class: 'label' }, l), h('div', { class: 'big-num' }, v), h('div', { class: 'note' }, n)))));
      main.appendChild(h('div', { class: 'grid-2' }, h('div', { class: 'panel stack' }, statusBox, planBox), side));
      main.appendChild(h('div', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', null, 'Personel yerleşimi'), h('span', { class: 'note' }, 'Toplam ' + total + ' kişi')),
        h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, h('th', null, 'Rol'), h('th', { class: 'r' }, 'Kişi'), h('th', null, 'Oda'), h('th', null, 'Vardiya'))),
          h('tbody', null, SK.personnel.map(p => {
            const room = SK.hq.floors.flatMap(f => f.rooms).find(r => r.id === p.room);
            return h('tr', null, h('td', null, p.role), h('td', { class: 'r' }, p.n), h('td', null, room ? room.label : p.room), h('td', { class: 'cell-sub' }, p.shift));
          }))))));
      render();
      hqStatus(statusBox);
      const off = SK.on('attack', () => {
        // Olay başka kattaysa o kata geç
        const X = SK.state.attack && SK.state.attack.hq;
        const fl = X && X.focus && SK.scenario.floorOf(X.focus);
        if (fl && fl !== state.tab && state.tab !== 'arsa') { state.tab = fl; render(); }
        if (floorView) floorView.update();
        hqStatus(statusBox);
      });
      return off;
    }
  });
})(window.SK);
