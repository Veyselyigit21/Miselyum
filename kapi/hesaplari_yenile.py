"""Demo hesaplarını yeniler: kullanıcı parolaları, iki adımlı doğrulama anahtarları ve sanal cihaz parolaları yeniden üretilir.
Denetim kaydı ve önlem durumu silinir (veritabanı baştan kurulur); sertifikalar korunur.
Kapı çalışıyorsa önce kapatın. Kullanım: python kapi/hesaplari_yenile.py
Yeni bilgiler kapi/veri/demo-hesaplar.txt dosyasına yazılır."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kapi  # noqa: E402

for ad in ('miselyum.db', 'demo-hesaplar.txt', 'cihaz-parolalari.json'):
    yol = os.path.join(kapi.VERI, ad)
    if os.path.exists(yol):
        os.remove(yol)
kapi.kur()
print('Demo hesapları yenilendi:', os.path.join(kapi.VERI, 'demo-hesaplar.txt'))
