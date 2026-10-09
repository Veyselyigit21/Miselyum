/* Miselyum — ortak yardımcılar: DOM/SVG üretimi, biçimlendirme, olay yolu, tohumlu rastgele sayı */
window.SK = window.SK || {};
(function (SK) {
  'use strict';

  // Tohumlu rastgele sayı üreteci (mulberry32). Aynı tohum her açılışta aynı dijital ikizi üretir.
  SK.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  SK.fmt = {
    n: v => nf0.format(Math.round(v)),
    n1: v => nf1.format(v),
    n2: v => nf2.format(v),
    tl: v => nf0.format(Math.round(v)) + ' TL',
    tlShort: v => {
      const a = Math.abs(v);
      if (a >= 1e9) return nf1.format(v / 1e9) + ' mlr TL';
      if (a >= 1e6) return nf1.format(v / 1e6) + ' mn TL';
      if (a >= 1e4) return nf0.format(v / 1e3) + ' bin TL';
      return nf0.format(Math.round(v)) + ' TL';
    },
    pct: v => '%' + nf0.format(Math.round(v * 100)),
    clock: min => {
      const m = ((Math.floor(min) % 1440) + 1440) % 1440;
      return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    },
    aro: v => {
      if (v >= 1) return 'yılda ' + nf1.format(v).replace(',0', '') + ' kez';
      const years = 1 / v;
      return Math.round(years) + ' yılda bir';
    }
  };

  function append(node, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false || c === true) continue;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return node;
  }

  // HTML öğesi üretir: SK.h('div', {class: 'x', onclick: fn}, 'metin', çocuk)
  SK.h = function (tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'checked' || k === 'disabled' || k === 'selected') node[k] = !!v;
        else if (k === 'value') node.value = v;
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    return append(node, children);
  };

  // SVG öğesi üretir
  SK.s = function (tag, attrs, ...children) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'text') node.textContent = v;
        else if (k === 'class') node.setAttribute('class', v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      }
    }
    return append(node, children);
  };

  SK.clear = function (node) { while (node.firstChild) node.removeChild(node.firstChild); return node; };

  // Basit olay yolu
  const listeners = {};
  SK.on = function (ev, fn) {
    (listeners[ev] = listeners[ev] || []).push(fn);
    return () => { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); };
  };
  SK.emit = function (ev, data) { (listeners[ev] || []).slice().forEach(fn => fn(data)); };

  // Tarayıcı deposu yalnızca kolaylık içindir; erişilemezse sessizce varsayılana döner.
  // Şirkete özgü ayarlar (açık önlemler, seçili senaryo, kat) her şirket için ayrı saklanır.
  const TENANT_KEYS = ['enabled', 'scenario', 'hqTab'];
  const key = k => 'miselyum:' + (TENANT_KEYS.indexOf(k) >= 0 ? (SK.tenantId || 'akimyolu') + ':' : '') + k;
  SK.store = {
    get(k, d) { try { const v = localStorage.getItem(key(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(key(k), JSON.stringify(v)); } catch (e) { /* depo kapalı */ } }
  };
  // Eski addan (ŞarjKalkan) kalan ayarları bir kez taşı: tema, asistan anahtarı, açık önlemler
  try {
    if (localStorage.getItem('miselyum:tasindi') == null) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf('sarjkalkan:') !== 0) continue;
        const name = k.slice(11);
        const to = TENANT_KEYS.indexOf(name) >= 0 ? 'miselyum:akimyolu:' + name : 'miselyum:' + name;
        if (localStorage.getItem(to) == null) localStorage.setItem(to, localStorage.getItem(k));
      }
      localStorage.setItem('miselyum:tasindi', '1');
    }
  } catch (e) { /* depo kapalı */ }

  SK.reducedMotion = (function () {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  })();

  // Paylaşılan uygulama durumu
  SK.state = {
    enabled: new Set(),      // açık güvenlik kontrolleri
    selectedSite: null,
    attack: null             // çalışan senaryo
  };

  SK.setEnabled = function (set) {
    SK.state.enabled = new Set(set);
    SK.store.set('enabled', Array.from(SK.state.enabled));
    SK.emit('controls');
  };

  SK.toggleControl = function (key, on) {
    const next = new Set(SK.state.enabled);
    if (on === undefined ? !next.has(key) : on) next.add(key); else next.delete(key);
    SK.setEnabled(next);
  };

  // Durum etiketi: renk asla tek başına anlam taşımaz, her zaman simge + yazı ile gelir
  SK.chip = function (kind, label, extra) {
    const icons = { kritik: '▲', yuksek: '▲', orta: '●', dusuk: '▼', ok: '✓', off: '○', warn: '!', info: 'i', crit: '✕' };
    return SK.h('span', { class: 'chip chip-' + kind + (extra ? ' ' + extra : '') },
      SK.h('span', { class: 'chip-ic', 'aria-hidden': 'true' }, icons[kind] || '•'), label);
  };
})(window.SK);
