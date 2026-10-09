/* Güvenlik kontrolleri kataloğu. ISO/IEC 27001:2022 Ek A numaralarıyla eşlenmiştir.
   cost: yıllık maliyet (TL, varsayım) · eff: etkinlik (0-1)
   kind 'L': olasılığı düşürür · kind 'I': gerçekleşirse etkiyi düşürür
   on: şirketin bugünkü (mevcut) durumunda açık mı */
(function (SK) {
  'use strict';

  SK.controls = [
    { key: 'isms', iso: 'Madde 4–10 · 5.1', title: 'BGYS kurulumu ve sertifikasyon', desc: 'Bilgi güvenliği politikası, risk süreci, iç denetim, yönetimin gözden geçirmesi ve belgelendirme denetimi.', cost: 650000, eff: 0.85, kind: 'L', on: false },
    { key: 'mfa', iso: '8.5', title: 'Çok faktörlü kimlik doğrulama', desc: 'CSMS yönetim paneli, e-posta, bulut konsolu ve VPN girişlerinde ikinci doğrulama adımı.', cost: 180000, eff: 0.6, kind: 'L', on: false },
    { key: 'pam', iso: '8.2 · 5.18', title: 'Ayrıcalıklı erişim yönetimi', desc: 'Yönetici hesapları kasada tutulur, oturumlar kaydedilir, yetkiler 90 günde bir gözden geçirilir.', cost: 320000, eff: 0.5, kind: 'L', on: false },
    { key: 'segment', iso: '8.22', title: 'Ağ ayrımı ve özel APN', desc: 'Ofis, CSMS yönetimi ve şarj cihazı ağları ayrılır. Cihazlar yalnızca şirketin özel APN\'i üzerinden bağlanır, SIM–IMEI eşlemesi yapılır.', cost: 260000, eff: 0.5, kind: 'L', on: false },
    { key: 'edr', iso: '8.7', title: 'Uç nokta koruma (EDR)', desc: 'Tüm ofis ve saha bilgisayarlarında davranış tabanlı zararlı yazılım tespiti ve uzaktan izolasyon.', cost: 240000, eff: 0.5, kind: 'L', on: true },
    { key: 'awareness', iso: '6.3', title: 'Farkındalık eğitimi ve oltalama tatbikatı', desc: 'Yılda iki eğitim, üç ayda bir sahte oltalama e-postası testi. Saha ve çağrı merkezi ekibine sosyal mühendislik eğitimi.', cost: 120000, eff: 0.4, kind: 'L', on: false },
    { key: 'backup', iso: '8.13', title: 'Değiştirilemez yedekleme (3-2-1)', desc: 'Üç kopya, iki ortam, bir kopya şirket dışında ve silinemez. Ayda bir geri yükleme testi.', cost: 150000, eff: 0.6, kind: 'I', on: true },
    { key: 'ocpp_tls', iso: '8.24 · 8.20', title: 'OCPP güvenlik profili 2/3 geçişi', desc: 'Tüm şarj cihazları TLS ile bağlanır, DC ünitelerde cihaz sertifikası kullanılır. Profil 1 (şifresiz) kapatılır.', cost: 380000, eff: 0.75, kind: 'L', on: false },
    { key: 'signed_fw', iso: '8.24 · 5.21', title: 'İmzalı firmware doğrulaması', desc: 'Cihazlar yalnızca üreticinin dijital imzasıyla doğrulanmış firmware\'i kabul eder. İmza anahtarları üreticide HSM\'de tutulur.', cost: 140000, eff: 0.8, kind: 'L', on: false },
    { key: 'staged_update', iso: '8.32', title: 'Kademeli güncelleme ve geri dönüş', desc: 'Güncellemeler önce test laboratuvarında, sonra %5\'lik pilot grupta denenir. Geri dönüş planı hazırdır.', cost: 90000, eff: 0.7, kind: 'I', on: false },
    { key: 'signed_meter', iso: '8.24', title: 'İmzalı ölçüm verisi', desc: 'Sayaç değerleri cihazda dijital olarak imzalanır (OCMF biçimi). Faturadaki her kWh müşteri tarafından doğrulanabilir.', cost: 210000, eff: 0.75, kind: 'L', on: false },
    { key: 'vuln_mgmt', iso: '8.8', title: 'Zafiyet ve yama yönetimi', desc: 'Cihaz ve sunucu envanteri zafiyet bültenleriyle eşlenir. Kritik yamalar 14 gün içinde uygulanır.', cost: 200000, eff: 0.5, kind: 'L', on: false },
    { key: 'logging', iso: '8.15 · 8.16', title: 'Merkezi kayıt ve SIEM izleme', desc: 'CSMS, bulut, ağ ve cihaz kayıtları tek yerde toplanır (ör. açık kaynak Wazuh). Anormal toplu komutlar alarm üretir.', cost: 360000, eff: 0.4, kind: 'I', on: false },
    { key: 'tamper', iso: '7.9 · 7.8', title: 'Saha cihazı fiziksel koruması', desc: 'Özel kilitli kapaklar, kapak açılma sensörü, bakım portu ve Bluetooth\'un sahada kapatılması.', cost: 160000, eff: 0.5, kind: 'L', on: false },
    { key: 'cctv', iso: '7.4', title: 'Kamera ve kablo kesme alarmı', desc: 'Lokasyonlarda kamera, kablo kesildiğinde anında alarm ve operasyon merkezine bildirim.', cost: 280000, eff: 0.45, kind: 'L', on: true },
    { key: 'vendor', iso: '5.19–5.22', title: 'Tedarikçi güvenliği', desc: 'Üretici, bakım firması ve roaming ortaklarıyla güvenlik maddeli sözleşme, uzaktan erişimin talebe bağlı ve kayıtlı açılması.', cost: 110000, eff: 0.5, kind: 'L', on: false },
    { key: 'secure_dev', iso: '8.25 · 8.29', title: 'Güvenli geliştirme ve sızma testi', desc: 'Mobil uygulama ve API için kod incelemesi, otomatik güvenlik taraması ve yılda bir bağımsız sızma testi.', cost: 420000, eff: 0.55, kind: 'L', on: false },
    { key: 'privacy', iso: '5.34', title: 'Kişisel veri minimizasyonu', desc: 'Konum geçmişi 90 günden sonra anonimleştirilir, plaka ve telefon maskelenir, gereksiz veri toplanmaz.', cost: 130000, eff: 0.5, kind: 'I', on: false },
    { key: 'pci', iso: '5.31 · 8.24', title: 'Ödeme tokenizasyonu', desc: 'Kart verisi şirket sistemlerinde hiç tutulmaz; PCI DSS uyumlu ödeme kuruluşu üzerinden token ile işlem yapılır.', cost: 60000, eff: 0.85, kind: 'L', on: true },
    { key: 'cert_mgmt', iso: '8.9', title: 'Sertifika envanteri ve otomatik yenileme', desc: 'Tüm TLS ve cihaz sertifikalarının bitiş tarihleri izlenir, 30 gün kala otomatik yenilenir.', cost: 70000, eff: 0.8, kind: 'L', on: false },
    { key: 'bcp', iso: '5.30 · 8.14', title: 'Yedek CSMS (iş sürekliliği)', desc: 'CSMS ikinci bir bulut bölgesinde hazır bekler. Ana sistem çökerse cihazlar 1 saat içinde yedeğe bağlanır.', cost: 540000, eff: 0.7, kind: 'I', on: false },
    { key: 'ir_plan', iso: '5.24–5.26', title: 'Olay müdahale planı ve tatbikat', desc: 'Kim neyi, ne zaman yapar; EPDK, KVKK ve Siber Güvenlik Başkanlığı bildirim akışları. Yılda iki tatbikat.', cost: 150000, eff: 0.4, kind: 'I', on: false },
    { key: 'sod', iso: '5.3', title: 'Görevler ayrılığı (çift onay)', desc: 'Fiyat, tarife, ücretsiz şarj ve fatura düzeltmeleri iki farklı kişinin onayı olmadan yapılamaz.', cost: 40000, eff: 0.6, kind: 'L', on: false },
    { key: 'time_sync', iso: '8.17', title: 'Güvenli saat senkronizasyonu', desc: 'Tüm cihaz ve sunucular doğrulanmış zaman kaynağından saat alır; sapma alarm üretir.', cost: 15000, eff: 0.85, kind: 'L', on: false },
    { key: 'waf', iso: '8.20 · 8.21', title: 'WAF ve DDoS koruması', desc: 'Mobil uygulama API\'si ve CSMS önünde web uygulama güvenlik duvarı ve hizmet engelleme koruması.', cost: 190000, eff: 0.6, kind: 'L', on: false },
    { key: 'cloud_sec', iso: '5.23', title: 'Bulut yapılandırma denetimi', desc: 'Bulut hesaplarında açık depolama, açık yönetim portu ve aşırı yetki sürekli taranır.', cost: 120000, eff: 0.6, kind: 'L', on: false },
    { key: 'load_guard', iso: '8.16', title: 'Toplu komut ve yük koruması', desc: 'Aynı anda belirli sayının üzerindeki cihaza komut gönderimi çift onaya bağlanır; ani yük değişimi sınırlanır.', cost: 110000, eff: 0.7, kind: 'L', on: false },
    { key: 'fire', iso: '7.5', title: 'Yangın algılama ve uzaktan kesme', desc: 'Ünitelerde sıcaklık ve duman algılama, operasyon merkezinden acil enerji kesme, otopark yönetimiyle ortak acil durum planı.', cost: 300000, eff: 0.5, kind: 'I', on: false },
    { key: 'maintenance', iso: '7.13', title: 'Periyodik bakım ve elektrik muayenesi', desc: 'Her ünite yılda iki kez bakım ve topraklama/kaçak akım ölçümünden geçer.', cost: 350000, eff: 0.6, kind: 'L', on: true },
    { key: 'utilities', iso: '7.11', title: 'UPS, jeneratör ve iklimlendirme yedeği', desc: 'Merkez tesiste sunucu odası ve operasyon merkezi için kesintisiz güç ve yedek soğutma.', cost: 180000, eff: 0.6, kind: 'L', on: true },
    { key: 'screening', iso: '6.1 · 6.4', title: 'Personel taraması ve disiplin süreci', desc: 'Kritik rollerde işe alım öncesi referans kontrolü, gizlilik sözleşmesi ve yazılı disiplin süreci.', cost: 30000, eff: 0.3, kind: 'L', on: false },
    { key: 'procedures', iso: '5.37', title: 'Yazılı prosedürler ve yedek personel', desc: 'Kritik işlerin adım adım yazılı prosedürleri ve her kritik rol için eğitimli bir yedek kişi.', cost: 60000, eff: 0.5, kind: 'I', on: false },
    { key: 'insurance_review', iso: '5.31', title: 'Poliçe şartlarının yıllık gözden geçirilmesi', desc: 'Sigorta poliçelerindeki şartlar (MFA, yedek, istisnalar) ile şirketin gerçek durumu her yıl karşılaştırılır.', cost: 25000, eff: 0.7, kind: 'L', on: false }
  ];

  SK.controlMap = {};
  SK.controls.forEach(c => {
    SK.controlMap[c.key] = c;
    const first = c.iso.replace('Madde 4–10 · ', '').trim().charAt(0);
    c.theme = { '5': 'Kurumsal', '6': 'İnsan', '7': 'Fiziksel', '8': 'Teknolojik' }[first] || 'Kurumsal';
  });

  SK.defaultEnabled = SK.controls.filter(c => c.on).map(c => c.key);
})(window.SK);
