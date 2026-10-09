/* Olay senaryoları: siber saldırı, fiziksel olay, çevresel afet, tedarikçi ve insan kaynaklı olaylar.
   place: 'hq' olan senaryolar öncelikle merkez binanın kat planında canlanır; stage.hq binadaki fiziksel durumu değiştirir
   (fire: yanan odalar, dark: elektrik yok, evac: bina boşaltıldı, intruder: yetkisiz kişinin konumu ve izi), onBlock: adım durdurulunca.
   Her adımın blockedBy listesindeki kontrollerden biri açıksa senaryo o adımda durur.
   impact.scope: etkilenen soketler · hours: kesinti süresi · mods: açık kontrolün çarpanı
   costs[].pct: yıllık gelirin yüzdesi olarak itibar/müşteri kaybı */
(function (SK) {
  'use strict';

  SK.scenarios = [
    {
      id: 'csms', title: 'Merkezi yönetim sisteminin ele geçirilmesi', cat: 'Siber', risks: ['R01', 'R14'],
      summary: 'Oltalamayla çalınan bir operatör hesabıyla bütün ağa uzaktan durdurma komutu gönderilir.',
      stages: [
        { title: 'Operatöre sahte oturum e-postası', text: 'Operasyon merkezindeki bir operatöre "CSMS oturumunuz sona erdi" başlıklı e-posta gelir ve sahte giriş sayfasına parolasını yazar.', tech: 'T1566 · Oltalama', blockedBy: ['awareness'], hit: { hq: ['noc'] } },
        { title: 'Çalınan parolayla yönetim paneline giriş', text: 'Saldırgan parolayla CSMS paneline girer. İkinci doğrulama adımı yoksa giriş başarılı olur.', tech: 'T1078 · Geçerli hesaplar', blockedBy: ['mfa'], hit: { csms: true } },
        { title: 'Yönetici yetkisine yükselme', text: 'Operatör hesabı ortak yönetici hesabının kayıtlı parolasını görebilmektedir. Saldırgan tam yetki alır.', tech: 'T1078.003 · Yerel/ortak hesaplar', blockedBy: ['pam'], hit: { csms: true } },
        { title: 'Bütün ağa toplu durdurma komutu', text: 'Tüm cihazlara RemoteStopTransaction ve ChangeAvailability(Inoperative) gönderilir. Şarjdaki araçlar durur.', tech: 'T0831 · Kontrol manipülasyonu', blockedBy: ['load_guard'], hit: { csms: true }, apply: true }
      ],
      impact: {
        scope: { all: true }, hours: 20, mods: { ir_plan: 0.6, logging: 0.7, backup: 0.85 },
        costs: [
          { label: 'Olay müdahale ve adli inceleme', amount: 600000, mods: { ir_plan: 0.7 } },
          { label: 'Sistemlerin yeniden kurulması', amount: 450000, mods: { backup: 0.5 } },
          { label: 'Müşteri iadeleri ve tazminat', amount: 250000 },
          { label: 'EPDK idari yaptırım riski', amount: 1200000 },
          { label: 'Müşteri kaybı (itibar)', pct: 0.02, mods: { ir_plan: 0.75 } }
        ]
      },
      contained: { label: 'Engellenen girişimin incelenmesi', amount: 40000 },
      log: ['CSMS → * RemoteStopTransaction', 'CSMS → * ChangeAvailability {type:"Inoperative"}']
    },
    {
      id: 'ransom', title: 'Merkez ofiste fidye yazılımı', cat: 'Siber', place: 'hq', risks: ['R02'],
      summary: 'Muhasebeye gelen ekli bir e-postayla başlayan saldırı dosya sunucusunu ve ERP\'yi şifreler.',
      stages: [
        { title: 'Ekli e-posta açılır', text: 'Muhasebeye "Fatura_Ekim.zip" ekli e-posta gelir ve açılır.', tech: 'T1566.001 · Oltalama eki', blockedBy: ['awareness'], hit: { hq: ['muhasebe'] } },
        { title: 'Zararlı yazılım çalışır', text: 'Ekteki betik fidye yazılımını indirir ve bilgisayarda çalıştırır.', tech: 'T1204 · Kullanıcı çalıştırması', blockedBy: ['edr'], hit: { hq: ['muhasebe'] } },
        { title: 'Ağda yayılma', text: 'Düz ofis ağında dosya sunucusuna ve ERP sunucusuna erişilir.', tech: 'T1021 · Uzak hizmetler', blockedBy: ['segment'], hit: { hq: ['sunucu'] } },
        { title: 'Şifreleme ve fidye notu', text: 'Dosya sunucusu, ERP ve çağrı merkezi kayıtları şifrelenir. Faturalama ve tahsilat durur.', tech: 'T1486 · Etki için veri şifreleme', blockedBy: [], hit: { hq: ['sunucu', 'cagri', 'yonetim'] }, apply: true }
      ],
      impact: {
        scope: null, hours: 72, mods: { backup: 0.35, ir_plan: 0.7 },
        costs: [
          { label: 'Veri kurtarma ve olay müdahalesi', amount: 900000, mods: { backup: 0.3, ir_plan: 0.7 } },
          { label: 'Faturalama ve tahsilat gecikmesi', amount: 600000, mods: { backup: 0.4 } },
          { label: 'Çağrı merkezi kesintisi', amount: 150000, mods: { procedures: 0.6 } },
          { label: 'Kişisel veri ihlali bildirimi', amount: 300000, mods: { privacy: 0.6 } }
        ]
      },
      contained: { label: 'Bilgisayarın temizlenmesi ve inceleme', amount: 30000 }
    },
    {
      id: 'firmware', title: 'Zararlı firmware güncellemesi', cat: 'Tedarikçi', risks: ['R03', 'R11'], example: 'm11',
      summary: 'Üreticinin güncelleme altyapısından arka kapılı firmware gelir ve bir modelin bütün üniteleri kilitlenir.',
      stages: [
        { title: 'Üreticinin güncelleme sunucusu ele geçirilir', text: 'Üretici C\'nin güncelleme altyapısına sızılır. Bu adım şirketin kontrolü dışındadır.', tech: 'T1195 · Tedarik zinciri saldırısı', blockedBy: [], hit: { vendor: true } },
        { title: 'Arka kapılı firmware yayınlanır', text: 'DC 120 kW modeli için imzasız, arka kapılı yeni sürüm yayınlanır. İmza doğrulaması varsa cihaz sürümü reddeder.', tech: 'T0857 · Sistem firmware\'i', blockedBy: ['signed_fw'], hit: { vendor: true, csms: true } },
        { title: 'Güncelleme bütün ünitelere iner', text: 'CSMS güncellemeyi aynı anda bütün DC 120 kW ünitelere gönderir. Kademeli güncelleme varsa yalnızca pilot grup etkilenir.', tech: 'T1072 · Yazılım dağıtım araçları', blockedBy: [], hit: { csms: true } },
        { title: 'Üniteler kilitlenir, ekranlarda mesaj', text: 'Üniteler hizmet dışı kalır ve ekranlarda saldırganın mesajı görünür.', tech: 'T1491 · Görünüm bozma', blockedBy: [], apply: true }
      ],
      impact: {
        scope: { model: 'DC120-C' }, scopeMods: { staged_update: 0.08 }, hours: 96, mods: { ir_plan: 0.8, procedures: 0.85 },
        costs: [
          { label: 'Sahada yeniden yükleme (saha ekibi)', amount: 280000, mods: { staged_update: 0.08 } },
          { label: 'Üreticiyle hukuki süreç', amount: 150000 },
          { label: 'Müşteri kaybı (itibar)', pct: 0.015, mods: { staged_update: 0.2 } }
        ]
      },
      contained: { label: 'Reddedilen güncellemenin incelenmesi', amount: 25000 },
      log: ['CSMS → CP-* UpdateFirmware {location:"https://guncelleme.uretici-c.example/fw-1.9.0.bin"}', 'CP-* → FirmwareStatusNotification {status:"Installed"}']
    },
    {
      id: 'mitm', title: 'Şifresiz OCPP\'de araya girme', cat: 'Siber', risks: ['R04', 'R20'],
      summary: 'AVM ağına bağlanan saldırgan şifresiz OCPP trafiğini ele geçirip sahte komut gönderir.',
      stages: [
        { title: 'Ev sahibinin ağına erişim', text: 'Saldırgan bir AVM\'nin misafir ağından, şarj ünitelerinin de bağlı olduğu kablolu ağa geçer. Cihazlar şirketin özel APN\'indeyse bu yol kapalıdır.', tech: 'T1199 · Güvenilen ilişki', blockedBy: ['segment'] },
        { title: 'Şifresiz trafik dinlenir', text: 'Profil 1 ile bağlanan AC ünitelerin ws:// trafiği okunur, cihaz parolaları yakalanır.', tech: 'T0830 · Araya girme', blockedBy: ['ocpp_tls'] },
        { title: 'Sahte "hizmet dışı" komutları', text: 'Merkezmiş gibi davranarak ChangeAvailability(Inoperative) komutları gönderilir.', tech: 'T0831 · Kontrol manipülasyonu', blockedBy: [] },
        { title: 'Operasyon merkezi yanlış durum görür', text: 'Cihazlar merkeze "kullanılabilir" bildirmeye devam ederken müşterilere hizmet vermez.', tech: 'T0832 · Görünüm manipülasyonu', blockedBy: [], hit: { hq: ['noc'] }, apply: true }
      ],
      impact: {
        scope: { model: 'AC22-A', link: 'host' }, hours: 30, mods: { logging: 0.4, ir_plan: 0.8 },
        costs: [
          { label: 'Saha kontrolleri ve parola yenileme', amount: 180000 },
          { label: 'Müşteri iadeleri', amount: 120000 },
          { label: 'Platforma yanlış durum bildirimi (EPDK)', amount: 250000, mods: { logging: 0.5 } },
          { label: 'Müşteri kaybı (itibar)', pct: 0.005 }
        ]
      },
      contained: { label: 'Şüpheli ağ trafiğinin incelenmesi', amount: 20000 },
      log: ['SAHTE-CSMS → CP-* ChangeAvailability {type:"Inoperative"}']
    },
    {
      id: 'ble', title: 'Bluetooth üzerinden cihaz ele geçirme', cat: 'Siber', risks: ['R05', 'R11'], example: 'pwn',
      summary: 'Otoparktaki saldırgan açık Bluetooth zafiyetiyle bir üniteyi ele geçirir ve aynı ağdaki diğerlerine yayılır.',
      stages: [
        { title: 'Saldırgan üniteye yaklaşır', text: 'Bir otel otoparkında AC üniteye 10 metre mesafede durulur.', tech: 'Fiziksel yakınlık', blockedBy: [] },
        { title: 'Bluetooth zafiyetiyle kod çalıştırma', text: 'Sahada açık bırakılan Bluetooth arayüzündeki bellek taşması hatasıyla cihazda kod çalıştırılır.', tech: 'T0866 · Uzak hizmet istismarı', blockedBy: ['tamper', 'vuln_mgmt'] },
        { title: 'Ekranda uygunsuz içerik', text: 'Ünitenin ekranında uygunsuz görsel gösterilir, sosyal medyada paylaşılır.', tech: 'T1491 · Görünüm bozma', blockedBy: [] },
        { title: 'Aynı ağdaki ünitelere yayılma', text: 'Ele geçirilen ünite, düz APN ağında aynı modeldeki diğer AC üniteleri tarar ve onları da ele geçirir.', tech: 'T1046 · Ağ servis keşfi', blockedBy: ['segment'], containedCost: { label: 'Tek ünitenin onarımı ve itibar', amount: 220000 }, apply: true }
      ],
      impact: {
        scope: { model: 'AC22-A', link: 'apn' }, hours: 24, mods: { logging: 0.6, ir_plan: 0.8 },
        costs: [
          { label: 'Ünitelerin yeniden kurulumu', amount: 160000 },
          { label: 'Basın ve itibar yönetimi', amount: 90000 },
          { label: 'Müşteri kaybı (itibar)', pct: 0.01 }
        ]
      },
      contained: { label: 'Yakalanan denemenin incelenmesi', amount: 15000 }
    },
    {
      id: 'meter', title: 'Ölçüm verisi manipülasyonu', cat: 'Siber', risks: ['R06', 'R29'],
      summary: 'Sayaç çarpanı gizlice değiştirilir; aylarca fazla faturalama yapılır.',
      stages: [
        { title: 'Yetkili bir hesap kötüye kullanılır', text: 'Tarife ve ölçüm ayarlarına erişimi olan bir hesap (içeriden biri ya da çalınmış hesap) kullanılır.', tech: 'T1078 · Geçerli hesaplar', blockedBy: [], hit: { csms: true } },
        { title: 'Sayaç çarpanı %8 artırılır', text: 'Bazı DC ünitelerde ölçüm değerine çarpan eklenir. İmzalı ölçüm verisi kullanılıyorsa değişiklik imzayı bozar; çift onay varsa değişiklik tek kişiyle yapılamaz.', tech: 'T1565 · Veri manipülasyonu', blockedBy: ['signed_meter', 'sod'], hit: { csms: true } },
        { title: 'Aylarca süren fazla faturalama', text: 'Şikâyetler artana kadar fark edilmez. Merkezi kayıt izleme varsa anormal tüketim erken yakalanır.', tech: 'T0856 · Sahte durum bildirimi', blockedBy: [], hit: { hq: ['cagri', 'muhasebe'] }, apply: true }
      ],
      impact: {
        scope: null, hours: 0,
        costs: [
          { label: 'Müşterilere iade', amount: 1100000, mods: { logging: 0.35 } },
          { label: 'EPDK ve tüketici hakem heyeti süreçleri', amount: 800000, mods: { logging: 0.5 } },
          { label: 'Müşteri kaybı (itibar)', pct: 0.015, mods: { logging: 0.5 } }
        ]
      },
      contained: { label: 'Reddedilen değişikliğin incelenmesi', amount: 10000 },
      log: ['CP-* → MeterValues {sampledValue:[{value:"…", signedMeterValue: null}]}']
    },
    {
      id: 'leak', title: 'Mobil uygulamadan müşteri verisi sızıntısı', cat: 'Siber', risks: ['R07', 'R35', 'R36'],
      summary: 'API\'deki yetki hatasıyla 120.000 kullanıcının konum geçmişi ve plakası çekilir.',
      stages: [
        { title: 'API incelenir', text: 'Saldırgan uygulamanın trafiğini izleyerek API uç noktalarını çıkarır.', tech: 'T1595 · Aktif tarama', blockedBy: [] },
        { title: 'Yetki hatası bulunur', text: 'Kullanıcı numarası değiştirilerek başka kullanıcıların oturum geçmişi okunabildiği görülür.', tech: 'T1190 · Açık uygulamanın istismarı', blockedBy: ['secure_dev'] },
        { title: 'Toplu veri çekme', text: '120.000 kullanıcının konum geçmişi, plakası ve telefonu otomatik olarak çekilir. WAF istek sınırı varsa çekme birkaç bin kayıtta kesilir.', tech: 'T1567 · Web servisiyle sızdırma', blockedBy: ['waf'], containedCost: { label: 'Sınırlı sızıntı (birkaç bin kayıt) ve bildirim', amount: 350000 } },
        { title: 'Veriler satışa çıkar', text: 'Veri kümesi bir forumda satışa çıkar. KVKK\'ya 72 saat içinde bildirim gerekir.', tech: 'Etki · Gizlilik kaybı', blockedBy: [], hit: { hq: ['cagri'] }, apply: true }
      ],
      impact: {
        scope: null, hours: 0,
        costs: [
          { label: 'KVKK idari para cezası riski', amount: 1800000, mods: { privacy: 0.5, ir_plan: 0.8 } },
          { label: 'Bildirim, çağrı merkezi ve hukuk giderleri', amount: 450000, mods: { ir_plan: 0.7 } },
          { label: 'Kullanıcı tazminat talepleri', amount: 900000, mods: { privacy: 0.5 } },
          { label: 'Müşteri kaybı (itibar)', pct: 0.03, mods: { ir_plan: 0.8 } }
        ]
      },
      contained: { label: 'Hatanın kapatılması ve inceleme', amount: 60000 }
    },
    {
      id: 'cert', title: 'Sertifika süresinin dolması', cat: 'İnsan ve süreç', risks: ['R12'],
      summary: 'Saldırı olmadan, süresi dolan bir sertifika bütün DC üniteleri gece yarısı çevrimdışı bırakır.',
      stages: [
        { title: 'Sunucu sertifikasının süresi dolar', text: 'CSMS\'in TLS sertifikası gece 03:00\'te geçersiz olur. Otomatik yenileme varsa sertifika 30 gün önce yenilenmiştir.', tech: 'Kasıtsız olay', blockedBy: ['cert_mgmt'], hit: { csms: true } },
        { title: 'TLS kullanan cihazlar bağlantıyı reddeder', text: 'Profil 2 ve 3 ile bağlanan bütün DC üniteler merkeze bağlanamaz. Şifresiz bağlanan AC üniteler ise çalışmaya devam eder.', tech: 'Erişilebilirlik kaybı', blockedBy: [], apply: true },
        { title: 'Sorun müşteri şikâyetiyle fark edilir', text: 'İzleme yoksa operasyon merkezi sorunu sabah gelen şikâyetlerle öğrenir.', tech: 'Tespit gecikmesi', blockedBy: [], hit: { hq: ['noc', 'cagri'] } }
      ],
      impact: {
        scope: { kind: 'DC' }, hours: 9, mods: { logging: 0.4, procedures: 0.7 },
        costs: [
          { label: 'Acil müdahale', amount: 60000 },
          { label: 'Müşteri kaybı (itibar)', pct: 0.005 }
        ]
      },
      contained: { label: 'Planlı sertifika yenileme', amount: 0 }
    },
    {
      id: 'cable', title: 'Kablo hırsızlığı dalgası', cat: 'Fiziksel', risks: ['R21'], example: 'trugo',
      summary: 'Bir gecede Konya\'daki akaryakıt istasyonlarında ve yol kenarı tesislerde kablolar kesilir.',
      stages: [
        { title: 'Gece kablolar kesilir', text: 'Saat 02:00\'de dört lokasyonda şarj kabloları kesilir. Kamera ve kablo kesme alarmı varsa ekip ve kolluk dakikalar içinde haberdar olur.', tech: 'Fiziksel hırsızlık', blockedBy: [], apply: true },
        { title: 'Üniteler kullanılamaz', text: 'Kablo değişene kadar üniteler hizmet dışıdır. Yedek kablo depoda yoksa süre uzar.', tech: 'Erişilebilirlik kaybı', blockedBy: [], hit: { hq: ['depo', 'saha'] } }
      ],
      impact: {
        scope: { siteTypes: ['Akaryakıt', 'Otoyol'], districts: ['Selçuklu', 'Karatay', 'Meram', 'Kulu'] }, scopeMods: { cctv: 0.5, tamper: 0.7 }, hours: 48, mods: { cctv: 0.6 },
        costs: [
          { label: 'Kablo ve konnektör yenileme', amount: 260000, mods: { cctv: 0.5, tamper: 0.7 } },
          { label: 'Saha ekibi mesaisi', amount: 40000 }
        ]
      },
      contained: { label: 'Önlenen hırsızlık', amount: 0 }
    },
    {
      id: 'quake', title: 'Deprem: merkez tesis kullanılamaz', cat: 'Çevresel', place: 'hq', risks: ['R25'],
      summary: 'Ankara\'daki depremde merkez bina boşaltılır; yerel sunucular ve operasyon merkezi devre dışı kalır.',
      stages: [
        { title: 'Deprem ve bina tahliyesi', text: 'Ankara\'da 6,1 büyüklüğünde deprem olur. Merkez bina hasar tespiti için kapatılır.', tech: 'Doğal afet', blockedBy: [], hit: { hq: ['noc', 'cagri', 'sunucu', 'yonetim', 'muhasebe', 'satis', 'yazilim', 'bg', 'toplanti', 'koridor'] }, hq: { evac: true } },
        { title: 'Yerel sunucular erişilemez', text: 'Dosya sunucusu ve ERP\'ye ulaşılamaz. Bölge dışında yedek yoksa veriler binanın açılmasını bekler.', tech: 'Erişilebilirlik kaybı', blockedBy: [], hit: { hq: ['sunucu'] } },
        { title: 'Ağ izlenemez', text: 'CSMS bulutta çalışır ama izleyen ve müdahale eden yoktur. Ankara\'daki bazı lokasyonlarda elektrik kesintisi sürer.', tech: 'Görünürlük kaybı', blockedBy: [], apply: true }
      ],
      impact: {
        scope: { city: 'ANK', fraction: 0.3 }, hours: 36, mods: { bcp: 0.5, procedures: 0.7 },
        costs: [
          { label: 'Bina hasarı ve ekipman (sigortalanabilir)', amount: 4500000 },
          { label: 'Operasyonun geçici yere taşınması', amount: 600000, mods: { bcp: 0.4, procedures: 0.6 } },
          { label: 'ERP ve dosyaların geri yüklenmesi', amount: 400000, mods: { backup: 0.3 } },
          { label: 'Müşteri kaybı (itibar)', pct: 0.01, mods: { bcp: 0.5 } }
        ]
      },
      contained: { label: '', amount: 0 }
    },
    {
      id: 'grid', title: 'Toplu yük manipülasyonu', cat: 'Siber', risks: ['R14'],
      summary: 'Açıkta unutulan bir API anahtarıyla bütün DC üniteler akşam pikinde aynı anda açılıp kapatılır.',
      stages: [
        { title: 'API anahtarı açıkta bulunur', text: 'Bir geliştiricinin herkese açık kod deposunda CSMS API anahtarı unutulmuştur.', tech: 'T1552 · Güvensiz kimlik bilgileri', blockedBy: ['cloud_sec', 'secure_dev'] },
        { title: 'Bütün DC ünitelere güç profili', text: 'API ile bütün DC ünitelere maksimum güç profili gönderilir. Toplu komut koruması varsa komut çift onaya takılır.', tech: 'T0831 · Kontrol manipülasyonu', blockedBy: ['load_guard'], hit: { csms: true } },
        { title: 'Akşam pikinde aç-kapa döngüsü', text: '10 saniye aralıkla toplu başlat/durdur komutları gönderilir.', tech: 'T0816 · Cihaz yeniden başlatma/kapatma', blockedBy: [], hit: { csms: true } },
        { title: 'Dağıtım şebekesinde koruma devreye girer', text: 'Trafolardaki koruma röleleri açar, bölgesel elektrik kesintisi yaşanır.', tech: 'T0826 · Erişilebilirlik kaybı', blockedBy: [], apply: true }
      ],
      impact: {
        scope: { kind: 'DC' }, hours: 12, mods: { ir_plan: 0.7, logging: 0.6 },
        costs: [
          { label: 'Dağıtım şirketinin tazminat talebi', amount: 6000000, mods: { ir_plan: 0.8 } },
          { label: 'EPDK soruşturması', amount: 3000000 },
          { label: 'Olay müdahalesi', amount: 500000, mods: { ir_plan: 0.7 } },
          { label: 'Müşteri kaybı (itibar)', pct: 0.03 }
        ]
      },
      contained: { label: 'Anahtarın iptali ve inceleme', amount: 30000 },
      log: ['API → CP-* SetChargingProfile {limit: max}', 'API → CP-* RequestStopTransaction', 'API → CP-* RequestStartTransaction']
    },
    {
      id: 'vendor', title: 'Bakım firmasının VPN\'i üzerinden saldırı', cat: 'Tedarikçi', risks: ['R17'],
      summary: 'Bakım firmasının sürekli açık VPN parolası çalınır; Konya\'daki üniteler sürekli yeniden başlatılır.',
      stages: [
        { title: 'Bakım firmasında bilgi çalan zararlı', text: 'Bakım firmasındaki bir teknisyenin bilgisayarına bilgi çalan zararlı yazılım bulaşır. Bu adım şirketin kontrolü dışındadır.', tech: 'T1555 · Kayıtlı parolalar', blockedBy: [], hit: { vendor: true } },
        { title: 'Sürekli açık VPN ile giriş', text: 'Çalınan ortak parolayla VPN\'e girilir. Erişim yalnızca talep üzerine açılıyorsa veya ikinci doğrulama varsa giriş başarısız olur.', tech: 'T1133 · Dış uzak hizmetler', blockedBy: ['vendor', 'mfa'], hit: { vendor: true } },
        { title: 'CSMS yönetim ağına geçiş', text: 'VPN ağı ile CSMS yönetim ağı ayrılmamıştır.', tech: 'T1021 · Uzak hizmetler', blockedBy: ['segment', 'pam'], hit: { csms: true } },
        { title: 'Konya\'da yeniden başlatma döngüsü', text: 'Konya\'daki bütün ünitelere 5 dakikada bir Reset komutu gönderilir.', tech: 'T0816 · Cihaz yeniden başlatma', blockedBy: [], apply: true }
      ],
      impact: {
        scope: { city: 'KON' }, hours: 16, mods: { logging: 0.5, ir_plan: 0.7 },
        costs: [
          { label: 'Olay müdahalesi', amount: 350000, mods: { ir_plan: 0.7 } },
          { label: 'Sözleşme ve hukuk süreci', amount: 120000 },
          { label: 'Müşteri kaybı (itibar)', pct: 0.008 }
        ]
      },
      contained: { label: 'Reddedilen girişin incelenmesi', amount: 20000 },
      log: ['CSMS → CP-KON-* Reset {type:"Hard"}']
    },
    {
      id: 'intruder', title: 'Kargo görevlisi kılığında binaya sızma', cat: 'Fiziksel', place: 'hq', risks: ['R01'],
      summary: 'Elinde koliyle gelen biri bir çalışanın arkasından binaya girer, operasyon merkezindeki kilitsiz konsola USB takar.',
      stages: [
        { title: 'Çalışanın arkasından kartlı kapıdan geçiş', text: 'Sabah 08:50\'de elinde koli olan biri "imza alacağım" diyerek resepsiyonu geçer ve bir çalışanın arkasından kartlı kapıdan içeri girer. Eğitim almış bir çalışan kapıyı tutmaz, kişiyi resepsiyona geri yönlendirir.', tech: 'Fiziksel · Peşinden girme', blockedBy: ['awareness'], hit: { hq: ['giris'] }, hq: { intruder: { room: 'giris', path: [[0.4, 16], [4, 16], [7.5, 14.5]] } } },
        { title: 'Merdivenden operasyon merkezine', text: 'Kişi 1. kata çıkar. Vardiya değişiminde operasyon merkezinin kapısı aralık kalmıştır ve içeride kimse yoktur.', tech: 'Fiziksel · Yetkisiz alan erişimi', blockedBy: [], hit: { hq: ['koridor', 'noc'] }, hq: { intruder: { room: 'noc', path: [[19.5, 10], [12, 10], [5, 10], [5, 6.5]] } } },
        { title: 'Kilitsiz konsola kötü amaçlı USB', text: 'Açık bırakılmış CSMS konsoluna klavye gibi davranan bir USB bellek takılır ve 10 saniyede uzaktan erişim aracı kurulur. Uç nokta koruması (EDR) bu davranışı tanırsa bilgisayarı ağdan ayırır.', tech: 'T1200 · Donanım ekleme', blockedBy: ['edr'], hit: { hq: ['noc'] }, hq: { intruder: { room: 'noc', path: [[3, 4]] } } },
        { title: 'Dışarıdan operatör oturumuyla komut', text: 'Kişi binadan ayrılır. Saldırgan konsolu uzaktan yönetir ve açık operatör oturumuyla Ankara\'daki ünitelere toplu durdurma komutu gönderir. Toplu komut koruması varsa komut çift onaya takılır.', tech: 'T0831 · Kontrol manipülasyonu', blockedBy: ['load_guard'], hit: { csms: true }, hq: { intruder: null }, apply: true }
      ],
      impact: {
        scope: { city: 'ANK' }, hours: 8, mods: { ir_plan: 0.7, logging: 0.6 },
        costs: [
          { label: 'Olay müdahalesi ve kamera kayıtlarının incelenmesi', amount: 250000, mods: { ir_plan: 0.7 } },
          { label: 'Müşteri iadeleri', amount: 90000 },
          { label: 'Müşteri kaybı (itibar)', pct: 0.006 }
        ]
      },
      contained: { label: 'Olayın incelenmesi ve kapı kuralının hatırlatılması', amount: 8000 },
      log: ['CSMS → CP-ANK-* RequestStopTransaction', 'CSMS → CP-ANK-* ChangeAvailability {type:"Inoperative"}']
    },
    {
      id: 'outage', title: 'Merkezde uzun elektrik kesintisi', cat: 'Çevresel', place: 'hq', risks: ['R28'],
      summary: 'OSTİM\'deki bir trafo arızası merkez binada elektriği 9 saat keser. Yedek güç yoksa sunucular kapanır, operasyon merkezi kör kalır.',
      stages: [
        { title: 'Şebeke elektriği kesilir', text: 'Fırtınadan sonra OSTİM\'deki bir trafo arızalanır ve merkez binada elektrik gider. UPS ve jeneratör varsa sistemler kesintisiz çalışmaya devam eder.', tech: 'Çevresel · Altyapı kesintisi', blockedBy: ['utilities'], hit: { hq: ['teknik'] }, hq: { dark: true }, onBlock: { ups: true } },
        { title: 'Sunucu odası ısınır, sunucular kapanır', text: 'Klima durur ve oda 40 dakikada 35 °C\'yi geçer. Dosya sunucusu ve ERP aniden kapanır, bazı diskler zarar görür.', tech: 'Erişilebilirlik kaybı', blockedBy: [], hit: { hq: ['sunucu'] } },
        { title: 'Operasyon merkezi kör kalır', text: 'Video duvarı ve konsollar kapalıdır. Cihazlar buluttaki CSMS\'e bağlı olduğu için şarj sürer, ama arızalar ve müşteri çağrıları saatlerce karşılanamaz.', tech: 'Görünürlük kaybı', blockedBy: [], hit: { hq: ['noc', 'cagri'] }, apply: true }
      ],
      impact: {
        scope: null, hours: 0,
        costs: [
          { label: 'Ani kapanmada donanım hasarı', amount: 120000 },
          { label: 'ERP ve dosyaların kontrolü, geri yükleme', amount: 90000, mods: { backup: 0.5 } },
          { label: 'Fark edilmeyen arızalar yüzünden kayıp şarj', amount: 70000, mods: { procedures: 0.7 } },
          { label: 'Karşılanamayan çağrılar ve iadeler', amount: 60000, mods: { procedures: 0.7 } }
        ]
      },
      contained: { label: 'Jeneratör yakıtı ve kesinti sonrası kontrol', amount: 8000 }
    },
    {
      id: 'hqfire', title: 'Teknik odada yangın', cat: 'Fiziksel', place: 'hq', risks: ['R28'],
      summary: 'Gece teknik odadaki eski bir UPS bataryası alev alır. Yangın üst kattaki sunucu odasına sıçrar ve bina iki gün kapalı kalır.',
      stages: [
        { title: 'UPS bataryası aşırı ısınır', text: 'Gece 02:10\'da zemin kattaki teknik odada eski bir UPS bataryası şişer ve duman çıkarır. Bina boştur; duman dedektörü güvenlik kulübesine alarm verir.', tech: 'Fiziksel · Donanım arızası', blockedBy: [], hit: { hq: ['teknik'] }, hq: { fire: ['teknik'] } },
        { title: 'Yangın sunucu odasına sıçrar', text: 'Alevler kablo kanalından hemen üstteki sunucu odasına ulaşır. Dosya sunucusu, ERP ve yedekleme cihazı yanar.', tech: 'Fiziksel · Yangın', blockedBy: [], hit: { hq: ['sunucu', 'bg'] }, hq: { fire: ['sunucu'] } },
        { title: 'Bina kapanır, yerel veriler kaybolur', text: 'İtfaiye yangını söndürür ama bina iki gün kapalı kalır. Yedeğin bir kopyası bina dışında değilse ERP ve dosyalar geri gelmez. Cihazlar buluttaki CSMS\'e bağlı olduğu için şarj sürer.', tech: 'Erişilebilirlik ve bütünlük kaybı', blockedBy: [], hit: { hq: ['noc', 'cagri', 'yonetim', 'muhasebe'] }, hq: { evac: true }, apply: true }
      ],
      impact: {
        scope: null, hours: 0,
        costs: [
          { label: 'Bina ve donanım hasarı (sigortalanabilir)', amount: 1800000 },
          { label: 'ERP ve dosyaların yeniden kurulması', amount: 600000, mods: { backup: 0.25 } },
          { label: 'Operasyonun geçici yere taşınması', amount: 350000, mods: { bcp: 0.5, procedures: 0.6 } },
          { label: 'Faturalama gecikmesi', amount: 250000, mods: { backup: 0.4 } },
          { label: 'Müşteri kaybı (itibar)', pct: 0.004, mods: { ir_plan: 0.8 } }
        ]
      },
      contained: { label: '', amount: 0 }
    },
    {
      id: 'flood', title: 'Sağanakta AVM otoparkını su basması', cat: 'Çevresel', risks: ['R26'],
      summary: 'Ankara\'da bir saatte 40 mm yağış düşer. AVM\'lerin en alt otopark katı su dolar ve oradaki üniteler su altında kalır.',
      stages: [
        { title: 'Ani sağanak, rampadan su iner', text: 'Akşam 18:00\'de turuncu meteoroloji uyarısından sonra sağanak başlar. AVM otoparklarının rampalarından alt kata su iner.', tech: 'Doğal olay', blockedBy: [] },
        { title: 'Su ünitelere ulaşmadan enerji kesilir mi?', text: 'Operasyon merkezi üniteleri uzaktan kapatabilirse kısa devre olmaz ve kesinti birkaç saatte biter. Uzaktan kesme yoksa üniteler enerjili hâlde suya gömülür.', tech: 'Fiziksel · Kısa devre ve çarpılma riski', blockedBy: ['fire'], hit: { hq: ['noc'] }, containedCost: { label: 'Kurutma, kontrol ve birkaç saatlik kesinti', amount: 45000 } },
        { title: 'Üniteler su altında kalır', text: 'Güç modülleri kısa devre yapar; üniteler değiştirilene kadar kullanılamaz. Otoparkta mahsur kalan araç sahiplerinin güvenliği de risk altındadır.', tech: 'Erişilebilirlik kaybı', blockedBy: [], hit: { hq: ['saha', 'depo'] }, apply: true }
      ],
      impact: {
        scope: { siteTypes: ['AVM'], city: 'ANK', fraction: 0.5 }, hours: 120, mods: { maintenance: 0.8, procedures: 0.8 },
        costs: [
          { label: 'Ünitelerin değiştirilmesi (elektronik cihaz sigortası)', amount: 520000 },
          { label: 'Saha ekibi ve kurutma', amount: 60000 },
          { label: 'Kullanıcı güvenliği incelemesi', amount: 40000, mods: { ir_plan: 0.7 } }
        ]
      },
      contained: { label: 'Kurutma ve kontrol', amount: 45000 }
    },
    {
      id: 'insider', title: 'Ayrılan çalışanın açık kalan hesabı', cat: 'İnsan ve süreç', place: 'hq', risks: ['R29'],
      summary: 'İşten ayrılan bir çağrı merkezi çalışanının hesabı kapatılmaz. Bir hafta sonra evden girip müşteri listesini indirir.',
      stages: [
        { title: 'Çalışan ayrılır, hesabı açık kalır', text: 'Çağrı merkezinden bir çalışan küs ayrılır. İşten çıkış listesinde CRM ve CSMS hesapları unutulur. Yazılı çıkış prosedürü veya düzenli yetki gözden geçirmesi varsa hesap ilk gün kapanır.', tech: 'İnsan · Süreç hatası', blockedBy: ['procedures', 'pam'], hit: { hq: ['cagri'] } },
        { title: 'Evden eski parolayla giriş', text: 'Bir hafta sonra eski parolasıyla evden giriş yapar. İkinci doğrulama adımı varsa kayıtlı telefon şirkete iade edildiği için giriş başarısız olur.', tech: 'T1078 · Geçerli hesaplar', blockedBy: ['mfa'] },
        { title: 'Müşteri listesi indirilir', text: '120.000 müşterinin adı, telefonu ve plakası dışa aktarılıp bir rakibe satılır. Merkezi kayıt izleme varsa toplu dışa aktarma alarm üretir.', tech: 'T1213 · Bilgi depolarından veri', blockedBy: [], hit: { hq: ['cagri'] }, apply: true }
      ],
      impact: {
        scope: null, hours: 0,
        costs: [
          { label: 'KVKK idari para cezası riski', amount: 900000, mods: { privacy: 0.5, logging: 0.7 } },
          { label: 'Bildirim, hukuk ve çağrı merkezi giderleri', amount: 220000, mods: { ir_plan: 0.7 } },
          { label: 'Müşteri kaybı (itibar)', pct: 0.01, mods: { ir_plan: 0.8 } }
        ]
      },
      contained: { label: 'Hesap denetimi', amount: 3000 }
    }
  ];

  // Senaryo türleri: bilgi güvenliği yalnızca siber değildir (ISO/IEC 27001 Ek A: kurumsal, insan, fiziksel, teknolojik)
  SK.scenarioCats = ['Siber', 'Fiziksel', 'Çevresel', 'Tedarikçi', 'İnsan ve süreç'];

  SK.scenarioMap = {};
  SK.scenarios.forEach(s => { SK.scenarioMap[s.id] = s; });
})(window.SK);
