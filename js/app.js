/* Başlatma: ikizi kur, kayıtlı kontrol durumunu yükle, simülasyonu ve arayüzü başlat */
(function (SK) {
  'use strict';

  function boot() {
    SK.twin = SK.buildTwin();
    SK.assets = SK.buildAssets(SK.twin);
    const saved = SK.store.get('enabled', null);
    const valid = Array.isArray(saved) ? saved.filter(k => SK.controlMap[k]) : SK.defaultEnabled;
    SK.state.enabled = new Set(valid);
    // Risk işleme planı (risk raporu 8. bölüm): maliyet-fayda seti + mevzuatın saydığı kontroller + farkındalık (md. 7.3)
    const fin = SK.risk.recommend(SK.defaultEnabled);
    const faz1 = new Set(fin);
    SK.frameworks.forEach(f => f.reqs.forEach(r => r.needs.forEach(k => faz1.add(k))));
    faz1.add('awareness');
    SK.plans = { fin, faz1, all: new Set(SK.controls.map(c => c.key)) };
    SK.phaseOf = k => SK.defaultEnabled.indexOf(k) >= 0 ? 'Mevcut' : faz1.has(k) ? 'Faz 1' : 'Faz 2';
    SK.recommended = faz1;
    SK.sim.init(SK.twin);
    const root = document.getElementById('app');
    SK.clear(root);
    SK.mountShell(root);
    SK.emit('tick', SK.sim.S);
    SK.emit('simstate', SK.sim.S);
    SK.sim.start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.SK);
