/* Akımyolu şirket paketi (Miselyum'a bağlı ilk şirket). Başka bir şirket için js/tenants/ altında yeni paket yazılır.
   Talep ve fiyat parametreleri real.js\'teki gerçek EPDK ve piyasa verilerine göre ayarlanmıştır. */
(function (SK) {
  'use strict';
  const R = SK.real;

  SK.company = {
    name: 'Akımyolu Şarj Hizmetleri A.Ş.',
    short: 'Akımyolu',
    disclaimer: 'Akımyolu kurgusal bir şirkettir. Lokasyonlar OpenStreetMap\'teki gerçek yerlerdir; bu yerlerdeki Akımyolu üniteleri kurgusaldır.',
    license: 'EPDK şarj ağı işletmeci lisansı',
    seed: 20261007,
    employees: 40,
    appUsers: 120000,
    hqCity: 'Ankara',
    // Fiyatlar: 21 Eylül 2026 piyasa listesinin medyanı (real.js)
    prices: { AC: Math.round(R.acMedian * 100) / 100, DC: Math.round(R.dcMedian * 100) / 100 },
    // Saatlik talep payı. Şekil EPDK Ağustos 2026 verisine uyarlandı: en yoğun saat 16-17, en düşük 04-05, oran ≈ 7
    hourCurve: [0.022, 0.017, 0.014, 0.012, 0.0105, 0.012, 0.018, 0.028, 0.038, 0.046, 0.053, 0.058,
                0.062, 0.065, 0.068, 0.071, 0.074, 0.072, 0.068, 0.061, 0.052, 0.043, 0.034, 0.027],
    // Haftanın günü çarpanı (Pzt…Paz). EPDK Ağustos 2026: en yoğun Cumartesi, en düşük Salı, oran ≈ 1,58
    dayFactor: [0.92, 0.82, 0.88, 0.92, 1.02, 1.30, 1.14],
    startDate: new Date(2026, 9, 7),
    // Soket başına günlük ortalama oturum (EPDK Ağustos 2026 ortalaması 2,34'e göre AC/DC ayrımı)
    sessionsPerDay: { AC: 1.3, DC: 3.2 },
    faultPerConnectorDay: 1 / 40,
    // Arayüz terimleri (Miselyum her şirkette kendi sözcüklerini kullanır)
    terms: {
      endpoint: 'soket', unit: 'ünite', site: 'lokasyon', sites: 'lokasyon', hqLabel: 'Merkez · OSTİM',
      busy: 'Şarjda', busyCount: 'araç', onlineLabel: 'Çevrimiçi soket', busyLabel: 'Şu an şarjda',
      revenueLabel: 'Bugünkü gelir', energyNote: 'kWh', protocol: 'OCPP', logTitle: 'OCPP mesaj akışı',
      unitTitle: 'Şarj ünitesi', endpointTitle: 'Soket', hostLabel: 'Ev sahibi', weakNote: 'şifresiz', profileTitle: 'OCPP güvenlik profili',
      loadTitle: 'Ağ yükü', hourlyTitle: 'Bugünün saatlik geliri', hourlySeries: 'Saatlik gelir', stateTitle: 'Soket durumları', revenueTitle: 'Beklenen gelir',
      allUnits: 'Tüm şarj üniteleri', lossNote: 'Gelir kaybı ikizdeki soketlerin beklenen gelirinden hesaplanır', lossLabel: 'Kayıp şarj geliri'
    },
    // Ekran metinleri: şirkete özgü cümleler burada, ekranlar yalnız bunları gösterir
    ui: {
      heroEyebrow: 'kurgusal şirket, gerçek lokasyonlar',
      heroTitle: ['Bir şarj ağının siber güvenliğini ', 'dijital ikizi', ' üzerinde deniyoruz.'],
      heroLead: 'Miselyum; Akımyolu\'nun 38 gerçek lokasyonunu, 190 soketini, merkez binasını ve 40 çalışanını canlı simüle eder. Saldırıları bu kopya üzerinde dener, riskleri liraya çevirir ve ISO/IEC 27001\'e ne kadar hazır olunduğunu ölçer.',
      deadline: { date: [2027, 2, 23], label: 'EPDK\'nın ISO 27001 son tarihine', text: '23 Mart 2026\'daki yönetmelik değişikliğiyle şarj ağı işletmecilerine TS ISO/IEC 27001 belgesi zorunlu oldu. Son tarih 23 Mart 2027.' },
      planNote: 'Faz 1, EPDK son tarihinden önce bitecek plandır; ayrıntısı risk raporunda.',
      faz1When: 'Mart 2027', faz2When: 'Aralık 2027',
      readyNote: 'EPDK, KVKK, 7545, PCI DSS',
      level2: 'Bir şarj cihazı ya da onun yazılım simülatörü OCPP ile bağlanır; durumu ikize kendiliğinden akar.',
      level3: 'İkiz sahadan okur, kendisi karar verip cihaza komut gönderir ve sonucu cihazın cevabıyla doğrular: arızalı soketi yeniden başlatır, onaysız yazılımlı cihazı karantinaya alır, şebeke talebinde gücü paylaştırır.',
      twinNote: 'Lokasyonlar OpenStreetMap\'teki gerçek yerler, talep EPDK\'nın Ağustos 2026 verisine ayarlı; şirket ve ünitelerin kendisi kurgusal.',
      sahaLead: n => 'Şirketin ' + n + ' lokasyonu gerçek sokak haritası üzerinde canlı simüle ediliyor. Her halka bir lokasyondur; dilimler soketleri ve anlık durumlarını gösterir. Bir halkaya tıklayınca harita o sokağa yakınlaşır.',
      sahaHelp: [
        '<b>Harita:</b> Halkalar Akımyolu\'nun lokasyonlarıdır (yeşil müsait, mavi şarjda, sarı arızalı, kırmızı olaydan etkilenen). Mor noktalar OpenStreetMap\'te kayıtlı <b>gerçek</b> diğer şarj noktalarıdır.',
        '<b>Üst düğmeler:</b> Şehirler arasında geçiş, harita altlığı (açık, koyu, uydu), 3B binalar ve diğer işletmeciler katmanı. Fareyle sürükleyip sağ tıkla döndürebilirsiniz.',
        '<b>Grafikler:</b> Ağ yükü son 24 saati, saatlik gelir bugünü, halka grafik soketlerin anlık durumunu gösterir. Talep, EPDK\'nın Ağustos 2026 verisine göre ayarlandı.',
        '<b>OCPP akışı:</b> Şarj cihazlarının merkeze gönderdiği protokol mesajları. Miselyum Kapısı açıkken mesajlar sanal cihazlardan gerçek OCPP bağlantısıyla gelir.'],
      sahaCallout: st => st.byProfile[1] + ' AC ünite şifresiz OCPP (Profil 1) ile bağlanıyor ve ' + st.links.host + ' lokasyon ev sahibinin ağını kullanıyor. Risk kaydındaki R04, R05 ve R20 buradan doğuyor. ',
      responseNote: (far, noFire) => far + ' lokasyona merkezdeki saha ekibinin ulaşması 2 saatten uzun sürüyor. Kablo hırsızlığı veya arızada kesinti bu yüzden uzar; Eskişehir ve Konya için bölgesel saha ortağı önerilir (R21, R22).' +
        (noFire ? ' ' + noFire + ' yol kenarı lokasyonunda OpenStreetMap\'te 30 km içinde kayıtlı itfaiye yok.' : ''),
      siteNote: 'Bu yer gerçektir; Akımyolu\'nun buradaki üniteleri kurgusaldır.',
      logNote: '→ cihazdan merkeze · ← merkezden cihaza · ! senaryo olayı. Mor satırlar ikizin kendi komutlarıdır (Seviye 3), mavi satırlar yöneticinin. Mesaj adları OCPP 1.6J standardından alınmıştır.',
      hqLead: (m2, floors, n) => 'Ankara\'daki merkez: ' + m2 + ' m² arsa, ' + floors + ' katlı bina, ' + n + ' personel. Noktalar odadaki çalışanları gösterir. Bir olay senaryosu çalışırken yangın, elektrik kesintisi ve etkilenen odalar planda görünür.',
      hqWhere: '<b>Konum:</b> Merkez tesis Ankara OSTİM OSB\'de temsili bir parseldir (koordinat gerçektir, bina kurgusaldır).',
      uyumNote: 'Not: EPDK yönetmeliği standardın "güncel sürümünü" istiyor. Güncel sürüm 2022\'dir; 2013 sürümünün geçiş süresi Ekim 2025\'te sona erdi.',
      insuranceNote: 'Sigorta kontrolün yerine geçmez. Siber poliçeler çok faktörlü doğrulama ve yedekleme şartı koşar; şart yerine getirilmemişse hasar ödenmeyebilir (R37). EPDK ve KVKK idari para cezaları çoğu poliçede kapsam dışıdır. 2026\'da KVKK\'nın veri güvenliği ihlali cezası 256.357 TL ile 17.092.242 TL arasındadır.'
    },
    // Haritadaki hızlı geçiş düğmeleri
    mapViews: {
      ANK: { label: 'Ankara', center: [32.80, 39.94], zoom: 10.6 },
      ESK: { label: 'Eskişehir', center: [30.515, 39.775], zoom: 12.3 },
      KON: { label: 'Konya', center: [32.49, 37.885], zoom: 11.8 }
    }
  };

  // Şarj ünitesi modelleri. Üretici adları kurgusaldır; güç ve süre değerleri piyasa ortalamalarına yakındır.
  SK.models = {
    'AC22-A': { label: 'AC 22 kW', vendor: 'Üretici A', kind: 'AC', kw: 22, avgKw: 7, meanMin: 150, ocpp: '1.6J', profile: 1, fw: '2.3.1', ble: true, connectors: 2 },
    'DC60-B': { label: 'DC 60 kW', vendor: 'Üretici B', kind: 'DC', kw: 60, avgKw: 36, meanMin: 38, ocpp: '1.6J', profile: 2, fw: '4.1.0', ble: false, connectors: 2 },
    'DC120-C': { label: 'DC 120 kW', vendor: 'Üretici C', kind: 'DC', kw: 120, avgKw: 55, meanMin: 33, ocpp: '2.0.1', profile: 2, fw: '1.8.2', ble: false, connectors: 2 },
    'DC180-D': { label: 'DC 180 kW', vendor: 'Üretici D', kind: 'DC', kw: 180, avgKw: 75, meanMin: 30, ocpp: '2.0.1', profile: 3, fw: '3.2.0', ble: false, connectors: 2 }
  };

  SK.profiles = {
    1: { label: 'Profil 1', desc: 'Şifresiz bağlantı (ws://) + temel parola', weak: true },
    2: { label: 'Profil 2', desc: 'TLS şifreleme + temel parola', weak: false },
    3: { label: 'Profil 3', desc: 'TLS + cihaz sertifikası (karşılıklı kimlik doğrulama)', weak: false }
  };

  SK.siteTypes = {
    AVM: { label: 'AVM otoparkı', units: ['AC22-A', 'AC22-A', 'DC60-B'], link: 'host', host: 'AVM yönetimi', demand: 1.1 },
    Otel: { label: 'Otel otoparkı', units: ['AC22-A', 'AC22-A'], link: 'apn', host: 'Otel işletmesi', demand: 0.8 },
    Plaza: { label: 'İş merkezi otoparkı', units: ['AC22-A', 'AC22-A'], link: 'host', host: 'İş merkezi yönetimi', demand: 0.9 },
    Belediye: { label: 'Belediye otoparkı', units: ['AC22-A', 'AC22-A'], link: 'apn', host: 'Belediye', demand: 1.0 },
    Akaryakıt: { label: 'Akaryakıt istasyonu', units: ['DC120-C', 'DC120-C'], link: 'apn', host: 'Akaryakıt bayisi', demand: 1.0 },
    Otoyol: { letter: 'Y', label: 'Yol kenarı tesis', units: ['DC180-D', 'DC180-D', 'DC180-D', 'DC180-D'], link: 'apn', host: 'Tesis işletmesi', demand: 1.2 }
  };

  SK.links = {
    apn: { label: 'Özel APN (4G modem + SIM)' },
    host: { label: 'Ev sahibinin yerel ağı (kablolu)' }
  };

  SK.cityNames = { ANK: 'Ankara', ESK: 'Eskişehir', KON: 'Konya', YOL: 'Yol kenarı' };

  // Şematik yedek harita (internet yokken). viewBox 1000 × 640; yönler doğru, mesafeler ölçekli değil.
  SK.geo = {
    cities: [
      { id: 'ESK', name: 'Eskişehir', x: 250, y: 250, r: 78 },
      { id: 'ANK', name: 'Ankara', x: 700, y: 215, r: 118 },
      { id: 'KON', name: 'Konya', x: 600, y: 525, r: 86 }
    ],
    roads: [
      { name: 'Eskişehir – Ankara yolu', pts: [[250, 250], [380, 305], [520, 272], [640, 222], [700, 215]] },
      { name: 'Ankara – Konya yolu', pts: [[700, 215], [716, 292], [684, 392], [642, 457], [600, 525]] }
    ],
    roadside: { 'Sivrihisar': [380, 305], 'Polatlı': [520, 272], 'Gölbaşı': [716, 300], 'Kulu': [684, 392] },
    hq: { x: 645, y: 122, label: 'Merkez tesis' },
    cloud: { x: 905, y: 70, label: 'Bulut CSMS', sub: 'OCPP · uygulama · ödeme' },
    vendors: { label: 'Tedarikçiler', sub: 'üretici · bakım · roaming' },
    roadLabels: [[418, 262, 'middle'], [726, 432, 'start']],
    roadsideRight: ['Kulu', 'Gölbaşı']
  };

  // Merkez tesis: OSTİM OSB'de temsili bir parsel. Ölçüler metre cinsindendir.
  SK.hq = {
    plot: { w: 50, h: 30, m2: 1500 },
    building: { x: 14, y: 5, w: 30, h: 20, m2: 600, floors: 2, indoorM2: 1200 },
    title: 'Merkez tesis', buildingLabel: 'Merkez bina', defaultFloor: 'kat1', defaultRoom: 'sunucu', entrance: [0.2, 11.4],
    // Odalara bağlı riskler (oda kimliği → risk numaraları)
    roomRisks: {
      noc: ['R01', 'R31'], cagri: ['R07', 'R34'], sunucu: ['R02', 'R25', 'R28'], bg: ['R36', 'R12'],
      yazilim: ['R18', 'R31'], muhasebe: ['R02', 'R30'], yonetim: ['R33', 'R37'], satis: ['R20'],
      depo: ['R21'], atolye: ['R03', 'R05'], teknik: ['R28'], saha: ['R19']
    },
    parkSlots: { servis: [4, 4], otopark: [10, 5] },
    security: [
      'Arsa çevresi çitli, tek araç ve yaya girişi, 7/24 güvenlik kulübesi',
      '6 çevre kamerası (koyu noktalar, görüş alanları açık renkte)',
      'Binaya kartlı geçiş; sunucu odası, teknik oda ve operasyon merkezine kart + giriş kaydı',
      'Jeneratör ve elektrik panosu bina dışında, kilitli kabinde',
      'Test şarj noktaları servis araçlarını da şarj eder; firmware testleri burada yapılır'],
    securityNote: 'Sunucu odası sel riskine karşı 1. kata yerleştirildi.',
    stats: [['Personel', null, '3 vardiyalı operasyon'], ['Servis aracı', '4', '8 saha teknisyeni']],
    sitePlan: [
      { id: 'kapi', label: 'Araç ve yaya girişi', x: 0, y: 12, w: 2, h: 6, kind: 'gate' },
      { id: 'kulube', label: 'Güvenlik kulübesi', x: 3, y: 8, w: 4, h: 3.5, kind: 'room' },
      { id: 'servis', label: 'Servis aracı otoparkı (4)', x: 3, y: 1, w: 10, h: 6, kind: 'park' },
      { id: 'otopark', label: 'Personel ve ziyaretçi otoparkı (10)', x: 3, y: 19, w: 10, h: 10, kind: 'park' },
      { id: 'test', label: 'Test şarj noktaları (AC + DC)', x: 45, y: 5, w: 4, h: 7, kind: 'equip' },
      { id: 'jenerator', label: 'Jeneratör ve elektrik panosu', x: 45, y: 18, w: 4, h: 7, kind: 'equip' }
    ],
    cameras: [[1, 1], [1, 29], [49, 1], [49, 29], [14, 15], [44, 15]],
    floors: [
      {
        id: 'zemin', label: 'Zemin kat',
        rooms: [
          { id: 'depo', label: 'Yedek parça deposu', x: 0, y: 0, w: 12, h: 12, access: 'Kartlı', assets: ['Yedek şarj modülleri ve kablolar', 'Arızalı cihaz rafları', 'Depo bilgisayarı'] },
          { id: 'atolye', label: 'Atölye ve test laboratuvarı', x: 12, y: 0, w: 10, h: 12, access: 'Kartlı', assets: ['Test tezgahı ve EV emülatörü', 'Firmware test ağı', 'Kalibrasyon cihazları'] },
          { id: 'teknik', label: 'Teknik oda (UPS, pano)', x: 22, y: 0, w: 8, h: 6, access: 'Kartlı + kayıtlı', assets: ['UPS', 'Ana elektrik panosu', 'Bina ağ anahtarı'] },
          { id: 'saha', label: 'Saha ekibi odası', x: 22, y: 6, w: 8, h: 6, access: 'Kartlı', assets: ['Saha dizüstü bilgisayarları', 'Servis anahtarları', 'Bakım tableti'] },
          { id: 'giris', label: 'Giriş ve resepsiyon', x: 0, y: 12, w: 10, h: 8, access: 'Herkes', assets: ['Ziyaretçi kayıt bilgisayarı', 'Kamera kayıt ekranı'] },
          { id: 'dinlenme', label: 'Soyunma ve dinlenme', x: 10, y: 12, w: 8, h: 8, access: 'Personel', assets: [] },
          { id: 'merdiven0', label: 'Merdiven', x: 18, y: 12, w: 4, h: 8, access: 'Personel', assets: [], minor: true },
          { id: 'egitim', label: 'Eğitim salonu', x: 22, y: 12, w: 8, h: 8, access: 'Personel', assets: ['Projeksiyon', 'Misafir Wi-Fi erişim noktası'] }
        ]
      },
      {
        id: 'kat1', label: '1. kat',
        rooms: [
          { id: 'noc', label: 'Operasyon merkezi (7/24)', x: 0, y: 0, w: 10, h: 9, access: 'Kartlı + kayıtlı', assets: ['CSMS yönetim konsolları', 'Video duvarı', 'Uzaktan komut yetkisi'] },
          { id: 'cagri', label: 'Çağrı merkezi', x: 10, y: 0, w: 10, h: 9, access: 'Kartlı', assets: ['Çağrı merkezi yazılımı', 'Müşteri kayıtları ekranı', 'Ses kayıt sistemi'] },
          { id: 'sunucu', label: 'Sunucu odası', x: 20, y: 0, w: 5, h: 6, access: 'Kartlı + kayıtlı', assets: ['Dosya sunucusu', 'Muhasebe/ERP sunucusu', 'Yedekleme cihazı', 'Güvenlik duvarı'] },
          { id: 'bg', label: 'Bilgi güvenliği', x: 25, y: 0, w: 5, h: 6, access: 'Kartlı + kayıtlı', assets: ['Kayıt izleme (SIEM) konsolu', 'Sertifika yönetimi'] },
          { id: 'yazilim', label: 'Yazılım ve DevOps', x: 20, y: 6, w: 10, h: 8, access: 'Kartlı', assets: ['Geliştirici bilgisayarları', 'Bulut yönetici hesapları', 'Kaynak kod deposu erişimi'] },
          { id: 'koridor', label: 'Koridor', x: 0, y: 9, w: 20, h: 2, access: 'Personel', assets: [], minor: true },
          { id: 'yonetim', label: 'Yönetim', x: 0, y: 11, w: 8, h: 9, access: 'Kartlı', assets: ['Yönetici dizüstü bilgisayarları', 'Sözleşme arşivi'] },
          { id: 'muhasebe', label: 'Muhasebe ve finans', x: 8, y: 11, w: 6, h: 9, access: 'Kartlı', assets: ['Muhasebe bilgisayarları', 'Banka ve ödeme ekranları'] },
          { id: 'satis', label: 'Satış ve lokasyon', x: 14, y: 11, w: 6, h: 9, access: 'Kartlı', assets: ['Ev sahibi sözleşmeleri', 'CRM erişimi'] },
          { id: 'toplanti', label: 'Toplantı odası', x: 20, y: 14, w: 10, h: 6, access: 'Personel', assets: ['Misafir Wi-Fi erişim noktası'] }
        ]
      }
    ]
  };

  // Yöntem ekranı için Akımyolu'na özgü veri kökeni, sektör boşluğu ve kaynaklar
  SK.company.yontem = {
    gap: [
      '23 Mart 2026\'da yayımlanan yönetmelik değişikliğiyle şarj ağı işletmecilerinin yazılım sistemleri, şarj cihazları ve uzaktan erişim altyapısının TS ISO/IEC 27001\'e uygun olması zorunlu hale geldi. Mevcut lisans sahiplerine 1 yıl süre tanındı.',
      'Genel amaçlı açık kaynak GRC araçları (ör. CISO Assistant) ISO 27001 belgelerini yönetir ama şarj cihazlarını, OCPP\'yi ve EPDK yükümlülüklerini bilmez, olayları bir ikiz üzerinde canlandırmaz. İngiltere\'deki CyberTWIN-EV projesi şarj altyapısı için siber dijital ikiz geliştiriyor ancak ISO 27001 belgelendirmesine ve Türkiye mevzuatına yönelik değil.'],
    revenue: () => 'AC ' + SK.fmt.n2(SK.company.prices.AC) + ', DC ' + SK.fmt.n2(SK.company.prices.DC) + ' TL/kWh',
    provenance: () => [
    ['Lokasyon konumları (38 yer)', 'Gerçek', 'OpenStreetMap kayıtları; her lokasyonun OSM bağlantısı ayrıntı panelinde'],
    ['Diğer işletmecilerin şarj noktaları', 'Gerçek', 'OpenStreetMap\'te 3 ilde etiketli ' + (SK.osmChargers ? SK.osmChargers.length : 0) + ' nokta'],
    ['Merkezden sürüş süreleri ve en yakın itfaiye', 'Gerçek', 'OpenStreetMap yol ağı üzerinde OSRM; itfaiyeler Overpass API ile (8 Ekim 2026)'],
    ['Pazar büyüklüğü ve büyüme', 'Gerçek', 'EPDK aylık istatistikleri, Ocak–Ağustos 2026'],
    ['Şarj fiyatları', 'Gerçek', '11 işletmecinin Eylül 2026 tarifesi; Akımyolu medyanı kullanıyor'],
    ['Talep (oturum, kWh, saatlik ve günlük profil)', 'Gerçeğe kalibre', 'EPDK Ağustos 2026 ortalamaları; Sektör verileri ekranında karşılaştırma'],
    ['Yasal yükümlülükler ve cezalar', 'Gerçek', 'Resmî Gazete, KVKK 2026 tutarları, 7545 sayılı Kanun'],
    ['Gerçek saldırı örnekleri', 'Gerçek', 'M11 (2022), Pwn2Own Automotive, kablo hırsızlığı'],
    ['Şirket, personel, bina planı', 'Kurgusal', 'Akımyolu A.Ş. temsilidir; merkez koordinatı gerçek (OSTİM OSB)'],
    ['Risk olasılık ve kayıp tutarları', 'Varsayım', 'Sektör bilgisine dayalı tahmin; gerçek şirkette olay kayıtlarıyla güncellenir'],
    ['Kontrol maliyetleri', 'Varsayım', 'Piyasa tahmini; gerçek tekliflerle güncellenir']
    ],
    sources: [
    ['Mevzuat', 'Şarj Hizmeti Yönetmeliğinde Değişiklik, Resmî Gazete 23.03.2026, sayı 33202', 'https://www.resmigazete.gov.tr/eskiler/2026/03/20260323-4.htm'],
    ['Mevzuat', 'AND Belgelendirme: Şarj işletmecilerine ISO 27001 zorunluluğu', 'https://andbelgelendirme.com/sarj-hizmeti-yonetmeliginde-degisiklik-kuruluslara-iso-27001-zorunlulugu/'],
    ['Mevzuat', 'Erdem & Erdem: Siber Güvenlik Kanunu 101 (7545)', 'https://www.erdem-erdem.av.tr/bilgi-bankasi/siber-guvenlik-kanunu-101'],
    ['Mevzuat', 'Cottgroup: 2026 KVKK idari para cezaları', 'https://cottgroup.com/tr/mevzuat/item/yeniden-degerleme-oranina-gore-2026-yili-kvkk-idari-para-cezalari'],
    ['Pazar', 'Foreks: Ağustos 2026 şarj tüketimi ve işlem sayısı (EPDK)', 'https://www.foreks.com/haber/detay/6aafbdce24008d7d43734305/FRKS/tr/agustos-2026-da-elektrikli-arac-sarj-tuketimi-97469-mwh-a-ulasti-20-09-26/'],
    ['Pazar', 'Yeşil Haber: EPDK Ağustos 2026 şarj verileri', 'https://yesilhaber.net/epdk-agustos-2026-sarj-verileri/'],
    ['Pazar', 'Beefull: EPDK Şubat, Mart, Nisan 2026 istatistikleri', 'https://beefull.com/blog/epdk-mart-2026-elektrikli-arac-ve-sarj-hizmeti-piyasasi-istatistikleri'],
    ['Pazar', 'Uzmanpara: Mayıs 2026 soket ve tüketim verisi', 'https://uzmanpara.milliyet.com.tr/uzmanpara/sarj-soket-sayisi-mayista-44-bini-asti-7607542'],
    ['Pazar', 'Alomaliye: Haziran ve Temmuz 2026 verileri', 'https://www.alomaliye.com/2026/08/20/elektrikli-arac-sayisi-465-bine-yaklasti/amp/'],
    ['Pazar', 'DonanımHaber: Şarj fiyat listesi (21 Eylül 2026)', 'https://www.donanimhaber.com/elektrik-arac-sarj-istasyonlari-fiyat-listesi--191391'],
    ['Pazar', 'Yeni Ankara: Ankara\'da şarj altyapısı (11 Eylül 2026)', 'https://www.yeniankara.com.tr/ankara/ankarada-elektrikli-arac-sarj-altyapisi-ne-durumda-182395'],
    ['Harita', 'OpenStreetMap katkıcıları (ODbL): lokasyonlar ve diğer şarj noktaları', 'https://www.openstreetmap.org/copyright'],
    ['Harita', 'CARTO Dark Matter altlığı ve Esri uydu görüntüsü', 'https://carto.com/attributions'],
    ['Harita', 'OSRM: OpenStreetMap yol ağı üzerinde merkezden sürüş süreleri', 'https://project-osrm.org/'],
    ['Harita', 'Overpass API: OpenStreetMap itfaiye kayıtları (30 istasyon)', 'https://wiki.openstreetmap.org/wiki/Overpass_API'],
    ['Tehdit', 'Jalopnik: Rusya M11 otoyolundaki şarj cihazlarının ele geçirilmesi (2022)', 'https://jalopnik.com/russian-company-outsourced-the-main-components-in-ev-ch-1848603252'],
    ['Tehdit', 'Open Charge Alliance: Pwn2Own Automotive 2026', 'https://openchargealliance.org/oca-at-pwn2own-automotive-2026-in-tokyo/'],
    ['Tehdit', 'NCC Group: Pwn2Own Automotive 2024\'te şarj cihazı istismarı', 'https://nccgroup.com/au/research-blog/44con-charging-ahead-exploiting-an-ev-charger-controller-at-pwn2own-automotive-2024'],
    ['Tehdit', 'DonanımHaber: Şarj istasyonlarında bakır kablo hırsızlığı', 'https://www.donanimhaber.com/elektrikli-arac-sarj-istasyonlarinda-bakir-kablo-hirsizligi-krizi--195724'],
    ['Benzer çalışma', 'TechWorks: CyberTWIN-EV projesi (İngiltere)', 'https://techworks.org.uk/cybertwin-ev-powering-through-digital-twins-and-cyber-resilience-for-secure-mobility/'],
    ['Benzer çalışma', 'Help Net Security: CISO Assistant açık kaynak GRC aracı', 'https://www.helpnetsecurity.com/2026/01/14/ciso-assistant-open-source-cybersecurity-management-grc/']
    ]
  };

  SK.personnel = [
    { role: 'Genel müdür', n: 1, room: 'yonetim', shift: 'Gündüz' },
    { role: 'Operasyon müdürü', n: 1, room: 'yonetim', shift: 'Gündüz' },
    { role: 'İK ve idari işler', n: 1, room: 'yonetim', shift: 'Gündüz' },
    { role: 'Bilgi güvenliği sorumlusu', n: 1, room: 'bg', shift: 'Gündüz, nöbetçi' },
    { role: 'Operasyon merkezi operatörü', n: 6, room: 'noc', shift: '3 vardiya × 2 kişi' },
    { role: 'Çağrı merkezi temsilcisi', n: 7, room: 'cagri', shift: '3 vardiya' },
    { role: 'Yazılım geliştirici', n: 4, room: 'yazilim', shift: 'Gündüz' },
    { role: 'Sistem ve DevOps yöneticisi', n: 2, room: 'yazilim', shift: 'Gündüz, nöbetçi' },
    { role: 'Muhasebe ve finans uzmanı', n: 2, room: 'muhasebe', shift: 'Gündüz' },
    { role: 'Satış ve lokasyon sorumlusu', n: 2, room: 'satis', shift: 'Gündüz, sahada' },
    { role: 'Saha teknisyeni', n: 8, room: 'saha', shift: '2 vardiya, 4 servis aracı' },
    { role: 'Test mühendisi', n: 1, room: 'atolye', shift: 'Gündüz' },
    { role: 'Depo sorumlusu', n: 2, room: 'depo', shift: 'Gündüz' },
    { role: 'Güvenlik görevlisi', n: 2, room: 'giris', shift: '2 vardiya' }
  ];
})(window.SK);
