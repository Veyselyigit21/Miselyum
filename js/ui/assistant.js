/* Asistan: ekranları açıklayan, canlı sayıları yorumlayan ve kullanıcıyı doğru ekrana götüren sohbet paneli.
   İki modda çalışır: (1) çevrimdışı bilgi tabanı — her yerde, internetsiz; (2) bilgisayarda Ollama varsa
   açık kaynak yerel dil modeli. İkinci modda veri bilgisayardan çıkmaz; bilgi tabanının bulduğu düğmeler yine eklenir. */
(function (SK) {
  'use strict';
  const h = SK.h, F = SK.fmt;

  // ---------- Metin eşleme ----------
  const TR = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
  const norm = t => String(t || '').toLocaleLowerCase('tr-TR').replace(/[çğıöşüâîû]/g, c => TR[c])
    .replace(/[^a-z0-9%\s]/g, ' ').replace(/\s+/g, ' ').trim();
  function hits(q, kws) {
    let sc = 0;
    kws.forEach(k => {
      const n = norm(k);
      if (!n) return;
      if (n.indexOf(' ') >= 0) { if (q.n.indexOf(n) >= 0) sc += 2 + n.length / 8; }
      else if (q.t.some(t => t === n || (n.length >= 4 && t.indexOf(n) === 0))) sc += 1 + n.length / 10;
    });
    return sc;
  }
  const want = (q, kws) => hits(q, kws) > 0;

  // ---------- Bilgi tabanı: ekranlar ----------
  const SCREENS = {
    genel: { kw: ['genel bakis', 'ana sayfa', 'ozet ekran', 'proje ne yapiyor', 'bu proje', 'bu arac', 'miselyum nedir', 'sarjkalkan nedir'],
      what: 'Projeyi tek ekranda anlatır: mevzuat son tarihine kalan gün, temel göstergeler, dört planın karşılaştırması, canlı ağ, PUKÖ adımları ve ikizin hangi seviyede olduğu.',
      how: ['**Planlar tablosu:** bir plana Uygula deyince bütün ekranlar o plana göre yeniden hesaplanır.', '**PUKÖ şeridi:** her adım ilgili ekrana götürür.', '**Ağ göstergesi:** üst çubuktaki yeşil düğme hangi şirketin Miselyum ağına bağlı olduğunu ve verinin simülasyondan mı canlı cihazlardan mı geldiğini gösterir; şirket buradan değiştirilir.'],
      get tell() { return SK.company.name + ' (kurgusal) için ISO 27001 hazırlığını, gerçek yerler ve gerçek verilerle kurulmuş bir dijital ikiz üzerinde ölçüyoruz.'; } },
    sektor: { kw: ['sektor', 'pazar', 'istatistik', 'epdk verisi', 'fiyat listesi', 'kalibrasyon', 'buyume', 'tuketim', 'soket sayisi'],
      what: 'EPDK\'nın Ocak–Ağustos 2026 istatistiklerini, 11 işletmecinin Eylül 2026 fiyatlarını ve Ankara verilerini gösterir. Simülasyonun talep ve fiyat ayarları bu gerçek verilerden çıkarıldı.',
      how: ['**Büyüme grafiği:** araç, soket ve tüketimin aylık seyri.', '**Fiyat grafiği:** işletmecilerin AC ve DC fiyatları; çizgiler orta değeri (AC 9,90, DC 13,90 TL/kWh) gösterir.', '**Kalibrasyon tablosu:** simülasyonun EPDK değerlerinden ne kadar saptığı; tüm ölçülerde %5\'in altında.'],
      tell: 'Önce pazarı tanıdık: risk analizinin gerçekçi olması için talep modelini EPDK\'nın gerçek verisine kalibre ettik.' },
    varliklar: { kw: ['varlik', 'envanter', 'gizlilik butunluk', 'cia'],
      get what() { return 'Risk analizinin girdisi olan ' + SK.assets.length + ' bilgi varlığını listeler: yazılımlar, veriler, ağlar, tesis ve sahadaki ' + Object.keys(SK.models).length + ' cihaz modeli. Her varlığın sahibi ve gizlilik–bütünlük–erişilebilirlik değeri vardır.'; },
      how: ['**Filtre:** varlık türüne göre süzer.', '**Bağlı riskler:** her varlığa dokunan risk numaraları; tıklayınca Risk kaydına gider.', 'Şarj üniteleri dijital ikizden otomatik sayılır; ikize lokasyon eklenirse envanter kendiliğinden güncellenir.'],
      tell: 'ISO 27001 risk analizi varlıklardan başlar; envanterimiz ikizden otomatik üretiliyor, elle tutulan bir Excel değil.' },
    riskler: { kw: ['risk kaydi', 'risk listesi', 'isi haritasi', 'risk matrisi', 'riskler ekrani'],
      get what() { return SK.risks.length + ' riski olasılık × etki matrisi ve tabloyla gösterir. Skor 10 ve üzeri major (kritik/yüksek), altı minör (orta/düşük) sayılır. Her riskin yıllık beklenen kaybı TL olarak hesaplanır.'; },
      how: ['**Isı haritası:** bir hücreye tıklayınca o hücredeki riskler listelenir.', '**Doğal / Şu anki:** kontrol yokken ve açık kontrollerle durumu karşılaştırır.', '**Satıra tıklayınca:** tehdit, zafiyet, kontroller ve önerilen işlem açılır; kontrolleri buradan aç-kapat yapabilirsin.', '**Az bilinen** olarak işaretli 13 risk, tipik listelerde olmayan, gözden kaçması kolay risklerdir.'],
      tell: 'Major ve minör riskleri ayırdık, her birini TL\'ye çevirdik; 13 tanesi sıradan listelerde görünmeyen, az bilinen risk.' },
    kontroller: { kw: ['kontroller', 'kontrol listesi', 'onlemler', 'maliyet fayda', 'faz 1 plani'],
      get what() { return SK.controls.length + ' güvenlik kontrolünü (ISO 27001 Ek A karşılıklarıyla) açıp kapatırsın. Her değişiklik risk, saldırı, sigorta ve uyum ekranlarını anında günceller.'; },
      get how() { return ['**Faz 1 planı:** risk raporundaki ilk fazın ' + SK.plans.faz1.size + ' kontrolünü açar. **Faz 2 · tümü** ' + SK.controls.length + ' kontrolün hepsini açar.', '**Grafik:** sarı kesikli çizginin üstündeki kontroller maliyetinden fazla kayıp önler.', '**Tablo:** her kontrolün maliyeti, önlediği kayıp, net faydası ve hangi fazda olduğu.', 'Kapı ile açıldığında değişiklik sunucuya sorulur: izleyici rolü önlem değiştiremez.']; },
      tell: 'Kontrolleri sezgiyle değil maliyet-faydayla seçtik; ama maliyet-fayda seti yasayı karşılamadığı için mevzuatın istediği 4 kontrolü de ekledik.' },
    saha: { kw: ['saha', 'harita', 'lokasyon', 'istasyon', 'ocpp akisi', 'mesaj akisi', '3b bina', 'uydu', 'yakinlas'],
      get what() { return SK.twin.sites.length + ' lokasyonu gerçek sokak haritasında canlı gösterir. Halkalar lokasyonlardır; dilimler ' + SK.T('endpoint') + ' ve anlık durumlarını gösterir.' + (SK.link.mode === 'canli' ? ' Şu an veri Miselyum Kapısı üzerinden OCPP ile bağlı ' + SK.link.devices + ' cihazdan canlı geliyor.' : ''); },
      how: ['**Halkaya tıkla:** harita o sokağa yakınlaşır, sağda gerçek adres ve ünite bilgisi açılır.', '**Üst düğmeler:** şehir seçimi, 3B binalar, uydu görüntüsü, diğer işletmecilerin OpenStreetMap\'teki şarj noktaları (mor).', '**Renkler:** yeşil müsait, mavi şarjda, sarı arızalı, kırmızı olaydan etkilenen.', '**OCPP akışı:** cihazların merkeze gönderdiği protokol mesajlarının simülasyonu.', '**Seviye 3 paneli (Kapı ile):** ikizin kendi kararları, her komutun doğrulaması, şebeke talebi ve imzasız yazılım tatbikatı.'],
      tell: 'Dijital ikizin sahası bu: lokasyonlar OpenStreetMap\'teki gerçek yerler, talep EPDK verisine göre ayarlı.' },
    merkez: { kw: ['merkez tesis', 'ostim', 'bina', 'kat plani', 'oda', 'personel', 'calisan', 'arazi', 'arsa', 'yerlesim'],
      get what() { return SK.tenantId === 'akimyolu' ? 'Ankara OSTİM\'deki merkez tesisin dijital ikizi: 1.500 m² arsa, 2 katlı bina, odalar, kameralar ve 40 çalışanın yerleşimi. Hocanın istediği arazi, tesis ve personel yerleşimi burada.'
        : SK.company.name + ' tesisinin dijital ikizi: arazi, katlar, odalar ve istasyonlar, kameralar ve personel yerleşimi. Plan şirket paketinden gelir; her şirketin kendi kat planı vardır.'; },
      how: ['**Kat seçimi:** zemin kat ve 1. kat arasında geçiş.', '**Noktalar:** odadaki çalışanlar; odaya gelince varlıklar ve erişim türü görünür.', 'Bir olay senaryosu çalışırken yangın, elektrik kesintisi, içeri sızan kişi ve etkilenen odalar planda görünür; etkilenen odalar kırmızıya döner.'],
      tell: 'Fiziksel ikiz: hangi odada hangi varlık ve kaç kişi var, saldırıda hangi oda etkileniyor, görebiliyoruz.' },
    saldiri: { kw: ['saldiri simulasyonu', 'saldiri testi', 'senaryolar', 'olay senaryo', 'senaryo ekrani', 'simulasyon ekrani', 'mitre', 'ne olursa'],
      what: SK.scenarios.length + ' olay senaryosunu ikizde adım adım çalıştırır: siber saldırı, fiziksel olay (yangın, binaya sızma, kablo hırsızlığı), çevresel olay (deprem, sel, elektrik kesintisi), tedarikçi ve insan kaynaklı olaylar. Açık bir kontrol bir adımı durdurursa olay orada biter. Binada geçen olaylar kat planında canlanır.',
      how: ['**Soldan senaryo seç, Çalıştır\'a bas:** adımlar sırayla ilerler, haritada etkilenen soketler kırmızıya döner.', '**Adım kartları:** her adımı durdurabilecek kontroller; buradan açıp kapatabilirsin.', '**Kayıp karşılaştırması:** hiç kontrol yok, şu anki durum ve Faz 1 planı.'],
      tell: 'Saldırıyı ikizde canlandırıp hangi kontrolün hangi adımda durdurduğunu ve kaç TL kurtardığını gösteriyoruz.' },
    sigorta: { kw: ['sigorta', 'police', 'teminat', 'risk devri', 'risk isleme', 'finans'],
      what: 'Her riskin nasıl işleneceğini (azalt, sigortala, kaçın, kabul et) ve hangi poliçenin hangi riski karşıladığını gösterir.',
      how: ['**Çubuk grafik:** her riskin doğal ve kalan yıllık kaybı.', '**Poliçe kartları:** teminat, istisnalar ve önerilen limit.', '**KVKK kutusu:** 2026 idari para cezası aralıkları.'],
      tell: 'Bazı riskleri kontrolle değil sigortayla yönetmek daha ucuz; ama sigortanın ödememe riskini de hesaba kattık.' },
    uyum: { kw: ['uyum', 'mevzuat', 'gereklilik', 'radar', 'hazirlik'],
      get what() { return SK.frameworks.map(f => f.short || f.title).join(', ') + ' kapsamındaki ' + SK.frameworks.reduce((a, f) => a + f.reqs.length, 0) + ' gerekliliğin hangi kontrolle karşılandığını izler.'; },
      how: ['**Radar:** bugünkü durum ile Faz 1 planının karşılaştırması.', '**Tablo:** eksik kontrolün çipine tıklayınca o kontrol açılır.'],
      get tell() { return 'Bugünkü hazırlık ' + F.pct(SK.risk.readiness(new Set(SK.defaultEnabled))) + ', Faz 1 ile ' + F.pct(SK.risk.readiness(SK.plans.faz1)) + '.'; } },
    yontem: { kw: ['yontem', 'kaynaklar', 'formul', 'veri kokeni', 'yol haritasi', 'tubitak'],
      what: 'PUKÖ eşlemesini, hangi verinin gerçek hangisinin varsayım olduğunu, hesap yöntemini, sektördeki boşluğu ve kaynakları gösterir.',
      how: ['**Veri kökeni tablosu:** Gerçek, gerçeğe kalibre, kurgusal ve varsayım ayrımı.', '**Kaynaklar:** her sayının bağlantısı.'],
      tell: 'Hangi sayının gerçek, hangisinin tahmin olduğunu açıkça yazdık; bu bilimsel dürüstlük için önemli.' },
    guvenlik: { kw: ['guvenlik merkezi', 'kapi', 'miselyum kapisi', 'giris paneli', 'oturum', 'waf', 'denetim kaydi', 'saldiri testi', 'sizma testi'],
      what: 'Panelin önündeki Miselyum Kapısı\'nı anlatır: bir isteğin geçtiği 9 denetim, hayalet oturum, yetki yükseltme, XSS, SSRF, SQL enjeksiyonu, kaba kuvvet ve CSRF korumaları, örnek nginx/ModSecurity yapılandırması, ağ bölgeleri ve yerinde/bulut kararı, savunma testlerinin sonucu.',
      how: ['**Kapı ile açılınca:** açık oturumlar, denetim kaydı, WAF engelleri ve OCPP cihazlarının hangi güvenlik profiliyle bağlı olduğu canlı görünür.', '**Denemeler:** denetim kaydı arama kutusunda SQL enjeksiyonu, önizleme kutusunda SSRF denenebilir; ikisi de durdurulur.', '**Cihaz komutu:** yalnız yönetici, son 5 dakikada iki adımlı doğrulama ister.', '**Saldırı testleri:** kapi/saldiri_testleri.py gerçek saldırı istekleri gönderip savunmayı doğrular.'],
      tell: 'İkiz yalnız risk hesaplamıyor, kendisi de korunuyor: giriş, oturum, yetki, istek sınırı, WAF ve denetim kaydı; hepsi testle kanıtlı.' }
  };
  const VIEWNAMES = () => Object.keys(SK.views).reduce((a, k) => { a[k] = SK.views[k].title; return a; }, {});

  // ---------- Bilgi tabanı: kavramlar ----------
  const TERMS = [
    { kw: ['bgys', 'bilgi guvenligi yonetim'], t: '**BGYS** (Bilgi Güvenliği Yönetim Sistemi), bir kurumun bilgi güvenliği risklerini politika, süreç ve kontrollerle sistemli biçimde yönetmesidir. ISO/IEC 27001 bunun şartlarını tanımlar.', go: 'yontem' },
    { kw: ['iso 27001', '27001', 'iso'], t: '**ISO/IEC 27001:2022**, BGYS için uluslararası standarttır. 4–10. maddeler yönetim sistemini, Ek A ise 93 kontrolü (5 kurumsal, 6 insan, 7 fiziksel, 8 teknolojik) tanımlar. EPDK 2026\'da şarj işletmecileri için bunu zorunlu yaptı.', go: 'uyum' },
    { kw: ['puko', 'pdca', 'planla uygula'], t: '**PUKÖ** = Planla, Uygula, Kontrol et, Önlem al. Her adımın bir rengi var ve menüdeki harfler bunu gösterir: P Riskler, U Kontroller, K Dijital ikiz ve Senaryolar, Ö Sigorta ve Uyum. Genel bakıştaki PUKÖ şeridi her adıma götürür.', go: 'genel' },
    { kw: ['ek a', 'annex'], t: '**Ek A**, ISO 27001\'in 93 kontrolünün listesidir. Araçtaki her kontrolün yanında Ek A numarası yazar (ör. MFA = 8.5).', go: 'kontroller' },
    { kw: ['soa', 'uygulanabilirlik'], t: '**Uygulanabilirlik Bildirgesi (SoA)**, Ek A\'daki kontrollerden hangilerinin neden uygulandığını gösteren zorunlu belgedir. Risk raporunun Ek A bölümünde 93 kontrolün tamamı var: 92\'si uygulanıyor, 8.30 gerekçesiyle dışlandı.' },
    { kw: ['ale', 'yillik beklenen kayip', 'beklenen kayip'], t: '**ALE** (yıllık beklenen kayıp) = SLE × ARO. Örneğin tek seferde 6,5 mn TL kaybettiren bir olay 7 yılda bir yaşanıyorsa (ARO 0,15) ALE yaklaşık 975 bin TL olur.', go: 'riskler' },
    { kw: ['sle', 'tek olay kaybi', 'tek seferlik'], t: '**SLE**, bir olay bir kez yaşandığında kaybedilen tutardır (TL).', go: 'riskler' },
    { kw: ['aro', 'yillik siklik', 'gerceklesme sikligi'], t: '**ARO**, bir olayın yılda kaç kez yaşanmasının beklendiğidir. 0,1 = on yılda bir, 3 = yılda üç kez.', go: 'riskler' },
    { kw: ['major', 'minor', 'minör'], t: '**Major risk:** skoru 10 ve üzeri (kritik 15–25, yüksek 10–14). **Minör risk:** skoru 9 ve altı (orta 5–9, düşük 1–4). Skor = olasılık × etki, ikisi de 1–5 arası.', go: 'riskler' },
    { kw: ['olasilik', 'etki', 'skor'], t: 'Olasılık ARO\'dan, etki SLE\'den 1–5 düzeyine çevrilir: ör. etki 5 = 10 mn TL üzeri, olasılık 5 = yılda 3 kezden fazla. Skor = olasılık × etki.', go: 'riskler' },
    { kw: ['risk isleme', 'azalt', 'devret', 'kacin', 'kabul et'], t: 'Risk dört şekilde işlenir: **azalt** (kontrol ekle), **devret** (sigorta, sözleşme), **kaçın** (riskin kaynağını kaldır; ör. kart verisini hiç tutmamak), **kabul et** (düşük riskler).', go: 'sigorta' },
    { kw: ['artik risk', 'kalan risk'], t: '**Artık risk**, kontroller uygulandıktan sonra kalan risktir. Faz 1 sonrası 37 riskin 29\'u düşük, 8\'i orta; risk sahipleri bunları imzayla kabul eder.', go: 'riskler' },
    { kw: ['csms', 'merkezi yonetim sistemi'], t: '**CSMS**, şarj ünitelerini uzaktan izleyen ve komut gönderen merkezi yazılımdır. Ele geçirilirse 190 soketin hepsi aynı anda durdurulabilir; bu yüzden en kritik varlık.', go: 'saha' },
    { kw: ['ocpp'], t: '**OCPP**, şarj ünitesiyle CSMS arasındaki açık protokoldür (1.6J ve 2.0.1). Güvenlik profili 1 şifresizdir; 2 TLS, 3 TLS + cihaz sertifikası kullanır.', go: 'saha' },
    { kw: ['profil 1', 'guvenlik profili', 'sifresiz'], t: 'Akımyolu\'nun 48 AC ünitesi (96 soket) **OCPP profil 1** ile, yani şifresiz bağlanıyor. Trafik okunup değiştirilebilir (R04). Çözüm: OCPP TLS geçişi (profil 2/3), Faz 1\'de.', go: 'saha' },
    { kw: ['ocpi', 'roaming', 'dolasim'], t: '**OCPI**, işletmeciler arası dolaşım (roaming) protokolüdür. Ortak platformun anahtarı sızarsa müşteri verisine erişilebilir (R16).' },
    { kw: ['ocmf', 'imzali olcum', 'imzali sayac'], t: '**OCMF**, sayaç değerlerinin cihazda dijital olarak imzalandığı veri biçimidir. Müşteri faturadaki her kWh\'yi doğrulayabilir. Faz 2\'de.', go: 'kontroller' },
    { kw: ['dijital imza', 'e imza', 'elektronik imza'], t: '**Dijital imza** projede üç yerde var: (1) imzalı firmware — cihaz yalnız üreticinin imzaladığı yazılımı kabul eder, (2) OCMF ile imzalı ölçüm verisi, (3) politika onayının 5070 sayılı Kanun kapsamında nitelikli e-imzayla yapılması.', go: 'kontroller' },
    { kw: ['dijital ikiz', 'ikiz nedir', 'ikiz mi', 'dijital golge', 'dijital model', 'ikiz prototipi'], t: 'Evet, Miselyum bir **dijital ikiz ağı**: şirketin yerini, binasını, cihazlarını ve personelini yazılımda canlandırıp senaryoları onun üzerinde dener. Dosyadan açıldığında **seviye 1** (ikiz prototipi, Grieves ve Vickers 2017): gerçek yerler ve verilerle kurulmuş simülasyon. Miselyum Kapısı ile açıldığında **seviye 3**: sanal şarj cihazları gerçek OCPP protokolüyle bağlanır, veri ikize akar; ikiz de bu veriye bakıp cihaza kendisi komut gönderir ve sonucu cihazın cevabıyla doğrular (Kritzinger vd. 2018: iki yönlü otomatik akış).', go: 'saha' },
    { kw: ['seviye 3', 'iki yonlu', 'kapali dongu', 'otomatik komut', 'ikiz komut', 'ikiz karar'], t: '**Seviye 3 (iki yönlü ikiz):** ikiz sahadan okur, kendisi karar verir, cihaza OCPP komutu yazar ve cihazın bir sonraki mesajıyla doğrular. Beş kural var: **kendini onarma** (yazılımsal arızada yeniden başlatma), **emniyet kilidi** (topraklama ve aşırı sıcaklıkta soketi kilitleyip iş emri), **güvenlik karantinası** (onaysız yazılım ya da anormal güç), **yük yönetimi** (şebeke sınırı ve talebi) ve **otomasyon freni** (60 sn\'de en çok 10 otomatik durdurma). Saha ikizindeki Seviye 3 panelinde canlı görünür.', go: 'saha' },
    { kw: ['kendini onarma', 'yeniden baslatma', 'otomatik onarim', 'reset'], t: '**Kendini onarma:** yazılımsal bir arıza (konnektör kilidi, sayaç, aşırı akım) 15 sn\'de geçmezse ikiz soketi ya da üniteyi yeniden başlatır. Diğer sokette şarj varsa üniteyi değil yalnız arızalı soketi yeniden başlatır, o şarj kesilmez. Arızalı soket kendiliğinden ortalama 90 sn\'de dönerken ikizle yaklaşık 17 sn\'de hizmete dönüyor.', go: 'saha' },
    { kw: ['sebeke talebi', 'puant', 'yuk yonetimi', 'smart charging', 'akilli sarj', 'setchargingprofile', 'guc siniri'], t: '**Şebeke talebi ve yük yönetimi:** dağıtım şirketi puant saatinde yükün azaltılmasını isteyince ikiz gücü aktif şarjlara orantılı paylaştırır (OCPP SetChargingProfile); hiçbir şarj kesilmez, yalnız yavaşlar. Lokasyonun şebeke bağlantı gücü (kurulu gücün %40\'ı) aşılınca da aynısı olur. Talep bitince sınırlar kademeli kalkar.', go: 'saha' },
    { kw: ['karantina', 'tatbikat', 'imzasiz yazilim', 'oynanmis yazilim', 'ota'], t: '**Güvenlik karantinası:** cihaz onaylı sürüm dışında bir yazılımla açılırsa ya da anma gücünün üstünde ölçüm gönderirse ikiz üniteyi ağdan ayırır (ChangeAvailability). Geri dönüşü yönetici onaylı yazılımla (OTA) başlatır; cihaz onaylı sürümle açılınca karantina kendiliğinden kalkar. Saha ikizindeki tatbikat düğmesiyle denenebilir; "İmzalı firmware doğrulaması" önlemi açıksa cihaz paketi kendisi reddeder.', go: 'saha' },
    { kw: ['otomasyon freni', 'toplu komut', 'fren'], t: '**Otomasyon freni:** ikiz 60 sn\'de en çok 10 durdurucu komut gönderir; fazlası bekletilir ve operatör uyarılır. Böylece sahte mesajlarla ikizi kendi ağını kapatmaya zorlamak mümkün olmaz. "Toplu komut ve yük koruması" önlemi açıksa insanlar da 60 sn\'de en çok 5 cihaza durdurucu komut gönderebilir (çalınan yönetici hesabına karşı).', go: 'saha' },
    { kw: ['miselyum', 'isim', 'neden miselyum', 'mantar', 'adi nereden'], t: '**Miselyum**, mantarın toprak altındaki ince lif ağıdır: ağaçları birbirine bağlar, aralarında su, besin ve sinyal taşır. Bizim ağımız da şirketlerin birbirinden kopuk yazılımlarını ve cihazlarını dipten bağlayıp risk haritasını besler. Hif ajanları cihazların dilini konuşur, çekirdek risk motorudur, panel ise toprağın üstünde görünen mantardır.', go: 'yontem' },
    { kw: ['sirket paketi', 'paket', 'baska sektor', 'her sektor', 'olceklenebilir', 'kivilcim', 'yeni sirket'], t: '**Şirket paketi**, Miselyum\'a bir şirketi bağlayan tek dosyadır: lokasyonlar, kat planı, varlıklar, riskler, önlemler, senaryolar ve mevzuat. Çekirdek değişmez. İkinci paket olarak kurgusal bir elektrikli otomobil üreticisi (Kıvılcım Otomotiv) eklendi: fabrika kat planı, 24 risk, UNECE R155/R156 ve ISO/SAE 21434. Üst çubuktaki yeşil düğmeden şirketler arasında geçilir.', go: 'yontem' },
    { kw: ['hayalet oturum', 'ghost session', 'oturum suresi', 'oturum kapan'], t: '**Hayalet oturum**, kapatılmamış ya da çalınmış bir oturumun başkası tarafından kullanılmasıdır. Kapı\'da oturum yalnız sunucuda tutulur; 15 dk işlemsizlikte ve en geç 8 saatte silinir, kullanıcı başına en fazla 2 oturum açılır, tarayıcı değişirse oturum iptal edilir, kapanan oturumun canlı akışı anında kesilir.', go: 'guvenlik' },
    { kw: ['yetki yukseltme', 'privilege escalation', 'rbac', 'rol', 'izleyici', 'analist', 'yonetici'], t: '**Yetki yükseltme**, bir kullanıcının rolünün izin vermediği işi yapmasıdır. Kapı\'da üç rol var: izleyici (salt okur), analist (önlem ve senaryo), yönetici (cihaz komutu, denetim kaydı). Rol ve şirket her istekte sunucuda yeniden denetlenir; cihaz komutu ayrıca iki adımlı doğrulama ister.', go: 'guvenlik' },
    { kw: ['xss', 'betik enjeksiyonu', 'cross site scripting'], t: '**XSS**, sayfaya kötü niyetli betik sokmaktır. Kapı\'da içerik güvenlik politikası (CSP) yalnız kendi betiklerine izin verir, satır içi betik yoktur, arayüz metni textContent ile yazar ve oturum çerezi HttpOnly olduğu için betik çereze erişemez.', go: 'guvenlik' },
    { kw: ['ssrf', 'sunucu tarafli istek'], t: '**SSRF**, sunucuyu iç ağa ya da bulut meta veri adresine istek atmaya zorlamaktır. Kapı yalnız izinli alan adlarına HTTPS ile gider, DNS sonucu iç ağ adresiyse isteği yapmaz, bağlantıyı denetlenen IP\'ye sabitler ve yönlendirme izlemez; WAF 931100 kuralı ilk hattır.', go: 'guvenlik' },
    { kw: ['sql enjeksiyonu', 'sqli', 'sql injection'], t: '**SQL enjeksiyonu**, girdi kutusundan veritabanına komut sokmaktır. Kapı\'da bütün sorgular parametrelidir; WAF\'ı atlatan bir girdi bile SQL olarak çalışmaz. Güvenlik merkezindeki arama kutusunda deneyebilirsin.', go: 'guvenlik' },
    { kw: ['istek siniri', 'rate limit', 'kaba kuvvet', 'brute force', 'hesap kilidi'], t: '**İstek sınırı:** giriş için IP başına dakikada 5 deneme, 5 hatalı girişte hesap 15 dakika kilitlenir (her kilitte süre ikiye katlanır); genel olarak IP başına 10 saniyede 300 istek, API için oturum başına saniyede 30 istek.', go: 'guvenlik' },
    { kw: ['csrf', 'siteler arasi istek'], t: '**CSRF**, kullanıcı başka bir sitedeyken onun adına istek göndermektir. Kapı\'da çerez SameSite=Strict, durum değiştiren her istekte Origin başlığı ve oturuma özel X-CSRF belirteci denetlenir.', go: 'guvenlik' },
    { kw: ['on prem', 'yerinde', 'bulut', 'cloud', 'kurulum'], t: '**Kurulum kararı: hibrit.** Miselyum çekirdeği (Kapı, risk ve ikiz motorları) Türkiye\'deki bir bulut bölgesinde; fabrikada üretim ağı internete açılmaz, yerinde bir hif ajanı yalnız dışa doğru karşılıklı TLS ile özet veri gönderir. Şarj ağı zaten internetten bağlandığı için bulutta kalır.', go: 'guvenlik' },
    { kw: ['apn', 'sim kart'], t: '**Özel APN**, ünitelerin yalnız şirketin özel mobil ağına bağlanmasını sağlar. SIM kart IMEI\'ye bağlanmazsa çalınan SIM ile ağa girilebilir (R19).' },
    { kw: ['siem', 'wazuh', 'merkezi kayit'], t: '**SIEM**, kayıtları tek yerde toplayıp anormal olayları alarm olarak üretir (ör. açık kaynak Wazuh). Araçta "Merkezi kayıt ve SIEM izleme" kontrolüdür.', go: 'kontroller' },
    { kw: ['mfa', 'cok faktorlu', 'iki adimli'], t: '**MFA** (çok faktörlü doğrulama), paroladan sonra ikinci bir doğrulama ister. CSMS ele geçirme senaryosunu ikinci adımda durdurur; yıllık maliyeti 180 bin TL.', go: 'kontroller' },
    { kw: ['kvkk', '6698', 'kisisel veri'], t: '**KVKK** (6698 sayılı Kanun) kişisel verileri korur. Veri güvenliğine aykırılığın 2026 cezası 256.357 TL ile 17.092.242 TL arası; ihlal 72 saat içinde Kurul\'a bildirilmeli.', go: 'uyum' },
    { kw: ['epdk', 'yonetmelik', 'sarj hizmeti yonetmeligi'], t: '**EPDK** Şarj Hizmeti Yönetmeliği\'ni 23.03.2026\'da (RG 33202) değiştirdi: yazılım, cihaz ve uzaktan erişim altyapısı TS ISO/IEC 27001\'e uygun olmalı. Mevcut lisanslılara belge için 1 yıl süre verildi: son tarih 23.03.2027.', go: 'uyum' },
    { kw: ['7545', 'siber guvenlik kanunu'], t: '**7545 sayılı Siber Güvenlik Kanunu** (RG 19.03.2025) siber olay ve zafiyetlerin gecikmeden bildirilmesini ister; kritik altyapı sayılanlara ek yükümlülükler getirir.', go: 'uyum' },
    { kw: ['pci', 'kart verisi', 'tokenizasyon'], t: '**PCI DSS** kart verisi güvenliği standardıdır. Akımyolu kart verisini hiç tutmaz, ödeme kuruluşunun token\'ıyla çalışır; bu riskten "kaçınma" örneğidir.', go: 'uyum' },
    { kw: ['mitre', 'att ck', 'attack teknik'], t: '**MITRE ATT&CK**, saldırı tekniklerinin uluslararası kataloğudur. Senaryo adımlarının yanındaki T1566 (oltalama) gibi kodlar buradan gelir.', go: 'saldiri' },
    { kw: ['faz 1', 'faz 2', 'faz'], t: '**Faz 1** (Ekim 2026–Mart 2027): 26 kontrol — maliyet-fayda seti + mevzuatın saydığı 4 kontrol + farkındalık. Belge son tarihinden önce biter. **Faz 2** (Nisan–Aralık 2027): kalan 7 kontrol; ortalama kayıpta kendini ödemez ama nadir ve ağır olayları (zararlı firmware, yangın) durdurur.', go: 'kontroller', act: 'faz1' },
    { kw: ['kalibrasyon', 'kalibre'], t: '**Kalibrasyon:** simülasyonun ürettiği soket başına günlük oturum, oturum başına kWh, oturum süresi ve DC enerji payı EPDK Ağustos 2026 değerleriyle karşılaştırıldı; sapma %5\'in altında.', go: 'sektor' },
    { kw: ['openstreetmap', 'osm'], t: '**OpenStreetMap**, gönüllülerce oluşturulan açık harita verisidir (ODbL lisansı). 38 lokasyon ve haritadaki 98 mor nokta (diğer işletmecilerin şarj noktaları) buradan geldi.', go: 'saha' }
  ];

  // ---------- Kontrol, senaryo ve lokasyon eşanlamlıları ----------
  const CTL_KW = {
    isms: ['bgys kurulum', 'sertifikasyon', 'belgelendirme'], mfa: ['mfa', 'cok faktor', 'iki adim'], pam: ['pam', 'ayricalikli erisim'],
    segment: ['ag ayrimi', 'segmentasyon', 'ozel apn'], edr: ['edr', 'uc nokta', 'antivirus'], awareness: ['farkindalik', 'oltalama tatbikat', 'olta tatbikat'],
    backup: ['degistirilemez yedek', '3 2 1', 'yedekleme'], ocpp_tls: ['tls', 'profil 2', 'profil 3', 'ocpp guvenlik'], signed_fw: ['imzali firmware', 'firmware imza'],
    staged_update: ['kademeli guncelleme', 'pilot grup'], signed_meter: ['imzali olcum', 'ocmf'], vuln_mgmt: ['yama', 'zafiyet yonetim'],
    logging: ['siem', 'merkezi kayit', 'wazuh', 'log'], tamper: ['fiziksel koruma', 'kapak', 'tamper'], cctv: ['kamera', 'cctv', 'kablo kesme alarm'],
    vendor: ['tedarikci guvenligi'], secure_dev: ['sizma testi', 'guvenli gelistirme', 'pentest'], privacy: ['minimizasyon', 'anonimlestir'],
    pci: ['tokenizasyon'], cert_mgmt: ['sertifika envanter', 'sertifika yonetim', 'otomatik yenileme'], bcp: ['yedek csms', 'is surekliligi'],
    ir_plan: ['olay mudahale', 'mudahale plani'], sod: ['cift onay', 'gorevler ayriligi'], time_sync: ['saat senkron', 'ntp'], waf: ['waf', 'ddos koruma'],
    cloud_sec: ['bulut yapilandirma', 'bulut denetim'], load_guard: ['toplu komut', 'yuk koruma'], fire: ['yangin algilama', 'uzaktan kesme'],
    maintenance: ['periyodik bakim', 'elektrik muayene'], utilities: ['ups', 'jenerator', 'iklimlendirme'], screening: ['personel tarama', 'disiplin'],
    procedures: ['yazili prosedur', 'yedek personel'], insurance_review: ['police sart', 'police gozden']
  };
  const SCN_KW = {
    csms: ['csms', 'merkezi yonetim', 'tum ag', 'ag durdur'], ransom: ['fidye', 'ransomware'], firmware: ['firmware', 'zararli guncelleme', 'tedarik zinciri'],
    mitm: ['araya girme', 'mitm', 'sifresiz ocpp'], ble: ['bluetooth', 'ble', 'bakim portu'], meter: ['olcum verisi', 'sayac', 'olcum manipul'],
    leak: ['sizinti', 'veri ihlali', 'mobil uygulama'], cert: ['sertifika suresi', 'sertifika dol'], cable: ['kablo', 'hirsizlik'],
    quake: ['deprem', 'afet'], grid: ['sebeke', 'toplu yuk', 'yuk manipul'], vendor: ['bakim firmasi', 'vpn'],
    intruder: ['sizma', 'kargo', 'tailgating', 'yetkisiz giris', 'usb bellek', 'binaya giris'], outage: ['elektrik kesintisi', 'elektrik kesil', 'jenerator'],
    hqfire: ['yangin', 'teknik oda'], flood: ['sel', 'su baskini', 'saganak'], insider: ['ayrilan calisan', 'eski calisan', 'icerden', 'hesap kapan']
  };
  const GENERIC = ['avm', 'otel', 'hotel', 'plaza', 'otopark', 'merkez', 'shell', 'total', 'opet', 'dinlenme', 'tesisleri', 'tesisi', 'is', 'po', 'bp', 'kent', 'aytemiz'];

  // ---------- Yardımcılar ----------
  function md(text) {
    // **kalın** biçimini güvenli DOM'a çevirir
    const p = h('p');
    String(text).split(/(\*\*[^*]+\*\*)/).forEach(part => {
      if (/^\*\*[^*]+\*\*$/.test(part)) p.appendChild(h('b', null, part.slice(2, -2)));
      else if (part) p.appendChild(document.createTextNode(part));
    });
    return p;
  }
  const go = (view, label) => ({ label: label || (SK.views[view] ? SK.views[view].title + ' ekranına git' : 'Git'), run: () => SK.go(view) });
  const ask = (text) => ({ label: text, ask: text });
  const guide = (anchor) => ({ label: 'Rehberde aç', href: 'rehber.html#' + anchor });
  const ctlAction = k => {
    const c = SK.controlMap[k], on = SK.state.enabled.has(k);
    return { label: (on ? 'Kapat: ' : 'Aç: ') + c.title, run: () => SK.toggleControl(k, !on), keep: true };
  };
  const bandOf = r => SK.risk.eval(r, SK.state.enabled);
  const curView = () => SK.currentView || 'genel';

  function summary() {
    const S = SK.sim.S, k = S.kpi, sm = SK.risk.summary(SK.state.enabled);
    const cnt = { kritik: 0, yuksek: 0, orta: 0, dusuk: 0 };
    SK.risks.forEach(r => cnt[bandOf(r).band.key]++);
    return { S, k, sm, cnt, ready: SK.risk.readiness(SK.state.enabled) };
  }

  // ---------- Niyetler ----------
  const INTENTS = [];
  const add = (score, answer) => INTENTS.push({ score, answer });

  // Selam ve tanıtım
  add(q => (q.t.length <= 4 && want(q, ['merhaba', 'selam', 'gunaydin', 'iyi aksamlar', 'hey'])) ? 3 : 0, () => ({
    text: ['Merhaba! Ekranları açıklayabilir, sayıları yorumlayabilir ve seni doğru yere götürebilirim. Şu an **' + SK.views[curView()].title + '** ekranındasın.'],
    actions: [ask('Bu ekran ne işe yarar?'), ask('Şu anki durum ne?'), ask('Ne yapmalıyım?')] }));
  add(q => want(q, ['tesekkur', 'sagol', 'eyvallah', 'super', 'harika']) ? 2.5 : 0, () => ({ text: ['Rica ederim. Başka bir yeri merak edersen sor; ? tuşuyla beni her ekranda açabilirsin.'] }));
  add(q => want(q, ['sen kimsin', 'ne yapabilirsin', 'neler yapabilirsin', 'nasil yardim', 'yardim']) ? 3 : 0, () => ({
    text: ['Ben Miselyum\'un asistanıyım. Şu an bağlı şirket: **' + SK.company.name + '**. Şunları yapabilirim:'],
    list: ['Herhangi bir ekranın ne işe yaradığını anlatmak', 'ALE, PUKÖ, OCPP gibi kavramları açıklamak', 'Risk (ör. "R12 nedir"), kontrol, senaryo ve lokasyon ayrıntısı vermek', 'Canlı durumu özetlemek ve sıradaki adımı önermek', 'Bir düğmeyle seni ilgili ekrana götürmek, senaryo başlatmak, kontrol açmak'],
    note: provider() === 'openrouter' ? 'OpenRouter üzerinden ' + orName() + ' modeliyle cevap veriyorum.' : provider() === 'ollama' ? 'Yerel model açık: ' + LLM.model : 'Çevrimdışı bilgi tabanıyla çalışıyorum; internet gerekmez. Başlıktaki düğmeden model seçebilirsin.' }));


  // Bu ekran
  add(q => want(q, ['bu ekran', 'burasi ne', 'bu sayfa', 'ne ise yarar', 'nasil kullan', 'ne gosteriyor', 'nasil okunur']) ? 2.6 : 0, () => explainAnswer(curView()));

  // Canlı durum
  add(q => want(q, ['durum', 'ozet', 'su an', 'su anda', 'nasil gidiyor', 'kac soket', 'cevrimici', 'sarjda', 'kac arac', 'gelir']) ? 2.2 : 0, () => {
    const x = summary(), A = SK.state.attack;
    return {
      text: ['**Canlı durum** (simülasyon saati ' + F.clock(x.S.minute) + '):'],
      list: [F.n(x.k.online) + ' / ' + F.n(x.k.total) + ' soket çevrimiçi, ' + F.n(x.k.charging) + ' araç şarjda (' + F.n(x.k.power) + ' kW).',
        'Bugünkü gelir ' + F.tl(x.S.dayRevenue) + ', enerji ' + F.n(x.S.dayEnergy) + ' kWh.',
        SK.state.enabled.size + ' kontrol açık; yıllık beklenen kayıp ' + F.tlShort(x.sm.aleRes) + ' (kontrolsüz ' + F.tlShort(x.sm.aleIn) + ').',
        'Risk dağılımı: ' + x.cnt.kritik + ' kritik, ' + x.cnt.yuksek + ' yüksek, ' + x.cnt.orta + ' orta, ' + x.cnt.dusuk + ' düşük. Mevzuat hazırlığı ' + F.pct(x.ready) + '.',
        A ? 'Senaryo: ' + SK.scenarioMap[A.id].title + ' (' + (A.status === 'blocked' ? 'engellendi' : A.status === 'done' ? 'etkisi sürüyor' : 'sürüyor') + ').' : 'Şu an çalışan olay senaryosu yok.'],
      actions: [go('saha'), ask('Ne yapmalıyım?')] };
  });

  // En büyük riskler
  add(q => want(q, ['en buyuk risk', 'en riskli', 'en onemli risk', 'major risk', 'kritik risk', 'hangi risk']) ? 2.8 : 0, () => {
    const top = SK.risks.map(r => ({ r, e: bandOf(r) })).sort((a, b) => b.e.ale - a.e.ale).slice(0, 5);
    const major = SK.risks.filter(r => bandOf(r).band.major).length;
    return {
      text: ['Açık kontrollerle şu an **' + major + ' major risk** var. Yıllık beklenen kaybı en yüksek 5 risk:'],
      list: top.map(x => x.r.id + ' · ' + x.r.title + ' — ' + x.e.band.label + ' (' + x.e.score + '), ' + F.tlShort(x.e.ale) + '/yıl'),
      actions: [go('riskler'), ask(top[0].r.id + ' nedir?')] };
  });

  // Öneri
  add(q => want(q, ['ne yapmali', 'ne yapayim', 'oneri', 'tavsiye', 'hangi kontrol', 'nereden basla', 'siradaki adim', 'iyilestir']) ? 2.8 : 0, () => {
    const en = SK.state.enabled;
    const cands = SK.controls.filter(c => !en.has(c.key)).map(c => ({ c, m: SK.risk.marginal(c.key, en) })).sort((a, b) => b.m.net - a.m.net).slice(0, 3);
    const missing = SK.plans ? [...SK.plans.faz1].filter(k => !en.has(k)) : [];
    if (!cands.length) return { text: ['33 kontrolün hepsi açık. Şimdi Senaryolar ekranında olayları deneyip kalan riskleri görebilirsin.'], actions: [go('saldiri')] };
    return {
      text: ['Şu anki duruma eklendiğinde **net faydası en yüksek** 3 kontrol:'],
      list: cands.map(x => x.c.title + ' (Ek A ' + x.c.iso + '): yılda ' + F.tlShort(x.m.benefit) + ' kayıp önler, maliyeti ' + F.tlShort(x.c.cost)),
      note: missing.length ? 'Faz 1 planında henüz açık olmayan ' + missing.length + ' kontrol var.' : 'Faz 1 planı tamam; sıradaki adım Faz 2.',
      actions: cands.map(x => ctlAction(x.c.key)).concat(missing.length ? [{ label: 'Faz 1 planını uygula', run: () => SK.setEnabled(SK.plans.faz1), keep: true }] : [], [go('kontroller')]) };
  });

  // Mevzuat eksikleri
  add(q => want(q, ['eksik', 'hazirlik', 'gereklilik', 'uyum durumu', 'mevzuat ne', 'epdk ne istiyor', 'zorunlu']) ? 2.5 : 0, () => {
    const miss = [];
    SK.frameworks.forEach(f => f.reqs.forEach(r => { const st = SK.risk.reqStatus(r, SK.state.enabled); if (st.key !== 'ok') miss.push({ r, st }); }));
    if (!miss.length) return { text: ['16 gerekliliğin hepsi karşılanıyor. Mevzuat hazırlığı %100.'], actions: [go('uyum')] };
    return {
      text: ['Mevzuat hazırlığı **' + F.pct(SK.risk.readiness(SK.state.enabled)) + '**. Eksik veya kısmen karşılanan ' + miss.length + ' gereklilik var:'],
      list: miss.slice(0, 6).map(x => x.r.id + ' · ' + x.r.text.split(' (')[0] + ' — eksik: ' + x.st.missing.map(k => SK.controlMap[k].title).join(', ')),
      note: miss.length > 6 ? (miss.length - 6) + ' gereklilik daha var.' : null,
      actions: [{ label: 'Faz 1 planını uygula', run: () => SK.setEnabled(SK.plans.faz1), keep: true }, go('uyum')] };
  });

  // Para
  add(q => want(q, ['maliyet', 'butce', 'kac para', 'yatirim', 'getiri', 'kac tl', 'net fayda', 'rosi']) ? 2.3 : 0, () => {
    const p = k => SK.risk.summary(SK.plans[k]);
    const cur = SK.risk.summary(SK.state.enabled);
    return {
      text: ['Açık kontrollerin yıllık maliyeti **' + F.tlShort(cur.cost) + '**; yıllık beklenen kaybı ' + F.tlShort(cur.aleIn) + '\'den ' + F.tlShort(cur.aleRes) + '\'ye indiriyor. Planların karşılaştırması:'],
      list: [['Yalnız maliyet-fayda', 'fin'], ['Faz 1', 'faz1'], ['Faz 2 · tümü', 'all']].map(([l, k]) => { const s = p(k); return l + ' (' + SK.plans[k].size + ' kontrol): maliyet ' + F.tlShort(s.cost) + ', kalan kayıp ' + F.tlShort(s.aleRes) + ', net fayda ' + F.tlShort(s.net); }),
      actions: [go('kontroller'), go('sigorta')] };
  });

  // Saha müdahale süresi ve itfaiye (OpenStreetMap: OSRM + Overpass)
  add(q => want(q, ['mudahale suresi', 'surus suresi', 'ne kadar surede', 'saha ekibi', 'itfaiye', 'teknisyen', 'ulasim']) ? 2.7 : 0, () => {
    const s = SK.twin.sites.filter(x => x.extra);
    const by = c => s.filter(x => x.city === c).map(x => x.extra.driveMin);
    const dur = m => m >= 60 ? Math.floor(m / 60) + ' sa ' + (m % 60) + ' dk' : m + ' dk';
    const rng = a => a.length ? dur(Math.min.apply(null, a)) + ' – ' + dur(Math.max.apply(null, a)) : '–';
    const fires = s.filter(x => x.extra.fireKm <= 30).map(x => x.extra.fireKm);
    const fmax = F.n1(Math.max.apply(null, fires));
    return {
      text: ['OpenStreetMap yol ağıyla hesaplanan **merkezden sürüş süreleri** (trafiksiz):'],
      list: ['Ankara: ' + rng(by('ANK')), 'Eskişehir: ' + rng(by('ESK')), 'Konya: ' + rng(by('KON')), 'Yol kenarı: ' + rng(by('YOL')),
        'En yakın itfaiye: ' + fires.length + ' lokasyonda ' + fmax + ' km içinde; ' + (s.length - fires.length) + ' yol kenarı tesisinde OpenStreetMap\'te yakın kayıt yok.'],
      note: 'Eskişehir ve Konya\'ya ulaşmak yaklaşık 3 saat sürdüğü için bölgesel saha ortağı öneriliyor; kablo hırsızlığı ve arızada kesinti süresini kısaltır.',
      actions: [go('saha')] };
  });

  // Veriler gerçek mi
  add(q => want(q, ['gercek mi', 'gercek veri', 'uydurma', 'kaynak', 'nereden aldin', 'veriler nereden', 'kurgusal']) ? 2.6 : 0, () => ({
    text: ['Ayrım açık tutuldu:'],
    list: ['**Gerçek:** EPDK Ocak–Ağustos 2026 istatistikleri, Eylül 2026 fiyatları, KVKK 2026 cezaları, yönetmelik metni, ' + SK.twin.sites.length + ' lokasyonun yeri (OpenStreetMap).', '**Gerçeğe kalibre:** talep modeli; EPDK Ağustos 2026 değerlerinden sapma %5\'in altında.', '**Kurgusal:** şirket, üniteler, personel.', '**Varsayım:** risk olasılıkları, kayıp tutarları, kontrol maliyetleri.'],
    actions: [go('yontem'), go('sektor')] }));

  // Sunum
  add(q => want(q, ['hocaya', 'hocama', 'sunum', 'nasil anlat', 'sunarim', 'tanit']) ? 2.7 : 0, () => ({
    text: ['6 dakikalık sunum akışı önerim:'],
    list: ['**Sorun (30 sn):** EPDK 2026\'da şarj işletmecilerine ISO 27001\'i zorunlu yaptı; son tarih 23.03.2027. Şirketlerin sistemleri kopuk, risk tablosu elle tutuluyor.',
      '**Miselyum (30 sn):** adın hikâyesi; üst çubuktaki yeşil düğmeden ikinci şirkete (Kıvılcım) geç, her şeyin değiştiğini göster.',
      '**Canlı ikiz (1 dk):** Kapı ile giriş yap; 95 sanal cihaz OCPP ile bağlı, haritada bir AVM\'ye tıkla.',
      '**Senaryo (1 dk):** CSMS senaryosunu çalıştır, ağ kırmızıya döner; MFA\'yı aç, tekrar çalıştır, 2. adımda durur.',
      '**Önlemler (1 dk):** Faz 1 planını uygula; yıllık zarar ve hazırlık değişir, şifresiz 48 cihaz birkaç saniyede TLS\'e geçer.',
      '**Güvenlik merkezi (1,5 dk):** isteğin yolculuğu, SQLi ve SSRF denemesi, 57/57 savunma testi; kapanışta politika ve risk raporu.'],
    actions: [SK.scenarioMap.csms ? { label: 'CSMS senaryosuna git', run: () => openScenario('csms', false) } : { label: 'Senaryolara git', run: () => SK.go('saldiri') }, guide('sunum')] }));

  // Kısayollar
  add(q => want(q, ['kisayol', 'klavye', 'tus']) ? 2.5 : 0, () => ({
    text: ['Klavye kısayolları:'],
    list: SK.navOrder.map((id, i) => (i + 1) + ' → ' + (SK.navGroupOf(id) || { title: id }).title).concat(['? → Asistanı aç/kapat']) }));

  // Yerel model
  add(q => want(q, ['openrouter', 'bulut model', 'akilli model', 'daha zeki']) ? 3 : 0, () => ({
    text: ['**OpenRouter**, birçok dil modeline tek anahtarla erişim sağlar. Asistan orada ağırlıkları açık yayımlanmış modelleri kullanır; varsayılan **DeepSeek V4 Pro** (1 milyon token girdi için yaklaşık 0,21 $; bir sunum birkaç kuruş tutar).', 'Başlıktaki model düğmesine bas, anahtarını gir ve Kaydet de. Anahtar yalnız bu tarayıcıda saklanır. İnternet koparsa asistan bilgi tabanına döner.'],
    actions: [{ label: 'Model ayarlarını aç', run: () => { if (settings) { settings.hidden = false; renderSettings(); } } }] }));
  add(q => want(q, ['yerel model', 'ollama', 'yapay zeka', 'llm', 'dil modeli', 'acik kaynak model']) ? 2.7 : 0, () => ({
    text: [LLM.ok ? 'Yerel model bağlı: **' + LLM.model + '**. Seçili mod buna izin veriyorsa sorularını bilgisayarındaki açık kaynak modelle yanıtlıyorum; veri dışarı çıkmıyor. Başlıktaki düğmeden mod seçebilirsin.'
      : 'Bilgisayarda yerel model bulamadım. Bilgisayarda açık kaynak bir model çalıştırırsan otomatik bağlanırım:'],
    list: LLM.ok ? null : (FILE
      ? ['Sayfa şu an dosyadan açık; Ollama güvenlik gereği dosyadan gelen isteklere cevap vermez.', 'Klasördeki **baslat-yerel-sunucu.bat** dosyasına çift tıkla: sayfa http://localhost:8765 adresinde açılır ve yerel model bağlanır.', 'Ollama kurulu değilse ollama.com\'dan kur, terminalde ollama pull qwen2.5:3b yaz.']
      : ['ollama.com\'dan Ollama\'yı kur.', 'Terminalde: ollama pull qwen2.5:3b (Türkçesi iyi, küçük bir model).', 'Ollama\'yı çalıştırıp sayfayı yenile; başlıkta "Yerel model" yazar.']),
    actions: [{ label: 'Yeniden dene', run: () => probe(true), keep: true }] }));

  // ---------- Varlığa özel yanıtlar ----------
  function riskAnswer(id) {
    const r = SK.riskMap[id];
    const e = bandOf(r), tr = SK.risk.treatment(r, e);
    const off = r.controls.filter(k => !SK.state.enabled.has(k));
    return {
      text: ['**' + r.id + ' · ' + r.title + '** (' + r.cat + (r.hidden ? ', az bilinen risk' : '') + ')',
        'Şu an: olasılık ' + e.L + ' × etki ' + e.I + ' = **' + e.score + ' (' + e.band.label + ', ' + (e.band.major ? 'major' : 'minör') + ')**, yıllık beklenen kayıp ' + F.tlShort(e.ale) + '.',
        '**Tehdit:** ' + r.threat, '**Zafiyet:** ' + r.vuln, '**Önerilen işlem:** ' + tr.label + ' — ' + tr.why],
      list: r.controls.length ? r.controls.map(k => (SK.state.enabled.has(k) ? '✓ ' : '✗ ') + SK.controlMap[k].title) : null,
      actions: off.slice(0, 2).map(ctlAction).concat([go('riskler')]) };
  }
  function controlAnswer(k) {
    const c = SK.controlMap[k], on = SK.state.enabled.has(k), m = SK.risk.marginal(k, SK.state.enabled);
    const rs = SK.risks.filter(r => r.controls.indexOf(k) >= 0).map(r => r.id);
    return {
      text: ['**' + c.title + '** (Ek A ' + c.iso + ') — şu an **' + (on ? 'açık' : 'kapalı') + '**, plan: ' + SK.phaseOf(k) + '.', c.desc,
        'Yıllık maliyet ' + F.tlShort(c.cost) + '; ' + (on ? 'kapatılırsa yılda ' + F.tlShort(m.benefit) + ' kayıp artar.' : 'açılırsa yılda ' + F.tlShort(m.benefit) + ' kayıp önler.') + ' ' + (c.kind === 'L' ? 'Olasılığı' : 'Etkiyi') + ' %' + Math.round(c.eff * 100) + ' azaltır; ilgili riskler: ' + rs.join(', ') + '.'],
      actions: [ctlAction(k), go('kontroller')] };
  }
  function openScenario(id, run) {
    SK.store.set('scenario', id);
    SK.go('saldiri');
    if (run) setTimeout(() => SK.scenario.run(SK.scenarioMap[id]), 500);
  }
  function scenarioAnswer(id, run) {
    const scn = SK.scenarioMap[id], res = SK.scenario.calc(scn, SK.state.enabled);
    const stopper = scn.stages.map((st, i) => (st.blockedBy || []).filter(k => !SK.state.enabled.has(k)).map(k => ({ i, k }))).reduce((a, b) => a.concat(b), [])[0];
    if (run) openScenario(id, true);
    return {
      text: ['**' + scn.title + '** — ' + scn.summary,
        res.blocked ? 'Açık kontrollerle ' + (scn.cat === 'Siber' ? 'saldırı' : 'olay') + ' **' + (res.at + 1) + '. adımda duruyor** (' + res.by.map(k => SK.controlMap[k].title).join(', ') + '); maliyet ' + F.tlShort(res.total) + '.'
          : 'Açık kontrollerle ' + (scn.cat === 'Siber' ? 'saldırı' : 'olay') + ' **durmuyor**: ' + (res.affected.length ? res.affected.length + ' soket, ' + F.n1(res.hours) + ' saat; ' : '') + 'tahmini kayıp ' + F.tlShort(res.total) + '.',
        run ? 'Senaryoyu Senaryolar ekranında başlattım; adımları oradan izleyebilirsin.' : null].filter(Boolean),
      actions: (run ? [] : [{ label: 'Senaryoyu çalıştır', run: () => openScenario(id, true) }, { label: 'Senaryoyu aç', run: () => openScenario(id, false) }])
        .concat(!res.blocked && stopper ? [ctlAction(stopper.k)] : []) };
  }
  function siteAnswer(site) {
    const units = site.units.map(u => SK.models[u.model].label).join(', ');
    return {
      text: ['**' + site.name + '** (' + site.code + ') — ' + SK.siteTypes[site.type].label + ', ' + (site.city === 'YOL' ? site.road : SK.cityNames[site.city]) + '.',
        'Gerçek konum: ' + site.poi + (site.street ? ', ' + site.street : '') + (site.district ? ' · ' + site.district : '') + '. Üniteler: ' + units + '. Bağlantı: ' + SK.links[site.link].label + '.',
        site.extra ? 'Merkezden sürüş ' + site.extra.driveMin + ' dk (' + F.n1(site.extra.driveKm) + ' km). ' + (site.extra.fireKm > 30 ? 'OpenStreetMap\'te 30 km içinde kayıtlı itfaiye yok.' : 'En yakın itfaiye: ' + site.extra.fireName + ', ' + F.n1(site.extra.fireKm) + ' km.') : null].filter(Boolean),
      actions: [{ label: 'Haritada göster', run: () => { SK.state.selectedSite = site.id; SK.go('saha'); } }] };
  }
  function explainAnswer(view) {
    const sc = SCREENS[view] || {};
    const title = SK.views[view] ? SK.views[view].title : view;
    const extra = (SK._help && SK._help.anchor === view && view === curView()) ? SK._help.lines : null;
    // Ekranın kendi yardım satırları varsa onları kullan (<b> → **kalın**, diğer etiketler atılır)
    const lines = extra ? extra.map(l => l.replace(/<\/?b>/g, '**').replace(/<[^>]+>/g, '')) : sc.how;
    return {
      text: ['**' + title + '** — ' + (sc.what || '')],
      list: lines || null,
      note: sc.tell ? 'Hocana şöyle anlat: "' + sc.tell + '"' : null,
      actions: (view === curView() ? [] : [go(view)]).concat([guide(view)]) };
  }

  // ---------- Yanıt seçimi ----------
  function respond(text) {
    const q = { raw: text, n: norm(text) };
    q.t = q.n.split(' ').filter(Boolean);
    const runWord = want(q, ['calistir', 'baslat', 'simule et', 'dene']);
    const navWord = want(q, ['git', 'goster', 'gotur', 'nerede', 'ekrani', 'sayfasi']);
    const defWord = want(q, ['nedir', 'ne demek', 'anlami', 'ne anlama', 'acikla']);
    const cands = [];

    // Risk numarası
    const m = q.n.match(/\br ?0?(\d{1,2})\b/) || q.n.match(/\brisk (\d{1,2})\b/);
    if (m) { const id = 'R' + String(+m[1]).padStart(2, '0'); if (SK.riskMap[id]) cands.push({ s: 6, a: () => riskAnswer(id) }); }
    // Senaryo
    Object.keys(SCN_KW).forEach(id => { if (!SK.scenarioMap[id]) return; const s = hits(q, SCN_KW[id]); if (s) cands.push({ s: s + (runWord ? 3 : 0) + (want(q, ['senaryo', 'saldiri']) ? 1.5 : 0), a: () => scenarioAnswer(id, runWord) }); });
    SK.scenarios.forEach(scn => {
      if (SCN_KW[scn.id]) return;
      const words = norm(scn.title).split(' ').filter(w => w.length >= 3 && ['ve', 'ile', 'icin', 'olur', 'durur'].indexOf(w) < 0);
      const n = words.filter(w => q.t.some(t => t === w || (w.length >= 4 && t.indexOf(w.slice(0, Math.max(4, w.length - 2))) === 0))).length;
      if (n) cands.push({ s: n * 1.3 + (runWord ? 3 : 0) + (want(q, ['senaryo', 'saldiri']) ? 1 : 0), a: () => scenarioAnswer(scn.id, runWord) });
    });
    // Kontrol
    Object.keys(CTL_KW).forEach(k => { if (!SK.controlMap[k]) return; const s = hits(q, CTL_KW[k]); if (s) cands.push({ s: s + (want(q, ['kontrol', 'ac', 'kapat']) ? 1 : 0), a: () => controlAnswer(k) }); });
    // Lokasyon
    SK.twin.sites.forEach(site => {
      const full = norm(site.poi), first = full.split(' ')[0];
      let s = 0;
      if (full.length >= 4 && q.n.indexOf(full) >= 0) s = 4 + full.length / 10;
      else if (first.length >= 5 && GENERIC.indexOf(first) < 0 && q.t.some(t => t.indexOf(first) === 0)) s = 3;
      if (s) cands.push({ s, a: () => siteAnswer(site) });
    });
    // Ekranlar
    Object.keys(SCREENS).forEach(v => {
      const s = hits(q, SCREENS[v].kw.concat([SK.views[v] ? SK.views[v].title : v]));
      if (s) cands.push({ s: s + (navWord ? 2 : 0) + (want(q, ['ne ise yarar', 'nasil kullan', 'ne gosterir']) ? 1.5 : 0) - (defWord ? 1 : 0), a: () => navWord ? Object.assign(explainAnswer(v), { autoGo: v }) : explainAnswer(v) });
    });
    // Kavramlar
    TERMS.forEach(term => { const s = hits(q, term.kw); if (s) cands.push({ s: s + (defWord ? 2 : 0) + 0.3, a: () => termAnswer(term) }); });
    // Genel niyetler
    INTENTS.forEach(it => { const s = it.score(q); if (s) cands.push({ s, a: it.answer }); });

    cands.sort((a, b) => b.s - a.s);
    if (cands.length && cands[0].s >= 1) return cands[0].a();
    return {
      text: ['Bunu tam anlayamadım. Şöyle sorabilirsin:'],
      list: ['"Bu ekran ne işe yarar?"', '"R12 nedir?" veya "MFA nedir?"', '"CSMS saldırısını çalıştır"', '"Kentpark nerede?"', '"Ne yapmalıyım?"'],
      actions: [guide('sss'), ask('Neler yapabilirsin?')] };
  }
  function termAnswer(term) {
    const acts = [];
    if (term.go) acts.push(go(term.go));
    if (term.act === 'faz1') acts.unshift({ label: 'Faz 1 planını uygula', run: () => SK.setEnabled(SK.plans.faz1), keep: true });
    return { text: [term.t], actions: acts };
  }

  // ---------- Dil modelleri: OpenRouter (bulut, açık ağırlıklı modeller) ve Ollama (yerel) ----------
  // Anahtar yalnız bu tarayıcının deposunda tutulur; dosyalara ve yayınlanan sürüme yazılmaz.
  const OR_MODELS = [
    ['deepseek/deepseek-v4-pro', 'DeepSeek V4 Pro · önerilen, çok ucuz'],
    ['qwen/qwen3.8-27b', 'Qwen 3.8 27B · Alibaba'],
    ['z-ai/glm-5.3', 'GLM 5.3 · Z.ai'],
    ['openai/gpt-oss-120b', 'gpt-oss 120B · OpenAI açık model'],
    ['moonshotai/kimi-k2.6', 'Kimi K2.6 · Moonshot']
  ];
  const LLM = {
    mode: SK.store.get('aiMode', 'auto'),
    ollama: 'http://127.0.0.1:11434', model: null, ok: false,
    orKey: SK.store.get('orKey', ''), orModel: SK.store.get('orModel', OR_MODELS[0][0]),
    busy: false
  };
  const FILE = location.protocol === 'file:';
  const orName = () => (OR_MODELS.find(m => m[0] === LLM.orModel) || [LLM.orModel, LLM.orModel])[1].split(' · ')[0];
  function provider() {
    if (LLM.mode === 'kb') return 'kb';
    if (LLM.mode === 'openrouter') return LLM.orKey ? 'openrouter' : 'kb';
    if (LLM.mode === 'ollama') return LLM.ok ? 'ollama' : 'kb';
    return LLM.orKey ? 'openrouter' : LLM.ok ? 'ollama' : 'kb';
  }
  const PREF = [/qwen3/, /qwen2\.5/, /gemma3/, /llama3\.[12]/, /gemma2/, /mistral/, /phi/, /llama/];
  function probe(say) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = setTimeout(() => ctl && ctl.abort(), 1500);
    return fetch(LLM.ollama + '/api/tags', ctl ? { signal: ctl.signal } : {}).then(r => r.json()).then(j => {
      clearTimeout(tm);
      const names = (j.models || []).map(m => m.name);
      LLM.model = PREF.map(re => names.find(n => re.test(n))).find(Boolean) || names[0] || null;
      LLM.ok = !!LLM.model;
      syncMode();
      if (say) post('bot', { text: [LLM.ok ? 'Yerel model bulundu: **' + LLM.model + '**.' : 'Ollama çalışıyor ama yüklü model yok. Terminalde: ollama pull qwen2.5:3b'] });
    }).catch(() => {
      clearTimeout(tm); LLM.ok = false; syncMode();
      if (say) post('bot', { text: [FILE ? 'Yerel model bulunamadı. Sayfa dosyadan açık olduğu için Ollama isteği reddediyor olabilir; **baslat-yerel-sunucu.bat** ile açmayı dene.' : 'Yerel model bulunamadı. Ollama kapalı olabilir.'] });
    });
  }
  function context(kb) {
    const x = summary(), v = curView(), sc = SCREENS[v] || {};
    const top = SK.risks.map(r => ({ r, e: bandOf(r) })).sort((a, b) => b.e.ale - a.e.ale).slice(0, 5)
      .map(o => o.r.id + ' ' + o.r.title + ': ' + o.e.band.label + ', ' + F.tlShort(o.e.ale) + '/yıl').join('; ');
    const kbText = kb ? [].concat(kb.text || [], kb.list || [], kb.note || []).join(' ').replace(/\*\*/g, '') : '';
    return [
      SK.tenantId === 'akimyolu'
        ? 'Şirket: Akımyolu Şarj Hizmetleri A.Ş. (kurgusal), Ankara OSTİM merkez, 38 gerçek lokasyon (Ankara 19, Konya 8, Eskişehir 7, yol kenarı 4), 95 ünite, 190 soket, 40 çalışan, 120.000 uygulama kullanıcısı.'
        : 'Şirket: ' + SK.company.name + ' (kurgusal), ' + SK.tenant.sector + '; ' + SK.twin.sites.length + ' lokasyon, ' + SK.twin.connectors.length + ' uç nokta, ' + SK.risks.length + ' risk, ' + SK.controls.length + ' önlem.',
      'Mevzuat: ' + SK.frameworks.map(f => f.title + (f.sub ? ' (' + f.sub + ')' : '')).join('; ') + '.',
      'Miselyum: şirketlerin kopuk sistemlerini bağlayan BGYS dijital ikiz ağı. Her şirket bir paket (lokasyon, kat planı, risk, önlem, senaryo, mevzuat). Bağlı şirketler: ' + SK.tenants.map(t => t.short).join(', ') + '.',
      'Ana ekranlar: Genel bakış, Dijital ikiz (Saha haritası, Tesis), Riskler, Önlemler (Kontroller, Sigorta, Uyum), Senaryolar, Yöntem, Güvenlik merkezi (Miselyum Kapısı).',
      'Bağlantı: ' + (SK.link.mode === 'canli' ? 'seviye 3, Miselyum Kapısı üzerinden ' + SK.link.devices + ' cihaz OCPP ile canlı bağlı; ikiz kendisi komut gönderip doğruluyor' + (SK.ikiz3 && SK.ikiz3.ozet ? ' (' + SK.ikiz3.ozet.say.otomatik + ' otomatik komut, ' + SK.ikiz3.ozet.say.dogrulandi + ' doğrulandı)' : '') + '.' : 'seviye 1, veri bu bilgisayarda simüle ediliyor; Kapı ile açılınca seviye 3.'),
      'Kapı korumaları: sunucu tarafı oturum (15 dk boşta, 8 sa mutlak, en fazla 2), rol ve şirket denetimi, iki adımlı doğrulama, CSRF belirteci, CSP, parametreli SQL, SSRF izin listesi, istek sınırı ve hesap kilidi, anomali puanlı WAF.',
      'Kullanıcının bulunduğu ekran: ' + SK.tabLabel(v) + ' — ' + (sc.what || ''),
      'Canlı durum: ' + x.k.online + '/' + x.k.total + ' soket çevrimiçi, ' + x.k.charging + ' araç şarjda; ' + SK.state.enabled.size + ' önlem açık; yıllık beklenen zarar ' + F.tlShort(x.sm.aleRes) + ' (önlemsiz ' + F.tlShort(x.sm.aleIn) + '); önlem maliyeti ' + F.tlShort(x.sm.cost) + '/yıl; risk dağılımı ' + x.cnt.kritik + ' kritik, ' + x.cnt.yuksek + ' yüksek, ' + x.cnt.orta + ' orta, ' + x.cnt.dusuk + ' düşük; mevzuata hazırlık ' + F.pct(x.ready) + '.',
      'En büyük 5 risk: ' + top + '.',
      'Plan: Faz 1 = ' + SK.plans.faz1.size + ' önlem (' + F.tlShort(SK.risk.summary(SK.plans.faz1).cost) + '/yıl, kalan zarar ' + F.tlShort(SK.risk.summary(SK.plans.faz1).aleRes) + ', hazırlık ' + F.pct(SK.risk.readiness(SK.plans.faz1)) + '); Faz 2 = ' + SK.controls.length + ' önlemin tamamı.',
      kbText ? 'Bilgi tabanının bu soruya ilişkin kaydı: ' + kbText : ''
    ].filter(Boolean).join('\n');
  }
  const SYSTEM = 'You are "Miselyum Asistan", the help assistant inside Miselyum, an ISO/IEC 27001 information-security digital-twin network that connects fictional Turkish companies (an EV charging operator and an EV manufacturer). ' +
    'Always answer in Turkish, in 2 to 5 short sentences, in plain language a university student understands. Use ONLY the facts in CONTEXT; never invent numbers, names or regulations. ' +
    'If CONTEXT does not contain the answer, say so briefly and name the most relevant screen to open. Do not use markdown headings or tables.';
  let history = [];
  // Düşünen modellerin <think> bölümünü ve markdown başlıklarını gizle
  const clean = t => t.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/^#+\s*/gm, '').trim();

  // Akış: Ollama satır satır JSON, OpenRouter "data: {...}" satırları (SSE) gönderir
  function streamRequest(prov, msgs) {
    if (prov === 'openrouter') {
      return fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LLM.orKey, 'X-Title': 'Miselyum' },
        body: JSON.stringify({ model: LLM.orModel, messages: msgs, stream: true, max_tokens: 700, temperature: 0.3, reasoning: { effort: 'low', exclude: true } })
      });
    }
    return fetch(LLM.ollama + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: LLM.model, messages: msgs, stream: true, options: { temperature: 0.2, num_ctx: 4096 } }) });
  }
  function piece(prov, line) {
    if (prov === 'openrouter') {
      if (line.indexOf('data:') !== 0) return '';
      const d = line.slice(5).trim();
      if (!d || d === '[DONE]') return '';
      const j = JSON.parse(d);
      if (j.error) throw new Error(j.error.message || 'model hatası');
      return (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) || '';
    }
    const j = JSON.parse(line);
    return (j.message && j.message.content) || '';
  }
  const ERR = { 401: 'OpenRouter anahtarı geçersiz.', 402: 'OpenRouter hesabında kredi kalmamış.', 429: 'Çok sık istek gönderildi; biraz bekleyip tekrar dene.' };
  function askLLM(prov, text, kb, bubble) {
    LLM.busy = true;
    const label = prov === 'openrouter' ? 'OpenRouter · ' + orName() : 'Yerel model · ' + LLM.model;
    const msgs = [{ role: 'system', content: SYSTEM + '\n\nCONTEXT:\n' + context(kb) }].concat(history.slice(-6), [{ role: 'user', content: text }]);
    const body = bubble.querySelector('.a-text');
    SK.clear(body).appendChild(h('p', { class: 'a-typing' }, (prov === 'openrouter' ? orName() : 'Yerel model') + ' düşünüyor…'));
    let out = '';
    return streamRequest(prov, msgs)
      .then(res => {
        if (!res.ok || !res.body) { const e = new Error(ERR[res.status] || ('Bağlantı hatası (' + res.status + ').')); e.status = res.status; throw e; }
        const reader = res.body.getReader(), dec = new TextDecoder();
        let buf = '';
        const pump = () => reader.read().then(({ done, value }) => {
          if (done) return;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n'); buf = lines.pop();
          lines.forEach(l => { if (!l.trim()) return; try { out += piece(prov, l.trim()); } catch (e) { if (/hata|error/i.test(e.message)) throw e; } });
          SK.clear(body);
          clean(out).split(/\n{2,}/).forEach(par => { if (par.trim()) body.appendChild(md(par.trim())); });
          scrollLog();
          return pump();
        });
        return pump();
      })
      .then(() => {
        if (!clean(out)) throw new Error('Model boş cevap döndürdü.');
        history.push({ role: 'user', content: text }, { role: 'assistant', content: clean(out) });
        bubble.appendChild(h('div', { class: 'a-meta' }, label));
      })
      .catch(err => {
        if (prov === 'ollama') { LLM.ok = false; syncMode(); }
        SK.clear(body);
        renderInto(bubble, kb, true);
        bubble.appendChild(h('div', { class: 'a-meta' }, (err && err.message && err.message.length < 90 ? err.message + ' ' : '') + 'Bilgi tabanı yanıtı gösteriliyor.'));
      })
      .then(() => { LLM.busy = false; scrollLog(); });
  }

  // ---------- Arayüz ----------
  let panel = null, log = null, input = null, sugs = null, modeBtn = null, fab = null, settings = null, greeted = false;
  const SUGS = {
    genel: ['Bu proje ne yapıyor?', 'Neden Miselyum?', 'Hocama nasıl anlatırım?'],
    sektor: ['Veriler gerçek mi?', 'Kalibrasyon ne demek?', 'EPDK ne istiyor?'],
    varliklar: ['Dijital ikiz nedir?', 'En büyük risk hangisi?', 'Gizlilik bütünlük erişilebilirlik nedir?'],
    riskler: ['En büyük risk hangisi?', 'Major ve minör ne demek?', 'ALE nedir?'],
    kontroller: ['Ne yapmalıyım?', 'Faz 1 ve Faz 2 nedir?', 'Maliyet ne kadar?'],
    saha: ['Şu anki durum ne?', 'Müdahale süresi ne kadar?', 'Kentpark nerede?'],
    merkez: ['Merkez tesis ne gösteriyor?', 'Fidye yazılımı senaryosunu çalıştır', 'Personel nerede çalışıyor?'],
    saldiri: ['CSMS saldırısını çalıştır', 'MITRE ATT&CK nedir?', 'Ne yapmalıyım?'],
    sigorta: ['Risk işleme nedir?', 'Sigorta neden ödemeyebilir? R37', 'Maliyet ne kadar?'],
    uyum: ['Hangi gereklilikler eksik?', 'EPDK ne istiyor?', 'SoA nedir?'],
    guvenlik: ['Hayalet oturum nedir?', 'SSRF nedir?', 'Yerinde mi bulutta mı?'],
    yontem: ['PUKÖ nedir?', 'Hocama nasıl anlatırım?', 'Veriler gerçek mi?']
  };
  function scrollLog() { if (log) log.scrollTop = log.scrollHeight; }
  function syncMode() {
    if (!modeBtn) return;
    const p = provider();
    modeBtn.textContent = p === 'openrouter' ? orName() : p === 'ollama' ? 'Yerel · ' + LLM.model : 'Bilgi tabanı';
    modeBtn.classList.toggle('is-llm', p !== 'kb');
    modeBtn.title = 'Model ayarları';
    if (settings && !settings.hidden) renderSettings();
  }
  function renderSettings() {
    SK.clear(settings);
    const mode = h('select', { 'aria-label': 'Çalışma modu', onchange: e => { LLM.mode = e.target.value; SK.store.set('aiMode', LLM.mode); syncMode(); } },
      [['auto', 'Otomatik (anahtar varsa OpenRouter, yoksa yerel, yoksa bilgi tabanı)'], ['openrouter', 'OpenRouter (bulut)'], ['ollama', 'Yerel model (Ollama)'], ['kb', 'Yalnız bilgi tabanı (internetsiz)']]
        .map(([v, l]) => h('option', { value: v, selected: LLM.mode === v }, l)));
    const model = h('select', { 'aria-label': 'OpenRouter modeli', onchange: e => { LLM.orModel = e.target.value; SK.store.set('orModel', LLM.orModel); syncMode(); } },
      OR_MODELS.map(([v, l]) => h('option', { value: v, selected: LLM.orModel === v }, l)));
    const key = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: LLM.orKey ? 'Kayıtlı anahtar (…' + LLM.orKey.slice(-4) + ')' : 'sk-or-v1-…', 'aria-label': 'OpenRouter anahtarı' });
    const status = h('p', { class: 'note' }, 'Şu an: ' + ({ openrouter: 'OpenRouter · ' + orName(), ollama: 'yerel model · ' + LLM.model, kb: 'bilgi tabanı' })[provider()] + '.');
    const save = () => { const v = key.value.trim(); if (!v) return; LLM.orKey = v; SK.store.set('orKey', v); key.value = ''; syncMode(); renderSettings(); };
    const test = () => {
      status.textContent = 'Anahtar deneniyor…';
      fetch('https://openrouter.ai/api/v1/key', { headers: { 'Authorization': 'Bearer ' + LLM.orKey } })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(j => { const d = j.data || {}; status.textContent = 'Anahtar çalışıyor.' + (d.limit_remaining != null ? ' Kalan limit: ' + d.limit_remaining + ' $.' : d.usage != null ? ' Bugüne kadarki kullanım: ' + Number(d.usage).toFixed(3) + ' $.' : ''); })
        .catch(st => { status.textContent = ERR[st] || 'Anahtar doğrulanamadı (' + st + ').'; });
    };
    settings.append(
      h('label', null, 'Çalışma modu', mode),
      h('label', null, 'OpenRouter anahtarı', h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, key,
        h('button', { type: 'button', class: 'btn btn-sm', onclick: save }, 'Kaydet'),
        LLM.orKey ? h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { LLM.orKey = ''; SK.store.set('orKey', ''); syncMode(); renderSettings(); } }, 'Sil') : null)),
      h('label', null, 'Model (hepsi ağırlıkları açık yayımlanmış modeller)', model),
      h('div', { class: 'row' }, LLM.orKey ? h('button', { type: 'button', class: 'btn btn-sm', onclick: test }, 'Anahtarı dene') : null,
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => probe(true) }, 'Yerel modeli ara')),
      status,
      h('p', { class: 'note' }, 'Anahtar yalnız bu tarayıcıda saklanır; proje dosyalarına ve yayınlanan sürüme yazılmaz. openrouter.ai/keys adresinden alınır. Modele yalnız aracın kendi verisi ve sorunuz gönderilir.'));
  }
  function renderInto(bubble, a, keepOld) {
    const body = bubble.querySelector('.a-text');
    if (!keepOld) SK.clear(body);
    (a.text || []).forEach(t => body.appendChild(md(t)));
    if (a.list && a.list.length) body.appendChild(h('ul', null, a.list.map(li => { const p = md(li); return h('li', null, Array.from(p.childNodes)); })));
    if (a.note) body.appendChild(h('p', { class: 'a-note' }, a.note));
    if (a.actions && a.actions.length) {
      bubble.appendChild(h('div', { class: 'a-actions' }, a.actions.map(act => act.href
        ? h('a', { class: 'chip-btn', href: act.href, target: '_blank', rel: 'noopener' }, act.label)
        : h('button', { type: 'button', class: 'chip-btn', onclick: () => {
          if (act.ask) { send(act.ask); return; }
          act.run();
          if (act.keep) setTimeout(() => post('bot', { text: ['Tamam. ' + SK.state.enabled.size + ' önlem açık; yıllık beklenen zarar ' + F.tlShort(SK.risk.summary(SK.state.enabled).aleRes) + ', mevzuata hazırlık ' + F.pct(SK.risk.readiness(SK.state.enabled)) + '.'] }), 60);
        } }, act.label))));
    }
  }
  function post(who, a) {
    const bubble = h('div', { class: 'a-msg is-' + who }, h('div', { class: 'a-text' }));
    if (who === 'user') bubble.querySelector('.a-text').textContent = a;
    else renderInto(bubble, a);
    log.appendChild(bubble);
    scrollLog();
    return bubble;
  }
  function send(text) {
    text = String(text || '').trim();
    if (!text || LLM.busy) return;
    post('user', text);
    input.value = '';
    const a = respond(text);
    if (a.autoGo) SK.go(a.autoGo);
    const prov = provider();
    if (prov !== 'kb') {
      const bubble = h('div', { class: 'a-msg is-bot' }, h('div', { class: 'a-text' }));
      log.appendChild(bubble);
      askLLM(prov, text, a, bubble).then(() => { if (a.actions && a.actions.length && !bubble.querySelector('.a-actions')) renderInto(bubble, { actions: a.actions }, true); });
    } else {
      const b = post('bot', a);
      b.classList.add('is-new');
    }
  }
  function setSugs() {
    if (!sugs) return;
    SK.clear(sugs);
    (SUGS[curView()] || []).concat(['Bu ekran ne işe yarar?']).forEach(t => sugs.appendChild(h('button', { type: 'button', class: 'chip-btn', onclick: () => send(t) }, t)));
  }
  function build() {
    input = h('input', { type: 'text', class: 'a-input', placeholder: 'Bir şey sor… (ör. "R12 nedir?")', 'aria-label': 'Asistana soru', autocomplete: 'off', maxlength: '300' });
    settings = h('div', { class: 'a-settings', hidden: true });
    modeBtn = h('button', { type: 'button', class: 'a-mode', 'aria-label': 'Model ayarları', onclick: () => { settings.hidden = !settings.hidden; if (!settings.hidden) renderSettings(); } }, 'Bilgi tabanı');
    log = h('div', { class: 'a-log', role: 'log', 'aria-live': 'polite' });
    sugs = h('div', { class: 'a-sugs', 'aria-label': 'Önerilen sorular' });
    panel = h('aside', { class: 'assist', role: 'dialog', 'aria-label': 'Asistan', hidden: true },
      h('div', { class: 'a-head' },
        h('div', { class: 'a-title' }, SK.icon('asistan'), h('div', null, h('b', null, 'Asistan'), h('span', null, 'Ekranları açıklar, seni doğru yere götürür'))),
        modeBtn,
        h('button', { type: 'button', class: 'a-close', 'aria-label': 'Asistanı kapat', onclick: () => api.close() }, SK.icon('kapat'))),
      settings, log, sugs,
      h('form', { class: 'a-form', onsubmit: e => { e.preventDefault(); send(input.value); } }, input,
        h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Gönder')));
    fab = h('button', { type: 'button', class: 'assist-fab', onclick: () => api.toggle(), 'aria-label': 'Asistanı aç' }, SK.icon('asistan'), h('span', null, 'Asistan'));
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') api.close(); });
    document.body.appendChild(panel);
    document.body.appendChild(fab);
    SK.on('route', () => setSugs());
    setSugs(); syncMode();
    probe(false);
  }
  function greet() {
    if (greeted) return;
    greeted = true;
    post('bot', { text: ['Merhaba! Ben Miselyum asistanıyım. Ekranları açıklarım, sayıları yorumlarım ve bir düğmeyle seni doğru yere götürürüm.', 'Şu an **' + SK.tabLabel(curView()) + '** ekranındasın. Aşağıdaki sorulardan birini seçebilir ya da kendi sorunu yazabilirsin. Model ayarları başlıktaki düğmede.'] });
  }

  const api = {
    open() { if (!panel) build(); panel.hidden = false; fab.hidden = true; document.body.classList.add('assist-open'); greet(); setTimeout(() => input.focus(), 30); },
    close() { if (!panel) return; panel.hidden = true; fab.hidden = false; document.body.classList.remove('assist-open'); },
    toggle() { if (!panel || panel.hidden) api.open(); else api.close(); },
    explain(view) { api.open(); post('user', 'Bu ekran ne işe yarar?'); post('bot', explainAnswer(view || curView())).classList.add('is-new'); },
    ask(text) { api.open(); send(text); },
    provider,
    respond
  };
  SK.assist = api;
  SK.on('route', () => { if (!panel) { build(); } });
})(window.SK);
