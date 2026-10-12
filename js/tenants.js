/* Miselyum ağına bağlı şirketler. Her şirket bir "şirket paketi"dir: kimlik, lokasyonlar, tesis planı, varlıklar,
   riskler, önlemler, senaryolar ve mevzuat. Varsayılan paket Akımyolu'dur (js/data/); diğer paketler js/tenants/
   altındadır ve yalnızca o şirket seçiliyken veriyi değiştirir. Şirket adresteki ?sirket= ile ya da üst çubuktaki
   ağ göstergesinden seçilir. */
(function (SK) {
  'use strict';

  SK.tenants = [
    { id: 'akimyolu', name: 'Akımyolu Şarj Hizmetleri A.Ş.', short: 'Akımyolu', sector: 'Elektrikli araç şarj ağı', connector: 'OCPP 1.6J / 2.0.1' },
    { id: 'kivilcim', name: 'Kıvılcım Otomotiv Teknolojileri A.Ş.', short: 'Kıvılcım', sector: 'Elektrikli otomobil üretimi', connector: 'OPC UA · OTA' }
  ];

  // Miselyum Kapısı ile açıldıysa yalnız kullanıcının yetkili olduğu şirketler görünür (asıl denetim sunucudadır:
  // yetkisiz şirketin paketi sunucudan hiç gönderilmez)
  const OT = window.MISELYUM_OTURUM;
  if (OT && Array.isArray(OT.sirketler)) {
    const izinli = SK.tenants.filter(t => OT.sirketler.indexOf(t.id) >= 0);
    if (izinli.length) SK.tenants = izinli;
  }

  let asked = null;
  try { asked = new URLSearchParams(location.search).get('sirket'); } catch (e) { /* eski tarayıcı */ }
  const known = id => SK.tenants.some(t => t.id === id);
  const saved = SK.store.get('tenant', 'akimyolu');
  SK.tenantId = known(asked) ? asked : known(saved) ? saved : SK.tenants[0].id;
  SK.store.set('tenant', SK.tenantId);
  SK.tenant = SK.tenants.find(t => t.id === SK.tenantId);

  // Başka şirkete bağlan: sayfa o şirketin paketiyle yeniden açılır
  SK.switchTenant = function (id) {
    if (!known(id) || id === SK.tenantId) return;
    SK.store.set('tenant', id);
    const u = new URL(location.href);
    u.searchParams.set('sirket', id);
    u.hash = 'genel';
    location.href = u.toString();
  };

  // Terimler: her şirket paketi kendi sözcüklerini verir (ör. soket / istasyon, şarjda / çalışıyor)
  const TERMS = {
    endpoint: 'uç nokta', unit: 'cihaz', site: 'lokasyon', sites: 'lokasyon', hqLabel: 'Merkez',
    busy: 'Çalışıyor', busyCount: 'cihaz', onlineLabel: 'Çevrimiçi uç nokta', busyLabel: 'Şu an çalışan',
    revenueLabel: 'Bugünkü değer', energyNote: 'kWh', protocol: 'Protokol', logTitle: 'Cihaz mesaj akışı', lossLabel: 'Kayıp gelir'
  };
  SK.T = k => (SK.company && SK.company.terms && SK.company.terms[k]) || TERMS[k] || k;

  // Platformun ortak sınıflandırması: bütün şirket paketleri aynı risk ve senaryo kategorilerini kullanır.
  // Burada durur ki bir şirketin paketi sunucudan gelmese de (yetkisiz kullanıcı) diğer şirketin ekranları çalışsın.
  SK.riskCats = ['Siber', 'Tedarikçi', 'Fiziksel', 'İnsan', 'Operasyonel', 'Mevzuat', 'Doğal afet', 'Finansal'];
  SK.scenarioCats = ['Siber', 'Fiziksel', 'Çevresel', 'Tedarikçi', 'İnsan ve süreç'];

  // Bağlantı durumu: 'sim' (yerel simülasyon), 'canli' (Miselyum Kapısı üzerinden canlı veri), 'kopuk'
  SK.link = { mode: 'sim', devices: 0, last: null };
  SK.setLink = function (patch) { Object.assign(SK.link, patch); SK.emit('link', SK.link); };
})(window.SK);
