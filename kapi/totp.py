"""Demo için iki adımlı doğrulama kodu üretir (kimlik doğrulayıcı uygulamanın yaptığı işin aynısı).
Kullanım: python kapi/totp.py [kullanıcı]      (varsayılan: yonetici)
Gerçek kullanımda bu anahtar yalnız kullanıcının telefonundaki uygulamada bulunur."""
import os
import sqlite3
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guvenlik import Totp  # noqa: E402

ad = sys.argv[1] if len(sys.argv) > 1 else 'yonetici'
c = sqlite3.connect(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'veri', 'miselyum.db'))
r = c.execute('SELECT totp FROM kullanicilar WHERE ad = ?', (ad,)).fetchone()
if not r or not r[0]:
    sys.exit('Bu kullanıcının iki adımlı doğrulaması yok.')
kalan = 30 - int(time.time()) % 30
print('%s için kod: %s   (%d saniye geçerli)' % (ad, Totp.kod(r[0]), kalan))
