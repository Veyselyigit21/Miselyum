"""Miselyum'u Kapı olmadan (simülasyon modu) yerel sunucuyla açar. python -m http.server bütün klasörü sunacağı için
kapi/ altındaki veritabanı ve demo hesapları da erişilebilir olurdu; bu sunucu yalnız panelin dosyalarını sunar
(Kapı ile aynı izin listesi). Yalnız 127.0.0.1'de dinler.

Kullanım: python kapi/statik_sunucu.py [port]     (varsayılan 8765)
"""
import http.server
import os
import re
import sys

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IZINLI = re.compile(r'^/(baslat\.html|rehber\.html|giris\.html|kapi-oturum\.js|css/[\w.-]+\.css|js/(?:[\w-]+/)*[\w.-]+\.js)$')


class Isleyici(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=KOK, **k)

    def do_GET(self):
        yol = self.path.split('?', 1)[0]
        if yol == '/':
            self.send_response(302)
            self.send_header('Location', '/baslat.html')
            self.end_headers()
            return
        if not IZINLI.match(yol):
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        self.do_GET()

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print('Miselyum (simülasyon modu): http://localhost:%d/baslat.html' % port, flush=True)
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Isleyici).serve_forever()
