/* Dijital ikiz: gerçek lokasyon listesinden (sites.js) lokasyon, ünite ve soketleri üretir; beklenen ekonomiyi ve EPDK kalibrasyonunu hesaplar */
(function (SK) {
  'use strict';

  const GENERIC = ['Otopark', 'Shell', 'BP', 'Total', 'Petrol Ofisi', 'Aytemiz', 'Opet', 'Dinlenme Tesisi'];

  // Şematik yedek harita için gerçek koordinatları şehir dairesine sığdırır
  function schematicPositions(sites) {
    const byCity = {};
    sites.forEach(s => { (byCity[s.city] = byCity[s.city] || []).push(s); });
    Object.keys(byCity).forEach(cid => {
      const list = byCity[cid];
      if (cid === 'YOL') {
        list.forEach(s => { const p = SK.geo.roadside[s.district] || [500, 300]; s.x = p[0]; s.y = p[1]; });
        return;
      }
      const city = SK.geo.cities.find(c => c.id === cid);
      const lat0 = list.reduce((a, s) => a + s.lat, 0) / list.length;
      const lon0 = list.reduce((a, s) => a + s.lon, 0) / list.length;
      const k = Math.cos(lat0 * Math.PI / 180);
      let maxD = 0;
      list.forEach(s => { maxD = Math.max(maxD, Math.hypot((s.lon - lon0) * k, s.lat - lat0)); });
      const scale = maxD ? (city.r * 0.78) / maxD : 0;
      list.forEach(s => {
        s.x = city.x + (s.lon - lon0) * k * scale;
        s.y = city.y - (s.lat - lat0) * scale;
      });
    });
  }

  SK.buildTwin = function () {
    const sites = [], units = [], connectors = [];
    const counters = {};

    SK.realSites.forEach(rs => {
      counters[rs.city] = (counters[rs.city] || 0) + 1;
      const code = rs.city + '-' + String(counters[rs.city]).padStart(2, '0');
      const st = SK.siteTypes[rs.type];
      const name = rs.name || (GENERIC.indexOf(rs.poi) >= 0 ? rs.poi + ' · ' + rs.district : rs.poi);
      const site = {
        id: code, code, city: rs.city, district: rs.district, type: rs.type, name, poi: rs.poi,
        lat: rs.lat, lon: rs.lon, street: rs.street, osm: rs.osm, road: rs.road || '', src: rs.src || null,
        link: st.link, host: st.host, units: [],
        extra: (SK.siteExtras && SK.siteExtras[code]) || null
      };
      st.units.forEach((m, ui) => {
        const model = SK.models[m];
        const unit = { id: (SK.company.unitPrefix || 'AKY-') + code + '-' + (ui + 1), siteId: code, model: m, fw: model.fw, connectors: [] };
        for (let c = 1; c <= model.connectors; c++) {
          const conn = { id: unit.id + '/' + c, unitId: unit.id, siteId: code, kind: model.kind, model: m, state: 'Available', session: null, compromised: null, faultLeft: 0 };
          unit.connectors.push(conn);
          connectors.push(conn);
        }
        site.units.push(unit);
        units.push(unit);
      });
      sites.push(site);
    });
    schematicPositions(sites);

    const siteMap = {}, unitMap = {};
    sites.forEach(s => { siteMap[s.id] = s; });
    units.forEach(u => { unitMap[u.id] = u; });

    // Beklenen ekonomi ve EPDK ile karşılaştırma metrikleri
    let daily = 0, sessions = 0, kwh = 0, minutes = 0, dcKwh = 0;
    const byKind = {};
    connectors.forEach(c => {
      const m = SK.models[c.model];
      const spd = SK.company.sessionsPerDay[m.kind] * SK.siteTypes[siteMap[c.siteId].type].demand;
      const e = spd * m.avgKw * m.meanMin / 60;
      c.expDailyKwh = e;
      c.expDailyRev = SK.company.revenueMode === 'job' ? spd * (m.jobValue || 0) : e * SK.company.prices[m.kind];
      daily += c.expDailyRev;
      sessions += spd; kwh += e; minutes += spd * m.meanMin;
      if (m.kind === 'DC') dcKwh += e;
      byKind[m.kind] = byKind[m.kind] || { n: 0, rev: 0 };
      byKind[m.kind].n++;
      byKind[m.kind].rev += c.expDailyRev;
    });

    return {
      sites, units, connectors, siteMap, unitMap,
      econ: { dailyRevenue: daily, annualRevenue: daily * 365, byKind },
      calib: {
        sessionsPerSocketDay: sessions / connectors.length,
        kwhPerSession: kwh / sessions,
        minutesPerSession: minutes / sessions,
        dcEnergyShare: dcKwh / kwh,
        dailyKwh: kwh
      }
    };
  };

  // Varlık envanteri: sabit varlıklar + ikizdeki ünite modelleri
  SK.buildAssets = function (twin) {
    const groups = {};
    twin.units.forEach(u => {
      const g = groups[u.model] = groups[u.model] || { count: 0, sites: new Set() };
      g.count++;
      g.sites.add(u.siteId);
    });
    const unitAssets = Object.keys(SK.models).filter(k => groups[k]).map(k => {
      const m = SK.models[k];
      return {
        id: 'unit:' + k,
        name: m.label + ' ' + (SK.company.assetNoun || 'şarj ünitesi') + ' (' + m.vendor + ') × ' + groups[k].count,
        type: 'Donanım',
        loc: 'Sahada, ' + groups[k].sites.size + ' lokasyon',
        owner: m.owner || 'Operasyon müdürü',
        detail: (m.protocol || 'OCPP ' + m.ocpp) + ' · ' + SK.profiles[m.profile].label + ' · firmware ' + m.fw,
        c: 1, i: 3, a: 3, unit: true
      };
    });
    return unitAssets.concat(SK.staticAssets);
  };
})(window.SK);
