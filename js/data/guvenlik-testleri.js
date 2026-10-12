/* Saldırı testlerinin son sonucu. kapi/saldiri_testleri.py çalışınca bu dosyayı yeniden yazar. */
window.SK.securityTests = {
 "tarih": "12.10.2026 04:42",
 "sure": 84,
 "ozet": {
  "gecti": 67,
  "toplam": 67,
  "atlandi": 0
 },
 "ortam": "Test örneği 127.0.0.1:8771; boşta 10 sn, MFA tazeliği 2 sn, giriş penceresi 6 sn",
 "testler": [
  {
   "grup": "basliklar",
   "ad": "Güvenlik başlıkları",
   "beklenen": "CSP, nosniff, DENY, no-referrer, COOP, no-store",
   "sonuc": "tamam",
   "gecti": true
  },
  {
   "grup": "basliklar",
   "ad": "Sunucu sürüm bilgisi",
   "beklenen": "Server başlığında yazılım sürümü yok",
   "sonuc": "Miselyum-Kapi",
   "gecti": true
  },
  {
   "grup": "basliklar",
   "ad": "Bilinmeyen ana bilgisayar adı (DNS yeniden bağlama)",
   "beklenen": "421",
   "sonuc": "421",
   "gecti": true
  },
  {
   "grup": "basliklar",
   "ad": "Kaynak kod ve veritabanı dosyaları",
   "beklenen": "/kapi/… ve /.git/ sunulmaz (404)",
   "sonuc": "404 404 404 404",
   "gecti": true
  },
  {
   "grup": "basliklar",
   "ad": "Yol geçişi",
   "beklenen": "/js/../kapi/kapi.py ve %2e%2e: WAF 930100 (403)",
   "sonuc": "403 403",
   "gecti": true
  },
  {
   "grup": "basliklar",
   "ad": "İzin verilmeyen HTTP yöntemi",
   "beklenen": "PUT ve TRACE: 403 (911100)",
   "sonuc": "403 403",
   "gecti": true
  },
  {
   "grup": "basliklar",
   "ad": "Aşırı büyük istek gövdesi",
   "beklenen": "40 KB gövde: 403 (920400)",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "oturum",
   "ad": "Oturum çerezinin öznitelikleri",
   "beklenen": "__Host- öneki, Secure, HttpOnly, SameSite=Strict, Path=/",
   "sonuc": "tamam",
   "gecti": true
  },
  {
   "grup": "oturum",
   "ad": "Girişsiz API ve sayfa erişimi",
   "beklenen": "API 401, sayfa giriş ekranına yönlenir (302)",
   "sonuc": "401 302",
   "gecti": true
  },
  {
   "grup": "oturum",
   "ad": "Uydurma oturum kimliği",
   "beklenen": "401",
   "sonuc": "401",
   "gecti": true
  },
  {
   "grup": "oturum",
   "ad": "Oturum sabitleme",
   "beklenen": "Her girişte yeni oturum kimliği verilir",
   "sonuc": "kimlikler farklı",
   "gecti": true
  },
  {
   "grup": "oturum",
   "ad": "Çalınan çerez başka tarayıcıda",
   "beklenen": "Tarayıcı imzası değişince 401 ve oturum silinir",
   "sonuc": "401 401",
   "gecti": true
  },
  {
   "grup": "oturum",
   "ad": "Çıkıştan sonra eski çerez",
   "beklenen": "Çıkış oturumu sunucudan siler: eski çerez 401",
   "sonuc": "401",
   "gecti": true
  },
  {
   "grup": "oturum",
   "ad": "Eş zamanlı oturum sınırı",
   "beklenen": "Üçüncü girişte en eski oturum kapanır (en fazla 2)",
   "sonuc": "401 200 200",
   "gecti": true
  },
  {
   "grup": "oturum",
   "ad": "Boşta kalan oturum",
   "beklenen": "10 sn işlemsiz kalınca 401 (üretimde 15 dk)",
   "sonuc": "401",
   "gecti": true
  },
  {
   "grup": "oturum",
   "ad": "Yöneticinin oturum kapatması",
   "beklenen": "Kapatılan oturumun çerezi hemen 401 olur",
   "sonuc": "200 401",
   "gecti": true
  },
  {
   "grup": "yetki",
   "ad": "İzleyici önlem değiştirir",
   "beklenen": "403 (rol izleyici)",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "yetki",
   "ad": "İzleyici gövdeye rol yazar",
   "beklenen": "{\"rol\":\"yonetici\"} yok sayılır: 403",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "yetki",
   "ad": "İzleyici senaryo çalıştırır",
   "beklenen": "403",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "yetki",
   "ad": "İzleyici denetim kaydını okur",
   "beklenen": "403",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "yetki",
   "ad": "Analist yetkisiz şirketin verisini okur",
   "beklenen": "Kıvılcım önlemleri: 403",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "yetki",
   "ad": "Analist yetkisiz şirketin paketini indirir",
   "beklenen": "/js/tenants/kivilcim.js: 403 (izleyicide 200)",
   "sonuc": "analist 403, izleyici 200",
   "gecti": true
  },
  {
   "grup": "yetki",
   "ad": "Analist cihaza komut gönderir",
   "beklenen": "403 (yalnız yönetici)",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "yetki",
   "ad": "Olumlu kontrol: analist kendi şirketinde",
   "beklenen": "Akımyolu önlemleri: 200",
   "sonuc": "200",
   "gecti": true
  },
  {
   "grup": "yetki",
   "ad": "Kritik işlemde yeniden doğrulama",
   "beklenen": "Süre geçince 401 mfa_gerekli; kodla doğrulayınca izin",
   "sonuc": "401 → mfa 200 → 200 (Cihaz bağlı değil)",
   "gecti": true
  },
  {
   "grup": "yetki",
   "ad": "İki adımlı kodun tekrar kullanımı",
   "beklenen": "Aynı kod ikinci kez: 401",
   "sonuc": "401",
   "gecti": true
  },
  {
   "grup": "csrf",
   "ad": "X-CSRF belirteci olmadan",
   "beklenen": "403",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "csrf",
   "ad": "Başka siteden gelen istek",
   "beklenen": "Origin: https://saldirgan.example → 403",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "csrf",
   "ad": "Başka siteden giriş denemesi",
   "beklenen": "Giriş isteğinde yabancı Origin: 403",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "xss",
   "ad": "CSP betik kaynağı",
   "beklenen": "script-src'te 'unsafe-inline' ve 'unsafe-eval' yok",
   "sonuc": "'self' https://unpkg.com https://cdn.jsdelivr.net",
   "gecti": true
  },
  {
   "grup": "xss",
   "ad": "Satır içi betik",
   "beklenen": "Giriş, panel ve rehber sayfalarında satır içi <script> yok",
   "sonuc": "0 satır içi betik",
   "gecti": true
  },
  {
   "grup": "xss",
   "ad": "Betik etiketi gövdede",
   "beklenen": "<script> içeren istek: WAF 941100 (403)",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "xss",
   "ad": "Olay özniteliği kullanıcı adında",
   "beklenen": "<img onerror> ile giriş: WAF 941110 (403)",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "sqli",
   "ad": "Mantık ifadesi",
   "beklenen": "q=' OR 1=1 -- : WAF 942110 (403)",
   "sonuc": "403 ['942110', '942120']",
   "gecti": true
  },
  {
   "grup": "sqli",
   "ad": "UNION ile veri çekme",
   "beklenen": "q=1 UNION SELECT parola FROM kullanicilar: WAF 942100 (403)",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "sqli",
   "ad": "WAF'ı atlatan girdi",
   "beklenen": "q=x' OR 'a'<>'b: 200 ama 0 kayıt (parametreli sorgu); boş aramada kayıt var",
   "sonuc": "0 kayıt (boş aramada 50)",
   "gecti": true
  },
  {
   "grup": "sqli",
   "ad": "Giriş formunda SQL",
   "beklenen": "kullanıcı adı yonetici'-- ile giriş: 401, oturum açılmaz",
   "sonuc": "401",
   "gecti": true
  },
  {
   "grup": "sqli",
   "ad": "Şirket parametresinde SQL",
   "beklenen": "sirket=akimyolu' OR '1'='1: 403",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "ssrf",
   "ad": "Bulut meta veri adresi",
   "beklenen": "http://169.254.169.254/: WAF 931100 (403)",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "ssrf",
   "ad": "Kapı'nın kendi iç adresi",
   "beklenen": "https://127.0.0.1:…/api/denetim: 403",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "ssrf",
   "ad": "Yerel dosya",
   "beklenen": "file:///C:/Windows/win.ini: 403",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "ssrf",
   "ad": "Kullanıcı bilgisi hilesi",
   "beklenen": "https://www.epdk.gov.tr@127.0.0.1/: 400 (gerçek ana bilgisayar 127.0.0.1)",
   "sonuc": "400 Adres reddedildi: alan adı izin listesinde değil",
   "gecti": true
  },
  {
   "grup": "ssrf",
   "ad": "Benzer alan adı hilesi",
   "beklenen": "https://www.epdk.gov.tr.saldirgan.example/: 400",
   "sonuc": "400",
   "gecti": true
  },
  {
   "grup": "ssrf",
   "ad": "Şifresiz ya da farklı port",
   "beklenen": "http:// ve :8443: 400",
   "sonuc": "400 400",
   "gecti": true
  },
  {
   "grup": "ssrf",
   "ad": "Olumlu kontrol: izinli adres",
   "beklenen": "https://www.epdk.gov.tr/: 200 (internet gerekir)",
   "sonuc": "200 EPDK | T.C. Enerji Piyasası Düzenleme Ku",
   "gecti": true
  },
  {
   "grup": "ocpp",
   "ad": "Olumlu kontrol: doğru parola",
   "beklenen": "Profil 1, cihazın kendi parolası: bağlanır",
   "sonuc": "bağlandı",
   "gecti": true
  },
  {
   "grup": "ocpp",
   "ad": "Yanlış cihaz parolası",
   "beklenen": "Profil 1: 401",
   "sonuc": "401",
   "gecti": true
  },
  {
   "grup": "ocpp",
   "ad": "Kayıtsız cihaz kimliği",
   "beklenen": "Profil 2, bilinmeyen kimlik: 401",
   "sonuc": "401",
   "gecti": true
  },
  {
   "grup": "ocpp",
   "ad": "Kimlik bilgisi olmadan",
   "beklenen": "Profil 2, Authorization yok: 401",
   "sonuc": "401",
   "gecti": true
  },
  {
   "grup": "ocpp",
   "ad": "Sertifikasız Profil 3",
   "beklenen": "İstemci sertifikası yok: TLS el sıkışması reddedilir",
   "sonuc": "red: InvalidMessage",
   "gecti": true
  },
  {
   "grup": "ocpp",
   "ad": "Başka cihazın sertifikası",
   "beklenen": "A cihazının sertifikasıyla B olarak bağlanma: 401",
   "sonuc": "401",
   "gecti": true
  },
  {
   "grup": "ocpp",
   "ad": "Olumlu kontrol: kendi sertifikası",
   "beklenen": "Profil 3, doğru sertifika: bağlanır",
   "sonuc": "bağlandı",
   "gecti": true
  },
  {
   "grup": "ocpp",
   "ad": "Profil 1 kapatılınca",
   "beklenen": "\"OCPP güvenlik profili geçişi\" açılınca doğru parolayla bile 403",
   "sonuc": "önlem 200, bağlantı 403",
   "gecti": true
  },
  {
   "grup": "kiraci",
   "ad": "Başka şirketin veri paketi",
   "beklenen": "Yalnız Kıvılcım hesabı Akımyolu risk kaydını ister: içerik yerine boş dosya; Akımyolu analisti gerçek veriyi alır",
   "sonuc": "Kıvılcım hesabı 40 bayt, Akımyolu analisti 18678 bayt",
   "gecti": true
  },
  {
   "grup": "kiraci",
   "ad": "Başka şirketin canlı cihaz akışı",
   "beklenen": "Yalnız Kıvılcım hesabı Akımyolu cihaz akışına (/canli) bağlanır: 403",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "kiraci",
   "ad": "Başka şirketin ikiz verisi",
   "beklenen": "Yalnız Kıvılcım hesabı Akımyolu ikiz özetini ister: 403; iki şirkete yetkili izleyici: 200",
   "sonuc": "403 / 200",
   "gecti": true
  },
  {
   "grup": "kiraci",
   "ad": "Olumlu kontrol: kendi şirketi",
   "beklenen": "Kıvılcım hesabı kendi önlemlerini okur: 200; Akımyolu önlemleri: 403",
   "sonuc": "200 / 403",
   "gecti": true
  },
  {
   "grup": "ikiz",
   "ad": "Onaysız yazılımla açılan cihaz",
   "beklenen": "Onaylı 3.2.0 yerine 3.2.0+mod ile açılış: ikiz 4 sn içinde ChangeAvailability(0, Inoperative) gönderir",
   "sonuc": "10 ms sonra Inoperative, ikizde karantinada",
   "gecti": true
  },
  {
   "grup": "ikiz",
   "ad": "Onaylı yazılıma dönünce",
   "beklenen": "Aynı cihaz 3.2.0 ile açılınca ikiz karantinayı kaldırır: ChangeAvailability(0, Operative)",
   "sonuc": "18 ms sonra Operative",
   "gecti": true
  },
  {
   "grup": "ikiz",
   "ad": "Toplu komut freni",
   "beklenen": "\"Toplu komut ve yük koruması\" açıkken 60 sn içinde 6. cihaza durdurucu komut: 423; önlem kapalıyken geçer",
   "sonuc": "önlem kapalı: 6 × 200 · önlem açık (200): 423",
   "gecti": true
  },
  {
   "grup": "ikiz",
   "ad": "Geçersiz şebeke talebi",
   "beklenen": "Yönetici yükü %90 kısmak ister: 400 (en çok %50); talep başlamaz",
   "sonuc": "400 · Talep oranı %10 ile %50, süre 15 ile 240 dakika ",
   "gecti": true
  },
  {
   "grup": "ikiz",
   "ad": "Şebeke talebi yetkisi",
   "beklenen": "Analist rolüyle şebeke talebi: 403 (yalnız yönetici)",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "ikiz",
   "ad": "Tatbikat yetkisi",
   "beklenen": "İzleyici rolüyle imzasız yazılım tatbikatı: 403",
   "sonuc": "403",
   "gecti": true
  },
  {
   "grup": "sinir",
   "ad": "Kullanıcı adı tahmini",
   "beklenen": "Olmayan kullanıcı ve yanlış parola: aynı yanıt, yakın süre",
   "sonuc": "yanıtlar aynı, süre oranı 0.61",
   "gecti": true
  },
  {
   "grup": "sinir",
   "ad": "Genel istek seli",
   "beklenen": "10 sn'de 300'ü aşan istek: 429",
   "sonuc": "360 istekten 89 tanesi 429",
   "gecti": true
  },
  {
   "grup": "sinir",
   "ad": "Parola deneme (IP sınırı)",
   "beklenen": "6 sn içinde 6. deneme: 429 (üretimde 60 sn)",
   "sonuc": "401 401 401 401 401 429",
   "gecti": true
  },
  {
   "grup": "sinir",
   "ad": "Hesap kilidi",
   "beklenen": "5 hatadan sonra doğru parola bile reddedilir: 423",
   "sonuc": "423 Hesap geçici olarak kilitli. 15 dakika sonra tekrar deneyin.",
   "gecti": true
  }
 ]
};
