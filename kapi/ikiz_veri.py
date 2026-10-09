"""Akımyolu ikizindeki üniteleri uygulamanın kendi veri dosyalarından okur (js/data/sites.js ve company.js).
Böylece sanal cihazlar ve Kapı, panelin gösterdiği ünitelerle birebir aynı kimlikleri kullanır; veri iki yerde tutulmaz.
Ünite kimliği kuralı twin.js ile aynıdır: AKY-<şehir>-<sıra>-<ünite no>, ör. AKY-ANK-01-1."""
import json
import os
import re

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _oku(yol):
    with open(os.path.join(KOK, yol), encoding='utf-8-sig') as f:
        return f.read()


def uniteler():
    siteler_js = _oku('js/data/sites.js')
    m = re.search(r'SK\.realSites\s*=\s*(\[.*?\]);', siteler_js, re.S)
    siteler = json.loads(m.group(1))
    sirket_js = _oku('js/data/company.js')
    blok = re.search(r'SK\.siteTypes\s*=\s*\{(.*?)\n  \};', sirket_js, re.S).group(1)
    turler = {t: re.findall(r"'([\w-]+)'", u) for t, u in re.findall(r"(\w+):\s*\{[^}]*?units:\s*\[([^\]]*)\]", blok)}
    mblok = re.search(r'SK\.models\s*=\s*\{(.*?)\n  \};', sirket_js, re.S).group(1)
    modeller = {}
    for ad, govde in re.findall(r"'([\w-]+)':\s*\{([^}]*)\}", mblok):
        al = lambda k: (re.search(k + r":\s*'?([\w. ]+)'?", govde) or [None, None])[1]
        modeller[ad] = {'etiket': al('label'), 'uretici': al('vendor'), 'tur': al('kind'), 'kw': float(al('kw')),
                        'ocpp': al('ocpp'), 'profil': int(al('profile')), 'fw': al('fw'), 'soket': int(al('connectors')),
                        'ort_kw': float(al('avgKw')), 'ort_dk': float(al('meanMin'))}
    sayac, out = {}, []
    for s in siteler:
        sayac[s['city']] = sayac.get(s['city'], 0) + 1
        kod = s['city'] + '-' + str(sayac[s['city']]).zfill(2)
        for i, m in enumerate(turler[s['type']]):
            mo = modeller[m]
            out.append({'kimlik': 'AKY-' + kod + '-' + str(i + 1), 'model': m, 'lokasyon': kod, 'tur': s['type'], **mo})
    return out


def surus():
    """Lokasyon kodu → merkezden sürüş süresi (dk), js/data/site-extras.js'ten (OSRM)."""
    m = re.search(r'SK\.siteExtras\s*=\s*(\{.*?\});', _oku('js/data/site-extras.js'), re.S)
    return {k: v.get('driveMin') for k, v in json.loads(m.group(1)).items()} if m else {}


if __name__ == '__main__':
    u = uniteler()
    print(len(u), 'ünite;', sum(x['soket'] for x in u), 'soket;', {p: sum(1 for x in u if x['profil'] == p) for p in (1, 2, 3)})
