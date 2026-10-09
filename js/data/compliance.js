/* Mevzuat gereklilikleri, sigorta poliçeleri ve sabit bilgi varlıkları */
(function (SK) {
  'use strict';

  // needs: gerekliliği karşılayan kontroller (hepsi açıksa karşılanır, bir kısmı açıksa kısmen)
  SK.frameworks = [
    {
      id: 'epdk', short: 'EPDK yönetmeliği', title: 'EPDK Şarj Hizmeti Yönetmeliği', sub: '2026 değişikliği · Resmî Gazete 23.03.2026, sayı 33202',
      url: 'https://www.resmigazete.gov.tr/eskiler/2026/03/20260323-4.htm',
      reqs: [
        { id: 'E1', text: 'Şarj hizmetinde kullanılan yazılım sistemleri, şarj cihazları ve uzaktan erişime ilişkin bilişim altyapısının TS ISO/IEC 27001 güncel sürümüne uygunluğu (mevcut lisans sahiplerine 1 yıl geçiş süresi)', needs: ['isms'] },
        { id: 'E2', text: 'Yetkisiz erişimlerin önlenmesi', needs: ['mfa', 'pam'] },
        { id: 'E3', text: 'Güvenli iletişim kanallarının kullanılması', needs: ['ocpp_tls', 'segment'] },
        { id: 'E4', text: 'Kimlik doğrulama ve erişim yetkilendirmesi', needs: ['mfa', 'pam'] },
        { id: 'E5', text: 'Bulut bilişim kullanılıyorsa güvenlik tedbirleri', needs: ['cloud_sec'] },
        { id: 'E6', text: 'Serbest erişim platformuna konum, fiyat, uygunluk ve tüketim verisinin doğru ve anlık bildirimi (Madde 30)', needs: ['sod', 'logging'] },
        { id: 'E7', text: '7/24 müşteri hizmetleri ve bütün istasyonların anlık durumunun gösterilmesi (Madde 28)', needs: ['bcp', 'procedures'] },
        { id: 'E8', text: 'Fiyatların eş zamanlı ilanı; sadakat fiyatı en düşük fiyatın %25 fazlasını aşamaz (Madde 25)', needs: ['sod'] },
        { id: 'E9', text: 'Roaming sözleşmelerinin imzadan sonra 30 gün içinde Kurum\'a bildirimi (Madde 16)', needs: ['vendor'] }
      ]
    },
    {
      id: 'kvkk', short: 'KVKK', title: 'KVKK (6698 sayılı Kanun)', sub: 'Kişisel verilerin korunması',
      reqs: [
        { id: 'K1', text: 'Konum, plaka ve iletişim verisi için aydınlatma; gerektiğinde açık rıza', needs: ['privacy'] },
        { id: 'K2', text: 'Veri güvenliği için teknik ve idari tedbirler (Madde 12)', needs: ['mfa', 'logging', 'privacy'] },
        { id: 'K3', text: 'Veri ihlalinin en kısa sürede (72 saat) Kurul\'a ve ilgililere bildirimi', needs: ['ir_plan', 'logging'] },
        { id: 'K4', text: 'Saklama ve imha politikası, veri minimizasyonu', needs: ['privacy'] }
      ]
    },
    {
      id: 'sgk', short: '7545 Siber Güvenlik', title: 'Siber Güvenlik Kanunu (7545)', sub: 'Resmî Gazete 19.03.2025',
      url: 'https://www.erdem-erdem.av.tr/bilgi-bankasi/siber-guvenlik-kanunu-101',
      reqs: [
        { id: 'S1', text: 'Siber olay ve zafiyetlerin gecikmeksizin bildirilmesi', needs: ['ir_plan', 'logging'] },
        { id: 'S2', text: 'Kritik altyapı kapsamına alınırsa yetkilendirilmiş tedarikçilerden temin', needs: ['vendor'] }
      ]
    },
    {
      id: 'pci', short: 'PCI DSS', title: 'PCI DSS', sub: 'Ödeme kartı güvenliği',
      reqs: [
        { id: 'P1', text: 'Kart verisinin şirket sistemlerinde tutulmaması veya PCI DSS kapsamında korunması', needs: ['pci'] }
      ]
    }
  ];

  // Sigorta poliçeleri. Teminat ve istisnalar genel piyasa uygulamasıdır; poliçe metni esastır.
  SK.policies = [
    { key: 'siber', title: 'Siber risk sigortası',
      covers: 'Olay müdahale ve adli inceleme, veri kurtarma, siber kaynaklı iş durması, veri ihlali bildirim giderleri, üçüncü kişi talepleri.',
      excl: ['İdari para cezaları çoğu poliçede kapsam dışıdır', 'Savaş ve devlet destekli saldırı istisnası olabilir', 'Poliçede şart koşulan MFA ve yedekleme yoksa ödeme reddedilebilir'] },
    { key: 'elektronik', title: 'Elektronik cihaz ve makine kırılması',
      covers: 'Şarj üniteleri, sunucular ve test ekipmanında ani ve beklenmedik fiziksel hasar.',
      excl: ['Aşınma ve bakımsızlık', 'Kasıtlı zarar'] },
    { key: 'hirsizlik', title: 'Hırsızlık sigortası',
      covers: 'Kablo, konnektör ve sahadaki ekipmanın çalınması.',
      excl: ['Her hasarda muafiyet uygulanır', 'Bazı poliçeler gözetimsiz alan için ek şart arar'] },
    { key: 'ucuncu', title: 'Üçüncü şahıs mali sorumluluk',
      covers: 'Araç yangınının otoparka ve diğer araçlara verdiği zarar, kullanıcı yaralanması, şebekeye verilen zarar talepleri.',
      excl: ['Sözleşmeden doğan cezalar', 'Kusur oranına göre rücu'] },
    { key: 'yangin', title: 'Yangın, deprem ve doğal afet',
      covers: 'Merkez bina, depo ve demirbaşlar. Deprem ve sel ek teminatı alınmalıdır.',
      excl: ['Deprem teminatında tenzili muafiyet uygulanır'] },
    { key: 'karkaybi', title: 'Kâr kaybı (iş durması)',
      covers: 'Fiziksel hasara bağlı faaliyet durması süresince brüt kâr kaybı.',
      excl: ['Siber kaynaklı kesinti bu poliçede değil, siber poliçede teminat altına alınır'] }
  ];
  SK.policyMap = {};
  SK.policies.forEach(p => { SK.policyMap[p.key] = p; });

  // Sabit bilgi varlıkları. Şarj üniteleri dijital ikizden otomatik eklenir.
  // c, i, a: gizlilik, bütünlük, erişilebilirlik (1 düşük · 2 orta · 3 yüksek)
  SK.staticAssets = [
    { id: 'csms', name: 'Merkezi yönetim sistemi (CSMS)', type: 'Yazılım', loc: 'Bulut (birincil bölge)', owner: 'Sistem ve DevOps', c: 2, i: 3, a: 3 },
    { id: 'app', name: 'Mobil uygulama ve API', type: 'Yazılım', loc: 'Bulut', owner: 'Sistem ve DevOps', c: 3, i: 3, a: 3 },
    { id: 'payment', name: 'Ödeme kuruluşu entegrasyonu', type: 'Hizmet', loc: 'Ödeme kuruluşu', owner: 'Muhasebe ve finans', c: 3, i: 3, a: 3 },
    { id: 'custdb', name: 'Müşteri veritabanı (120.000 kullanıcı)', type: 'Veri', loc: 'Bulut', owner: 'Bilgi güvenliği sorumlusu', c: 3, i: 3, a: 2 },
    { id: 'sessions', name: 'Şarj oturumu ve ölçüm kayıtları', type: 'Veri', loc: 'Bulut', owner: 'Muhasebe ve finans', c: 2, i: 3, a: 2 },
    { id: 'fwserver', name: 'Firmware dağıtım altyapısı', type: 'Yazılım', loc: 'Bulut + üretici', owner: 'Operasyon müdürü', c: 2, i: 3, a: 2 },
    { id: 'ocpi', name: 'Roaming (OCPI) bağlantıları', type: 'Hizmet', loc: 'Ortak platformlar', owner: 'Sistem ve DevOps', c: 2, i: 3, a: 2 },
    { id: 'epdkfeed', name: 'Serbest erişim platformu veri akışı', type: 'Veri', loc: 'Bulut → EPDK', owner: 'Operasyon müdürü', c: 1, i: 3, a: 3 },
    { id: 'apn', name: 'Özel APN ve SIM kartlar', type: 'Ağ', loc: 'Mobil operatör + saha', owner: 'Operasyon müdürü', c: 2, i: 2, a: 3 },
    { id: 'pki', name: 'Sertifika altyapısı (TLS ve cihaz sertifikaları)', type: 'Yazılım', loc: 'Bulut', owner: 'Bilgi güvenliği sorumlusu', c: 3, i: 3, a: 3 },
    { id: 'time', name: 'Zaman kaynağı (NTP)', type: 'Hizmet', loc: 'Bulut', owner: 'Sistem ve DevOps', c: 1, i: 3, a: 2 },
    { id: 'cloud', name: 'Bulut hesabı ve altyapısı', type: 'Hizmet', loc: 'Bulut sağlayıcısı', owner: 'Sistem ve DevOps', c: 3, i: 3, a: 3 },
    { id: 'office', name: 'Merkez ofis ağı ve bilgisayarlar', type: 'Donanım', loc: 'Merkez tesis', owner: 'Sistem ve DevOps', c: 2, i: 2, a: 2 },
    { id: 'fileserver', name: 'Dosya sunucusu', type: 'Donanım', loc: 'Sunucu odası', owner: 'Sistem ve DevOps', c: 2, i: 2, a: 2 },
    { id: 'erp', name: 'Muhasebe ve ERP', type: 'Yazılım', loc: 'Sunucu odası', owner: 'Muhasebe ve finans', c: 3, i: 3, a: 2 },
    { id: 'email', name: 'E-posta ve iş birliği araçları', type: 'Hizmet', loc: 'Bulut', owner: 'Sistem ve DevOps', c: 3, i: 2, a: 2 },
    { id: 'noc', name: 'Operasyon merkezi konsolları', type: 'Donanım', loc: 'Merkez · 1. kat', owner: 'Operasyon müdürü', c: 2, i: 3, a: 3 },
    { id: 'callcenter', name: 'Çağrı merkezi sistemi', type: 'Yazılım', loc: 'Merkez · 1. kat', owner: 'Operasyon müdürü', c: 3, i: 2, a: 3 },
    { id: 'backupsys', name: 'Yedekleme sistemi', type: 'Donanım', loc: 'Sunucu odası + bulut', owner: 'Sistem ve DevOps', c: 3, i: 3, a: 2 },
    { id: 'vendorvpn', name: 'Bakım firması uzaktan erişimi', type: 'Ağ', loc: 'VPN', owner: 'Bilgi güvenliği sorumlusu', c: 3, i: 3, a: 1 },
    { id: 'serverroom', name: 'Sunucu odası', type: 'Fiziksel', loc: 'Merkez · 1. kat', owner: 'Sistem ve DevOps', c: 3, i: 3, a: 3 },
    { id: 'building', name: 'Merkez bina ve arsa (1.500 m²)', type: 'Fiziksel', loc: 'Ankara', owner: 'Genel müdür', c: 1, i: 2, a: 3 },
    { id: 'people', name: 'Kritik roller (DevOps, operasyon)', type: 'İnsan', loc: 'Merkez', owner: 'Genel müdür', c: 2, i: 2, a: 3 },
    { id: 'policies', name: 'BGYS belgeleri ve lisans uyumu', type: 'Belge', loc: 'Merkez', owner: 'Bilgi güvenliği sorumlusu', c: 1, i: 3, a: 2 }
  ];
})(window.SK);
