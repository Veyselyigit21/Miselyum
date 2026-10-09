/* Kıvılcım şirket paketi: kurgusal yerli elektrikli otomobil üreticisi. Miselyum'un her sektöre uyduğunu göstermek için
   Akımyolu ile aynı motorla çalışır; yalnız veri değişir. Konumlar OpenStreetMap'teki gerçek yerlerdir (Photon, 8 Ekim 2026);
   şirket, tesis planı, istasyonlar, personel, risk tutarları ve kontrol maliyetleri kurgusal ve varsayımdır.
   Bu paket yalnızca Kıvılcım seçiliyken (SK.tenantId === 'kivilcim') veriyi değiştirir. */
(function (SK) {
  'use strict';
  if (SK.tenantId !== 'kivilcim') return;

  let vinSeq = 3800;
  const vin = () => 'KVL0E' + String(++vinSeq).padStart(12, '0');

  SK.company = {
    name: 'Kıvılcım Otomotiv Teknolojileri A.Ş.',
    short: 'Kıvılcım',
    disclaimer: 'Kıvılcım kurgusal bir şirkettir. Konumlar OpenStreetMap\'teki gerçek yerlerdir; bu yerlerdeki Kıvılcım tesisleri, istasyonları ve personeli kurgusaldır.',
    license: 'Araç üreticisi (tip onayı)',
    seed: 20261008,
    employees: 1450,
    appUsers: 42000,
    hqCity: 'Kocaeli',
    revenueMode: 'job',          // değer, hat sonunda biten her araçta yazılır
    unitPrefix: 'KVL-',
    assetNoun: 'üretim ve servis cihazı',
    impactScale: [5e6, 20e6, 80e6, 300e6],   // büyük sanayi şirketi: etki eşikleri daha yüksek
    prices: {},
    hourCurve: [0.01, 0.008, 0.006, 0.005, 0.005, 0.008, 0.02, 0.06, 0.07, 0.07, 0.07, 0.06,
                0.05, 0.065, 0.07, 0.07, 0.068, 0.062, 0.058, 0.055, 0.05, 0.045, 0.03, 0.015],
    dayFactor: [1, 1, 1, 1, 1, 0.55, 0.15],
    startDate: new Date(2026, 9, 7),
    sessionsPerDay: { URETIM: 55, LOJ: 40, ARGE: 8, BT: 30, SERVIS: 6, SARJ: 6 },
    faultPerConnectorDay: 1 / 30,
    kindNames: { URETIM: 'üretim', LOJ: 'lojistik', ARGE: 'Ar-Ge', BT: 'bilişim', SERVIS: 'servis', SARJ: 'şarj' },
    errors: ['RobotCollision', 'SafetyDoorOpen', 'TorqueOutOfRange', 'VisionCheckFailed', 'PLCWatchdog'],
    stateLabels: { Available: 'Boşta', Charging: 'Çalışıyor', Faulted: 'Arızalı', Unavailable: 'Olaydan etkilenen', Offline: 'Çevrimdışı' },
    hideViews: ['sektor'],
    terms: {
      endpoint: 'istasyon', unit: 'cihaz', site: 'tesis', sites: 'tesis', hqLabel: 'Kontrol merkezi · TOSB',
      busy: 'Çalışıyor', busyCount: 'istasyon', onlineLabel: 'Çevrimiçi istasyon', busyLabel: 'Şu an çalışan',
      revenueLabel: 'Bugünkü üretim değeri', energyNote: 'kWh tüketim', protocol: 'OPC UA', logTitle: 'OT olay akışı (OPC UA)',
      unitTitle: 'Cihaz ve istasyon', endpointTitle: 'İstasyon', hostLabel: 'Yer', weakNote: 'temel koruma', profileTitle: 'IEC 62443 güvenlik seviyesi',
      loadTitle: 'Tesis yükü', hourlyTitle: 'Bugünün saatlik üretim değeri', hourlySeries: 'Saatlik üretim değeri', stateTitle: 'İstasyon durumları',
      revenueTitle: 'Beklenen üretim değeri', allUnits: 'Tüm üretim ve servis cihazları',
      lossNote: 'Üretim kaybı ikizdeki istasyonların beklenen üretim değerinden hesaplanır'
    },
    messages: {
      start: (c, s) => 'OPC UA Write ' + c.unitId + '.Is.Basla {iş:' + s.id + ', VIN:"' + vin() + '"}',
      stop: (c, s) => 'OPC UA Event ' + c.unitId + '.Is.Bitti {iş:' + s.id + ', enerji:' + Math.round(s.kwh * 10) / 10 + ' kWh}',
      meter: (c, s) => 'OPC UA DataChange ' + c.unitId + '.Guc {kW:' + Math.round(s.kw) + '}',
      fault: (c, err) => 'OPC UA Alarm ' + c.unitId + ' {önem:"Yüksek", kod:"' + err + '"}',
      recover: c => 'OPC UA Alarm ' + c.unitId + ' {durum:"Temizlendi"}',
      heartbeat: () => 'OPC UA KeepAlive {}',
      boot: ['MES', 'OPC UA CreateSession {istemci:"MES", güvenlik:"SignAndEncrypt"}'],
      restore: n => 'OPC UA Reconnect ×' + n + ' (istasyonlar yeniden devreye alındı)'
    },
    ui: {
      heroEyebrow: 'kurgusal şirket, gerçek konumlar',
      heroTitle: ['Bir otomobil fabrikasının siber güvenliğini ', 'dijital ikizi', ' üzerinde deniyoruz.'],
      heroLead: 'Miselyum; Kıvılcım\'ın TOSB\'deki üretim tesisini, robot hücrelerinden hat sonu yazılım yüklemesine kadar 51 istasyonu, Ar-Ge merkezini, batarya deposunu ve 6 servis noktasını canlı simüle eder. Akımyolu ile aynı motor, farklı şirket paketi.',
      deadline: { date: [2027, 5, 30], label: 'UNECE R155 sertifika yenileme denetimine', text: 'Araç tip onayı için zorunlu siber güvenlik yönetim sistemi (CSMS) sertifikasının yenileme denetimi 30 Haziran 2027\'de (kurgusal plan). R155, AB\'de Temmuz 2024\'ten beri satılan bütün yeni araçlar için zorunlu.' },
      planNote: 'Faz 1, CSMS yenileme denetiminden önce bitecek plandır.',
      faz1When: 'Haziran 2027', faz2When: 'Aralık 2027',
      readyNote: 'UNECE R155/R156, ISO/SAE 21434, TISAX, IEC 62443, KVKK',
      level2: 'Fabrikadaki PLC ve robotlar OPC UA ile bağlanır; istasyon durumları ikize kendiliğinden akar.',
      level3: 'İkiz hatta komut da gönderir; örneğin şüpheli bir yazılım paketinde hat sonu istasyonunu güvenle durdurur.',
      twinNote: 'Konumlar OpenStreetMap\'teki gerçek yerler (TOSB, Teknopark İstanbul, AVM\'ler); şirket, tesis planı ve istasyonlar kurgusal.',
      sahaLead: n => 'Kıvılcım\'ın ' + n + ' tesisi gerçek harita üzerinde: üretim tesisi, Ar-Ge merkezi, depo ve servis noktaları. Halkadaki dilimler istasyonları ve anlık durumlarını gösterir.',
      sahaHelp: [
        '<b>Harita:</b> Halkalar Kıvılcım\'ın tesisleridir (yeşil boşta, mavi çalışıyor, sarı arızalı, kırmızı olaydan etkilenen). F fabrika, A Ar-Ge, D depo, S showroom ve servis.',
        '<b>Üst düğmeler:</b> İl geçişi, harita altlığı (açık, koyu, uydu) ve 3B binalar.',
        '<b>Grafikler:</b> Tesis yükü, saatlik üretim değeri ve istasyon durumları. Değer, hat sonunda biten her araçta yazılır.',
        '<b>OT olay akışı:</b> İstasyonların üretim yürütme sistemine (MES) gönderdiği OPC UA olayları.'],
      sahaCallout: st => st.byProfile[1] + ' cihaz yalnız temel korumada (IEC 62443 SL 1): kaynak robotları, AGV\'ler ve depo batarya izleme. Ofis ağından OT\'ye geçen bir fidye yazılımı hattı durdurabilir (K01, K14). ',
      responseNote: null,
      siteNote: 'Bu yer gerçektir; Kıvılcım\'ın buradaki tesisi ve cihazları kurgusaldır.',
      logNote: '→ cihazdan merkeze · ← merkezden cihaza · ! senaryo olayı. Mesajlar OPC UA adlandırmasına benzetilmiştir.',
      hqLead: (m2, floors, n) => 'TOSB\'deki üretim tesisi: ' + m2 + ' m² arsa, ' + floors + ' katlı fabrika binası, vardiya başına ' + n + ' kişi. Noktalar odadaki çalışanları gösterir; olaylar planda canlanır.',
      hqWhere: '<b>Konum:</b> Tesis Kocaeli Çayırova\'daki TOSB OSB\'de temsili bir parseldir (koordinat gerçektir, bina kurgusaldır).',
      uyumNote: 'Not: UNECE R155 (siber güvenlik) ve R156 (yazılım güncelleme), AB\'de Temmuz 2024\'ten beri satılan bütün yeni araçlar için zorunludur; ISO/SAE 21434 bu sistemin mühendislik standardıdır.',
      insuranceNote: 'Sigorta kontrolün yerine geçmez. Siber poliçeler OT kaynaklı üretim kaybını çoğu zaman sınırlı teminat ve uzun bekleme süresiyle karşılar; araç geri çağırma maliyeti ayrı poliçe ister ve tip onayı yaptırımları sigortalanamaz.'
    },
    mapViews: {
      IST: { label: 'İstanbul', center: [29.08, 41.03], zoom: 10.2 },
      KOC: { label: 'Kocaeli', center: [29.47, 40.85], zoom: 11.2 }
    },
    yontem: {
      gap: [
        'Bir otomobil üreticisi aynı anda üç dünyayı korur: fabrika (OT: robot, PLC, AGV), kurumsal BT ve sahadaki araçlar (OTA, bağlı araç). UNECE R155 ve R156 tip onayı için siber güvenlik ve yazılım güncelleme yönetim sistemi şartı koyar.',
        'Akımyolu için kurulan Miselyum motoru bu şirkete kod değişmeden, yalnız şirket paketi yazılarak uyarlandı: kat planı, istasyonlar, riskler, önlemler, senaryolar ve mevzuat.'],
      revenue: () => 'hat sonunda biten her araç için 650 bin TL katma değer varsayımı',
      provenance: [
        ['Tesis konumları (9 yer)', 'Gerçek', 'OpenStreetMap kayıtları (Photon ile 8 Ekim 2026): TOSB, Teknopark İstanbul, Gebze Makine İhtisas OSB ve 6 AVM'],
        ['Gerçek olay örnekleri', 'Gerçek', 'Jaguar Land Rover (2025), Toyota (2022), Honda (2020), Jeep Cherokee (2015)'],
        ['Mevzuat ve standartlar', 'Gerçek', 'UNECE R155 ve R156, ISO/SAE 21434, TISAX (VDA ISA), IEC 62443, KVKK'],
        ['Şirket, tesis planı, istasyonlar, personel', 'Kurgusal', 'Kıvılcım A.Ş. temsilidir; TOSB koordinatı gerçek'],
        ['Üretim ve değer modeli', 'Varsayım', 'İki vardiya, iki hat sonu istasyonu, araç başına 650 bin TL katma değer'],
        ['Risk olasılık ve kayıp tutarları', 'Varsayım', 'Sektör olaylarından ölçeklenmiş tahmin'],
        ['Kontrol maliyetleri', 'Varsayım', 'Büyük sanayi şirketi ölçeğinde piyasa tahmini']
      ],
      sources: [
        ['Mevzuat', 'UNECE R155: siber güvenlik ve siber güvenlik yönetim sistemi', 'https://unece.org/transport/documents/2021/03/standards/un-regulation-no-155-cyber-security-and-cyber-security'],
        ['Mevzuat', 'UNECE R156: yazılım güncellemesi ve yazılım güncelleme yönetim sistemi', 'https://unece.org/transport/documents/2021/03/standards/un-regulation-no-156-software-update-and-software-update'],
        ['Standart', 'ISO/SAE 21434: Karayolu araçları, siber güvenlik mühendisliği', 'https://www.iso.org/standard/70918.html'],
        ['Standart', 'ENX: TISAX (otomotiv bilgi güvenliği değerlendirmesi)', 'https://enx.com/tisax/'],
        ['Standart', 'ISA/IEC 62443: endüstriyel otomasyon ve kontrol sistemleri güvenliği', 'https://www.isa.org/standards-and-publications/isa-standards/isa-iec-62443-series-of-standards'],
        ['Harita', 'OpenStreetMap katkıcıları (ODbL)', 'https://www.openstreetmap.org/copyright'],
        ['Tehdit', 'Jaguar Land Rover, 2025: siber saldırı üretimi haftalarca durdurdu', null],
        ['Tehdit', 'Toyota, 2022: tedarikçi Kojima Industries\'e saldırı üretimi bir gün durdurdu', null],
        ['Tehdit', 'Chrysler, 2015: Jeep Cherokee uzaktan ele geçirme gösterimi, 1,4 milyon araç geri çağrıldı', null]
      ]
    }
  };

  // İstasyon ve cihaz modelleri. Üretici adları kurgusaldır. kw: kurulu güç, avgKw: çalışırken ortalama, meanMin: iş süresi
  SK.models = {
    KAYNAK: { label: 'Kaynak robot hücresi', vendor: 'Robot üreticisi A', kind: 'URETIM', kw: 120, avgKw: 65, meanMin: 6, protocol: 'PROFINET · OPC UA', profile: 1, fw: '8.4.2', connectors: 1, owner: 'Üretim direktörü' },
    BOYA: { label: 'Boya robotu', vendor: 'Robot üreticisi B', kind: 'URETIM', kw: 90, avgKw: 50, meanMin: 9, protocol: 'OPC UA', profile: 2, fw: '5.1.0', connectors: 1, owner: 'Üretim direktörü' },
    BATARYA: { label: 'Batarya montaj istasyonu', vendor: 'Otomasyon firması C', kind: 'URETIM', kw: 60, avgKw: 30, meanMin: 7, protocol: 'OPC UA', profile: 2, fw: '3.3.1', connectors: 1, owner: 'Üretim direktörü' },
    MONTAJ: { label: 'Son montaj istasyonu', vendor: 'Otomasyon firması C', kind: 'URETIM', kw: 25, avgKw: 12, meanMin: 5, protocol: 'OPC UA', profile: 2, fw: '3.3.1', connectors: 1, owner: 'Üretim direktörü' },
    EOL: { label: 'Hat sonu test ve yazılım yükleme', vendor: 'Kıvılcım iç yazılım', kind: 'URETIM', kw: 15, avgKw: 8, meanMin: 12, protocol: 'UDS / DoIP · OPC UA', profile: 2, fw: '2.6.0', connectors: 1, jobValue: 650000, note: 'araçlara ECU yazılımı yükler', owner: 'Kalite direktörü' },
    AGV: { label: 'Otonom taşıyıcı (AGV)', vendor: 'AGV üreticisi D', kind: 'LOJ', kw: 6, avgKw: 3, meanMin: 15, protocol: 'Wi-Fi · VDA 5050', profile: 1, fw: '2.0.7', connectors: 1, owner: 'Lojistik müdürü' },
    HIL: { label: 'HIL test tezgahı', vendor: 'Test sistemleri E', kind: 'ARGE', kw: 10, avgKw: 5, meanMin: 45, protocol: 'Ethernet · CAN', profile: 2, fw: '7.2.1', connectors: 1, owner: 'Ar-Ge direktörü' },
    OTA: { label: 'OTA güncelleme sunucusu', vendor: 'Kıvılcım iç yazılım', kind: 'BT', kw: 4, avgKw: 3, meanMin: 30, protocol: 'HTTPS · Uptane', profile: 3, fw: '1.9.4', connectors: 1, note: 'filoya imzalı paket dağıtır', owner: 'Yazılım direktörü' },
    PROTO: { label: 'Prototip veri istasyonu', vendor: 'Kıvılcım', kind: 'ARGE', kw: 2, avgKw: 1, meanMin: 60, protocol: 'Kurumsal ağ', profile: 2, fw: '—', connectors: 1, owner: 'Ar-Ge direktörü' },
    BMS: { label: 'Depo batarya izleme (BMS)', vendor: 'Batarya üreticisi F', kind: 'LOJ', kw: 3, avgKw: 2, meanMin: 30, protocol: 'Modbus TCP', profile: 1, fw: '4.0.2', connectors: 1, owner: 'Lojistik müdürü' },
    TESHIS: { label: 'Servis teşhis cihazı', vendor: 'Kıvılcım', kind: 'SERVIS', kw: 1, avgKw: 0.5, meanMin: 40, protocol: 'DoIP · HTTPS', profile: 2, fw: '3.1.0', connectors: 1, note: 'araç anahtarı eşleyebilir', owner: 'Satış sonrası müdürü' },
    DC: { label: 'Showroom hızlı şarj (120 kW)', vendor: 'Şarj üreticisi G', kind: 'SARJ', kw: 120, avgKw: 55, meanMin: 35, protocol: 'OCPP 2.0.1', profile: 3, fw: '3.2.0', connectors: 2, owner: 'Satış sonrası müdürü' }
  };

  SK.profiles = {
    1: { label: 'SL 1', desc: 'Temel koruma: kimlik doğrulama ve ağ ayrımı zayıf', weak: true },
    2: { label: 'SL 2', desc: 'Kimlik doğrulama, rol yetkisi ve olay kaydı', weak: false },
    3: { label: 'SL 3', desc: 'Şifreli iletişim, cihaz kimliği ve bütünlük denetimi', weak: false }
  };

  SK.siteTypes = {
    Fabrika: { letter: 'F', label: 'Üretim tesisi', units: ['KAYNAK', 'KAYNAK', 'KAYNAK', 'KAYNAK', 'BOYA', 'BOYA', 'BATARYA', 'BATARYA', 'BATARYA', 'MONTAJ', 'MONTAJ', 'MONTAJ', 'MONTAJ', 'EOL', 'EOL', 'AGV', 'AGV', 'AGV'], link: 'ot', host: 'Kıvılcım (kendi tesisi)', demand: 1 },
    ArGe: { letter: 'A', label: 'Ar-Ge ve yazılım merkezi', units: ['HIL', 'HIL', 'HIL', 'OTA', 'PROTO'], link: 'kurumsal', host: 'Teknopark (kiracı)', demand: 1 },
    Depo: { letter: 'D', label: 'Batarya ve parça deposu', units: ['AGV', 'AGV', 'BMS', 'BMS'], link: 'ot', host: 'Kıvılcım (kiralık depo)', demand: 1 },
    Servis: { letter: 'S', label: 'Showroom ve servis', units: ['TESHIS', 'TESHIS', 'DC'], link: 'bayi', host: 'AVM yönetimi (kiracı)', demand: 1 }
  };

  SK.links = {
    ot: { label: 'Fabrika OT ağı (PROFINET, OPC UA)' },
    kurumsal: { label: 'Kurumsal ağ ve bulut' },
    bayi: { label: 'Servis noktası ağı (VPN ile merkeze)' }
  };

  SK.cityNames = { KOC: 'Kocaeli', IST: 'İstanbul', ANK: 'Ankara', IZM: 'İzmir', BUR: 'Bursa', ANT: 'Antalya' };

  SK.geo = {
    cities: [
      { id: 'IST', name: 'İstanbul', x: 330, y: 170, r: 70 },
      { id: 'KOC', name: 'Kocaeli', x: 480, y: 205, r: 48 },
      { id: 'BUR', name: 'Bursa', x: 390, y: 335, r: 40 },
      { id: 'ANK', name: 'Ankara', x: 720, y: 300, r: 44 },
      { id: 'IZM', name: 'İzmir', x: 230, y: 470, r: 44 },
      { id: 'ANT', name: 'Antalya', x: 560, y: 565, r: 40 }
    ],
    roads: [
      { name: 'TEM / D-100', pts: [[330, 170], [405, 188], [480, 205]] },
      { name: 'Anadolu Otoyolu', pts: [[480, 205], [600, 252], [720, 300]] }
    ],
    roadLabels: [[405, 176, 'middle'], [600, 240, 'middle']],
    roadside: {},
    roadsideRight: [],
    hq: { x: 480, y: 112, label: 'Kontrol merkezi' },
    cloud: { x: 905, y: 70, label: 'Bulut ve OTA', sub: 'MES · PLM · OTA · bağlı araç' },
    vendors: { label: 'Tedarikçiler', sub: 'robot · batarya · yazılım' }
  };

  SK.realSites = [
    { poi: 'TOSB Otomotiv Yan Sanayi OSB', name: 'Kıvılcım Üretim Tesisi', lat: 40.851067, lon: 29.412862, osm: 'W603042818', street: '16. Yol', district: 'Şekerpınar, Çayırova', city: 'KOC', type: 'Fabrika' },
    { poi: 'Gebze Makine İhtisas OSB', name: 'Batarya ve Parça Deposu', lat: 40.838665, lon: 29.566242, osm: 'W229721941', street: '', district: 'Dilovası', city: 'KOC', type: 'Depo' },
    { poi: 'Teknopark İstanbul', name: 'Ar-Ge ve Yazılım Merkezi', lat: 40.918818, lon: 29.31216, osm: 'N11664747864', street: 'Teknopark Bulvarı', district: 'Pendik', city: 'IST', type: 'ArGe' },
    { poi: 'Vadistanbul AVM', name: 'Showroom ve servis · Vadistanbul', lat: 41.107385, lon: 28.987478, osm: 'W655013017', street: 'Azerbaycan Caddesi', district: 'Ayazağa, Sarıyer', city: 'IST', type: 'Servis' },
    { poi: 'Brandium AVM', name: 'Showroom ve servis · Brandium', lat: 40.982585, lon: 29.132466, osm: 'W866790438', street: 'Dudullu Caddesi', district: 'Kayışdağı, Ataşehir', city: 'IST', type: 'Servis' },
    { poi: 'Forum Gordion AVM', name: 'Showroom ve servis · Gordion', lat: 39.900385, lon: 32.691332, osm: 'W1498416042', street: 'Ankaralılar Caddesi', district: 'Koru', city: 'ANK', type: 'Servis' },
    { poi: 'İzmir Optimum AVM', name: 'Showroom ve servis · Optimum', lat: 38.337856, lon: 27.134816, osm: 'W402049604', street: 'Akçay Caddesi', district: 'Beyazevler, Gaziemir', city: 'IZM', type: 'Servis' },
    { poi: 'Korupark AVM', name: 'Showroom ve servis · Korupark', lat: 40.250712, lon: 28.957198, osm: 'N5316433984', street: 'Sanayi Caddesi', district: 'Emek, Osmangazi', city: 'BUR', type: 'Servis' },
    { poi: 'TerraCity AVM', name: 'Showroom ve servis · TerraCity', lat: 36.852484, lon: 30.757174, osm: 'W168667578', street: 'Tekelioğlu Caddesi', district: 'Fener, Muratpaşa', city: 'ANT', type: 'Servis' }
  ];
  SK.realHq = { name: 'TOSB Bölge Müdürlüğü', lat: 40.86869, lon: 29.408912 };
  SK.siteExtras = null;
  SK.osmChargers = null;

  // Üretim tesisi: 200 × 130 m arsa, 96 × 54 m fabrika binası (üretim holü + ofis ve kontrol katı). Ölçüler metre.
  SK.hq = {
    plot: { w: 200, h: 130, m2: 26000 },
    building: { x: 40, y: 30, w: 96, h: 54, m2: 5184, floors: 2, indoorM2: 8640 },
    scale: 2.3,   // kat planı yazı ölçeği (bina 96 m; küçük odalarda yazı taşmasın)
    title: 'Üretim tesisi', buildingLabel: 'Fabrika binası', defaultFloor: 'uretim', defaultRoom: 'eol', entrance: [0.8, 56],
    roomRisks: {
      kaynak: ['K04', 'K01'], boya: ['K01'], batarya: ['K09', 'K01'], teknik: ['K11', 'K04'], batdepo: ['K09'],
      montaj: ['K01', 'K12'], eol: ['K03', 'K08'], kalite: ['K03'], sevkiyat: ['K14'], giris: ['K22'],
      kontrol: ['K01', 'K18'], veri: ['K15', 'K10'], vsoc: ['K02', 'K07'], ota: ['K02', 'K13'], bg: ['K21', 'K24'],
      proto: ['K05', 'K16', 'K22'], yonetim: ['K19', 'K17'], satinalma: ['K12', 'K04'], ikfinans: ['K17', 'K16']
    },
    parkSlots: { otopark: [24, 8], stok: [30, 10] },
    sitePlan: [
      { id: 'kapi', label: 'Araç ve yaya girişi', x: 0, y: 58, w: 4, h: 16, kind: 'gate' },
      { id: 'kulube', label: 'Güvenlik ve ziyaretçi kabulü', x: 6, y: 46, w: 14, h: 9, kind: 'room' },
      { id: 'otopark', label: 'Personel otoparkı', x: 6, y: 80, w: 30, h: 42, kind: 'park' },
      { id: 'stok', label: 'Bitmiş araç sahası (sevkiyat bekleyen)', x: 40, y: 92, w: 62, h: 32, kind: 'park' },
      { id: 'pist', label: 'Sürüş ve hat sonu test pisti', x: 150, y: 18, w: 44, h: 66, kind: 'equip' },
      { id: 'trafo', label: 'Trafo merkezi ve jeneratör', x: 108, y: 92, w: 20, h: 14, kind: 'equip' },
      { id: 'karantina', label: 'Dış batarya karantina alanı', x: 132, y: 92, w: 20, h: 14, kind: 'equip' }
    ],
    cameras: [[2, 2], [2, 128], [198, 2], [198, 128], [40, 30], [136, 84], [150, 18]],
    security: [
      'Arsa çevresi çitli, tek araç ve yaya girişi, 7/24 güvenlik ve ziyaretçi kabulü',
      '7 çevre kamerası; prototip stüdyosu ve batarya alanları ayrıca kameralı',
      'Fabrika binasına turnikeli kartlı geçiş; EOL, veri merkezi, VSOC ve prototip stüdyosuna kart + kayıt',
      'Trafo merkezi ve jeneratör bina dışında, kilitli alanda',
      'Hasarlı bataryalar binadan uzakta dış karantina alanında bekletilir'],
    securityNote: 'Batarya stoğu yangın riskine karşı üretim holünden ayrı bölümde ve termal kamerayla izlenir.',
    stats: [['Vardiyada tesiste', null, 'iki vardiya'], ['Çalışan (toplam)', '1.450', 'bütün tesisler']],
    floors: [
      {
        id: 'uretim', label: 'Üretim holü',
        rooms: [
          { id: 'kaynak', label: 'Gövde kaynak hücreleri', x: 0, y: 0, w: 30, h: 24, access: 'Kartlı (hat)', assets: ['4 kaynak robot hücresi', 'Hücre PLC\'leri ve emniyet rölesi', 'Robot programlama paneli'] },
          { id: 'boya', label: 'Boyahane', x: 30, y: 0, w: 24, h: 24, access: 'Kartlı (hat)', assets: ['2 boya robotu', 'Fırın kontrol sistemi'] },
          { id: 'batarya', label: 'Batarya modül ve paket montajı', x: 54, y: 0, w: 24, h: 24, access: 'Kartlı + kayıtlı', assets: ['3 montaj istasyonu', 'Hücre test cihazları', 'Batarya izlenebilirlik veritabanı'] },
          { id: 'teknik', label: 'Teknik oda (OT, UPS)', x: 78, y: 0, w: 18, h: 12, access: 'Kartlı + kayıtlı', assets: ['OT ağ anahtarları ve güvenlik duvarı', 'UPS', 'Ana dağıtım panosu'] },
          { id: 'batdepo', label: 'Hat içi batarya stoku', x: 78, y: 12, w: 18, h: 12, access: 'Kartlı + kayıtlı', assets: ['Günlük batarya paketi stoku', 'Termal kamera ve söndürme'] },
          { id: 'yol', label: 'AGV yolu', x: 0, y: 24, w: 96, h: 4, access: 'Personel', assets: [], minor: true },
          { id: 'montaj', label: 'Son montaj hattı', x: 0, y: 28, w: 42, h: 26, access: 'Kartlı (hat)', assets: ['4 montaj istasyonu', 'Tork ve görüntü kontrol cihazları', 'Hat ekranları (andon)'] },
          { id: 'eol', label: 'Hat sonu test ve yazılım yükleme (EOL)', x: 42, y: 28, w: 20, h: 26, access: 'Kartlı + kayıtlı', assets: ['2 EOL istasyonu', 'ECU yazılım yükleme sunucusu', 'Araç anahtarı eşleme cihazı'] },
          { id: 'kalite', label: 'Kalite ve test', x: 62, y: 28, w: 16, h: 14, access: 'Kartlı', assets: ['Ölçüm cihazları', 'Kalite veritabanı istemcisi'] },
          { id: 'sevkiyat', label: 'Sevkiyat ve lojistik', x: 62, y: 42, w: 16, h: 12, access: 'Kartlı', assets: ['AGV filo yöneticisi', 'Depo yönetim istemcisi'] },
          { id: 'giris', label: 'Giriş, güvenlik ve ziyaretçi galerisi', x: 78, y: 28, w: 18, h: 26, access: 'Herkes', assets: ['Turnike ve kart okuyucu', 'Ziyaretçi galerisi (cam)', 'Kamera kayıt ekranı'] }
        ]
      },
      {
        id: 'ofis', label: 'Ofis ve kontrol katı',
        rooms: [
          { id: 'kontrol', label: 'Üretim kontrol odası (MES, 7/24)', x: 0, y: 0, w: 24, h: 14, access: 'Kartlı + kayıtlı', assets: ['MES ve SCADA konsolları', 'Hat video duvarı', 'Uzaktan duruş yetkisi'] },
          { id: 'veri', label: 'Veri merkezi', x: 24, y: 0, w: 14, h: 14, access: 'Kartlı + kayıtlı', assets: ['MES ve PLM sunucuları', 'Yedekleme cihazı', 'Kurumsal güvenlik duvarı'] },
          { id: 'vsoc', label: 'Araç güvenlik operasyon merkezi (VSOC)', x: 38, y: 0, w: 20, h: 14, access: 'Kartlı + kayıtlı', assets: ['Filo olay izleme konsolu', 'SIEM'] },
          { id: 'ota', label: 'Yazılım ve OTA ekibi', x: 58, y: 0, w: 22, h: 14, access: 'Kartlı', assets: ['Derleme ve imzalama hattı (CI/CD)', 'OTA yayın konsolu', 'Geliştirici bilgisayarları'] },
          { id: 'bg', label: 'Bilgi güvenliği', x: 80, y: 0, w: 16, h: 14, access: 'Kartlı + kayıtlı', assets: ['HSM yönetim konsolu', 'Sertifika yönetimi'] },
          { id: 'proto', label: 'Prototip ve tasarım stüdyosu (TISAX)', x: 0, y: 14, w: 30, h: 18, access: 'Kartlı + kayıtlı', assets: ['Gizli prototip araç', 'CAD iş istasyonları', 'PLM erişimi'] },
          { id: 'koridor', label: 'Koridor', x: 30, y: 14, w: 66, h: 4, access: 'Personel', assets: [], minor: true },
          { id: 'yonetim', label: 'Yönetim', x: 30, y: 18, w: 20, h: 14, access: 'Kartlı', assets: ['Yönetici dizüstü bilgisayarları', 'Sözleşme arşivi'] },
          { id: 'satinalma', label: 'Satın alma ve tedarik zinciri', x: 50, y: 18, w: 22, h: 14, access: 'Kartlı', assets: ['Tedarikçi portalı', 'ERP istemcileri'] },
          { id: 'ikfinans', label: 'İK ve finans', x: 72, y: 18, w: 24, h: 14, access: 'Kartlı', assets: ['Bordro ve ERP', 'Banka ekranları'] },
          { id: 'galeri', label: 'Üretim holüne açık galeri', x: 0, y: 32, w: 96, h: 22, access: 'Personel', assets: [], minor: true }
        ]
      }
    ]
  };

  SK.personnel = [
    { role: 'Kaynak hücresi operatörü', n: 6, room: 'kaynak', shift: '2 vardiya' },
    { role: 'Boyahane teknisyeni', n: 4, room: 'boya', shift: '2 vardiya' },
    { role: 'Batarya montaj teknisyeni', n: 10, room: 'batarya', shift: '2 vardiya' },
    { role: 'Son montaj operatörü', n: 40, room: 'montaj', shift: '2 vardiya' },
    { role: 'Hat sonu test teknisyeni', n: 6, room: 'eol', shift: '2 vardiya' },
    { role: 'Kalite mühendisi', n: 5, room: 'kalite', shift: 'Gündüz' },
    { role: 'Lojistik ve AGV sorumlusu', n: 6, room: 'sevkiyat', shift: '2 vardiya' },
    { role: 'Bakım ve OT mühendisi', n: 4, room: 'teknik', shift: '2 vardiya, nöbetçi' },
    { role: 'Güvenlik görevlisi', n: 3, room: 'giris', shift: '3 vardiya' },
    { role: 'Batarya depo sorumlusu', n: 2, room: 'batdepo', shift: '2 vardiya' },
    { role: 'Üretim kontrol operatörü', n: 4, room: 'kontrol', shift: '3 vardiya' },
    { role: 'Sistem ve veri merkezi ekibi', n: 3, room: 'veri', shift: 'Gündüz, nöbetçi' },
    { role: 'VSOC analisti', n: 5, room: 'vsoc', shift: '3 vardiya' },
    { role: 'Yazılım ve OTA mühendisi', n: 14, room: 'ota', shift: 'Gündüz' },
    { role: 'Bilgi güvenliği ekibi', n: 4, room: 'bg', shift: 'Gündüz, nöbetçi' },
    { role: 'Tasarım ve prototip mühendisi', n: 10, room: 'proto', shift: 'Gündüz' },
    { role: 'Yönetim', n: 4, room: 'yonetim', shift: 'Gündüz' },
    { role: 'Satın alma uzmanı', n: 6, room: 'satinalma', shift: 'Gündüz' },
    { role: 'İK ve finans uzmanı', n: 7, room: 'ikfinans', shift: 'Gündüz' }
  ];

  // Önlemler (ISO/IEC 27001:2022 Ek A eşlemesiyle). Maliyetler büyük sanayi şirketi ölçeğinde varsayımdır. on: bugün uygulanıyor
  SK.controls = [
    { key: 'isms', iso: 'Madde 4–10 · 5.1', title: 'BGYS ve CSMS kurulumu, belgelendirme', desc: 'ISO 27001 ile UNECE R155 siber güvenlik yönetim sisteminin birlikte kurulması, iç denetim ve belgelendirme.', cost: 2400000, eff: 0.85, kind: 'L', on: false },
    { key: 'mfa', iso: '8.5', title: 'Çok faktörlü kimlik doğrulama', desc: 'MES, PLM, OTA konsolu, VPN ve e-postada ikinci doğrulama adımı.', cost: 900000, eff: 0.6, kind: 'L', on: false },
    { key: 'pam', iso: '8.2 · 5.18', title: 'Ayrıcalıklı erişim yönetimi', desc: 'PLC, robot ve sunucu yönetici hesapları kasada; bakım oturumları kayıtlı, yetkiler üç ayda bir gözden geçirilir.', cost: 1400000, eff: 0.5, kind: 'L', on: false },
    { key: 'ot_segment', iso: '8.22', title: 'OT ağ ayrımı (IEC 62443 bölge ve kanalları)', desc: 'Ofis, MES ve hat ağları ayrılır; bölgeler arası trafik güvenlik duvarından ve yalnız izinli kanallardan geçer.', cost: 2200000, eff: 0.55, kind: 'L', on: false },
    { key: 'edr', iso: '8.7', title: 'Uç nokta koruma (EDR)', desc: 'Ofis ve mühendislik bilgisayarlarında davranış tabanlı zararlı yazılım tespiti ve uzaktan izolasyon.', cost: 1100000, eff: 0.5, kind: 'L', on: true },
    { key: 'awareness', iso: '6.3', title: 'Farkındalık eğitimi ve oltalama tatbikatı', desc: 'Ofis ve hat personeline sosyal mühendislik, USB ve kapı güvenliği eğitimi; üç ayda bir oltalama testi.', cost: 600000, eff: 0.4, kind: 'L', on: false },
    { key: 'backup', iso: '8.13', title: 'Değiştirilemez yedek (MES, PLC programları, PLM)', desc: 'Robot ve PLC programları dahil, bir kopyası çevrimdışı ve silinemez; ayda bir geri yükleme testi.', cost: 900000, eff: 0.6, kind: 'I', on: true },
    { key: 'logging', iso: '8.15 · 8.16', title: 'Merkezi kayıt ve SIEM', desc: 'IT, OT ve bulut kayıtları tek yerde toplanır; toplu işlem ve olağandışı oturumlar alarm üretir.', cost: 1800000, eff: 0.4, kind: 'I', on: false },
    { key: 'ot_ids', iso: '8.16 · 8.20', title: 'OT ağ izleme ve anomali tespiti', desc: 'PROFINET ve OPC UA trafiğini pasif izleyen açık kaynak sensörler (ör. Zeek, Suricata); yeni cihaz ve komut alarmı.', cost: 1300000, eff: 0.5, kind: 'I', on: false },
    { key: 'vuln_mgmt', iso: '8.8', title: 'Zafiyet ve yama yönetimi', desc: 'IT ve OT varlık envanteri zafiyet bültenleriyle eşlenir; OT yamaları planlı bakım duruşlarında uygulanır.', cost: 1000000, eff: 0.5, kind: 'L', on: false },
    { key: 'vendor', iso: '5.19–5.22', title: 'Tedarikçi güvenliği (TISAX şartları)', desc: 'Robot, batarya ve yazılım tedarikçileriyle güvenlik maddeli sözleşme; uzaktan erişim yalnız talep üzerine ve kayıtlı.', cost: 700000, eff: 0.5, kind: 'L', on: false },
    { key: 'sbom', iso: '5.21 · 8.8', title: 'Yazılım envanteri (SBOM) ve tedarikçi yazılım taraması', desc: 'Her ECU yazılımının bileşen listesi tutulur; bilinen zafiyet ve imza kontrolünden geçmeyen paket hatta giremez.', cost: 800000, eff: 0.5, kind: 'L', on: false },
    { key: 'secure_dev', iso: '8.25 · 8.29', title: 'Güvenli geliştirme ve TARA (ISO/SAE 21434)', desc: 'Araç yazılımında tehdit analizi ve risk değerlendirmesi, kod incelemesi, otomatik tarama ve bağımsız sızma testi.', cost: 2600000, eff: 0.55, kind: 'L', on: false },
    { key: 'signed_sw', iso: '8.24 · 8.32', title: 'İmzalı yazılım ve güvenli OTA (Uptane)', desc: 'ECU yazılımı ve OTA paketleri dijital imzalı; araç ve hat sonu istasyonu imzasız paketi reddeder.', cost: 1200000, eff: 0.8, kind: 'L', on: true },
    { key: 'staged_ota', iso: '8.32', title: 'Kademeli OTA ve geri dönüş', desc: 'Güncelleme önce %1\'lik pilot filoya gider; sorun çıkarsa otomatik geri dönüş.', cost: 500000, eff: 0.7, kind: 'I', on: false },
    { key: 'hsm', iso: '8.24', title: 'Anahtar yönetimi (HSM)', desc: 'İmza ve araç anahtarları donanım güvenlik modülünde; teşhis cihazları anahtar tutmaz, kısa ömürlü oturum alır.', cost: 1600000, eff: 0.7, kind: 'L', on: false },
    { key: 'vsoc', iso: '5.24 · 8.16', title: 'Araç güvenlik operasyon merkezi (VSOC)', desc: 'Filodan gelen güvenlik olaylarının 7/24 izlenmesi ve müdahalesi (R155 gereği).', cost: 3200000, eff: 0.45, kind: 'I', on: false },
    { key: 'usb_ctl', iso: '7.10 · 8.1', title: 'Taşınabilir medya denetimi', desc: 'Hat bilgisayarlarında ve EOL istasyonlarında USB kapalı; yazılım yalnız imzalı depodan gelir.', cost: 300000, eff: 0.6, kind: 'L', on: false },
    { key: 'proto_sec', iso: '7.1 · 7.2 · 5.12', title: 'Prototip koruma alanı (TISAX)', desc: 'Kartlı ve kayıtlı gizli alan, kamera, temiz masa, telefon dolabı ve gizlilik sözleşmesi.', cost: 900000, eff: 0.55, kind: 'L', on: false },
    { key: 'privacy', iso: '5.34', title: 'Kişisel veri minimizasyonu', desc: 'Araç konum ve sürüş verisi anonimleştirilir; açık rıza kayıt altında tutulur.', cost: 600000, eff: 0.5, kind: 'I', on: false },
    { key: 'ir_plan', iso: '5.24–5.26', title: 'Olay müdahale planı ve tatbikat', desc: 'Üretim, araç ve veri olayları için ayrı oyun kitapları; KVKK, 7545 ve tip onayı makamı bildirimleri; yılda iki tatbikat.', cost: 700000, eff: 0.4, kind: 'I', on: false },
    { key: 'sod', iso: '5.3', title: 'Görevler ayrılığı (çift onay)', desc: 'Yazılım sürüm yayını, ödeme ve tedarikçi banka bilgisi değişiklikleri iki kişinin onayıyla yapılır.', cost: 200000, eff: 0.6, kind: 'L', on: false },
    { key: 'bcp', iso: '5.30 · 8.14', title: 'İş sürekliliği ve alternatif tedarik', desc: 'Kritik parçada ikinci tedarikçi ve emniyet stoğu, yedek MES, ikinci veri merkezi.', cost: 3500000, eff: 0.5, kind: 'I', on: false },
    { key: 'cloud_sec', iso: '5.23', title: 'Bulut yapılandırma denetimi', desc: 'Bağlı araç, OTA ve derleme (CI/CD) bulut hesaplarında açık anahtar ve aşırı yetki sürekli taranır.', cost: 600000, eff: 0.6, kind: 'L', on: false },
    { key: 'waf', iso: '8.20 · 8.21', title: 'WAF ve DDoS koruması', desc: 'Mobil uygulama ve bağlı araç API\'si önünde web uygulama güvenlik duvarı ve istek sınırlama.', cost: 1200000, eff: 0.6, kind: 'L', on: false },
    { key: 'cctv', iso: '7.4', title: 'Kamera ve çevre izleme', desc: 'Tesis çevresi, depo ve prototip alanı kameraları; kayıtlar 90 gün saklanır.', cost: 800000, eff: 0.45, kind: 'L', on: true },
    { key: 'fire', iso: '7.5', title: 'Batarya yangını algılama ve söndürme', desc: 'Termal kamera, gaz algılama, dış karantina alanı ve otomatik söndürme.', cost: 2000000, eff: 0.55, kind: 'I', on: true },
    { key: 'utilities', iso: '7.11', title: 'Kesintisiz güç ve gerilim koruma', desc: 'Veri merkezi ve kritik hatlar için UPS, jeneratör ve gerilim düzenleyici.', cost: 1500000, eff: 0.6, kind: 'L', on: true },
    { key: 'screening', iso: '6.1 · 6.4', title: 'Personel taraması ve gizlilik sözleşmesi', desc: 'Kritik ve prototip rollerinde işe alım öncesi referans kontrolü ve gizlilik sözleşmesi (1.450 çalışan).', cost: 2200000, eff: 0.3, kind: 'L', on: false },
    { key: 'procedures', iso: '5.37', title: 'Yazılı prosedürler ve yedek personel', desc: 'İşe giriş-çıkış, OT bakım ve geri yükleme prosedürleri; her kritik rol için eğitimli yedek kişi.', cost: 400000, eff: 0.5, kind: 'I', on: false },
    { key: 'cert_mgmt', iso: '8.9', title: 'Sertifika envanteri ve otomatik yenileme', desc: 'OPC UA, OTA ve bulut sertifikaları izlenir ve 30 gün kala otomatik yenilenir.', cost: 300000, eff: 0.8, kind: 'L', on: false },
    { key: 'insurance_review', iso: '5.31', title: 'Poliçe şartlarının yıllık gözden geçirilmesi', desc: 'OT ve geri çağırma teminatları ile şirketin gerçek durumu her yıl karşılaştırılır.', cost: 150000, eff: 0.7, kind: 'L', on: false }
  ];

  const SRC = {
    jlr: { text: 'Jaguar Land Rover, Eylül 2025: siber saldırı İngiltere\'deki üretimi haftalarca durdurdu' },
    toyota: { text: 'Toyota, Mart 2022: tedarikçisi Kojima Industries\'e yapılan saldırı Japonya\'daki fabrikalarda üretimi bir gün durdurdu' },
    honda: { text: 'Honda, Haziran 2020: fidye yazılımı bazı fabrikalarda üretimi durdurdu' },
    jeep: { text: 'Chrysler, 2015: Jeep Cherokee\'nin uzaktan ele geçirilebildiği gösterildi; 1,4 milyon araç geri çağrıldı' }
  };
  SK.sources = SRC;

  // Risk kaydı (K: Kıvılcım). aro: yıllık sıklık · sle: tek olay kaybı (TL). Değerler varsayımdır.
  SK.risks = [
    { id: 'K01', title: 'OT ağında fidye yazılımı: üretim hattının durması', cat: 'Siber', assets: ['ot', 'mes', 'units'], owner: 'Üretim direktörü',
      threat: 'Ofis ağından bulaşan fidye yazılımı düz ağ üzerinden MES ve hat bilgisayarlarına geçer; hat günlerce durur.',
      vuln: 'IT ve OT ağları ayrılmamış; PLC\'lere ofis ağından erişilebiliyor; OT\'de izleme yok.',
      aro: 0.4, sle: 220000000, controls: ['ot_segment', 'edr', 'backup', 'ot_ids', 'awareness'], ins: ['siber', 'karkaybi'], example: SRC.jlr },
    { id: 'K02', title: 'OTA sunucusunun ele geçirilip filoya zararlı güncelleme gönderilmesi', cat: 'Siber', assets: ['ota', 'fleet'], owner: 'Yazılım direktörü',
      threat: 'Saldırgan derleme hattına sızar ve sahadaki araçlara zararlı yazılım güncellemesi gönderir.',
      vuln: 'Güncellemeler bütün filoya aynı anda gider; imza anahtarı derleme sunucusunda.',
      aro: 0.05, sle: 900000000, controls: ['signed_sw', 'staged_ota', 'hsm', 'pam', 'mfa'], ins: ['siber', 'geri_cagirma'], example: SRC.jeep },
    { id: 'K03', title: 'Hat sonunda araçlara zararlı veya kusurlu ECU yazılımı yüklenmesi', cat: 'Tedarikçi', assets: ['ecu_sw', 'units'], owner: 'Kalite direktörü',
      threat: 'Tedarikçiden gelen ECU yazılımı arka kapılı ya da kusurlu; hat sonu istasyonu bunu üretilen her araca yükler.',
      vuln: 'Yazılım paketleri USB ile getiriliyor; bileşen envanteri (SBOM) yok.',
      aro: 0.1, sle: 450000000, controls: ['signed_sw', 'sbom', 'usb_ctl', 'vendor'], ins: ['geri_cagirma'] },
    { id: 'K04', title: 'Robot ve PLC\'lere bakım firmasının uzaktan erişiminin kötüye kullanılması', cat: 'Tedarikçi', assets: ['ot', 'vendorvpn'], owner: 'Bakım müdürü',
      threat: 'Bakım firmasının çalınan parolasıyla robot programları değiştirilir; kaynak hataları fark edilmeden sürer.',
      vuln: 'Bakım VPN\'i sürekli açık, ortak parola, OT ağına doğrudan erişim.',
      aro: 0.3, sle: 60000000, controls: ['pam', 'vendor', 'mfa', 'ot_segment'], ins: ['siber'] },
    { id: 'K05', title: 'Prototip ve tasarım verisinin sızması (sanayi casusluğu)', cat: 'Siber', assets: ['plm', 'proto'], owner: 'Ar-Ge direktörü',
      threat: 'Yeni modelin CAD verisi ve prototip fotoğrafları rakibe ya da basına sızar.',
      vuln: 'PLM\'den toplu dışa aktarma izlenmiyor; prototip alanına erişim gevşek.',
      aro: 0.2, sle: 250000000, controls: ['proto_sec', 'mfa', 'logging', 'screening'], ins: ['siber'] },
    { id: 'K06', title: 'Bağlı araç arka ucunda araç sahibi verisi sızıntısı', cat: 'Siber', assets: ['connected', 'custdb'], owner: 'Yazılım direktörü',
      threat: 'Mobil uygulama API\'sindeki yetki hatasıyla araç sahiplerinin konum geçmişi çekilir.',
      vuln: 'API\'de nesne düzeyi yetki kontrolü eksik; istek sınırı yok.',
      aro: 0.15, sle: 120000000, controls: ['secure_dev', 'waf', 'privacy', 'cloud_sec'], ins: ['siber'] },
    { id: 'K07', title: 'Araç dijital anahtarının kopyalanması ve uzaktan açma', cat: 'Siber', assets: ['connected', 'keys'], owner: 'Yazılım direktörü', hidden: true,
      threat: 'Dijital anahtar protokolündeki zayıflıkla araçlar açılır ve çalınır.',
      vuln: 'Anahtar türetme yazılımda; donanım güvenlik modülü yok.',
      aro: 0.1, sle: 80000000, controls: ['hsm', 'secure_dev', 'vsoc'], ins: ['geri_cagirma'] },
    { id: 'K08', title: 'Servis teşhis cihazından araç anahtarlarının ve oturumların çalınması', cat: 'Siber', assets: ['keys', 'units'], owner: 'Satış sonrası müdürü', hidden: true,
      threat: 'Servis noktasından çalınan teşhis cihazındaki kalıcı oturumla araç anahtarı üretilir.',
      vuln: 'Teşhis cihazı uzun ömürlü kimlik ve anahtar tutuyor.',
      aro: 0.15, sle: 70000000, controls: ['hsm', 'pam', 'usb_ctl'], ins: ['siber'] },
    { id: 'K09', title: 'Batarya stokunda termal kaçak ve yangın', cat: 'Fiziksel', assets: ['battery', 'building'], owner: 'Üretim direktörü',
      threat: 'Hasarlı bir batarya paketi ısınır, yangın stoka ve üretim holüne yayılır.',
      vuln: 'Hasarlı paketlerin karantinası ve erken algılama yetersiz.',
      aro: 0.03, sle: 600000000, controls: ['fire', 'procedures', 'bcp'], ins: ['yangin', 'karkaybi'] },
    { id: 'K10', title: 'Kocaeli depremi: tesisin uzun süre durması', cat: 'Doğal afet', assets: ['building', 'mes'], owner: 'Genel müdür',
      threat: 'Büyük deprem binaya ve hatlara zarar verir; üretim haftalarca durur.',
      vuln: 'Tek üretim tesisi; ikinci veri merkezi ve alternatif tedarik yok.',
      aro: 0.01, sle: 2500000000, controls: ['bcp', 'backup', 'procedures'], ins: ['yangin', 'karkaybi'] },
    { id: 'K11', title: 'Şebeke kesintisi ve gerilim dalgalanması: hat duruşu', cat: 'Operasyonel', assets: ['ot', 'building'], owner: 'Bakım müdürü',
      threat: 'Gerilim çökmesi robotları emniyete alır; hattın yeniden başlatılması saatler sürer.',
      vuln: 'Kritik hatlarda gerilim düzenleyici yok.',
      aro: 1, sle: 8000000, controls: ['utilities'], ins: [] },
    { id: 'K12', title: 'Tedarikçiye siber saldırı: parça akışının durması', cat: 'Tedarikçi', assets: ['erp', 'units'], owner: 'Satın alma müdürü',
      threat: 'Tam zamanında üretimde tek bir parça tedarikçisinin sistemleri şifrelenir; hat beslenemez.',
      vuln: 'Kritik parçalarda tek tedarikçi ve birkaç saatlik stok.',
      aro: 0.3, sle: 140000000, controls: ['vendor', 'bcp'], ins: [], example: SRC.toyota },
    { id: 'K13', title: 'Yazılım tedarik zinciri: açık kaynak bileşende zafiyet', cat: 'Tedarikçi', assets: ['ecu_sw', 'ota'], owner: 'Yazılım direktörü', hidden: true,
      threat: 'Araç yazılımındaki bir açık kaynak kütüphanede kritik zafiyet çıkar; hangi araçların etkilendiği bilinmez.',
      vuln: 'Bileşen envanteri (SBOM) tutulmuyor.',
      aro: 0.5, sle: 25000000, controls: ['sbom', 'vuln_mgmt'], ins: [] },
    { id: 'K14', title: 'AGV ve kablosuz OT ağında araya girme', cat: 'Siber', assets: ['ot', 'units'], owner: 'Lojistik müdürü',
      threat: 'Kablosuz ağdan gönderilen sahte komutlarla AGV\'ler durdurulur; hat beslenemez.',
      vuln: 'AGV ağı misafir Wi-Fi ile aynı altyapıda; komutlar doğrulanmıyor.',
      aro: 0.3, sle: 15000000, controls: ['ot_segment', 'cert_mgmt', 'ot_ids'], ins: ['siber'] },
    { id: 'K15', title: 'MES ve PLM bulut hesabında yanlış yapılandırma', cat: 'Siber', assets: ['cloud', 'plm'], owner: 'Bilgi teknolojileri müdürü',
      threat: 'Açık bırakılan bir depolama alanından tasarım ve üretim verisi sızar.',
      vuln: 'Bulut hesapları düzenli taranmıyor.',
      aro: 0.3, sle: 40000000, controls: ['cloud_sec', 'logging'], ins: ['siber'] },
    { id: 'K16', title: 'İçeriden tehdit: ayrılan mühendisin tasarım verisini götürmesi', cat: 'İnsan', assets: ['plm', 'people'], owner: 'İK müdürü',
      threat: 'Rakibe geçen bir mühendis açık kalan hesabıyla tasarım verisini indirir.',
      vuln: 'İşten çıkışta hesaplar kapanmıyor; toplu indirme izlenmiyor.',
      aro: 0.2, sle: 90000000, controls: ['procedures', 'pam', 'proto_sec', 'logging', 'screening'], ins: [] },
    { id: 'K17', title: 'Yönetici dolandırıcılığı ve sahte tedarikçi faturası', cat: 'İnsan', assets: ['email', 'erp'], owner: 'Finans direktörü',
      threat: 'Genel müdür adına gelen e-postayla bir tedarikçinin banka hesabı değiştirilir; ödeme dolandırıcıya gider.',
      vuln: 'Banka bilgisi değişikliği tek kişinin onayıyla yapılıyor.',
      aro: 0.5, sle: 20000000, controls: ['awareness', 'mfa', 'sod'], ins: ['siber'] },
    { id: 'K18', title: 'Kilit OT mühendislerine bağımlılık', cat: 'İnsan', assets: ['people', 'ot'], owner: 'Üretim direktörü', hidden: true,
      threat: 'Hattın PLC programlarını bilen iki mühendis ayrılır; arızada hat günlerce durur.',
      vuln: 'Yazılı prosedür ve yedek kişi yok.',
      aro: 0.2, sle: 30000000, controls: ['procedures'], ins: [] },
    { id: 'K19', title: 'UNECE R155/R156 sertifikasının yenilenememesi', cat: 'Mevzuat', assets: ['policies'], owner: 'Genel müdür',
      threat: 'Yenileme denetiminde siber güvenlik ve yazılım güncelleme yönetim sistemi yetersiz bulunur; yeni tip onayı ve ihracat durur.',
      vuln: 'CSMS süreçleri belgelenmemiş; filo izleme ve SBOM yok.',
      aro: 0.1, sle: 600000000, controls: ['isms', 'secure_dev', 'vsoc', 'signed_sw', 'staged_ota', 'sbom'], ins: [] },
    { id: 'K20', title: 'Bağlı araç konum verisinde açık rıza eksikliği (KVKK)', cat: 'Mevzuat', assets: ['custdb', 'connected'], owner: 'Hukuk müdürü',
      threat: 'Konum verisinin rızasız işlendiği gerekçesiyle KVKK yaptırımı gelir.',
      vuln: 'Aydınlatma metni ve rıza kayıtları eksik.',
      aro: 0.2, sle: 17000000, controls: ['privacy'], ins: [] },
    { id: 'K21', title: 'Siber olay bildiriminin gecikmesi (KVKK, 7545)', cat: 'Mevzuat', assets: ['policies'], owner: 'Bilgi güvenliği müdürü', hidden: true,
      threat: 'Bir olaydan sonra bildirimler gecikir; ek yaptırım gelir.',
      vuln: 'Bildirim akışı yazılı değil.',
      aro: 0.1, sle: 10000000, controls: ['ir_plan', 'logging'], ins: [] },
    { id: 'K22', title: 'Yetkisiz kişinin prototip stüdyosuna girmesi', cat: 'Fiziksel', assets: ['proto', 'building'], owner: 'Güvenlik müdürü',
      threat: 'Ziyaretçi ya da sahte personel prototip aracı fotoğraflar.',
      vuln: 'Kapılar peşinden girmeye açık; telefon yasağı uygulanmıyor.',
      aro: 0.2, sle: 60000000, controls: ['proto_sec', 'cctv', 'awareness'], ins: [] },
    { id: 'K23', title: 'Sertifika süresinin dolması: OPC UA bağlantılarının kopması', cat: 'Operasyonel', assets: ['ot', 'mes'], owner: 'Bilgi teknolojileri müdürü', hidden: true,
      threat: 'MES\'in OPC UA sertifikası gece dolar; istasyonlar MES\'e bağlanamaz, hat durur.',
      vuln: 'Sertifika bitiş tarihleri izlenmiyor.',
      aro: 0.3, sle: 12000000, controls: ['cert_mgmt'], ins: [] },
    { id: 'K24', title: 'Sigortanın OT kaynaklı kaybı ödememesi', cat: 'Finansal', assets: ['policies'], owner: 'Finans direktörü', hidden: true,
      threat: 'Sigorta, poliçede şart koşulan ağ ayrımı ve yedekleme olmadığı gerekçesiyle üretim kaybını ödemez.',
      vuln: 'Poliçe şartları ile şirketin gerçek durumu karşılaştırılmıyor.',
      aro: 0.1, sle: 80000000, controls: ['insurance_review', 'backup', 'ot_segment'], ins: [] }
  ];

  SK.policies = [
    { key: 'siber', title: 'Siber risk sigortası',
      covers: 'Olay müdahale ve adli inceleme, veri kurtarma, siber kaynaklı iş durması (sınırlı), veri ihlali giderleri, üçüncü kişi talepleri.',
      excl: ['OT kaynaklı kesintide teminat limiti ve bekleme süresi sınırlı olabilir', 'Savaş ve devlet destekli saldırı istisnası', 'Poliçe şartı olan ağ ayrımı ve yedekleme yoksa ödeme reddedilebilir'] },
    { key: 'geri_cagirma', title: 'Ürün geri çağırma sigortası',
      covers: 'Kusurlu ya da zararlı yazılım nedeniyle araçların geri çağrılması, servis ve lojistik giderleri.',
      excl: ['Tip onayı yaptırımları ve idari para cezaları', 'Bilinen ve giderilmemiş kusurlar'] },
    { key: 'urun', title: 'Ürün sorumluluk sigortası',
      covers: 'Araç kusurundan doğan üçüncü kişi yaralanma ve maddi zarar talepleri.',
      excl: ['Sözleşmeden doğan cezalar'] },
    { key: 'yangin', title: 'Yangın, deprem ve doğal afet',
      covers: 'Fabrika binası, hatlar, stok ve demirbaşlar. Deprem ek teminatı alınmalıdır.',
      excl: ['Deprem teminatında tenzili muafiyet', 'Batarya stoku için ek şartlar'] },
    { key: 'karkaybi', title: 'Kâr kaybı (iş durması)',
      covers: 'Fiziksel hasara bağlı üretim durması süresince brüt kâr kaybı.',
      excl: ['Tedarikçi kaynaklı duruş ayrı teminat ister', 'Siber kaynaklı kesinti siber poliçede'] }
  ];

  SK.staticAssets = [
    { id: 'mes', name: 'Üretim yürütme sistemi (MES) ve SCADA', type: 'Yazılım', loc: 'Veri merkezi', owner: 'Üretim direktörü', c: 2, i: 3, a: 3 },
    { id: 'ot', name: 'OT ağı: PLC, HMI, robot denetleyicileri', type: 'Ağ', loc: 'Üretim holü', owner: 'Bakım müdürü', c: 2, i: 3, a: 3 },
    { id: 'plm', name: 'PLM ve CAD tasarım verisi', type: 'Veri', loc: 'Veri merkezi + bulut', owner: 'Ar-Ge direktörü', c: 3, i: 3, a: 2 },
    { id: 'ota', name: 'OTA güncelleme altyapısı ve derleme hattı', type: 'Yazılım', loc: 'Bulut + Ar-Ge', owner: 'Yazılım direktörü', c: 3, i: 3, a: 3 },
    { id: 'ecu_sw', name: 'ECU yazılımları ve imza anahtarları', type: 'Yazılım', loc: 'Ar-Ge + hat sonu', owner: 'Yazılım direktörü', c: 3, i: 3, a: 2 },
    { id: 'fleet', name: 'Sahadaki araç filosu (yaklaşık 40.000 araç)', type: 'Donanım', loc: 'Müşteride', owner: 'Satış sonrası müdürü', c: 2, i: 3, a: 3 },
    { id: 'connected', name: 'Bağlı araç arka ucu ve mobil uygulama', type: 'Yazılım', loc: 'Bulut', owner: 'Yazılım direktörü', c: 3, i: 3, a: 3 },
    { id: 'keys', name: 'Araç dijital anahtar sistemi', type: 'Yazılım', loc: 'Bulut + araç', owner: 'Yazılım direktörü', c: 3, i: 3, a: 3 },
    { id: 'custdb', name: 'Araç sahibi verisi (42.000 kullanıcı)', type: 'Veri', loc: 'Bulut', owner: 'Hukuk müdürü', c: 3, i: 3, a: 2 },
    { id: 'erp', name: 'ERP ve tedarikçi portalı', type: 'Yazılım', loc: 'Veri merkezi', owner: 'Finans direktörü', c: 3, i: 3, a: 2 },
    { id: 'email', name: 'E-posta ve iş birliği araçları', type: 'Hizmet', loc: 'Bulut', owner: 'Bilgi teknolojileri müdürü', c: 3, i: 2, a: 2 },
    { id: 'cloud', name: 'Bulut hesapları', type: 'Hizmet', loc: 'Bulut sağlayıcısı', owner: 'Bilgi teknolojileri müdürü', c: 3, i: 3, a: 3 },
    { id: 'vendorvpn', name: 'Bakım firmalarının uzaktan erişimi', type: 'Ağ', loc: 'VPN', owner: 'Bilgi güvenliği müdürü', c: 3, i: 3, a: 1 },
    { id: 'battery', name: 'Batarya stoku ve karantina alanı', type: 'Fiziksel', loc: 'Üretim tesisi + depo', owner: 'Üretim direktörü', c: 1, i: 2, a: 3 },
    { id: 'proto', name: 'Fiziksel prototipler', type: 'Fiziksel', loc: 'Prototip stüdyosu', owner: 'Ar-Ge direktörü', c: 3, i: 2, a: 2 },
    { id: 'building', name: 'Fabrika binası ve arsa (26.000 m²)', type: 'Fiziksel', loc: 'TOSB, Kocaeli', owner: 'Genel müdür', c: 1, i: 2, a: 3 },
    { id: 'people', name: 'Kritik roller (OT, yazılım, tasarım)', type: 'İnsan', loc: 'Tesis', owner: 'İK müdürü', c: 2, i: 2, a: 3 },
    { id: 'policies', name: 'BGYS, CSMS belgeleri ve tip onayı uyumu', type: 'Belge', loc: 'Tesis', owner: 'Bilgi güvenliği müdürü', c: 1, i: 3, a: 2 }
  ];

  SK.frameworks = [
    { id: 'r155', short: 'UNECE R155', title: 'UNECE R155 (siber güvenlik yönetim sistemi)', sub: 'Araç tip onayı için zorunlu · AB\'de Temmuz 2024\'ten beri tüm yeni araçlar',
      reqs: [
        { id: 'R1', text: 'Araç tipi için siber güvenlik yönetim sistemi (CSMS) ve sertifikası', needs: ['isms', 'secure_dev'] },
        { id: 'R2', text: 'Araç ve arka uçta saldırıların izlenmesi, tespiti ve müdahalesi', needs: ['vsoc', 'logging', 'ir_plan'] },
        { id: 'R3', text: 'Tedarik zinciri risklerinin yönetimi', needs: ['vendor', 'sbom'] },
        { id: 'R4', text: 'Kriptografik anahtarların korunması', needs: ['hsm'] }
      ] },
    { id: 'r156', short: 'UNECE R156', title: 'UNECE R156 (yazılım güncelleme yönetim sistemi)', sub: 'OTA ve servis güncellemeleri',
      reqs: [
        { id: 'U1', text: 'Güncellemelerin bütünlüğü ve kaynağının doğrulanması', needs: ['signed_sw'] },
        { id: 'U2', text: 'Güvenli dağıtım ve başarısız güncellemede geri dönüş', needs: ['staged_ota'] },
        { id: 'U3', text: 'Yazılım sürüm ve bileşen kaydı (RXSWIN)', needs: ['sbom'] }
      ] },
    { id: 'iso21434', short: 'ISO/SAE 21434', title: 'ISO/SAE 21434 (araç siber güvenlik mühendisliği)', sub: 'Tasarımdan hurdaya kadar',
      reqs: [
        { id: 'I1', text: 'Tehdit analizi ve risk değerlendirmesi (TARA)', needs: ['secure_dev'] },
        { id: 'I2', text: 'Doğrulama, sızma testi ve zafiyet yönetimi', needs: ['secure_dev', 'vuln_mgmt'] }
      ] },
    { id: 'tisax', short: 'TISAX', title: 'TISAX (VDA ISA)', sub: 'Otomotiv tedarik zincirinde bilgi güvenliği değerlendirmesi',
      reqs: [
        { id: 'T1', text: 'Prototip ve tasarım verisinin korunması', needs: ['proto_sec', 'mfa'] },
        { id: 'T2', text: 'Bilgi güvenliği yönetimi', needs: ['isms'] },
        { id: 'T3', text: 'Fiziksel prototip alanında erişim denetimi', needs: ['proto_sec', 'cctv'] }
      ] },
    { id: 'iec62443', short: 'IEC 62443', title: 'IEC 62443 (endüstriyel otomasyon güvenliği)', sub: 'Fabrika OT ağı',
      reqs: [
        { id: 'O1', text: 'Bölge ve kanallarla ağ ayrımı', needs: ['ot_segment'] },
        { id: 'O2', text: 'OT ağında izleme ve anomali tespiti', needs: ['ot_ids'] },
        { id: 'O3', text: 'Uzaktan bakım erişiminin denetimi', needs: ['pam', 'vendor'] }
      ] },
    { id: 'kvkk', short: 'KVKK', title: 'KVKK (6698 sayılı Kanun)', sub: 'Bağlı araç ve müşteri verisi',
      reqs: [
        { id: 'K1', text: 'Konum ve sürüş verisi için aydınlatma ve açık rıza', needs: ['privacy'] },
        { id: 'K2', text: 'Veri güvenliği için teknik ve idari tedbirler (Madde 12)', needs: ['mfa', 'logging', 'privacy'] },
        { id: 'K3', text: 'Veri ihlalinin 72 saat içinde bildirimi', needs: ['ir_plan', 'logging'] }
      ] }
  ];

  // Olay senaryoları
  SK.scenarios = [
    {
      id: 'otransom', title: 'OT ağında fidye yazılımı: hat durur', cat: 'Siber', place: 'hq', risks: ['K01'], example: 'jlr',
      summary: 'Planlama ekibine gelen ekli e-postayla başlayan fidye yazılımı düz ağ üzerinden MES\'e ve hat bilgisayarlarına geçer; üretim durur.',
      stages: [
        { title: 'Planlama mühendisine ekli e-posta', text: '"Revize üretim planı" başlıklı e-postadaki ek açılır.', tech: 'T1566.001 · Oltalama eki', blockedBy: ['awareness'], hit: { hq: ['satinalma'] } },
        { title: 'Zararlı yazılım çalışır', text: 'Ekteki makro uzaktan erişim aracını indirir.', tech: 'T1204 · Kullanıcı çalıştırması', blockedBy: ['edr'], hit: { hq: ['satinalma'] } },
        { title: 'Ofis ağından OT ağına geçiş', text: 'IT ve OT ağları ayrılmadığı için saldırgan MES sunucusuna ve hat bilgisayarlarına ulaşır.', tech: 'T0866 · Uzak hizmet istismarı', blockedBy: ['ot_segment'], hit: { hq: ['veri', 'kontrol'] } },
        { title: 'MES ve hat ekranları şifrelenir', text: 'İstasyonlar iş emri alamaz; robotlar emniyete geçer, hat durur. OT izleme varsa yayılma erken fark edilir.', tech: 'T0828 · Üretim kaybı', blockedBy: [], hit: { hq: ['kaynak', 'boya', 'batarya', 'montaj', 'eol'] }, apply: true }
      ],
      impact: {
        scope: { kind: 'URETIM' }, hours: 72, mods: { backup: 0.4, ir_plan: 0.7, ot_ids: 0.6 },
        costs: [
          { label: 'Olay müdahalesi ve adli inceleme', amount: 15000000, mods: { ir_plan: 0.7 } },
          { label: 'MES ve hat bilgisayarlarının yeniden kurulması', amount: 12000000, mods: { backup: 0.4 } },
          { label: 'Bayi ve teslimat gecikme cezaları', amount: 20000000 },
          { label: 'Müşteri kaybı (itibar)', pct: 0.003, mods: { ir_plan: 0.8 } }
        ]
      },
      contained: { label: 'Bilgisayarın temizlenmesi ve inceleme', amount: 150000 },
      log: ['MES → * OPC UA Write {iş emri: reddedildi}', 'HMI-* → MES {durum:"Erişilemiyor"}']
    },
    {
      id: 'ota', title: 'OTA altyapısı ele geçirilir: filoya zararlı güncelleme', cat: 'Siber', risks: ['K02'], example: 'jeep',
      summary: 'Derleme hattındaki açıkta kalan bir erişim anahtarıyla saldırgan zararlı bir güncelleme hazırlar ve filoya göndermeye çalışır.',
      stages: [
        { title: 'Derleme hattının erişim anahtarı açıkta', text: 'Bulut hesabında açık bırakılan bir erişim anahtarı bulunur.', tech: 'T1552 · Güvensiz kimlik bilgisi', blockedBy: ['cloud_sec'], hit: { csms: true } },
        { title: 'Zararlı paket imzalanmaya çalışılır', text: 'İmza anahtarı donanım güvenlik modülündeyse saldırgan paketi imzalayamaz; araçlar imzasız paketi reddeder.', tech: 'T1195.002 · Yazılım tedarik zinciri', blockedBy: ['hsm'], hit: { hq: ['ota'] } },
        { title: 'Bütün filoya aynı anda gönderim', text: 'Kademeli dağıtım varsa paket yalnız %1\'lik pilot filoya gider ve geri çekilir.', tech: 'T1072 · Yazılım dağıtım araçları', blockedBy: [], hit: { hq: ['ota', 'vsoc'] } },
        { title: 'Araçlarda bilgi-eğlence ve bağlantı birimi çalışmaz', text: 'Etkilenen araçlar servise çağrılır.', tech: 'Etki · Geri çağırma', blockedBy: [], apply: true }
      ],
      impact: {
        scope: { model: 'OTA' }, hours: 48, mods: { ir_plan: 0.7 },
        costs: [
          { label: 'Araçların geri çağrılması ve servis', amount: 350000000, mods: { staged_ota: 0.05, vsoc: 0.7 } },
          { label: 'Müşteri tazminatları', amount: 80000000, mods: { staged_ota: 0.05 } },
          { label: 'R156 uygunsuzluğu ve tip onayı süreci', amount: 60000000 },
          { label: 'Müşteri kaybı (itibar)', pct: 0.01, mods: { staged_ota: 0.2 } }
        ]
      },
      contained: { label: 'Anahtarın iptali ve inceleme', amount: 400000 },
      log: ['OTA → * UpdatePackage {imza:"geçersiz"}']
    },
    {
      id: 'eolfw', title: 'Hat sonunda araçlara zararlı ECU yazılımı', cat: 'Tedarikçi', place: 'hq', risks: ['K03'],
      summary: 'Tedarikçinin derleme sunucusu ele geçirilir; arka kapılı bir ECU yazılımı USB ile hat sonu istasyonuna getirilir ve araçlara yüklenir.',
      stages: [
        { title: 'Tedarikçinin derleme sunucusu ele geçirilir', text: 'Bu adım şirketin kontrolü dışındadır.', tech: 'T1195 · Tedarik zinciri saldırısı', blockedBy: [], hit: { vendor: true } },
        { title: 'Paket USB ile hat sonuna getirilir', text: 'Yeni sürüm hat sonu istasyonuna USB bellekle yüklenir. Taşınabilir medya kapalıysa paket imzalı depodan gelmek zorundadır.', tech: 'T0847 · Çıkarılabilir medya', blockedBy: ['usb_ctl'], hit: { hq: ['eol'] } },
        { title: 'İmza doğrulaması yapılmadan yükleme', text: 'Hat sonu istasyonu imzasız paketi reddederse yükleme durur.', tech: 'T0839 · Modül firmware\'i', blockedBy: ['signed_sw'], hit: { hq: ['eol', 'kalite'] } },
        { title: 'Üç gün boyunca üretilen araçlar etkilenir', text: 'Sorun bayilerden gelen şikâyetlerle fark edilir.', tech: 'Etki · Geri çağırma', blockedBy: [], apply: true }
      ],
      impact: {
        scope: { model: 'EOL' }, hours: 24, mods: { ir_plan: 0.8 },
        costs: [
          { label: 'Etkilenen araçların geri çağrılması', amount: 180000000, mods: { sbom: 0.6 } },
          { label: 'Tedarikçiyle hukuki süreç', amount: 8000000 },
          { label: 'Müşteri kaybı (itibar)', pct: 0.004 }
        ]
      },
      contained: { label: 'Reddedilen paketin incelenmesi', amount: 200000 },
      log: ['EOL-* → ECU UDS RequestDownload {paket:"tedarikçi-3.4.1"}']
    },
    {
      id: 'robotvpn', title: 'Robot bakım firmasının uzaktan erişimi', cat: 'Tedarikçi', place: 'hq', risks: ['K04'],
      summary: 'Bakım firmasında çalınan VPN parolasıyla kaynak robotlarının programları değiştirilir; hatalı kaynaklar fark edilmeden sürer.',
      stages: [
        { title: 'Bakım firmasında bilgi çalan zararlı', text: 'Teknisyenin bilgisayarındaki kayıtlı parolalar çalınır. Bu adım şirketin kontrolü dışındadır.', tech: 'T1555 · Kayıtlı parolalar', blockedBy: [], hit: { vendor: true } },
        { title: 'Sürekli açık VPN ile giriş', text: 'Erişim talep üzerine açılıyorsa ya da ikinci doğrulama varsa giriş başarısız olur.', tech: 'T0822 · Dış uzak hizmetler', blockedBy: ['vendor', 'mfa'], hit: { hq: ['teknik'] } },
        { title: 'Robot denetleyicisine geçiş', text: 'Bakım ağı ile robot hücreleri ayrılmamıştır; yönetici parolası ortaktır.', tech: 'T0859 · Geçerli hesaplar', blockedBy: ['ot_segment', 'pam'], hit: { hq: ['kaynak'] } },
        { title: 'Kaynak programları değiştirilir', text: 'Kaynak noktaları kayar; kalite kontrol bunu ancak günler sonra yakalar.', tech: 'T0833 · Kontrol mantığı değişikliği', blockedBy: [], hit: { hq: ['kaynak', 'kalite'] }, apply: true }
      ],
      impact: {
        scope: { model: 'KAYNAK' }, hours: 36, mods: { backup: 0.6, ot_ids: 0.5 },
        costs: [
          { label: 'Hatalı gövdelerin yeniden işlenmesi', amount: 35000000, mods: { ot_ids: 0.4 } },
          { label: 'Robot programlarının geri yüklenmesi', amount: 3000000, mods: { backup: 0.4 } },
          { label: 'Olay müdahalesi', amount: 4000000, mods: { ir_plan: 0.7 } }
        ]
      },
      contained: { label: 'Reddedilen girişin incelenmesi', amount: 100000 },
      log: ['VPN-BAKIM → KAYNAK-* Program.Yaz {nokta: kaydırıldı}']
    },
    {
      id: 'proto', title: 'Prototip stüdyosuna sızma ve tasarım verisi', cat: 'Fiziksel', place: 'hq', risks: ['K05', 'K22'],
      summary: 'Ziyaretçi kılığındaki biri prototip stüdyosuna girer, yeni modeli fotoğraflar ve kilitsiz bir CAD istasyonundan veri çeker.',
      stages: [
        { title: 'Ziyaretçi galerisinden turnikeye', text: 'Fabrika turundaki biri bir çalışanın arkasından turnikeden geçer. Eğitimli çalışan kapıyı tutmaz.', tech: 'Fiziksel · Peşinden girme', blockedBy: ['awareness'], hit: { hq: ['giris'] }, hq: { intruder: { room: 'giris', path: [[95.5, 41], [88, 41], [80, 36]] } } },
        { title: 'Ofis katından prototip stüdyosuna', text: 'Stüdyo kartlı ve kayıtlı gizli alansa kişi kapıda durur.', tech: 'Fiziksel · Yetkisiz alan erişimi', blockedBy: ['proto_sec'], hit: { hq: ['koridor', 'proto'] }, hq: { intruder: { room: 'proto', path: [[90, 16], [60, 16], [32, 16], [22, 22]] } } },
        { title: 'Kilitsiz CAD istasyonundan veri', text: 'İkinci doğrulama yoksa açık oturumdan PLM\'deki modeller USB\'ye kopyalanır.', tech: 'T1005 · Yerel sistemden veri', blockedBy: ['mfa'], hit: { hq: ['proto'] }, hq: { intruder: { room: 'proto', path: [[12, 26]] } } },
        { title: 'Tasarım basına ve rakibe sızar', text: 'Lansmandan aylar önce fotoğraflar yayımlanır.', tech: 'Etki · Gizlilik kaybı', blockedBy: [], hq: { intruder: null }, apply: true }
      ],
      impact: {
        scope: null, hours: 0,
        costs: [
          { label: 'Rekabet avantajı kaybı ve lansman değişikliği', amount: 180000000, mods: { logging: 0.8 } },
          { label: 'TISAX bulgusu ve müşteri denetimi', amount: 15000000 },
          { label: 'Hukuk süreci', amount: 5000000 }
        ]
      },
      contained: { label: 'Olayın incelenmesi', amount: 50000 }
    },
    {
      id: 'battfire', title: 'Batarya stokunda termal kaçak', cat: 'Fiziksel', place: 'hq', risks: ['K09'],
      summary: 'Hat içi stoktaki hasarlı bir batarya paketi ısınır. Erken algılama yoksa yangın montaj alanına yayılır, hol boşaltılır.',
      stages: [
        { title: 'Hasarlı paket ısınmaya başlar', text: 'Taşıma sırasında darbe almış bir paket hat içi stokta bekliyor.', tech: 'Fiziksel · Termal kaçak', blockedBy: [], hit: { hq: ['batdepo'] }, hq: { fire: ['batdepo'] } },
        { title: 'Erken algılama ve söndürme', text: 'Termal kamera ve gaz algılama varsa paket karantinaya alınır, yangın büyümez.', tech: 'Fiziksel · Yangın', blockedBy: ['fire'], hit: { hq: ['batarya'] }, hq: { fire: ['batarya'] } },
        { title: 'Hol boşaltılır, üretim durur', text: 'İtfaiye müdahalesinden sonra hol iki gün kapalı kalır.', tech: 'Erişilebilirlik kaybı', blockedBy: [], hit: { hq: ['montaj', 'eol', 'teknik'] }, hq: { evac: true }, apply: true }
      ],
      impact: {
        scope: { kind: 'URETIM' }, hours: 48, mods: { bcp: 0.6 },
        costs: [
          { label: 'Bina, hat ve stok hasarı (sigortalanabilir)', amount: 250000000, mods: { procedures: 0.8 } },
          { label: 'Kâr kaybı dışındaki ek giderler', amount: 20000000 },
          { label: 'Müşteri kaybı (itibar)', pct: 0.002 }
        ]
      },
      contained: { label: 'Paketin karantinası ve inceleme', amount: 300000 }
    },
    {
      id: 'quake', title: 'Kocaeli depremi: tesis durur', cat: 'Çevresel', place: 'hq', risks: ['K10'],
      summary: 'Marmara\'da büyük deprem; tesis hasar tespiti için kapatılır, veri merkezi ve hatlar devre dışı kalır.',
      stages: [
        { title: 'Deprem ve tahliye', text: 'Fabrika binası boşaltılır, hasar tespiti başlar.', tech: 'Doğal afet', blockedBy: [], hit: { hq: ['kaynak', 'boya', 'batarya', 'montaj', 'eol', 'kontrol', 'veri'] }, hq: { evac: true } },
        { title: 'Veri merkezi ve MES erişilemez', text: 'İkinci veri merkezi yoksa üretim planı ve izlenebilirlik verisi bina açılana kadar beklenir.', tech: 'Erişilebilirlik kaybı', blockedBy: [], hit: { hq: ['veri'] } },
        { title: 'Tedarik ve sevkiyat durur', text: 'Bölgedeki tedarikçiler de etkilenir.', tech: 'Görünürlük kaybı', blockedBy: [], apply: true }
      ],
      impact: {
        scope: { kind: 'URETIM' }, hours: 240, mods: { bcp: 0.5, procedures: 0.8 },
        costs: [
          { label: 'Bina ve hat hasarı (sigortalanabilir)', amount: 900000000 },
          { label: 'Geçici üretim ve lojistik', amount: 120000000, mods: { bcp: 0.4 } },
          { label: 'MES ve PLM verisinin geri yüklenmesi', amount: 20000000, mods: { backup: 0.3 } },
          { label: 'Müşteri kaybı (itibar)', pct: 0.005, mods: { bcp: 0.5 } }
        ]
      },
      contained: { label: '', amount: 0 }
    },
    {
      id: 'outage', title: 'Şebeke kesintisi ve gerilim çökmesi', cat: 'Çevresel', place: 'hq', risks: ['K11'],
      summary: 'OSB\'deki bir arızada gerilim çöker; koruma yoksa robotlar emniyete geçer, MES sunucuları kapanır.',
      stages: [
        { title: 'Gerilim çöker', text: 'UPS, jeneratör ve gerilim düzenleyici varsa veri merkezi ve kritik hatlar çalışmaya devam eder.', tech: 'Çevresel · Altyapı kesintisi', blockedBy: ['utilities'], hit: { hq: ['teknik'] }, hq: { dark: true }, onBlock: { ups: true } },
        { title: 'MES ve robotlar emniyete geçer', text: 'Hattın yeniden başlatılması ve kalite kontrolü saatler sürer.', tech: 'Erişilebilirlik kaybı', blockedBy: [], hit: { hq: ['veri', 'kontrol', 'kaynak', 'montaj'] }, apply: true }
      ],
      impact: {
        scope: { kind: 'URETIM' }, hours: 6, mods: { procedures: 0.7 },
        costs: [
          { label: 'Ani kapanmada donanım ve iş parçası hasarı', amount: 4000000 },
          { label: 'Hattın yeniden başlatılması ve kalite kontrolü', amount: 2000000, mods: { procedures: 0.7 } }
        ]
      },
      contained: { label: 'Jeneratör yakıtı ve kontrol', amount: 50000 }
    },
    {
      id: 'agvmitm', title: 'AGV kablosuz ağında sahte komutlar', cat: 'Siber', risks: ['K14'],
      summary: 'Misafir Wi-Fi ile aynı altyapıdaki AGV ağına geçen saldırgan sahte "dur" komutları gönderir; hat beslenemez.',
      stages: [
        { title: 'Misafir ağından AGV ağına geçiş', text: 'Ağlar ayrıysa bu yol kapalıdır.', tech: 'T0860 · Kablosuz ele geçirme', blockedBy: ['ot_segment'] },
        { title: 'Doğrulanmayan komutlar', text: 'Sertifikalı bağlantı yoksa AGV filo yöneticisi gibi davranılır.', tech: 'T0830 · Araya girme', blockedBy: ['cert_mgmt'] },
        { title: 'AGV\'ler durur, hat beslenemez', text: 'OT izleme varsa olağandışı komutlar hemen fark edilir.', tech: 'T0814 · Hizmet engelleme', blockedBy: [], hit: { hq: ['sevkiyat', 'montaj'] }, apply: true }
      ],
      impact: {
        scope: { model: 'AGV' }, hours: 8, mods: { ot_ids: 0.4 },
        costs: [
          { label: 'Hat duruşundan kaynaklı ek mesai', amount: 3000000, mods: { ot_ids: 0.4 } },
          { label: 'Ağın yeniden yapılandırılması', amount: 1500000 }
        ]
      },
      contained: { label: 'Şüpheli trafiğin incelenmesi', amount: 50000 },
      log: ['SAHTE → AGV-* VDA5050 instantActions {"stopPause"}']
    },
    {
      id: 'keytheft', title: 'Servis teşhis cihazından araç anahtarı', cat: 'Siber', risks: ['K08', 'K07'],
      summary: 'Bir servis noktasından çalınan teşhis cihazındaki kalıcı oturumla dijital araç anahtarları üretilir.',
      stages: [
        { title: 'Teşhis cihazı çalınır', text: 'Servis noktasında gözetimsiz bırakılan cihaz alınır.', tech: 'Fiziksel hırsızlık', blockedBy: [] },
        { title: 'Kalıcı oturumla merkeze giriş', text: 'Cihaz anahtar tutmuyor ve kısa ömürlü oturum alıyorsa giriş başarısız olur.', tech: 'T1078 · Geçerli hesaplar', blockedBy: ['hsm', 'pam'], hit: { csms: true } },
        { title: 'Dijital anahtar üretimi', text: 'Saldırgan araç anahtarlarını üretip araçları açar. VSOC varsa olağandışı anahtar üretimi yakalanır.', tech: 'Etki · Araç hırsızlığı', blockedBy: [], hit: { hq: ['vsoc'] }, apply: true }
      ],
      impact: {
        scope: { model: 'TESHIS' }, hours: 24, mods: { vsoc: 0.5 },
        costs: [
          { label: 'Çalınan araçlar ve tazminat', amount: 40000000, mods: { vsoc: 0.4 } },
          { label: 'Anahtar sisteminin yenilenmesi', amount: 12000000 },
          { label: 'Müşteri kaybı (itibar)', pct: 0.002 }
        ]
      },
      contained: { label: 'Cihazın iptali ve inceleme', amount: 30000 }
    },
    {
      id: 'supplier', title: 'Parça tedarikçisine fidye saldırısı', cat: 'Tedarikçi', risks: ['K12'], example: 'toyota',
      summary: 'Tam zamanında üretimde tek bir parça tedarikçisinin sistemleri şifrelenir; sipariş akışı durur ve hat beslenemez.',
      stages: [
        { title: 'Tedarikçinin sistemleri şifrelenir', text: 'Bu adım şirketin kontrolü dışındadır.', tech: 'T1486 · Etki için şifreleme', blockedBy: [], hit: { vendor: true } },
        { title: 'Sipariş akışı durur', text: 'İkinci tedarikçi ve emniyet stoğu varsa hat birkaç gün beslenmeye devam eder.', tech: 'Tedarik zinciri kesintisi', blockedBy: ['bcp'], hit: { hq: ['satinalma'] } },
        { title: 'Hat bir gün durur', text: 'Montaj hattı parça bekler.', tech: 'Üretim kaybı', blockedBy: [], hit: { hq: ['montaj'] }, apply: true }
      ],
      impact: {
        scope: { kind: 'URETIM' }, hours: 24, mods: {},
        costs: [
          { label: 'Ek lojistik ve hızlı sevkiyat', amount: 6000000 },
          { label: 'Bayi teslimat gecikmesi', amount: 10000000 }
        ]
      },
      contained: { label: 'Emniyet stoğundan besleme', amount: 1500000 }
    },
    {
      id: 'insider', title: 'Ayrılan mühendisin açık kalan hesabı', cat: 'İnsan ve süreç', place: 'hq', risks: ['K16'],
      summary: 'Rakibe geçen bir tasarım mühendisinin hesabı kapatılmaz; evden girip yeni modelin tasarım verisini indirir.',
      stages: [
        { title: 'Mühendis ayrılır, hesabı açık kalır', text: 'Yazılı çıkış prosedürü veya düzenli yetki gözden geçirmesi varsa hesap ilk gün kapanır.', tech: 'İnsan · Süreç hatası', blockedBy: ['procedures', 'pam'], hit: { hq: ['proto'] } },
        { title: 'Evden eski parolayla giriş', text: 'İkinci doğrulama adımı varsa kayıtlı telefon iade edildiği için giriş başarısız olur.', tech: 'T1078 · Geçerli hesaplar', blockedBy: ['mfa'] },
        { title: 'PLM\'den toplu indirme', text: 'Merkezi kayıt izleme varsa toplu indirme alarm üretir.', tech: 'T1213 · Bilgi depolarından veri', blockedBy: [], hit: { hq: ['proto', 'veri'] }, apply: true }
      ],
      impact: {
        scope: null, hours: 0,
        costs: [
          { label: 'Rekabet avantajı kaybı', amount: 70000000, mods: { logging: 0.5 } },
          { label: 'Hukuk süreci', amount: 4000000, mods: { ir_plan: 0.8 } }
        ]
      },
      contained: { label: 'Hesap denetimi', amount: 20000 }
    }
  ];

  // Arama tabloları (veri değişti; eşlemeler yeniden kurulur)
  SK.controlMap = {};
  SK.controls.forEach(c => {
    SK.controlMap[c.key] = c;
    const first = c.iso.replace('Madde 4–10 · ', '').trim().charAt(0);
    c.theme = { '5': 'Kurumsal', '6': 'İnsan', '7': 'Fiziksel', '8': 'Teknolojik' }[first] || 'Kurumsal';
  });
  SK.defaultEnabled = SK.controls.filter(c => c.on).map(c => c.key);
  SK.riskMap = {};
  SK.risks.forEach(r => { SK.riskMap[r.id] = r; });
  SK.scenarioMap = {};
  SK.scenarios.forEach(x => { SK.scenarioMap[x.id] = x; });
  SK.policyMap = {};
  SK.policies.forEach(p => { SK.policyMap[p.key] = p; });
})(window.SK);
