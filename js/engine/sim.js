/* Canlı simülasyon: her uç nokta için işler (şarj ağında şarj oturumu, fabrikada istasyondaki iş), arızalar ve cihaz mesaj akışı.
   Mesaj kalıpları ve gelir modeli şirket paketinden gelir; varsayılanlar OCPP 1.6J ve kWh başına fiyattır. */
(function (SK) {
  'use strict';

  const C = SK.company;
  const curveSum = C.hourCurve.reduce((a, b) => a + b, 0);
  const curve = C.hourCurve.map(v => v / curveSum);
  const ERRORS = C.errors || ['GroundFailure', 'ConnectorLockFailure', 'OverCurrentFailure', 'PowerMeterFailure', 'HighTemperature'];
  const JOB = C.revenueMode === 'job'; // fabrika: değer iş bitince yazılır
  const M = Object.assign({
    start: (c, s, tag) => ['Authorize {idTag:"' + tag + '"}', 'StartTransaction {transactionId:' + s.id + '}'],
    stop: (c, s, reason) => 'StopTransaction {transactionId:' + s.id + ', meterStop:' + Math.round(s.kwh * 1000) + ' Wh, reason:"' + reason + '"}',
    meter: (c, s) => 'MeterValues {Energy.Active.Import.Register:' + Math.round(s.kwh * 1000) + ' Wh}',
    fault: (c, err) => 'StatusNotification {status:"Faulted", errorCode:"' + err + '"}',
    recover: c => 'StatusNotification {status:"Available"}',
    heartbeat: c => 'Heartbeat {}',
    boot: ['AKY-ANK-01-1', 'BootNotification {chargePointVendor:"Üretici A", firmwareVersion:"2.3.1"}'],
    restore: n => 'BootNotification ×' + n + ' (üniteler yeniden kuruldu)'
  }, C.messages || {});

  const S = {
    minute: 0, day: 0, speed: 10, running: true, acc: 0,
    dayEnergy: 0, dayRevenue: 0, daySessions: 0,
    log: [], logSeq: 0, kpi: {},
    series: [],          // 10 dakikalık örnekler: anlık güç ve şarjdaki araç sayısı
    hourly: new Array(24).fill(0)  // bugünün saatlik geliri
  };
  function dayIdx() { const d = new Date(C.startDate.getTime() + S.day * 86400000); return (d.getDay() + 6) % 7; }
  SK.simDate = function () { return new Date(C.startDate.getTime() + S.day * 86400000); };
  let twin = null, rnd = null, timer = null, seq = 4100;

  function log(dir, who, msg, kind) {
    S.log.push({ n: ++S.logSeq, t: S.minute, dir, who, msg, kind: kind || '' });
    if (S.log.length > 260) S.log.splice(0, S.log.length - 260);
  }

  function tag() { return 'RFID-' + Math.floor(rnd() * 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0'); }

  function startSession(c, quiet) {
    const m = SK.models[c.model];
    const dur = Math.max(8, m.meanMin * (0.45 + rnd() * 1.1));
    const kw = Math.min(m.kw, m.avgKw * (0.75 + rnd() * 0.5));
    c.session = { id: ++seq, left: dur, kw, kwh: 0, tl: 0 };
    c.state = 'Charging';
    if (!quiet) [].concat(M.start(c, c.session, tag())).forEach(m => log('→', c.id, m));
  }

  function stopSession(c, reason, quiet) {
    const s = c.session;
    S.daySessions++;
    if (JOB && reason !== 'Remote') {
      const v = SK.models[c.model].jobValue || 0;
      S.dayRevenue += v; S.hourly[Math.floor((S.minute % 1440) / 60)] += v;
    }
    if (!quiet) log('→', c.id, M.stop(c, s, reason));
    c.session = null;
    c.state = 'Available';
  }

  function step(quiet) {
    const h = Math.floor((S.minute % 1440) / 60);
    const dayF = C.dayFactor[dayIdx()];
    let power = 0, charging = 0;
    for (const c of twin.connectors) {
      if (c.compromised) continue;
      if (c.live) {   // canlı cihaz: durumu ve enerjisi Miselyum Kapısı'ndan gelir
        if (c.state === 'Charging' && c.session) { power += c.session.kw; charging++; }
        continue;
      }
      if (c.state === 'Charging') {
        const s = c.session;
        const e = s.kw / 60;
        const price = JOB ? 0 : C.prices[c.kind];
        s.kwh += e; s.tl += e * price;
        S.dayEnergy += e; S.dayRevenue += e * price; S.hourly[h] += e * price;
        power += s.kw; charging++;
        s.left -= 1;
        if (s.left <= 0) stopSession(c, 'EVDisconnected', quiet);
        else if (!quiet && rnd() < 0.003) log('→', c.id, M.meter(c, s));
      } else if (c.state === 'Faulted') {
        c.faultLeft -= 1;
        if (c.faultLeft <= 0) {
          c.state = 'Available';
          if (!quiet) log('→', c.id, M.recover(c));
        }
      } else if (c.state === 'Available') {
        const site = twin.siteMap[c.siteId];
        const p = C.sessionsPerDay[c.kind] * SK.siteTypes[site.type].demand * dayF * curve[h] / 60;
        if (rnd() < p) startSession(c, quiet);
        else if (rnd() < C.faultPerConnectorDay / 1440) {
          c.state = 'Faulted';
          c.faultLeft = 40 + rnd() * 140;
          if (!quiet) log('→', c.id, M.fault(c, ERRORS[Math.floor(rnd() * ERRORS.length)]), 'warn');
        }
      }
    }
    if (!quiet && rnd() < 0.08) {
      const c = twin.connectors[Math.floor(rnd() * twin.connectors.length)];
      if (!c.compromised && !c.live) log('→', c.unitId, M.heartbeat(c), 'dim');
    }
    if (S.minute % 10 === 0) {
      S.series.push({ t: S.minute, power: Math.round(power), charging });
      if (S.series.length > 144) S.series.shift();
    }
    S.minute++;
    if (S.minute % 1440 === 0) { S.day++; S.dayEnergy = 0; S.dayRevenue = 0; S.daySessions = 0; S.hourly = new Array(24).fill(0); }
  }

  function computeKpi() {
    let charging = 0, faulted = 0, attacked = 0, power = 0;
    for (const c of twin.connectors) {
      if (c.compromised) { attacked++; continue; }
      if (c.state === 'Charging') { charging++; power += c.session ? c.session.kw : 0; }
      else if (c.state === 'Faulted') faulted++;
    }
    const total = twin.connectors.length;
    S.kpi = { total, online: total - attacked, charging, faulted, attacked, available: total - attacked - charging - faulted, power };
  }

  function tick() {
    if (!S.running) return;
    S.acc += S.speed / 4;
    while (S.acc >= 1) { step(false); S.acc -= 1; }
    computeKpi();
    SK.emit('tick', S);
  }

  SK.sim = {
    S,
    init(t) {
      twin = t;
      rnd = SK.rng(SK.company.seed + 7);
      // Günün ilk 9 saatini sessizce çalıştırarak sahayı gerçekçi bir sabah durumuyla aç
      for (let i = 0; i < 9 * 60; i++) step(true);
      log('→', M.boot[0], M.boot[1], 'dim');
      computeKpi();
    },
    start() {
      if (timer) return;
      timer = setInterval(tick, 250);
    },
    setSpeed(v) { S.speed = v; SK.emit('simstate', S); },
    toggle() { S.running = !S.running; SK.emit('simstate', S); },
    log,
    compromise(list, tagId, quiet) {
      list.forEach(c => {
        if (c.session) stopSession(c, 'Remote', true);
        c.compromised = tagId;
        c.state = 'Unavailable';
      });
      computeKpi();
      SK.emit('tick', S);
    },
    // Canlı cihazdan gelen sayaç artışı (kWh) bugünkü enerji ve gelire yazılır
    liveEnergy(c, kwh) {
      if (!(kwh > 0)) return;
      const price = JOB ? 0 : C.prices[c.kind];
      S.dayEnergy += kwh; S.dayRevenue += kwh * price; S.hourly[Math.floor((S.minute % 1440) / 60)] += kwh * price;
      if (c.session) c.session.tl += kwh * price;
    },
    liveEnd() { S.daySessions++; },
    restore() {
      let n = 0;
      twin.connectors.forEach(c => {
        if (!c.compromised) return;
        c.compromised = null; n++;
        if (c.live) { c.session = c.liveSession || null; c.state = c.liveState === 'Charging' && !c.session ? 'Available' : (c.liveState || 'Available'); }
        else c.state = 'Available';
      });
      if (n) log('→', '*', M.restore(n), 'ok');
      computeKpi();
      SK.emit('tick', S);
    }
  };
})(window.SK);
