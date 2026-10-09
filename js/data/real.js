/* Gerçek veriler: EPDK aylık istatistikleri, piyasa fiyatları, KVKK cezaları ve kaynakları.
   Her sayı bir kaynağa bağlıdır; kaynak bulunamayan alan null bırakılmıştır. Son güncelleme: 7 Ekim 2026. */
(function (SK) {
  'use strict';

  const S = {
    beefullOcak: { t: 'Yeşil Haber: EPDK Ocak 2026 verisi', u: 'https://yesilhaber.net/epdk-ocak-2026-elektrikli-arac-sarj-orani/' },
    beefullSubat: { t: 'Beefull: EPDK Şubat 2026 istatistikleri', u: 'https://beefull.com/blog/epdk-subat-2026-elektrikli-arac-ve-sarj-hizmeti-piyasasi-istatistikleri' },
    beefullMart: { t: 'Beefull: EPDK Mart 2026 istatistikleri', u: 'https://beefull.com/blog/epdk-mart-2026-elektrikli-arac-ve-sarj-hizmeti-piyasasi-istatistikleri' },
    beefullNisan: { t: 'Beefull: EPDK Nisan 2026 istatistikleri', u: 'https://beefull.com/blog/epdk-nisan-2026-elektrikli-arac-ve-sarj-hizmeti-piyasasi-istatistikleri' },
    mayis: { t: 'Uzmanpara: Şarj soket sayısı mayısta 44 bini aştı', u: 'https://uzmanpara.milliyet.com.tr/uzmanpara/sarj-soket-sayisi-mayista-44-bini-asti-7607542' },
    haziran: { t: 'Alomaliye: Elektrikli araç sayısı 450 bini aştı', u: 'https://www.alomaliye.com/2026/07/23/elektrikli-arac-sayisi-450-bini-asti/' },
    temmuz: { t: 'Alomaliye: Elektrikli araç sayısı 465 bine yaklaştı', u: 'https://www.alomaliye.com/2026/08/20/elektrikli-arac-sayisi-465-bine-yaklasti/amp/' },
    temmuzTuketim: { t: 'YatırımX: Temmuzda 90 bin MWh ile tüketim rekoru', u: 'https://www.yatirimx.com.tr/otomobil/elektrikli-arac-sarjinda-tum-zamanlarin-rekoru-temmuzda-90-bin-mwh-tuketim/23804' },
    agustos: { t: 'Foreks: Ağustos 2026 şarj tüketimi 97.469 MWh', u: 'https://www.foreks.com/haber/detay/6aafbdce24008d7d43734305/FRKS/tr/agustos-2026-da-elektrikli-arac-sarj-tuketimi-97469-mwh-a-ulasti-20-09-26/' },
    agustosOp: { t: 'Yeşil Haber: EPDK Ağustos 2026 şarj verileri', u: 'https://yesilhaber.net/epdk-agustos-2026-sarj-verileri/' },
    fiyat: { t: 'DonanımHaber: Şarj fiyat listesi (güncelleme 21 Eylül 2026)', u: 'https://www.donanimhaber.com/elektrik-arac-sarj-istasyonlari-fiyat-listesi--191391' },
    ankara: { t: 'Yeni Ankara: Ankara\'da şarj altyapısı (11 Eylül 2026)', u: 'https://www.yeniankara.com.tr/ankara/ankarada-elektrikli-arac-sarj-altyapisi-ne-durumda-182395' },
    kvkk: { t: 'Cottgroup: 2026 KVKK idari para cezaları', u: 'https://cottgroup.com/tr/mevzuat/item/yeniden-degerleme-oranina-gore-2026-yili-kvkk-idari-para-cezalari' },
    yonetmelik: { t: 'Resmî Gazete 23.03.2026, sayı 33202', u: 'https://www.resmigazete.gov.tr/eskiler/2026/03/20260323-4.htm' },
    lisans: { t: 'Ekonomist: EPDK 2026 lisans bedelleri', u: 'https://www.ekonomist.com.tr/enerji/epdk-2026-icin-lisans-bedellerini-belirledi-69052' },
    osm: { t: 'OpenStreetMap katkıcıları (ODbL), Photon ile sorgulandı, 7 Ekim 2026', u: 'https://www.openstreetmap.org/copyright' }
  };

  // Aylık EPDK serisi (2026). tuketim: MWh. Haziran tüketimi, Temmuz'daki %24 artıştan geri hesaplanmıştır.
  const months = [
    { ay: 'Oca', ev: 389134, soket: 39694, ac: 22635, dc: 17059, tuketim: 60124, islem: null, guc: 2990, src: 'beefullOcak' },
    { ay: 'Şub', ev: 399043, soket: 40575, ac: 23142, dc: 17433, tuketim: 53424, islem: null, guc: 3073, src: 'beefullSubat' },
    { ay: 'Mar', ev: 411796, soket: 41938, ac: 23900, dc: 18038, tuketim: 67547, islem: 2621720, guc: 3190, src: 'beefullMart' },
    { ay: 'Nis', ev: 427486, soket: 43009, ac: 24468, dc: 18541, tuketim: 61652, islem: null, guc: 3295, src: 'beefullNisan' },
    { ay: 'May', ev: 440327, soket: 44175, ac: null, dc: null, tuketim: 76974, islem: 3150000, guc: 3412, src: 'mayis' },
    { ay: 'Haz', ev: 450038, soket: 45097, ac: null, dc: null, tuketim: 72538, islem: null, guc: 3545, src: 'haziran', approx: ['tuketim'] },
    { ay: 'Tem', ev: 464873, soket: 46665, ac: null, dc: null, tuketim: 89947, islem: 3330000, guc: null, src: 'temmuz' },
    { ay: 'Ağu', ev: 476934, soket: 48649, ac: 27533, dc: 21116, tuketim: 97469, islem: 3527070, guc: null, src: 'agustos' }
  ];

  // Ağustos 2026 ayrıntıları (Foreks/AA): talep modelinin kalibrasyon hedefi
  const august = {
    islem: 3527070, tuketimMWh: 97469, kwhPerSession: 27.63, chargeHours: 3650668, sockets: 48649,
    peakHour: '16:00–17:00', peakMWh: 6496, lowHour: '04:00–05:00', lowMWh: 922,
    peakDay: 'Cumartesi', peakDayMWh: 17535, lowDay: 'Salı', lowDayMWh: 11064,
    yekgShare: 0.622
  };
  august.sessionsPerSocketDay = august.islem / august.sockets / 31;
  august.minutesPerSession = august.chargeHours * 60 / august.islem;

  // Mayıs 2026: DC'nin tüketimdeki payı (AC 12,6 GWh, DC 64,4 GWh)
  const dcEnergyShareMay = 64.4 / (64.4 + 12.6);

  // Eylül 2026 fiyat listesi (TL/kWh). Aralık verilen fiyatlarda alt ve üst değer ayrı tutulur.
  const prices = [
    { op: 'Togg Trugo', dc: [14.98], ac: 9.95 },
    { op: 'Tesla', dc: [10.40, 13.00], ac: null },
    { op: 'Shell Recharge', dc: [12.99, 15.99], ac: 11.99 },
    { op: 'E-Power', dc: [11.99], ac: 8.99 },
    { op: 'Eşarj', dc: [9.90, 14.90], ac: 9.90 },
    { op: '5 Şarj', dc: [15.90], ac: 8.99 },
    { op: 'ZES', dc: [12.99, 16.49], ac: 10.99 },
    { op: 'Voltrun', dc: [13.90], ac: 10.90 },
    { op: 'Beefull', dc: [13.99], ac: 9.90 },
    { op: 'XŞarj', dc: [9.50], ac: 8.90 },
    { op: 'Porty', dc: [9.90], ac: 8.40 }
  ];
  const median = arr => { const a = arr.slice().sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const acMedian = median(prices.filter(p => p.ac).map(p => p.ac));
  const dcMedian = median(prices.map(p => p.dc.reduce((a, b) => a + b, 0) / p.dc.length));

  SK.real = {
    sources: S,
    months, august, dcEnergyShareMay,
    prices, acMedian, dcMedian,
    operators: [
      { op: 'ZES', sockets: 5616, mwh: 16500 },
      { op: 'Trugo', sockets: 3900, mwh: 22900 }
    ],
    operatorsNote: 'Ağustos 2026; diğer işletmecilerin ayrıntısı kaynakta yok. Mart 2026\'da en büyük işletmecinin soket payı %12,8 idi.',
    ankara: { stations: 2081, mwh: 9972, socketsPer100Ev: 3.23, month: 'Mayıs 2026', consumptionShareMar: 0.1468 },
    kvkk: [
      { t: 'Veri güvenliği yükümlülüğüne aykırılık', min: 256357, max: 17092242 },
      { t: 'Aydınlatma yükümlülüğüne aykırılık', min: 85437, max: 1709200 },
      { t: 'Kurul kararlarına aykırılık', min: 427263, max: 17092242 },
      { t: 'VERBİS kayıt ve bildirim yükümlülüğüne aykırılık', min: 341809, max: 17092242 }
    ],
    licenseFee2026: 1914200
  };
})(window.SK);
