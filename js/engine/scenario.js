/* Senaryo motoru: hangi adımda durduğunu, kaç soketin etkilendiğini ve TL kaybını hesaplar; ikizde (haritada ve binada) canlandırır */
(function (SK) {
  'use strict';

  function match(c, scope, twin) {
    const site = twin.siteMap[c.siteId];
    if (scope.all) return true;
    if (scope.model && c.model !== scope.model) return false;
    if (scope.kind && c.kind !== scope.kind) return false;
    if (scope.link && site.link !== scope.link) return false;
    if (scope.city && site.city !== scope.city) return false;
    if (scope.siteTypes && scope.siteTypes.indexOf(site.type) < 0) return false;
    if (scope.districts && scope.districts.indexOf(site.district) < 0) return false;
    return true;
  }

  function thin(list, frac) {
    if (frac >= 1) return list;
    const keep = Math.max(1, Math.round(list.length * frac));
    const out = [];
    for (let i = 0; i < keep; i++) out.push(list[Math.floor(i * list.length / keep)]);
    return out;
  }

  function mult(mods, enabled) {
    let m = 1;
    if (mods) for (const k in mods) if (enabled.has(k)) m *= mods[k];
    return m;
  }

  function select(scn, enabled) {
    const imp = scn.impact, twin = SK.twin;
    if (!imp.scope) return [];
    let list = twin.connectors.filter(c => match(c, imp.scope, twin));
    if (imp.scope.fraction) list = thin(list, imp.scope.fraction);
    return thin(list, mult(imp.scopeMods, enabled));
  }

  function calc(scn, enabled) {
    for (let i = 0; i < scn.stages.length; i++) {
      const st = scn.stages[i];
      const by = (st.blockedBy || []).filter(k => enabled.has(k));
      if (by.length) {
        const cc = st.containedCost || scn.contained;
        const lines = cc && cc.amount ? [{ label: cc.label, amount: cc.amount }] : [];
        return { blocked: true, at: i, by, affected: [], hours: 0, lines, total: lines.reduce((a, l) => a + l.amount, 0) };
      }
    }
    const imp = scn.impact;
    const affected = select(scn, enabled);
    const hours = imp.hours * mult(imp.mods, enabled);
    const lines = [];
    const rev = affected.reduce((a, c) => a + c.expDailyRev / 24, 0) * hours;
    if (rev > 0) lines.push({ label: SK.T('lossLabel') + ' (' + affected.length + ' ' + SK.T('endpoint') + ' × ' + SK.fmt.n1(hours) + ' saat)', amount: rev });
    imp.costs.forEach(c => {
      const base = c.pct ? SK.twin.econ.annualRevenue * c.pct : c.amount;
      lines.push({ label: c.label, amount: base * mult(c.mods, enabled) });
    });
    return { blocked: false, at: -1, by: [], affected, hours, lines, total: lines.reduce((a, l) => a + l.amount, 0) };
  }

  // Bu senaryoda en çok tasarruf sağlayan, henüz açık olmayan kontroller
  function bestFixes(scn, enabled) {
    const base = calc(scn, enabled).total;
    const keys = new Set();
    scn.stages.forEach(s => (s.blockedBy || []).forEach(k => keys.add(k)));
    const addMods = m => { if (m) Object.keys(m).forEach(k => keys.add(k)); };
    addMods(scn.impact.mods); addMods(scn.impact.scopeMods);
    scn.impact.costs.forEach(c => addMods(c.mods));
    const out = [];
    keys.forEach(k => {
      if (enabled.has(k) || !SK.controlMap[k]) return;
      const set = new Set(enabled); set.add(k);
      const r = calc(scn, set);
      const saving = base - r.total;
      if (saving > 0) out.push({ key: k, saving, blocks: r.blocked, cost: SK.controlMap[k].cost });
    });
    return out.sort((a, b) => (b.blocks - a.blocks) || (b.saving - a.saving));
  }

  let timer = null;

  // Merkez binadaki fiziksel durum: yanan odalar, elektrik, tahliye, yetkisiz kişinin konumu ve kat kat izi
  function floorOf(room) {
    const f = SK.hq.floors.find(x => x.rooms.some(r => r.id === room));
    return f ? f.id : null;
  }
  function applyHq(X, fx) {
    if (!fx) return;
    (fx.fire || []).forEach(r => { X.fire.add(r); X.focus = r; });
    if (fx.dark) X.dark = true;
    if (fx.ups) X.ups = true;
    if (fx.evac) X.evac = true;
    if ('intruder' in fx) {
      if (!fx.intruder) { X.intruder = null; return; }
      const fl = floorOf(fx.intruder.room);
      X.intruder = { room: fx.intruder.room, floor: fl };
      (X.trail[fl] = X.trail[fl] || []).push.apply(X.trail[fl], fx.intruder.path || []);
      X.focus = fx.intruder.room;
    }
  }

  function run(scn) {
    reset(true);
    const enabled = new Set(SK.state.enabled);
    const result = calc(scn, enabled);
    const A = SK.state.attack = { id: scn.id, stage: -1, status: 'running', result, hit: { hq: new Set(), csms: false, vendor: false },
      hq: { fire: new Set(), dark: false, ups: false, evac: false, intruder: null, caught: false, trail: {}, focus: null } };
    const delay = SK.reducedMotion ? 350 : 1500;
    const lastStage = result.blocked ? result.at : scn.stages.length - 1;
    SK.sim.log('!', 'SENARYO', 'Başladı: ' + scn.title, 'attack');
    SK.emit('attack', A);

    function next() {
      A.stage++;
      const st = scn.stages[A.stage];
      if (result.blocked && A.stage === result.at) {
        A.status = 'blocked';
        if (st.hq && st.hq.intruder) { applyHq(A.hq, { intruder: st.hq.intruder }); A.hq.caught = true; }
        applyHq(A.hq, st.onBlock);
        SK.sim.log('!', 'SENARYO', 'Adım ' + (A.stage + 1) + ' engellendi: ' + result.by.map(k => SK.controlMap[k].title).join(', '), 'ok');
        SK.emit('attack', A);
        timer = null;
        return;
      }
      if (st.hit) {
        (st.hit.hq || []).forEach(r => { A.hit.hq.add(r); A.hq.focus = r; });
        if (st.hit.csms) A.hit.csms = true;
        if (st.hit.vendor) A.hit.vendor = true;
      }
      applyHq(A.hq, st.hq);
      SK.sim.log('!', 'SENARYO', 'Adım ' + (A.stage + 1) + ': ' + st.title + (st.tech ? ' [' + st.tech + ']' : ''), 'attack');
      if (st.apply) {
        (scn.log || []).forEach(l => {
          const parts = l.split(' → ');
          SK.sim.log('←', parts[0], parts[1] || l, 'attack');
        });
        if (result.affected.length) SK.sim.compromise(result.affected, scn.id);
      }
      SK.emit('attack', A);
      if (A.stage >= lastStage) {
        A.status = 'done';
        SK.sim.log('!', 'SENARYO', 'Tamamlandı. Tahmini kayıp: ' + SK.fmt.tl(result.total), 'attack');
        SK.emit('attack', A);
        timer = null;
        return;
      }
      timer = setTimeout(next, delay);
    }
    timer = setTimeout(next, SK.reducedMotion ? 100 : 600);
  }

  function reset(silent) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (SK.state.attack) {
      SK.state.attack = null;
      SK.sim.restore();
      if (!silent) SK.emit('attack', null);
    }
  }

  SK.scenario = { select, calc, bestFixes, run, reset, floorOf };
})(window.SK);
