# Miselyum Kapısı · savunma doğrulama testleri

12.10.2026 04:42 · 67/67 test geçti · 84 sn

Test örneği 127.0.0.1:8771; boşta 10 sn, MFA tazeliği 2 sn, giriş penceresi 6 sn. Kurallar ve sınır sayıları üretimdekiyle aynıdır.

| Grup | Saldırı | Beklenen savunma | Sonuç | |
|---|---|---|---|---|
| basliklar | Güvenlik başlıkları | CSP, nosniff, DENY, no-referrer, COOP, no-store | tamam | ✓ |
| basliklar | Sunucu sürüm bilgisi | Server başlığında yazılım sürümü yok | Miselyum-Kapi | ✓ |
| basliklar | Bilinmeyen ana bilgisayar adı (DNS yeniden bağlama) | 421 | 421 | ✓ |
| basliklar | Kaynak kod ve veritabanı dosyaları | /kapi/… ve /.git/ sunulmaz (404) | 404 404 404 404 | ✓ |
| basliklar | Yol geçişi | /js/../kapi/kapi.py ve %2e%2e: WAF 930100 (403) | 403 403 | ✓ |
| basliklar | İzin verilmeyen HTTP yöntemi | PUT ve TRACE: 403 (911100) | 403 403 | ✓ |
| basliklar | Aşırı büyük istek gövdesi | 40 KB gövde: 403 (920400) | 403 | ✓ |
| oturum | Oturum çerezinin öznitelikleri | __Host- öneki, Secure, HttpOnly, SameSite=Strict, Path=/ | tamam | ✓ |
| oturum | Girişsiz API ve sayfa erişimi | API 401, sayfa giriş ekranına yönlenir (302) | 401 302 | ✓ |
| oturum | Uydurma oturum kimliği | 401 | 401 | ✓ |
| oturum | Oturum sabitleme | Her girişte yeni oturum kimliği verilir | kimlikler farklı | ✓ |
| oturum | Çalınan çerez başka tarayıcıda | Tarayıcı imzası değişince 401 ve oturum silinir | 401 401 | ✓ |
| oturum | Çıkıştan sonra eski çerez | Çıkış oturumu sunucudan siler: eski çerez 401 | 401 | ✓ |
| oturum | Eş zamanlı oturum sınırı | Üçüncü girişte en eski oturum kapanır (en fazla 2) | 401 200 200 | ✓ |
| oturum | Boşta kalan oturum | 10 sn işlemsiz kalınca 401 (üretimde 15 dk) | 401 | ✓ |
| oturum | Yöneticinin oturum kapatması | Kapatılan oturumun çerezi hemen 401 olur | 200 401 | ✓ |
| yetki | İzleyici önlem değiştirir | 403 (rol izleyici) | 403 | ✓ |
| yetki | İzleyici gövdeye rol yazar | {"rol":"yonetici"} yok sayılır: 403 | 403 | ✓ |
| yetki | İzleyici senaryo çalıştırır | 403 | 403 | ✓ |
| yetki | İzleyici denetim kaydını okur | 403 | 403 | ✓ |
| yetki | Analist yetkisiz şirketin verisini okur | Kıvılcım önlemleri: 403 | 403 | ✓ |
| yetki | Analist yetkisiz şirketin paketini indirir | /js/tenants/kivilcim.js: 403 (izleyicide 200) | analist 403, izleyici 200 | ✓ |
| yetki | Analist cihaza komut gönderir | 403 (yalnız yönetici) | 403 | ✓ |
| yetki | Olumlu kontrol: analist kendi şirketinde | Akımyolu önlemleri: 200 | 200 | ✓ |
| yetki | Kritik işlemde yeniden doğrulama | Süre geçince 401 mfa_gerekli; kodla doğrulayınca izin | 401 → mfa 200 → 200 (Cihaz bağlı değil) | ✓ |
| yetki | İki adımlı kodun tekrar kullanımı | Aynı kod ikinci kez: 401 | 401 | ✓ |
| csrf | X-CSRF belirteci olmadan | 403 | 403 | ✓ |
| csrf | Başka siteden gelen istek | Origin: https://saldirgan.example → 403 | 403 | ✓ |
| csrf | Başka siteden giriş denemesi | Giriş isteğinde yabancı Origin: 403 | 403 | ✓ |
| xss | CSP betik kaynağı | script-src'te 'unsafe-inline' ve 'unsafe-eval' yok | 'self' https://unpkg.com https://cdn.jsdelivr.net | ✓ |
| xss | Satır içi betik | Giriş, panel ve rehber sayfalarında satır içi <script> yok | 0 satır içi betik | ✓ |
| xss | Betik etiketi gövdede | <script> içeren istek: WAF 941100 (403) | 403 | ✓ |
| xss | Olay özniteliği kullanıcı adında | <img onerror> ile giriş: WAF 941110 (403) | 403 | ✓ |
| sqli | Mantık ifadesi | q=' OR 1=1 -- : WAF 942110 (403) | 403 ['942110', '942120'] | ✓ |
| sqli | UNION ile veri çekme | q=1 UNION SELECT parola FROM kullanicilar: WAF 942100 (403) | 403 | ✓ |
| sqli | WAF'ı atlatan girdi | q=x' OR 'a'<>'b: 200 ama 0 kayıt (parametreli sorgu); boş aramada kayıt var | 0 kayıt (boş aramada 50) | ✓ |
| sqli | Giriş formunda SQL | kullanıcı adı yonetici'-- ile giriş: 401, oturum açılmaz | 401 | ✓ |
| sqli | Şirket parametresinde SQL | sirket=akimyolu' OR '1'='1: 403 | 403 | ✓ |
| ssrf | Bulut meta veri adresi | http://169.254.169.254/: WAF 931100 (403) | 403 | ✓ |
| ssrf | Kapı'nın kendi iç adresi | https://127.0.0.1:…/api/denetim: 403 | 403 | ✓ |
| ssrf | Yerel dosya | file:///C:/Windows/win.ini: 403 | 403 | ✓ |
| ssrf | Kullanıcı bilgisi hilesi | https://www.epdk.gov.tr@127.0.0.1/: 400 (gerçek ana bilgisayar 127.0.0.1) | 400 Adres reddedildi: alan adı izin listesinde değil | ✓ |
| ssrf | Benzer alan adı hilesi | https://www.epdk.gov.tr.saldirgan.example/: 400 | 400 | ✓ |
| ssrf | Şifresiz ya da farklı port | http:// ve :8443: 400 | 400 400 | ✓ |
| ssrf | Olumlu kontrol: izinli adres | https://www.epdk.gov.tr/: 200 (internet gerekir) | 200 EPDK / T.C. Enerji Piyasası Düzenleme Ku | ✓ |
| ocpp | Olumlu kontrol: doğru parola | Profil 1, cihazın kendi parolası: bağlanır | bağlandı | ✓ |
| ocpp | Yanlış cihaz parolası | Profil 1: 401 | 401 | ✓ |
| ocpp | Kayıtsız cihaz kimliği | Profil 2, bilinmeyen kimlik: 401 | 401 | ✓ |
| ocpp | Kimlik bilgisi olmadan | Profil 2, Authorization yok: 401 | 401 | ✓ |
| ocpp | Sertifikasız Profil 3 | İstemci sertifikası yok: TLS el sıkışması reddedilir | red: InvalidMessage | ✓ |
| ocpp | Başka cihazın sertifikası | A cihazının sertifikasıyla B olarak bağlanma: 401 | 401 | ✓ |
| ocpp | Olumlu kontrol: kendi sertifikası | Profil 3, doğru sertifika: bağlanır | bağlandı | ✓ |
| ocpp | Profil 1 kapatılınca | "OCPP güvenlik profili geçişi" açılınca doğru parolayla bile 403 | önlem 200, bağlantı 403 | ✓ |
| kiraci | Başka şirketin veri paketi | Yalnız Kıvılcım hesabı Akımyolu risk kaydını ister: içerik yerine boş dosya; Akımyolu analisti gerçek veriyi alır | Kıvılcım hesabı 40 bayt, Akımyolu analisti 18678 bayt | ✓ |
| kiraci | Başka şirketin canlı cihaz akışı | Yalnız Kıvılcım hesabı Akımyolu cihaz akışına (/canli) bağlanır: 403 | 403 | ✓ |
| kiraci | Başka şirketin ikiz verisi | Yalnız Kıvılcım hesabı Akımyolu ikiz özetini ister: 403; iki şirkete yetkili izleyici: 200 | 403 / 200 | ✓ |
| kiraci | Olumlu kontrol: kendi şirketi | Kıvılcım hesabı kendi önlemlerini okur: 200; Akımyolu önlemleri: 403 | 200 / 403 | ✓ |
| ikiz | Onaysız yazılımla açılan cihaz | Onaylı 3.2.0 yerine 3.2.0+mod ile açılış: ikiz 4 sn içinde ChangeAvailability(0, Inoperative) gönderir | 10 ms sonra Inoperative, ikizde karantinada | ✓ |
| ikiz | Onaylı yazılıma dönünce | Aynı cihaz 3.2.0 ile açılınca ikiz karantinayı kaldırır: ChangeAvailability(0, Operative) | 18 ms sonra Operative | ✓ |
| ikiz | Toplu komut freni | "Toplu komut ve yük koruması" açıkken 60 sn içinde 6. cihaza durdurucu komut: 423; önlem kapalıyken geçer | önlem kapalı: 6 × 200 · önlem açık (200): 423 | ✓ |
| ikiz | Geçersiz şebeke talebi | Yönetici yükü %90 kısmak ister: 400 (en çok %50); talep başlamaz | 400 · Talep oranı %10 ile %50, süre 15 ile 240 dakika  | ✓ |
| ikiz | Şebeke talebi yetkisi | Analist rolüyle şebeke talebi: 403 (yalnız yönetici) | 403 | ✓ |
| ikiz | Tatbikat yetkisi | İzleyici rolüyle imzasız yazılım tatbikatı: 403 | 403 | ✓ |
| sinir | Kullanıcı adı tahmini | Olmayan kullanıcı ve yanlış parola: aynı yanıt, yakın süre | yanıtlar aynı, süre oranı 0.61 | ✓ |
| sinir | Genel istek seli | 10 sn'de 300'ü aşan istek: 429 | 360 istekten 89 tanesi 429 | ✓ |
| sinir | Parola deneme (IP sınırı) | 6 sn içinde 6. deneme: 429 (üretimde 60 sn) | 401 401 401 401 401 429 | ✓ |
| sinir | Hesap kilidi | 5 hatadan sonra doğru parola bile reddedilir: 423 | 423 Hesap geçici olarak kilitli. 15 dakika sonra tekrar deneyin. | ✓ |
