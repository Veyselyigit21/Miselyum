/* Risk motoru: olasılık × etki, yıllık beklenen kayıp (ALE = SLE × ARO), kontrol etkisi, öneri ve uyum */
(function (SK) {
  'use strict';

  const L_SCALE = [
    { v: 1, label: 'Çok düşük', rule: '25 yılda birden seyrek' },
    { v: 2, label: 'Düşük', rule: '7–25 yılda bir' },
    { v: 3, label: 'Olası', rule: '2–7 yılda bir' },
    { v: 4, label: 'Sık', rule: 'Yılda 0,5–3 kez' },
    { v: 5, label: 'Çok sık', rule: 'Yılda 3 kezden fazla' }
  ];
  // Etki eşikleri şirketin büyüklüğüne göre değişir (şirket paketi impactScale verir); varsayılan KOBİ ölçeğidir
  const T = (SK.company && SK.company.impactScale) || [250e3, 1e6, 3e6, 10e6];
  const tl = v => SK.fmt.tlShort(v).replace(' TL', '');
  const I_SCALE = [
    { v: 1, label: 'Önemsiz', rule: tl(T[0]) + ' TL altı' },
    { v: 2, label: 'Sınırlı', rule: tl(T[0]) + ' – ' + tl(T[1]) + ' TL' },
    { v: 3, label: 'Önemli', rule: tl(T[1]) + ' – ' + tl(T[2]) + ' TL' },
    { v: 4, label: 'Ciddi', rule: tl(T[2]) + ' – ' + tl(T[3]) + ' TL' },
    { v: 5, label: 'Yıkıcı', rule: tl(T[3]) + ' TL üzeri' }
  ];
  const BANDS = {
    kritik: { key: 'kritik', label: 'Kritik', major: true, rule: 'Skor 15–25' },
    yuksek: { key: 'yuksek', label: 'Yüksek', major: true, rule: 'Skor 10–14' },
    orta: { key: 'orta', label: 'Orta', major: false, rule: 'Skor 5–9' },
    dusuk: { key: 'dusuk', label: 'Düşük', major: false, rule: 'Skor 1–4' }
  };

  function levelL(aro) { return aro >= 3 ? 5 : aro >= 0.5 ? 4 : aro >= 0.15 ? 3 : aro >= 0.04 ? 2 : 1; }
  function levelI(sle) { return sle >= T[3] ? 5 : sle >= T[2] ? 4 : sle >= T[1] ? 3 : sle >= T[0] ? 2 : 1; }
  function band(score) { return score >= 15 ? BANDS.kritik : score >= 10 ? BANDS.yuksek : score >= 5 ? BANDS.orta : BANDS.dusuk; }

  function evalRisk(r, enabled) {
    let aro = r.aro, sle = r.sle;
    r.controls.forEach(k => {
      if (!enabled.has(k)) return;
      const c = SK.controlMap[k];
      if (c.kind === 'L') aro *= (1 - c.eff); else sle *= (1 - c.eff);
    });
    const L = levelL(aro), I = levelI(sle), score = L * I;
    return { aro, sle, ale: aro * sle, L, I, score, band: band(score) };
  }

  const NONE = new Set();

  function treatment(r, res) {
    if (r.avoid && SK.state.enabled.has(r.avoid)) return { key: 'kacin', label: 'Kaçın', why: 'Riskin kaynağı ortadan kaldırıldı: ' + SK.controlMap[r.avoid].title.toLowerCase() + '.' };
    const insurable = r.ins && r.ins.length > 0;
    const b = res.band.key;
    if ((b === 'kritik' || b === 'yuksek')) {
      if (insurable && res.L <= 2) return { key: 'transfer', label: 'Azalt + sigortala', why: 'Etki yüksek, olasılık düşük: kontrolleri artır, kalan kısmı sigortaya devret.' };
      return { key: 'azalt', label: 'Azalt', why: 'Kabul edilemez seviye: kontrol eklenmeli.' };
    }
    if (b === 'orta') {
      if (insurable && res.I >= 4) return { key: 'transfer', label: 'Sigortala', why: 'Seyrek ama ağır kayıp: sigorta ile devretmek kontrol yatırımından daha ekonomik.' };
      return { key: 'izle', label: 'Azalt veya izle', why: 'Ucuz kontrol varsa uygula, yoksa üç ayda bir izle.' };
    }
    return { key: 'kabul', label: 'Kabul et', why: 'Düşük seviye: yıllık gözden geçirmede izlenir.' };
  }

  function totalAle(enabled) {
    let t = 0;
    SK.risks.forEach(r => { t += evalRisk(r, enabled).ale; });
    return t;
  }

  function controlCost(enabled) {
    let t = 0;
    enabled.forEach(k => { if (SK.controlMap[k]) t += SK.controlMap[k].cost; });
    return t;
  }

  // Açgözlü öneri: net faydası (azalan ALE − maliyet) en yüksek kontrolü ekle, pozitif kaldıkça devam et
  function recommend(start) {
    const set = new Set(start);
    let base = totalAle(set);
    for (;;) {
      let best = null, bestNet = 0, bestAle = base;
      SK.controls.forEach(c => {
        if (set.has(c.key)) return;
        set.add(c.key);
        const a = totalAle(set);
        set.delete(c.key);
        const net = (base - a) - c.cost;
        if (net > bestNet) { bestNet = net; best = c.key; bestAle = a; }
      });
      if (!best) break;
      set.add(best);
      base = bestAle;
    }
    return set;
  }

  // Bir kontrolün mevcut duruma göre marjinal katkısı
  function marginal(key, enabled) {
    const set = new Set(enabled);
    const had = set.has(key);
    set.add(key);
    const withC = totalAle(set);
    set.delete(key);
    const without = totalAle(set);
    const benefit = without - withC;
    const cost = SK.controlMap[key].cost;
    return { benefit, cost, net: benefit - cost, rosi: (benefit - cost) / cost, had };
  }

  function reqStatus(req, enabled) {
    const on = req.needs.filter(k => enabled.has(k)).length;
    if (on === req.needs.length) return { key: 'ok', label: 'Karşılanıyor', missing: [] };
    return {
      key: on > 0 ? 'kismen' : 'yok', label: on > 0 ? 'Kısmen' : 'Eksik',
      missing: req.needs.filter(k => !enabled.has(k))
    };
  }

  function readiness(enabled) {
    let sum = 0, n = 0;
    SK.frameworks.forEach(f => f.reqs.forEach(r => {
      const st = reqStatus(r, enabled);
      sum += st.key === 'ok' ? 1 : st.key === 'kismen' ? 0.5 : 0;
      n++;
    }));
    return n ? sum / n : 0;
  }

  SK.risk = {
    L_SCALE, I_SCALE, BANDS, levelL, levelI, band,
    eval: evalRisk,
    inherent: r => evalRisk(r, NONE),
    treatment, totalAle, controlCost, recommend, marginal, reqStatus, readiness,
    summary(enabled) {
      const aleIn = totalAle(NONE), aleRes = totalAle(enabled), cost = controlCost(enabled);
      return { aleIn, aleRes, cost, net: aleIn - aleRes - cost, rosi: cost ? (aleIn - aleRes - cost) / cost : 0 };
    }
  };
})(window.SK);
