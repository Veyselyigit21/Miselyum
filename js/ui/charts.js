/* Grafik katmanı: ECharts koyu tema, yeniden boyutlanma ve görünüm kapanınca temizlik */
(function (SK) {
  'use strict';
  const F = SK.fmt;

  // Renkler CSS belirteçlerinden okunur; tema değişince SK.refreshPalette() çağrılır ve grafikler yeni temayla kurulur.
  // Renk anlam taşır: P lacivert, U yeşil, K kiremit, Ö mürdüm; durum renkleri yalnız durum için.
  SK.PAL = {};
  const P = SK.PAL;
  const cssVar = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  let themeName = 'sk0', registered = false, ver = 0;
  SK.refreshPalette = function () {
    Object.assign(P, {
      ink: cssVar('--ink'), ink2: cssVar('--ink-2'), muted: cssVar('--muted'), bg: cssVar('--bg'), surface: cssVar('--surface'),
      grid: cssVar('--line'), axis: cssVar('--line-strong'), accent: cssVar('--accent'),
      p: cssVar('--ph-p'), u: cssVar('--ph-u'), k: cssVar('--ph-k'), o: cssVar('--ph-o'),
      ok: cssVar('--st-ok'), charge: cssVar('--st-charge'), warn: cssVar('--st-warn'), serious: cssVar('--st-serious'), crit: cssVar('--st-crit'), off: cssVar('--st-off')
    });
    P.accent2 = P.p;
    P.series = [P.p, P.k, P.u, P.warn, P.o, P.charge, P.serious, P.muted];
    themeName = 'sk' + (++ver);
    registered = false;
  };
  SK.refreshPalette();
  // #rrggbb → rgba(…, a)
  SK.alpha = function (hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  };

  function register() {
    if (registered || !window.echarts) return;
    window.echarts.registerTheme(themeName, {
      backgroundColor: 'transparent',
      color: P.series,
      textStyle: { fontFamily: 'Archivo, "Segoe UI", sans-serif', color: P.ink2, fontSize: 12.5 },
      title: { textStyle: { color: P.ink } },
      legend: { textStyle: { color: P.ink2 }, icon: 'roundRect', itemWidth: 12, itemHeight: 8 },
      tooltip: {
        backgroundColor: P.surface, borderColor: P.axis, borderWidth: 1,
        textStyle: { color: P.ink, fontSize: 12.5 }, extraCssText: 'border-radius:6px;box-shadow:0 10px 26px -12px rgba(28,26,22,.35);'
      },
      categoryAxis: { axisLine: { lineStyle: { color: P.axis } }, axisTick: { show: false }, axisLabel: { color: P.muted }, splitLine: { show: false } },
      valueAxis: { axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: P.muted }, splitLine: { lineStyle: { color: P.grid } } },
      timeAxis: { axisLine: { lineStyle: { color: P.axis } }, axisLabel: { color: P.muted }, splitLine: { show: false } }
    });
    registered = true;
  }

  // Sayıyı yumuşakça artırarak gösterir (büyük rakamlar için)
  SK.countUp = function (el, to, fmt, ms) {
    const from = +(el.dataset.v || 0), dur = ms || 900, t0 = performance.now();
    el.dataset.v = to;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
    const token = (el._cu = (el._cu || 0) + 1);
    (function step(t) {
      if (el._cu !== token) return;
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
    // Sekme arka plandaysa animasyon kareleri çalışmaz; son değer yine de yazılsın
    setTimeout(() => { if (el._cu === token) el.textContent = fmt(to); }, dur + 150);
  };

  // Bir grafik oluşturur; dönen nesne set(option) ve dispose() sunar
  SK.chart = function (el, option, opts) {
    if (!window.echarts) {
      el.appendChild(SK.h('div', { class: 'chart-empty' }, 'Grafikler için internet bağlantısı gerekir (ECharts yüklenemedi).'));
      return { set() {}, dispose() {}, inst: null };
    }
    register();
    const inst = window.echarts.init(el, themeName, { renderer: 'canvas' });
    inst.setOption(option);
    let ro = null;
    try { ro = new ResizeObserver(() => inst.resize()); ro.observe(el); } catch (e) { /* eski tarayıcı */ }
    const api = {
      inst,
      set(opt, notMerge) { inst.setOption(opt, notMerge); },
      dispose() { if (ro) ro.disconnect(); inst.dispose(); }
    };
    SK._charts.push(api);
    return api;
  };
  SK._charts = [];
  SK.disposeCharts = function () { SK._charts.forEach(c => { try { c.dispose(); } catch (e) { /* zaten kapalı */ } }); SK._charts = []; };

  // Ortak eksen biçimleyiciler
  SK.axisTL = v => F.tlShort(v).replace(' TL', '');
  SK.gradient = function (top, bottom) {
    if (!window.echarts) return top;
    return new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: top }, { offset: 1, color: bottom }]);
  };
  SK.hgradient = function (left, right) {
    if (!window.echarts) return left;
    return new window.echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: left }, { offset: 1, color: right }]);
  };

  // Küçük çizgi grafiği (KPI kartları için, kütüphanesiz)
  SK.sparkline = function (values, color) {
    const w = 160, hgt = 26;
    const svg = SK.s('svg', { class: 'kpi-spark', viewBox: '0 0 ' + w + ' ' + hgt, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    if (!values || values.length < 2) return svg;
    const max = Math.max.apply(null, values) || 1;
    const pts = values.map((v, i) => [i * w / (values.length - 1), hgt - 2 - (v / max) * (hgt - 6)]);
    const d = 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
    const id = 'sg' + Math.random().toString(36).slice(2, 7);
    svg.appendChild(SK.s('defs', null, SK.s('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 },
      SK.s('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.35 }), SK.s('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }))));
    svg.appendChild(SK.s('path', { d: d + ' L' + w + ' ' + hgt + ' L0 ' + hgt + ' Z', fill: 'url(#' + id + ')' }));
    svg.appendChild(SK.s('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.6, 'vector-effect': 'non-scaling-stroke' }));
    const last = pts[pts.length - 1];
    svg.appendChild(SK.s('circle', { cx: last[0], cy: last[1], r: 2.2, fill: color }));
    return svg;
  };

  // Görünüm içi yardım kutusu
  // Ekran açıklaması: asistana kaydedilir, başlık satırında küçük bir düğme olarak görünür
  SK.help = function (anchor, lines) {
    SK._help = { anchor, lines };
    return SK.h('button', { type: 'button', class: 'btn btn-sm help-btn', onclick: () => SK.assist && SK.assist.explain(anchor) },
      SK.h('span', { class: 'help-q', 'aria-hidden': 'true' }, '?'), 'Bu ekran ne işe yarar?');
  };
})(window.SK);
