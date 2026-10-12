/* Güvenlik merkezi: panelin önündeki Miselyum Kapısı. Bir isteğin geçtiği denetimler, tehditler ve korumalar, örnek
   yapılandırmalar (nginx + ModSecurity, uygulama içi WAF, istek sınırı, başlıklar, OCPP profilleri), ağ bölgeleri ve kurulum
   kararı, saldırı testlerinin sonucu. Kapı ile açıldığında oturumlar, denetim kaydı, WAF ve cihaz bağlantıları canlı gelir. */
(function (SK) {
  'use strict';
  const h = SK.h, F = SK.fmt;

  // Bir isteğin yolculuğu: sıra önemlidir, ucuz denetim önce gelir
  const PIPE = [
    ['Ana bilgisayar adı', 'Host başlığı izin listesinde mi? DNS yeniden bağlama saldırısını keser.', '421'],
    ['İstek sınırı', 'IP başına 10 sn\'de 300 istek; girişte dakikada 5 deneme.', '429'],
    ['WAF', 'Yol, sorgu, gövde ve tarayıcı kimliği anomali puanlı kurallardan geçer.', '403'],
    ['Oturum', 'Çerezdeki kimlik sunucuda var mı, süresi dolmadı mı, tarayıcı aynı mı?', '401'],
    ['CSRF', 'Durum değiştiren istekte Origin aynı köken mi, X-CSRF belirteci doğru mu?', '403'],
    ['Rol (RBAC)', 'İzleyici, analist, yönetici: işlem bu role açık mı?', '403'],
    ['Şirket (kiracı)', 'Kullanıcı bu şirkete yetkili mi? Yetkisiz şirketin paketi hiç gönderilmez.', '403'],
    ['İşleyici', 'Parametreli SQL, izinli dış adres, kritik işlemde iki adımlı doğrulama.', '–'],
    ['Yanıt ve iz', 'Güvenlik başlıkları eklenir; olay denetim kaydına yazılır.', '✓']
  ];

  // Tehditler ve korumalar. grup: saldırı testlerindeki grup adı (kanıt için)
  const THREATS = [
    { id: 'oturum', t: 'Hayalet oturum', risk: 'Kapatılmamış, çalınmış ya da unutulmuş bir oturumun başkası tarafından kullanılması.',
      p: ['Oturum yalnız sunucuda tutulur; tarayıcıda 256 bit rastgele kimlik vardır, içinde bilgi yoktur.',
        '15 dakika işlemsiz kalınca ve en geç 8 saatte oturum sunucudan silinir.',
        'Kullanıcı başına en fazla 2 oturum: üçüncü girişte en eski oturum kapanır.',
        'Girişte her zaman yeni kimlik verilir (oturum sabitleme engeli); tarayıcı imzası değişirse oturum iptal edilir.',
        'Kapanan oturumun canlı veri akışı anında kesilir; kullanıcı kendi açık oturumlarını görüp kapatabilir.'], a: '5.18 · 8.5' },
    { id: 'yetki', t: 'Yetki yükseltme', risk: 'İzleyicinin önlem değiştirmesi, analistin başka şirketin verisini görmesi, arayüzü atlayıp API\'yi doğrudan çağırmak.',
      p: ['Rol ve şirket yetkisi sunucuda, her istekte yeniden denetlenir; arayüz gizlese de gizlemese de karar sunucunundur.',
        'Yetkisiz şirketin paketi (kat planı, riskler) sunucudan hiç gönderilmez.',
        'Sahadaki cihaza komut gibi kritik işlemler son 5 dakikada iki adımlı doğrulama ister.',
        'Reddedilen her deneme kim, ne zaman, hangi IP ile denetim kaydına yazılır.'], a: '5.15 · 5.18 · 8.2' },
    { id: 'xss', t: 'XSS (betik enjeksiyonu)', risk: 'Kullanıcı girdisi üzerinden sayfaya betik sokup oturumu ya da veriyi çalmak.',
      p: ['İçerik güvenlik politikası (CSP): yalnız kendi sunucusundan ve iki sabit kütüphane adresinden betik; satır içi betik yok.',
        'Arayüz bütün metni textContent ile yazar; HTML olarak yorumlanan kullanıcı girdisi yoktur.',
        'Oturum çerezi HttpOnly: betik çalışsa bile çereze erişemez.',
        'WAF 941100 ve 941110 kuralları betik etiketlerini ve olay özniteliklerini yakalar.'], a: '8.28' },
    { id: 'ssrf', t: 'SSRF (sunucu taraflı istek sahteciliği)', risk: 'Sunucuyu iç ağa ya da bulut meta veri adresine (169.254.169.254) istek atmaya zorlamak.',
      p: ['Dış adres önizlemesi yalnız izinli alan adlarına, yalnız HTTPS ve 443 portuna yapılır.',
        'Alan adı çözülür; sonuç iç ağ, döngü ya da yerel bağlantı adresiyse istek hiç yapılmaz.',
        'Bağlantı denetlenen IP\'ye sabitlenir (DNS yeniden bağlama engeli); yönlendirme izlenmez.',
        'WAF 931100 kuralı iç ağ adreslerini daha istek işlenmeden keser.'], a: '8.20 · 8.23' },
    { id: 'sqli', t: 'SQL enjeksiyonu', risk: 'Arama kutusu ya da giriş formu üzerinden veritabanına komut sokmak.',
      p: ['Bütün sorgular parametrelidir (? yer tutucu); kullanıcı girdisi asla SQL olarak çalışmaz.',
        'Arama metni LIKE parametresi olarak gönderilir; uzunluğu 60 karakterle sınırlıdır.',
        'WAF 942100, 942110 ve 942120 kuralları ilk savunma hattıdır; atlatılsa bile ikinci hat bozulmaz.'], a: '8.28' },
    { id: 'sinir', t: 'Kaba kuvvet ve kötüye kullanım', risk: 'Parola denemek, kullanıcı adı tahmin etmek, sunucuyu istekle boğmak.',
      p: ['Giriş: IP başına dakikada 5 deneme; 5 hatalı girişte hesap 15 dakika kilitlenir, her kilitte süre ikiye katlanır.',
        'Genel: IP başına 10 saniyede 300 istek; API: oturum başına saniyede 30 istek; iki adımlı kod: en fazla 5 deneme.',
        'Hatalı girişte yanıt her zaman aynıdır; kullanıcı yoksa da parola özeti hesaplanır, yanıt süresi ipucu vermez.',
        'Parolalar scrypt ile tuzlanıp özetlenir (her deneme ~16 MB bellek ister).'], a: '8.5 · 8.6 · 8.16' },
    { id: 'csrf', t: 'CSRF (siteler arası istek sahteciliği)', risk: 'Kullanıcı başka bir sitedeyken onun adına önlem kapatmak ya da komut göndermek.',
      p: ['Çerez SameSite=Strict: başka siteden gelen istekle gönderilmez.',
        'Durum değiştiren her istekte Origin başlığı ve oturuma özel X-CSRF belirteci denetlenir.'], a: '8.26' },
    { id: 'kiraci', t: 'Şirketler arası veri sızıntısı', risk: 'Bir şirketin kullanıcısının başka şirketin risk kaydını, kat planını ya da canlı cihaz verisini görmesi.',
      p: ['Her oturumun yetkili olduğu şirketler sunucuda tutulur; şirket paketi ve cihaz verisi yalnız yetkili oturuma gönderilir.',
        'Yetkisiz kullanıcıya veri dosyası yerine boş dosya gider; panel yalnız kendi şirket paketiyle kurulur.',
        'Canlı cihaz akışı, ikiz verisi ve cihaz komutları şirket yetkisi olmadan 403 döner; deneme denetim kaydına yazılır.',
        'Şirket değiştirme düğmesi yalnız birden çok şirkete yetkili hesaplarda görünür (grup güvenlik ekibi, denetçi).'], a: '5.15 · 8.3 · 5.23' },
    { id: 'ocpp', t: 'Sahte cihaz ve dinleme (OCPP)', risk: 'Şifresiz bağlantıyı dinleyip parolayı almak ya da sahte cihazla merkeze bağlanmak.',
      p: ['Profil 1 (şifresiz) bağlantı önlemle tek tıkla kapatılır; cihazlar TLS\'e geçmek zorunda kalır.',
        'Profil 2: TLS + cihaza özel parola (merkezde pbkdf2 özeti). Profil 3: karşılıklı TLS, sertifikadaki ad cihaz kimliğiyle aynı olmalı.',
        'Tanınmayan cihaz kimliği, yanlış parola ya da uyuşmayan sertifika bağlantı kurulmadan reddedilir.'], a: '8.20 · 8.21 · 8.24' },
    { id: 'ikiz', t: 'Oynanmış cihaz ve toplu kapatma (Seviye 3)', risk: 'Cihaza imzasız yazılım yüklemek, sahte mesajlarla ikizi kendi ağını kapatmaya zorlamak ya da çalınan yönetici hesabıyla bütün ağı durdurmak.',
      p: ['Onaylı sürüm dışında yazılımla açılan ya da anma gücünü aşan cihazı ikiz kendiliğinden karantinaya alır; onaylı yazılıma dönünce karantina kalkar.',
        '"İmzalı firmware doğrulaması" önlemi açıksa cihaz imzasız paketi kendisi reddeder (SecurityEventNotification).',
        'Otomasyon freni: ikiz 60 sn\'de en çok 10 durdurucu komut gönderir. "Toplu komut ve yük koruması" açıksa insanlar da 60 sn\'de en çok 5 cihaza.',
        'Şebeke talebi, tatbikat ve cihaz komutu yalnız yöneticiye açık ve iki adımlı doğrulama ister; her biri denetim kaydına yazılır.'], a: '8.7 · 8.16 · 8.32' }
  ];

  const WAF_RULES = [
    ['942100', 'SQL enjeksiyonu: UNION / SELECT … FROM', '?q=1 UNION SELECT parola FROM kullanicilar'],
    ['942110', 'SQL enjeksiyonu: mantık ifadesi', '?q=\' OR 1=1'],
    ['942120', 'SQL enjeksiyonu: yorum, bekletme, tablo silme', '?q=x\'; DROP TABLE denetim --'],
    ['941100', 'XSS: betik etiketi', '<script>fetch(…)</script>'],
    ['941110', 'XSS: olay özniteliği, javascript:', '<img src=x onerror=…>'],
    ['930100', 'Yol geçişi', '/js/../kapi/veri/miselyum.db'],
    ['931100', 'SSRF: iç ağ ve meta veri adresi', '?url=http://169.254.169.254/'],
    ['932100', 'Komut enjeksiyonu', '?ad=x; whoami'],
    ['913100', 'Tarama aracı imzası', 'User-Agent: sqlmap/1.8']
  ];

  const LIMITS = [
    ['Genel', 'IP başına', '300 istek / 10 sn', '429 + Retry-After'],
    ['Giriş ve iki adımlı kod', 'IP başına', '5 deneme / 60 sn', '429 + Retry-After'],
    ['Hesap kilidi', 'Kullanıcı başına', '5 hatalı giriş', '15 dk kilit, her kilitte ×2 (423)'],
    ['API', 'Oturum başına', '30 istek / sn', '429'],
    ['İki adımlı kod', 'Giriş denemesi başına', '5 kod, 120 sn geçerli', 'Yeniden giriş'],
    ['İstek gövdesi', 'İstek başına', '32 KB (WAF), 64 KB (sunucu)', '403 / 413']
  ];

  const CONFIGS = {
    nginx: { t: 'Üretim önü: nginx + ModSecurity', f: '/etc/nginx/conf.d/miselyum.conf', c:
`# İstek sınırı bölgeleri (IP başına)
limit_req_zone  $binary_remote_addr zone=giris:10m rate=5r/m;
limit_req_zone  $binary_remote_addr zone=api:10m   rate=30r/s;
limit_conn_zone $binary_remote_addr zone=baglanti:10m;

server {
  listen 443 ssl http2;
  server_name panel.miselyum.example;
  ssl_protocols TLSv1.3;
  ssl_certificate     /etc/ssl/miselyum/panel.pem;
  ssl_certificate_key /etc/ssl/miselyum/panel-anahtar.pem;
  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

  modsecurity on;                                     # OWASP CRS 4
  modsecurity_rules_file /etc/nginx/modsec/main.conf;
  client_max_body_size 64k;
  limit_conn baglanti 20;

  location = /api/giris { limit_req zone=giris burst=3 nodelay; proxy_pass http://127.0.0.1:8770; }
  location /api/        { limit_req zone=api burst=60;          proxy_pass http://127.0.0.1:8770; }
  location /canli       { proxy_pass http://127.0.0.1:8770; proxy_http_version 1.1;
                          proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }
  location /            { proxy_pass http://127.0.0.1:8770; }
}` },
    modsec: { t: 'ModSecurity: CRS ayarı ve Miselyum\'a özel kurallar', f: '/etc/nginx/modsec/main.conf', c:
`SecRuleEngine On
SecRequestBodyLimit 65536
Include /etc/nginx/modsec/crs/crs-setup.conf
Include /etc/nginx/modsec/crs/rules/*.conf
SecAction "id:900000,phase:1,pass,nolog,setvar:tx.blocking_paranoia_level=2"
SecAction "id:900110,phase:1,pass,nolog,setvar:tx.inbound_anomaly_score_threshold=5"

# SSRF: önizleme adresi yalnız izinli alan adlarına
SecRule ARGS:url "!@rx ^https://([a-z0-9-]+\\.)*(resmigazete\\.gov\\.tr|epdk\\.gov\\.tr|unece\\.org|iso\\.org|openstreetmap\\.org)(/|$)" \\
  "id:100100,phase:2,deny,status:403,log,msg:'SSRF: izin listesi disinda adres'"

# API yalnız JSON kabul eder
SecRule REQUEST_URI "@beginsWith /api/" "id:100110,phase:1,deny,status:415,log,chain,msg:'API yalniz JSON'"
  SecRule REQUEST_METHOD "@streq POST" "chain"
    SecRule REQUEST_HEADERS:Content-Type "!@beginsWith application/json"

# Kaba kuvvet: IP başına 15 dakikada 5 hatalı giriş
SecAction "id:100120,phase:1,pass,nolog,initcol:ip=%{REMOTE_ADDR}"
SecRule IP:GIRIS_HATA "@ge 5" "id:100121,phase:1,deny,status:429,log,msg:'Kaba kuvvet: IP gecici engellendi'"
SecRule REQUEST_URI "@streq /api/giris" "id:100122,phase:5,pass,nolog,chain"
  SecRule RESPONSE_STATUS "@streq 401" "setvar:ip.giris_hata=+1,expirevar:ip.giris_hata=900"` },
    basliklar: { t: 'Güvenlik başlıkları ve oturum çerezi', f: 'kapi/guvenlik.py · guvenlik_basliklari()', c:
`Content-Security-Policy: default-src 'self'; script-src 'self' https://unpkg.com https://cdn.jsdelivr.net;
  connect-src 'self' https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com https://server.arcgisonline.com …;
  object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Cache-Control: no-store

Set-Cookie: __Host-miselyum=<256 bit rastgele>; Secure; HttpOnly; SameSite=Strict; Path=/` },
    ocpp: { t: 'OCPP güvenlik profilleri: cihaz ve merkez', f: 'kapi/kapi.py · kapi/sanal_saha.py', c:
`# Cihaz tarafı (OCPP 1.6J güvenlik eki, ChangeConfiguration ile)
SecurityProfile  = 2          # 1: ws + parola · 2: wss + parola · 3: wss + cihaz sertifikası
AuthorizationKey = <cihaza özel, 24+ karakter>   # merkezde yalnız pbkdf2 özeti tutulur
CpoName          = Akımyolu

# Merkez tarafı (Miselyum Kapısı)
ws://127.0.0.1:9080/ocpp/<kimlik>    Profil 1   şifresiz; "OCPP güvenlik profili geçişi" önlemiyle kapanır (403)
wss://127.0.0.1:9443/ocpp/<kimlik>   Profil 2   TLS 1.2+, temel kimlik doğrulama (kimlik:parola)
wss://127.0.0.1:9444/ocpp/<kimlik>   Profil 3   TLS 1.2+, karşılıklı sertifika, CN = cihaz kimliği

# Sertifikalar (kapi/sertifika.py): EC P-256, SHA-256, Miselyum Demo CA
# Gerçek sahada: SignCertificate / CertificateSigned ile yenileme, ISO 27001 Ek A 8.24` }
  };

  function codeBlock(key) {
    const C = CONFIGS[key];
    const btn = h('button', { type: 'button', class: 'btn btn-sm', onclick: async () => {
      try { await navigator.clipboard.writeText(C.c); btn.textContent = 'Kopyalandı'; } catch (e) { btn.textContent = 'Kopyalanamadı'; }
      setTimeout(() => { btn.textContent = 'Kopyala'; }, 1600);
    } }, 'Kopyala');
    return h('figure', { class: 'code-fig' },
      h('figcaption', null, h('div', null, h('b', null, C.t), h('span', { class: 'note mono' }, C.f)), btn),
      h('pre', { class: 'code' }, h('code', null, C.c)));
  }

  function testsOf(group) {
    const T = SK.securityTests;
    if (!T) return null;
    const list = T.testler.filter(t => t.grup === group);
    return list.length ? { ok: list.filter(t => t.gecti).length, n: list.length } : null;
  }

  SK.registerView('guvenlik', {
    title: 'Güvenlik merkezi',
    mount(main) {
      const K = SK.kapi && SK.kapi.aktif, OT = K ? SK.kapi.oturum : null;
      const AKY = SK.tenantId === 'akimyolu';     // canlı OCPP cihazları Akımyolu'nun şarj ağına aittir
      const timers = [];
      main.appendChild(SK.viewHead('Kontrol et · Miselyum Kapısı', 'Güvenlik merkezi',
        K ? 'Panel şu an Miselyum Kapısı\'nın arkasında çalışıyor (' + OT.kullanici + ', ' + SK.kapi.ROL[OT.rol] + '). Aşağıdaki sayılar sunucudan anlık geliyor; her deneme denetim kaydına yazılıyor.'
          : 'Panelin önündeki güvenlik kapısı: giriş, oturum, yetki, istek sınırı, WAF ve denetim kaydı. Uygulamayı Miselyum Kapısı ile açınca (baslat-miselyum-kapi.bat) oturumlar, engellenen saldırılar ve bağlı cihazlar burada canlı görünür.'));

      // ---- Durum şeridi ----
      const stat = (label, note) => {
        const v = h('div', { class: 'big-num' }, K ? '…' : '–'), n = h('div', { class: 'note' }, note);
        return { el: h('div', { class: 'stat' }, h('div', { class: 'label' }, label), v, n), v, n };
      };
      const sOt = stat('Açık oturum', 'kullanıcı başına en fazla 2'), sWaf = stat('WAF engeli', 'Kapı açıldığından beri'),
        sLim = stat('İstek sınırı engeli', 'kaba kuvvet ve taşma'), sRed = stat('Reddedilen yetki', 'son 24 saat · rol, şirket, CSRF'),
        sDev = AKY ? stat('Bağlı OCPP cihazı', K ? 'Profil 1 / 2 / 3' : 'Kapı ile canlı') : stat('Canlı bağlayıcı', SK.tenant.connector + ' · henüz bağlı değil');
      if (!AKY) sDev.v.textContent = '–';
      main.appendChild(h('div', { class: 'stat-row' }, sOt.el, sWaf.el, sLim.el, sRed.el, sDev.el));
      if (!K) {
        // Kapı yokken: mimarinin sabit özeti (canlı sayılar Kapı ile gelir)
        const T = SK.securityTests;
        [[sOt, String(PIPE.length), 'denetim katmanı', 'Bir isteğin yolculuğu'], [sWaf, String(WAF_RULES.length), 'WAF kuralı · eşik 5 puan', 'WAF kuralları'],
          [sLim, '3', 'rol: izleyici, analist, yönetici', 'Rol ve şirket yetkisi'], [sRed, T ? T.ozet.gecti + '/' + T.ozet.toplam : '–', 'saldırı testi geçti', 'Savunma testleri'],
          [sDev, '3', 'OCPP güvenlik profili', 'OCPP profilleri']].filter(x => AKY || x[0] !== sDev).forEach(([st, v, n, l]) => {
          st.v.textContent = v; st.n.textContent = n; st.el.querySelector('.label').textContent = l;
        });
      }

      // ---- Bir isteğin yolculuğu ----
      main.appendChild(h('div', { class: 'panel stack' },
        h('div', { class: 'panel-head' }, h('h2', null, 'Bir isteğin yolculuğu'), h('span', { class: 'note' }, 'Her istek bu sırayla denetlenir; ucuz denetim önce, ilk takıldığı yerde durur')),
        h('ol', { class: 'pipe' }, PIPE.map(([t, d, code], i) => h('li', { class: 'pipe-step' },
          h('div', { class: 'pipe-top' }, h('span', { class: 'pipe-n' }, String(i + 1)), h('span', { class: 'pipe-code' + (code === '✓' ? ' is-ok' : '') }, code)),
          h('h3', null, t), h('p', { class: 'cell-sub' }, d))))));

      // ---- Tehditler ve korumalar ----
      main.appendChild(h('div', { class: 'panel stack' },
        h('div', { class: 'panel-head' }, h('h2', null, 'Tehditler ve korumalar'),
          h('span', { class: 'note' }, SK.securityTests ? 'Kanıt: ' + SK.securityTests.ozet.gecti + '/' + SK.securityTests.ozet.toplam + ' saldırı testi geçti (' + SK.securityTests.tarih + ')' : 'Kanıt: kapi/saldiri_testleri.py')),
        h('div', { class: 'threats' }, THREATS.filter(x => AKY || (x.id !== 'ocpp' && x.id !== 'ikiz')).map(x => {
          const tr = testsOf(x.id);
          return h('article', { class: 'threat' },
            h('h3', null, x.t),
            h('p', { class: 'threat-risk' }, x.risk),
            h('ul', { class: 'threat-list' }, x.p.map(p => h('li', null, p))),
            h('div', { class: 'threat-foot' }, h('span', { class: 'tag', title: 'ISO/IEC 27001:2022 Ek A kontrolleri' }, 'Ek A ' + x.a),
              tr ? SK.chip(tr.ok === tr.n ? 'ok' : 'crit', 'Test: ' + tr.ok + '/' + tr.n + ' geçti') : null));
        }))));

      // ---- Canlı bölüm (Kapı ile) ----
      if (K) main.appendChild(liveSection(timers, { sOt, sWaf, sLim, sRed, sDev }));
      else main.appendChild(h('div', { class: 'panel stack callout-panel' }, h('h2', null, 'Canlı denetim için Kapı\'yı başlatın'),
        h('p', null, 'Kapı çalışırken bu sayfada açık oturumlarınız, denetim kaydı (arama kutusu SQL enjeksiyonu denemesine açık), SSRF denemesi, engellenen istekler ve OCPP cihazlarının hangi güvenlik profiliyle bağlı olduğu görünür.'),
        h('ol', { class: 'plain' },
          h('li', null, 'Proje klasöründe ', h('code', null, 'baslat-miselyum-kapi.bat'), ' dosyasını çalıştırın (ya da ', h('code', null, 'python kapi/kapi.py'), ').'),
          h('li', null, 'Tarayıcıda ', h('code', null, 'http://127.0.0.1:8770'), ' açılır; demo hesapları ', h('code', null, 'kapi/veri/demo-hesaplar.txt'), ' dosyasındadır.'),
          AKY ? h('li', null, '95 sanal şarj ünitesi gerçek OCPP 1.6J ile Kapı\'ya bağlanır; ikiz Seviye 3\'e geçer: sahadan okur, kendisi komut gönderir ve sonucu doğrular.')
            : h('li', null, 'Her şirket yalnız kendi verisini görür: oturum hangi şirketlere yetkiliyse sunucu yalnız o şirketlerin paketini ve cihaz verisini gönderir.'))));

      // ---- Örnek yapılandırmalar ----
      main.appendChild(h('div', { class: 'panel stack' },
        h('div', { class: 'panel-head' }, h('h2', null, 'Örnek yapılandırmalar'), h('span', { class: 'note' }, 'Üretimde iki savunma hattı: önde nginx + ModSecurity (OWASP CRS 4), arkada Kapı\'nın kendi denetimleri')),
        h('div', { class: 'grid-even' },
          h('div', { class: 'stack' }, h('h3', null, 'Kapı WAF kuralları (anomali puanı ≥ 5 → 403)'),
            h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
              h('thead', null, h('tr', null, h('th', null, 'Kural'), h('th', null, 'Yakaladığı'), h('th', null, 'Örnek istek'))),
              h('tbody', null, WAF_RULES.map(([id, d, ex]) => h('tr', null, h('td', null, h('span', { class: 'tag' }, id)), h('td', null, d), h('td', { class: 'mono cell-sub' }, ex))))))),
          h('div', { class: 'stack' }, h('h3', null, 'İstek sınırları'),
            h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
              h('thead', null, h('tr', null, h('th', null, 'Kapsam'), h('th', null, 'Anahtar'), h('th', null, 'Sınır'), h('th', null, 'Aşılınca'))),
              h('tbody', null, LIMITS.map(r => h('tr', null, r.map((c, i) => h('td', { class: i === 0 ? 'cell-title' : '' }, c))))))),
            h('p', { class: 'note' }, 'Kayan pencere: her anahtar için son isteklerin zamanı tutulur, pencere dışına çıkanlar düşer. Kilit süresi her yeni kilitte ikiye katlanır (15, 30, 60 dk).'))),
        h('div', { class: 'grid-even' }, codeBlock('nginx'), codeBlock('modsec')),
        h('div', { class: 'grid-even' }, codeBlock('basliklar'), AKY ? codeBlock('ocpp') : null)));

      // ---- Ağ bölgeleri ve kurulum kararı ----
      main.appendChild(h('div', { class: 'panel stack' },
        h('div', { class: 'panel-head' }, h('h2', null, 'Ağ bölgeleri ve kurulum: yerinde mi, bulutta mı?'), h('span', { class: 'note' }, 'Karar: hibrit. Çekirdek Türkiye\'de bulutta, fabrikada yerinde ajan')),
        h('div', { class: 'zones' },
          zone('İnternet', 'Kullanıcılar ve tarayıcılar', ['Yalnız 443 (TLS 1.3)'], 'is-out'),
          zone('DMZ', 'Ters vekil + WAF', ['nginx, ModSecurity CRS 4', 'İstek sınırı, TLS sonlandırma'], ''),
          zone('Uygulama bölgesi', 'Miselyum Kapısı ve çekirdek', ['Oturum, rol, şirket denetimi', 'İkiz, risk ve senaryo motorları'], 'is-core'),
          zone('Veri bölgesi', 'Veritabanı ve denetim kaydı', ['İnternete çıkışı yok', 'Şifreli günlük yedek'], 'is-data')),
        h('div', { class: 'zones zones-2' },
          AKY ? zone('Cihaz bölgesi', 'Şarj üniteleri (özel APN / VLAN)', ['Yalnız 9443 ve 9444 (OCPP TLS)', 'Profil 1 kapatılabilir'], 'is-dev') : null,
          AKY ? null : zone('Fabrika OT bölgesi', 'IEC 62443 bölge ve kanal', ['Üretim ağı internete açılmaz', 'Hif ajanı yalnız dışa doğru mTLS'], 'is-dev'),
          zone('Şirket ayrımı', 'Her şirket ayrı paket ve yetki', ['Paket ve cihaz verisi yalnız yetkili oturuma', 'Yetkisiz deneme denetim kaydına'], 'is-data')),
        h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, h('th', null, 'Ölçüt'), h('th', null, 'Yerinde (on-prem)'), h('th', null, 'Bulut (Türkiye bölgesi)'), h('th', null, 'Miselyum kararı'))),
          h('tbody', null, [
            ['Veri yerelliği', 'Veri şirkette kalır', 'Türkiye bölgesi seçilirse yurt dışına aktarım (KVKK md. 9) olmaz', 'Çekirdek Türkiye\'de; kişisel veri maskelenerek gelir'],
            ['Cihaz bağlantısı', 'Fabrika içinde düşük gecikme', 'Şarj ağı zaten internet ya da APN ile bağlanır', 'Şarj ağı bulutta; fabrika yerinde ajanla'],
            ['Süreklilik', 'Tek veri merkezi: yangın, kesinti riski', 'Bölge içinde yedekli', 'Bulut + yerinde şifreli yedek'],
            ['Güvenlik sorumluluğu', 'Fiziksel ve ağ güvenliği tamamen şirkette', 'Paylaşılan sorumluluk: altyapı sağlayıcıda', 'Kimlik, veri ve yapılandırma bizde (Ek A 5.23)'],
            ['Yeni şirket eklemek', 'Her şirkete ayrı kurulum', 'Yeni kiracı dakikalar içinde', 'Şirket başına ayrı paket ve anahtar'],
            ['Maliyet', 'Yüksek ilk yatırım', 'Kullandıkça öde', 'Pilot tek sunucu; büyüyünce bulut'],
            ['Üretim (OT) ağı', 'Zorunlu: üretim ağı dışarı açılmaz', 'Doğrudan bağlanamaz', 'Yerinde hif ajanı, yalnız özet veri gönderir']
          ].map(r => h('tr', null, r.map((c, i) => h('td', { class: i === 0 ? 'cell-title' : i === 3 ? 'is-pick' : '' }, c)))))))));

      // ---- Saldırı testleri ----
      const T = SK.securityTests;
      main.appendChild(h('div', { class: 'panel stack' },
        h('div', { class: 'panel-head' }, h('h2', null, 'Saldırı testleri'),
          h('span', { class: 'note' }, T ? T.tarih + ' · ' + T.ozet.gecti + '/' + T.ozet.toplam + ' geçti · ' + T.sure + ' sn' : 'Henüz çalıştırılmadı')),
        h('p', { class: 'cell-sub' }, 'kapi/saldiri_testleri.py, çalışan Kapı\'ya gerçek saldırı istekleri gönderir ve beklenen savunmayı doğrular. OWASP ZAP bu bilgisayarda kurulu olmadığı için (Java ve Docker yok) testler elle yazıldı; ZAP kurulunca aynı adrese otomatik tarama da yapılabilir.'),
        T ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, h('th', null, 'Grup'), h('th', null, 'Saldırı'), h('th', null, 'Beklenen savunma'), h('th', null, 'Sonuç'))),
          h('tbody', null, T.testler.map(t => h('tr', null, h('td', null, h('span', { class: 'tag' }, t.grup)), h('td', null, t.ad),
            h('td', { class: 'cell-sub' }, t.beklenen), h('td', null, SK.chip(t.gecti ? 'ok' : 'crit', t.sonuc)))))))
          : h('p', { class: 'note' }, 'Kapı çalışırken: python kapi/saldiri_testleri.py')));

      return () => timers.forEach(clearInterval);
    }
  });

  function zone(t, sub, items, cls) {
    return h('div', { class: 'zone ' + (cls || '') }, h('b', null, t), h('span', { class: 'note' }, sub), h('ul', null, items.map(i => h('li', null, i))));
  }

  // ---- Kapı ile canlı bölüm ----
  function liveSection(timers, S) {
    const api = SK.kapi.api, can = SK.kapi.can;
    const AKY = SK.tenantId === 'akimyolu';
    const wrap = h('div', { class: 'stack' });

    // Durum şeridi ve OCPP
    const ocppBox = h('div', { class: 'ocpp-bars' });
    async function refresh() {
      if (!can('guvenlik_goruntule')) {
        const o = SK.link.ozet;
        if (o && AKY) { S.sDev.v.textContent = F.n(o.bagli); S.sDev.n.textContent = o.profil[1] + ' / ' + o.profil[2] + ' / ' + o.profil[3]; }
        return;
      }
      const r = await api('api/guvenlik');
      if (!r.ok) return;
      const d = r.data, o = d.ocpp, ev = d.olaylar_24s || {};
      S.sOt.v.textContent = F.n(d.oturum);
      S.sWaf.v.textContent = F.n(d.waf);
      S.sLim.v.textContent = F.n(d.istek_siniri);
      S.sRed.v.textContent = F.n((ev.yetki_reddedildi || 0) + (ev.sirket_erisim_reddedildi || 0) + (ev.csrf_reddedildi || 0));
      wafList(d.waf_son || []);
      if (!AKY || !o) return;       // cihaz verisi yalnız Akımyolu'na yetkili oturumda ve Akımyolu ekranında
      S.sDev.v.textContent = F.n(o.bagli);
      S.sDev.n.textContent = 'Profil 1 / 2 / 3: ' + o.profil[1] + ' / ' + o.profil[2] + ' / ' + o.profil[3];
      SK.clear(ocppBox);
      const tot = Math.max(1, o.bagli);
      ocppBox.appendChild(h('div', { class: 'ocpp-bar', role: 'img', 'aria-label': 'Profil dağılımı' },
        [1, 2, 3].map(p => o.profil[p] ? h('span', { class: 'p' + p, style: { width: (o.profil[p] / tot * 100) + '%' } }, 'P' + p + ' · ' + o.profil[p]) : null)));
      ocppBox.appendChild(h('p', { class: 'note' }, o.profil1_kapali
        ? 'Profil 1 kapalı: şifresiz bağlantı reddediliyor; bütün cihazlar TLS ile bağlı.'
        : o.profil[1] + ' cihaz şifresiz (Profil 1) bağlı: parola ağda açık metin gidiyor. Kontroller ekranında "OCPP güvenlik profili geçişi" önlemini açınca bu cihazlar birkaç saniyede TLS\'e geçer.'));
      wafList(d.waf_son || []);
    }
    const wafBox = h('div', { class: 'stack' });
    function wafList(list) {
      SK.clear(wafBox);
      if (!list.length) { wafBox.appendChild(h('p', { class: 'note' }, 'Henüz engellenen istek yok. Aşağıdaki denemelerden birini çalıştırın.')); return; }
      list.slice().reverse().forEach(w => wafBox.appendChild(h('div', { class: 'waf-row' },
        h('span', { class: 'mono note' }, new Date(w.zaman * 1000).toLocaleTimeString('tr-TR')), h('span', { class: 'mono' }, w.yol),
        h('span', null, w.kurallar.map(k => h('span', { class: 'tag' }, k))))));
    }

    // Denetim kaydı ve arama (SQLi denemesi)
    const q = h('input', { class: 'inp', type: 'search', placeholder: 'Denetim kaydında ara (olay, kullanıcı, ayrıntı)', maxlength: 60, 'aria-label': 'Denetim kaydında ara' });
    const auditMsg = h('p', { class: 'note', role: 'status' });
    const auditBody = h('tbody');
    async function audit() {
      if (!can('denetim_goruntule')) { auditMsg.textContent = 'Denetim kaydı yalnız yönetici rolüne açık. (Sunucu bu rolde 403 döndürür.)'; return; }
      const r = await api('api/denetim?limit=40&q=' + encodeURIComponent(q.value));
      SK.clear(auditBody);
      if (r.status === 403 && r.data.kurallar) { auditMsg.textContent = 'WAF engelledi (' + r.data.kurallar.join(', ') + '): arama veritabanına hiç ulaşmadı.'; return; }
      if (!r.ok) { auditMsg.textContent = r.data.hata || 'Okunamadı'; return; }
      auditMsg.textContent = r.data.kayitlar.length + ' kayıt' + (q.value ? ' · arama metni SQL olarak değil, LIKE parametresi olarak arandı' : '');
      r.data.kayitlar.forEach(k => auditBody.appendChild(h('tr', null,
        h('td', { class: 'mono note' }, new Date(k.zaman * 1000).toLocaleTimeString('tr-TR')),
        h('td', null, k.kullanici), h('td', null, h('span', { class: 'tag' }, k.olay)),
        h('td', { class: 'cell-sub' }, k.ayrinti), h('td', null, SK.chip(k.sonuc === 'ok' ? 'ok' : 'crit', k.sonuc === 'ok' ? 'izin' : 'red')))));
    }
    let qt = null;
    q.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(audit, 350); });
    const preset = (label, val) => h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { q.value = val; audit(); } }, label);

    // SSRF denemesi
    const url = h('input', { class: 'inp', type: 'url', value: 'http://169.254.169.254/latest/meta-data/', 'aria-label': 'Önizlenecek adres' });
    const ssrfOut = h('p', { class: 'note', role: 'status' });
    async function preview() {
      ssrfOut.textContent = 'Deneniyor…';
      const r = await api('api/onizleme?url=' + encodeURIComponent(url.value));
      if (r.status === 403 && r.data.kurallar) ssrfOut.textContent = '✕ WAF engelledi (' + r.data.kurallar.join(', ') + '): istek sunucuya ulaşmadan durdu.';
      else if (!r.ok) ssrfOut.textContent = '✕ ' + (r.data.hata || 'Reddedildi');
      else ssrfOut.textContent = '✓ İzinli adres: HTTP ' + r.data.durum + (r.data.baslik ? ' · başlık: ' + r.data.baslik : '');
      refresh();
    }
    const ssrfPreset = (label, val) => h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { url.value = val; preview(); } }, label);

    // Cihaz komutu (yönetici + iki adımlı doğrulama)
    const units = SK.twin.units;
    const unitSel = h('select', { class: 'inp', 'aria-label': 'Ünite' }, units.map(u => h('option', { value: u.id }, u.id + ' · ' + SK.models[u.model].label)));
    const konSel = h('select', { class: 'inp inp-sm', 'aria-label': 'Soket' }, h('option', { value: 1 }, 'Soket 1'), h('option', { value: 2 }, 'Soket 2'));
    const cmdOut = h('p', { class: 'note', role: 'status' });
    async function command(komut) {
      const body = { cp: unitSel.value, konnektor: +konSel.value, komut };
      const r = await SK.kapi.kritik('api/cihaz/komut', body);
      if (r.iptal) { cmdOut.textContent = r.data.hata; return; }
      if (r.status === 403) { cmdOut.textContent = '✕ ' + (r.data.hata || 'Yetkiniz yok') + ' · deneme denetim kaydına yazıldı.'; audit(); return; }
      if (!r.ok) { cmdOut.textContent = '✕ ' + (r.data.hata || 'Reddedildi'); audit(); return; }
      const once = (r.data.sonuc === 'Accepted' ? '✓ Cihaz kabul etti: ' : '• Cihazın yanıtı: ') + r.data.sonuc;
      cmdOut.textContent = once;
      // İkiz komutu cihazın bir sonraki mesajıyla doğrular (Seviye 3)
      const id = r.data.eylem, off = id && SK.on('eylem', e => {
        if (e.id !== id || e.dogrulama === 'bekliyor') return;
        if (e.dogrulama === 'dogrulandi') cmdOut.textContent = once + ' · ikiz doğruladı, ' + F.n(e.ms) + ' ms (beklenen: ' + e.beklenen + ')';
        off();
      });
      if (off) setTimeout(off, 60000);
      audit();
    }

    wrap.appendChild(h('div', { class: 'grid-even' },
      !AKY ? h('div', { class: 'panel stack' }, h('div', { class: 'panel-head' }, h('h2', null, 'Cihaz bağlantıları'), h('span', { class: 'note' }, SK.tenant.short + ' · ' + SK.tenant.connector)),
        h('p', { class: 'callout' }, 'Bu şirketin bağlayıcısı henüz canlı bağlı değil; veriler simülasyondan geliyor.'),
        h('p', { class: 'cell-sub' }, 'Şirketler birbirinden ayrıdır: başka bir şirketin cihaz verisi ve komutları burada gösterilmez, sunucu da yetkisiz oturuma göndermez. Deneme denetim kaydına yazılır.')) :
      h('div', { class: 'panel stack' }, h('div', { class: 'panel-head' }, h('h2', null, 'OCPP cihaz bağlantıları'), h('span', { class: 'note' }, 'Akımyolu şarj ağı · canlı')), ocppBox,
        h('h3', null, 'Cihaza komut gönder'),
        h('p', { class: 'cell-sub' }, 'Yalnız yönetici; son 5 dakikada iki adımlı doğrulama ister. Komut gerçek OCPP mesajı olarak cihaza gider (RemoteStopTransaction, ChangeAvailability); ikiz, cihazın bir sonraki mesajıyla uygulandığını doğrular. Daha fazla komut: Saha ikizi › Seviye 3.'),
        h('div', { class: 'cta-row tight' }, unitSel, konSel),
        h('div', { class: 'cta-row tight' },
          h('button', { type: 'button', class: 'btn btn-sm', onclick: () => command('durdur') }, 'Şarjı durdur'),
          h('button', { type: 'button', class: 'btn btn-sm', onclick: () => command('hizmet_disi') }, 'Hizmet dışı al'),
          h('button', { type: 'button', class: 'btn btn-sm', onclick: () => command('hizmette') }, 'Hizmete al')), cmdOut),
      h('div', { class: 'panel stack' }, h('div', { class: 'panel-head' }, h('h2', null, 'SSRF denemesi'), h('span', { class: 'note' }, 'Sunucu adına dış adres önizleme')),
        h('p', { class: 'cell-sub' }, 'Sunucu yalnız izinli alan adlarına, HTTPS ile gider. Bulut meta veri adresi ya da iç ağ denemesi iki katmanda durur: önce WAF, atlatılırsa adres denetimi.'),
        url, h('div', { class: 'cta-row tight' }, h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: preview }, 'Önizle'),
          ssrfPreset('Meta veri adresi', 'http://169.254.169.254/latest/meta-data/'), ssrfPreset('Kapı\'nın kendisi', 'https://127.0.0.1:8770/api/denetim'),
          ssrfPreset('İzinsiz alan adı', 'https://example.com/'), ssrfPreset('İzinli alan adı', 'https://www.epdk.gov.tr/')),
        ssrfOut,
        h('h3', null, 'Son WAF engelleri'), wafBox)));

    wrap.appendChild(h('div', { class: 'panel stack' },
      h('div', { class: 'panel-head' }, h('h2', null, 'Denetim kaydı'), h('span', { class: 'note' }, 'SQLite · bütün sorgular parametreli · ISO 27001 Ek A 8.15')),
      h('div', { class: 'cta-row tight' }, q, preset('Girişler', 'giris'), preset('Reddedilenler', 'reddedildi'),
        preset('SQLi: WAF yakalar', '\' OR 1=1 --'), preset('SQLi: WAF\'ı atlatır, yine çalışmaz', 'x\' OR \'a\'<>\'b')),
      auditMsg,
      h('div', { class: 'table-wrap table-scroll' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, 'Saat'), h('th', null, 'Kullanıcı'), h('th', null, 'Olay'), h('th', null, 'Ayrıntı'), h('th', null, 'Sonuç'))), auditBody))));

    refresh(); audit();
    timers.push(setInterval(refresh, 4000));
    timers.push(setInterval(() => { if (!q.value) audit(); }, 6000));
    return wrap;
  }
})(window.SK);
