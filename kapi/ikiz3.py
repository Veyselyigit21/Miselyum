"""Seviye 3 dijital ikiz: ikizden sahaya otomatik geri besleme (kapalı döngü).

Seviye 2'de veri yalnız cihazdan ikize akar. Seviye 3'te ikiz bu veriye bakıp kendisi karar verir, cihaza OCPP komutu
gönderir ve komutun sahada gerçekten uygulandığını cihazın sonraki mesajlarından doğrular. Kritzinger vd. (2018) bunu
iki yönlü, otomatik veri akışı diye tanımlar. Döngü:  sahadan oku → ikizde karar ver → sahaya yaz → geri doğrula.

Kurallar (her saniye çalışır)
  onarim     Yazılımsal arıza (kilit, sayaç, aşırı akım) 15 sn'de geçmezse ikiz yeniden başlatır. Diğer sokette şarj sürüyorsa
             üniteyi değil yalnız arızalı soketi yeniden başlatır; kimsenin şarjı kesilmez.
  emniyet    Topraklama arızası ve aşırı sıcaklıkta soket kilitlenir (hizmet dışı) ve saha ekibine iş emri açılır. Cihaz
             arızanın giderildiğini bildirince ikiz soketi hizmete geri alır.
  karantina  Onaylı sürüm dışında yazılımla açılan ya da anma gücünün üstünde ölçüm gönderen cihaz ağdan ayrılır.
             Cihaz onaylı yazılıma dönünce karantina kendiliğinden kalkar. Geri dönüşü (OTA) yönetici başlatır.
  yuk        Lokasyonun şebeke bağlantı gücü (kurulu gücün %40'ı, eş zamanlılık katsayısı) aşılırsa güç aktif şarjlara
             orantılı paylaştırılır. Şebeke talebinde (puant) ağ yükü istenen oranda düşürülür; talep bitince sınırlar
             kademeli kalkar (ani yük sıçraması olmasın).
  fren       Otomasyon 60 sn'de en fazla 10 durdurucu komut gönderir; fazlası bekletilir ve operatör uyarılır. Sahte mesajlarla
             ikizi kendi ağını kapatmaya zorlamak bu yüzden mümkün değildir. "Toplu komut ve yük koruması" önlemi açıksa
             insanlar da 60 sn'de en fazla 5 cihaza durdurucu komut gönderebilir (çalınan yönetici hesabına karşı).
Her komut için beklenen sonuç kaydedilir; cihazdan o sonuç gelince komut "doğrulandı" sayılır, gelmezse zaman aşımı olur.
"""
import asyncio
import itertools
import statistics
import time
from collections import deque
from datetime import datetime, timezone

from ocpp.v16 import call
from ocpp.v16.enums import AvailabilityType, ResetType

ESZAMANLILIK = 0.40
ONARIM_BEKLE = 15
YAZILIMSAL = {'ConnectorLockFailure': 'Konnektör kilidi arızası', 'PowerMeterFailure': 'Sayaç arızası', 'OverCurrentFailure': 'Aşırı akım'}
EMNIYET = {'GroundFailure': 'Topraklama arızası: elektrik çarpması riski', 'HighTemperature': 'Aşırı sıcaklık: yangın riski'}
OTO_FREN, ELLE_FREN = 10, 5        # 60 sn'de en fazla durdurucu komut (otomasyon, insan)
DOGAL_ARIZA_SN = 90                # sanal sahada arızanın kendiliğinden geçme süresi ortalaması (40–140 sn)
DOGRULAMA_SN = 25

KOMUTLAR = {
    'durdur': 'Şarjı durdur', 'baslat': 'Şarjı başlat', 'hizmet_disi': 'Hizmet dışı al', 'hizmette': 'Hizmete al',
    'guc_siniri': 'Güç sınırı koy', 'sinir_kaldir': 'Güç sınırını kaldır', 'yeniden_baslat': 'Yeniden başlat',
    'yazilim_guncelle': 'Onaylı yazılımı yükle (OTA)'
}
DURDURUCU = {'durdur', 'hizmet_disi', 'guc_siniri', 'yeniden_baslat'}


def simdi_iso():
    return datetime.now(timezone.utc).isoformat()


def kw_metin(x):
    return ('%.1f' % x).rstrip('0').rstrip('.').replace('.', ',')


class Ikiz:
    def __init__(self, merkez, yayinla, denetim, uniteler, surus=None):
        self.m, self._yayinla, self._denetim = merkez, yayinla, denetim
        self.u = {x['kimlik']: x for x in uniteler}
        self.surus = surus or {}
        self.lok = {}
        for x in uniteler:
            l = self.lok.setdefault(x['lokasyon'], {'kurulu': 0.0, 'yuk': 0.0, 'asildi': None})
            l['kurulu'] += x['kw'] * x['soket']
        for l in self.lok.values():
            l['sinir'] = round(l['kurulu'] * ESZAMANLILIK / 5) * 5
        self.eylemler = deque(maxlen=120)
        self.bekleyen = []
        self.ariza = {}          # 'cp/k' → {'kod', 'zaman', 'islem'}
        self.karantina = {}      # cp → {'neden', 'zaman'}
        self.oto_sinir = {}      # 'cp/k' → kW (ikizin koyduğu TxProfile, işlem bitince düşer)
        self.elle_sinir = {}     # 'cp/k' → kW (yöneticinin koyduğu TxDefaultProfile)
        self.dogal = {}          # 'cp/k' → ikiz sınırı yokken ölçülen güç (kW)
        self.talep = None
        self.tatbikat = {}       # cp → (eylem, başlangıç)
        self.is_emirleri = deque(maxlen=40)
        self.no = itertools.count(1)
        self.say = {'otomatik': 0, 'elle': 0, 'dogrulandi': 0, 'zaman_asimi': 0, 'red': 0}
        self.kural = {'onarim': 0, 'emniyet': 0, 'karantina': 0, 'yuk': 0, 'fren': 0}
        self.sureler = deque(maxlen=400)
        self.onarim_sn = deque(maxlen=200)
        self.oto_gecmis, self.elle_gecmis, self.okunan = deque(), deque(), deque()
        self.frenli_bitis = 0.0
        self.ag_kw = 0.0

    # ------------------------------------------------------------ yardımcılar
    def okundu(self):
        self.okunan.append(time.time())

    def _yay(self, e):
        if not e.get('gizli'):
            asyncio.ensure_future(self._yayinla({'t': 'eylem', 'e': {k: v for k, v in e.items() if not k.startswith('_')}}))

    def _eylem(self, kaynak, kural, cp, k, komut, ocpp, neden, beklenen, gizli=False):
        e = {'id': next(self.no), 'zaman': round(time.time(), 2), 'kaynak': kaynak, 'kural': kural, 'cp': cp, 'k': k,
             'komut': komut, 'ocpp': ocpp, 'neden': neden, 'beklenen': beklenen, 'yanit': None, 'dogrulama': 'bekliyor', 'ms': None}
        if kaynak == 'ikiz':
            self.say['otomatik'] += 1
        elif kural in ('elle', 'tatbikat', 'talep'):
            self.say['elle'] += 1
        if gizli:
            e['gizli'] = True
        else:
            self.eylemler.append(e)
        return e

    def _durum(self, cp, k):
        return self.m.durum.get('%s/%d' % (cp, k)) or {}

    def _istek(self, komut, cp, k, kw=None):
        """Komutun OCPP isteği, günlük metni ve doğrulama koşulu. Gönderilemiyorsa nedenini (metin) döndürür."""
        u = self.u[cp]
        if komut == 'durdur':
            tx = self._durum(cp, k).get('tx')
            if not tx:
                return 'Aktif şarj yok'
            return dict(istek=call.RemoteStopTransaction(transaction_id=tx), ocpp='RemoteStopTransaction {transactionId:%d}' % tx,
                        tur='islem_bitti', kosul=lambda v: v['tx'] == tx, beklenen='cihaz StopTransaction göndermeli')
        if komut == 'baslat':
            s = self._durum(cp, k).get('s', 'Available')
            if s not in ('Available', 'Preparing'):
                return 'Soket müsait değil (%s)' % s
            return dict(istek=call.RemoteStartTransaction(id_tag='MISELYUM-OPERATOR', connector_id=k),
                        ocpp='RemoteStartTransaction {connectorId:%d, idTag:"MISELYUM-OPERATOR"}' % k,
                        tur='durum', kosul=lambda v: v['k'] == k and v['s'] == 'Charging', beklenen='soket Charging bildirmeli')
        if komut in ('hizmet_disi', 'hizmette'):
            tip = AvailabilityType.inoperative if komut == 'hizmet_disi' else AvailabilityType.operative
            hedef = {'Unavailable'} if komut == 'hizmet_disi' else {'Available', 'Preparing', 'Charging'}
            return dict(istek=call.ChangeAvailability(connector_id=k, type=tip), ocpp='ChangeAvailability {connectorId:%d, type:"%s"}' % (k, tip.value),
                        tur='durum', kosul=lambda v: (k == 0 or v['k'] == k) and v['s'] in hedef,
                        beklenen=('soket' if k else 'ünite') + (' Unavailable' if komut == 'hizmet_disi' else ' Available') + ' bildirmeli')
        if komut in ('guc_siniri', 'oto_sinir'):
            tx = self._durum(cp, k).get('tx') if self._durum(cp, k).get('s') == 'Charging' else None
            oto = komut == 'oto_sinir'
            if oto and not tx:
                return 'Aktif şarj yok'
            amac = 'TxProfile' if oto else 'TxDefaultProfile'
            w = int(round(kw * 1000))
            profil = {'charging_profile_id': (2000 if oto else 1000) + k, 'stack_level': 1, 'charging_profile_purpose': amac,
                      'charging_profile_kind': 'Absolute',
                      'charging_schedule': {'charging_rate_unit': 'W', 'charging_schedule_period': [{'start_period': 0, 'limit': w}]}}
            if oto:
                profil['transaction_id'] = tx
            return dict(istek=call.SetChargingProfile(connector_id=k, cs_charging_profiles=profil),
                        ocpp='SetChargingProfile {connectorId:%d, %s, limit:%s kW}' % (k, amac, kw_metin(kw)),
                        tur='olcum' if tx else None, kosul=lambda v: v['k'] == k and v['kw'] <= kw * 1.05 + 0.1,
                        beklenen='ölçülen güç %s kW altına inmeli' % kw_metin(kw) if tx else 'cihaz kabul etmeli (soket boşta)')
        if komut in ('sinir_kaldir', 'oto_kaldir'):
            amac = 'TxProfile' if komut == 'oto_kaldir' else 'TxDefaultProfile'
            return dict(istek=call.ClearChargingProfile(connector_id=k, charging_profile_purpose=amac),
                        ocpp='ClearChargingProfile {connectorId:%d, %s}' % (k, amac), tur=None, beklenen='cihaz kabul etmeli')
        if komut == 'yeniden_baslat':
            return dict(istek=call.Reset(type=ResetType.soft), ocpp='Reset {type:"Soft"}', tur='acilis', kosul=lambda v: True,
                        beklenen='cihaz yeniden açılıp BootNotification göndermeli', sure=45)
        if komut == 'yazilim_guncelle':
            fw = u['fw']
            return dict(istek=call.UpdateFirmware(location='https://guncelleme.miselyum.example/%s/%s.bin' % (u['model'], fw), retrieve_date=simdi_iso()),
                        ocpp='UpdateFirmware {location:"…/%s/%s.bin"}' % (u['model'], fw), tur='acilis', kosul=lambda v: v['fw'] == fw,
                        beklenen='cihaz onaylı %s sürümüyle açılmalı' % fw, sure=60)
        return 'Geçersiz komut'

    async def _gonder(self, e, r):
        c = self.m.cihazlar.get(e['cp'])
        if not c:
            e.update(yanit='Cihaz bağlı değil', dogrulama='yok')
            self._yay(e)
            return e['yanit']
        b = None
        if r.get('tur'):
            # Doğrulama gönderimden önce kaydedilir: cihaz yanıttan önce StatusNotification gönderebilir
            b = {'e': e, 'tur': r['tur'], 'kosul': r['kosul'], 'bitis': time.time() + r.get('sure', DOGRULAMA_SN), 't0': time.perf_counter()}
            self.bekleyen.append(b)
        self.m.gunluk(e['cp'], '←', r['ocpp'], 'ikiz' if e['kaynak'] == 'ikiz' else 'komut')
        try:
            y = await c.call(r['istek'])
            st = getattr(y, 'status', 'Accepted')
            e['yanit'] = str(getattr(st, 'value', st))
        except Exception as ex:
            e['yanit'] = 'Hata: ' + type(ex).__name__
        if e['yanit'] != 'Accepted':
            if b in self.bekleyen:
                self.bekleyen.remove(b)
            if e['dogrulama'] == 'bekliyor':
                e['dogrulama'] = 'yok'
            self.say['red'] += 1
        elif not b:
            e['dogrulama'] = 'yanit'
        elif b in self.bekleyen and r['tur'] == 'durum':
            # Cihaz zaten istenen durumdaysa yeni StatusNotification göndermez; ikizdeki son durum yeterlidir
            for d in list(self.m.durum.values()):
                if d['cp'] == e['cp'] and b in self.bekleyen and r['kosul']({'k': d['k'], 's': d['s']}):
                    self._tamam(b)
        self._yay(e)
        return e['yanit']

    def _tamam(self, b):
        if b in self.bekleyen:
            self.bekleyen.remove(b)
        e = b['e']
        e['dogrulama'], e['ms'] = 'dogrulandi', int((time.perf_counter() - b['t0']) * 1000)
        self.say['dogrulandi'] += 1
        self.sureler.append(e['ms'])
        self._yay(e)

    def _dogrula(self, tur, cp, **v):
        for b in [b for b in self.bekleyen if b['tur'] == tur and b['e']['cp'] == cp]:
            try:
                ok = b['kosul'](v)
            except Exception:
                ok = False
            if ok:
                self._tamam(b)

    def _fren_izin(self, cp, k):
        simdi = time.time()
        while self.oto_gecmis and simdi - self.oto_gecmis[0] > 60:
            self.oto_gecmis.popleft()
        if len(self.oto_gecmis) < OTO_FREN:
            self.oto_gecmis.append(simdi)
            return True
        if simdi > self.frenli_bitis:     # aynı fren penceresi için tek kayıt
            self.kural['fren'] += 1
            e = self._eylem('ikiz', 'fren', cp, k, 'Otomasyon freni', '— (gönderilmedi)',
                            '60 saniyede %d otomatik durdurucu komut sınırına ulaşıldı; kalan kararlar bekletiliyor. Bu kadar çok cihaz aynı anda '
                            'sorunluysa kitlesel bir olay ya da sahte mesaj olabilir: operatör uyarıldı.' % OTO_FREN, '')
            e.update(yanit='Bekletildi', dogrulama='yok')
            self._yay(e)
            self._denetim('ikiz', '-', 'otomasyon_freni', '%d komut / 60 sn' % OTO_FREN, 'red')
        self.frenli_bitis = self.oto_gecmis[0] + 60
        return False

    def _otomatik(self, kural, cp, k, komut, neden, kw=None, durdurucu=True, dogrulama=None, gizli=False):
        """İkizin kendi kararı. Durdurucu komutlar otomasyon frenine tabidir."""
        if durdurucu and not self._fren_izin(cp, k):
            return None
        r = self._istek(komut, cp, k, kw)
        if isinstance(r, str):
            return None
        if dogrulama:
            r.update(dogrulama)
        if not gizli:
            self.kural[kural] += 1
        e = self._eylem('ikiz', kural, cp, k, KOMUTLAR.get(komut, komut), r['ocpp'], neden, r['beklenen'], gizli=gizli)
        asyncio.ensure_future(self._gonder(e, r))
        return e

    # ------------------------------------------------------------ sahadan gelen olaylar (kapi.py'deki OCPP işleyicileri çağırır)
    def acilis(self, cp, fw):
        self._dogrula('acilis', cp, fw=fw)
        for key in [x for x in self.ariza if x.startswith(cp + '/') and not self.ariza[x]['islem']]:
            del self.ariza[key]          # açılış, ikizin henüz dokunmadığı arızaları sıfırlar; onarılanlar Available gelince sayılır
        for key in [x for x in self.oto_sinir if x.startswith(cp + '/')]:
            del self.oto_sinir[key]      # işlem profilleri açılışta düşer
        u = self.u.get(cp)
        if not u:
            return
        asyncio.ensure_future(self._imza_gonder(cp))
        tb = self.tatbikat.pop(cp, None)
        if fw != u['fw']:
            if cp not in self.karantina:
                self.karantina[cp] = {'neden': 'Onaysız yazılım %s (onaylı sürüm %s)' % (fw, u['fw']), 'zaman': time.time()}
                self._denetim('ikiz', '-', 'ikiz_karantina', '%s yazılım %s (onaylı %s)' % (cp, fw, u['fw']), 'red')
            self._otomatik('karantina', cp, 0, 'hizmet_disi',
                           'Cihaz onaylı sürüm %s yerine %s ile açıldı; yazılım oynanmış olabilir. Ünite ağdan ayrıldı, şarj başlatılamaz. '
                           'Geri dönüş için onaylı yazılım (OTA) yönetici onayıyla yüklenir.' % (u['fw'], fw))
            if tb:
                e, t0 = tb
                e.update(dogrulama='dogrulandi', ms=int((time.perf_counter() - t0) * 1000),
                         sonuc='Cihaz paketi kabul etti; ikiz açılışta onaysız sürümü yakalayıp karantinaya aldı.')
                self._yay(e)
        elif cp in self.karantina:
            self.karantina.pop(cp)
            self._denetim('ikiz', '-', 'ikiz_karantina_kalkti', '%s onaylı %s' % (cp, fw), 'ok')
            self._otomatik('karantina', cp, 0, 'hizmette', 'Cihaz onaylı %s sürümüyle açıldı; ikiz karantinayı kaldırıp üniteyi hizmete aldı.' % fw,
                           durdurucu=False)

    def durum(self, cp, k, s, hata):
        key = '%s/%d' % (cp, k)
        self._dogrula('durum', cp, k=k, s=s, hata=hata)
        a = self.ariza.get(key)
        if s == 'Faulted':
            if not a:
                self.ariza[key] = {'kod': hata, 'zaman': time.time(), 'islem': None}
            return
        if not a:
            return
        if a['islem'] == 'emniyet':
            if s == 'Unavailable' and hata == 'NoError' and not a.get('giderildi'):
                a['giderildi'] = True
                for i in self.is_emirleri:
                    if i['cp'] == cp and i['k'] == k and i['durum'] == 'açık':
                        i['durum'] = 'kapandı'
                self._otomatik('emniyet', cp, k, 'hizmette', 'Cihaz arızanın giderildiğini bildirdi (errorCode NoError); iş emri kapandı. '
                               'İkiz soketi hizmete geri aldı.', durdurucu=False)
            elif s in ('Available', 'Charging', 'Preparing'):
                del self.ariza[key]
            return
        if s in ('Available', 'Charging', 'Preparing'):
            if a['islem'] == 'onarim':
                self.onarim_sn.append(time.time() - a['zaman'])
            del self.ariza[key]

    def olcum(self, cp, k, kw):
        key = '%s/%d' % (cp, k)
        if key not in self.oto_sinir:
            self.dogal[key] = kw
        self._dogrula('olcum', cp, k=k, kw=kw)
        u = self.u.get(cp)
        if u and kw > u['kw'] * 1.15 and cp not in self.karantina:
            self.karantina[cp] = {'neden': 'Anma gücünün üstünde ölçüm: %s kW (anma %s kW)' % (kw_metin(kw), kw_metin(u['kw'])), 'zaman': time.time()}
            self._denetim('ikiz', '-', 'ikiz_karantina', '%s anormal güç %s kW' % (cp, kw_metin(kw)), 'red')
            neden = 'Ölçülen güç %s kW, cihazın anma gücü %s kW: sayaç ya da yazılım oynanmış olabilir. ' % (kw_metin(kw), kw_metin(u['kw']))
            self._otomatik('karantina', cp, k, 'durdur', neden + 'Şarj durduruldu.')
            self._otomatik('karantina', cp, 0, 'hizmet_disi', neden + 'Ünite ağdan ayrıldı.')

    def islem_bitti(self, cp, k, tx):
        key = '%s/%d' % (cp, k)
        self.dogal.pop(key, None)
        self.oto_sinir.pop(key, None)
        self._dogrula('islem_bitti', cp, tx=tx)

    def guvenlik_olayi(self, cp, tur, bilgi):
        e = self._eylem('cihaz', 'onlem', cp, 0, 'Cihaz paketi reddetti', 'SecurityEventNotification {type:"%s"}' % tur,
                        'İmzalı firmware doğrulaması açık: cihaz imzası doğrulanamayan paketi yüklemedi. Karantinaya gerek kalmadı.', '')
        e.update(yanit='—', dogrulama='yok')
        self._yay(e)
        tb = self.tatbikat.pop(cp, None)
        if tb:
            te, t0 = tb
            te.update(dogrulama='dogrulandi', ms=int((time.perf_counter() - t0) * 1000), sonuc='Önlem durdurdu: cihaz imzasız paketi reddetti.')
            self._yay(te)

    async def _imza_gonder(self, cp):
        """"İmzalı firmware doğrulaması" önleminin durumu cihaz yapılandırmasına yazılır (açılışta ve önlem değişince)."""
        await asyncio.sleep(0.6)
        c = self.m.cihazlar.get(cp)
        if c:
            try:
                await c.call(call.ChangeConfiguration(key='FirmwareSignatureRequired', value='true' if 'signed_fw' in self.m.onlemler else 'false'))
            except Exception:
                pass

    def onlemler_degisti(self, eski, yeni):
        if ('signed_fw' in eski) != ('signed_fw' in yeni):
            self.m.gunluk('*', '←', 'ChangeConfiguration {key:"FirmwareSignatureRequired", value:"%s"} → %d cihaz'
                          % ('true' if 'signed_fw' in yeni else 'false', len(self.m.cihazlar)), 'ikiz')
            for cp in list(self.m.cihazlar):
                asyncio.ensure_future(self._imza_gonder(cp))

    # ------------------------------------------------------------ kurallar
    def _kurallar(self):
        simdi = time.time()
        for key, a in list(self.ariza.items()):
            if a['islem'] or simdi - a['zaman'] < ONARIM_BEKLE:
                continue
            cp, k = key.rsplit('/', 1)
            k = int(k)
            u = self.u.get(cp)
            if not u or cp not in self.m.cihazlar or cp in self.karantina:
                continue
            gecen = int(simdi - a['zaman'])
            if a['kod'] in EMNIYET:
                lok = u['lokasyon']
                e = self._otomatik('emniyet', cp, k, 'hizmet_disi', EMNIYET[a['kod']] + '. Bu arıza yeniden başlatmayla geçmez: soket kilitlendi, '
                                   'saha ekibine iş emri açıldı (%s, merkezden %s dk).' % (lok, self.surus.get(lok, '?')))
                if e:
                    a['islem'] = 'emniyet'
                    self.is_emirleri.append({'zaman': simdi, 'cp': cp, 'k': k, 'kod': a['kod'], 'lok': lok, 'durum': 'açık'})
            elif a['kod'] in YAZILIMSAL:
                ad = YAZILIMSAL[a['kod']]
                diger = [d for d in self.m.durum.values() if d['cp'] == cp and d['k'] != k and d['s'] == 'Charging']
                if diger:
                    e = self._soket_yeniden(cp, k, '%s %d sn\'dir sürüyor, yazılımsal bir arıza. Diğer sokette şarj var: ünite yerine '
                                            'yalnız bu soket yeniden başlatılıyor, o şarj kesilmez.' % (ad, gecen))
                else:
                    e = self._otomatik('onarim', cp, 0, 'yeniden_baslat', '%s %d sn\'dir sürüyor, yazılımsal bir arıza. Ünitede başka şarj yok: '
                                       'yeniden başlatmak kimseyi etkilemez.' % (ad, gecen),
                                       dogrulama=dict(tur='durum', kosul=lambda v, k=k: v['k'] == k and v['s'] == 'Available',
                                                      beklenen='soket %d Available bildirmeli' % k, sure=45))
                if e:
                    a['islem'] = 'onarim'
            else:
                a['islem'] = 'izle'

    def _soket_yeniden(self, cp, k, neden):
        if not self._fren_izin(cp, k):
            return None
        self.kural['onarim'] += 1
        e = self._eylem('ikiz', 'onarim', cp, k, 'Soketi yeniden başlat',
                        'ChangeAvailability {connectorId:%d, type:"Inoperative" → "Operative"}' % k, neden, 'soket %d Available bildirmeli' % k)

        async def is_():
            c = self.m.cihazlar.get(cp)
            if not c:
                e.update(yanit='Cihaz bağlı değil', dogrulama='yok')
                self._yay(e)
                return
            self.m.gunluk(cp, '←', 'ChangeAvailability {connectorId:%d, type:"Inoperative"}' % k, 'ikiz')
            try:
                await c.call(call.ChangeAvailability(connector_id=k, type=AvailabilityType.inoperative))
                await asyncio.sleep(1.5)
                r = dict(istek=call.ChangeAvailability(connector_id=k, type=AvailabilityType.operative),
                         ocpp='ChangeAvailability {connectorId:%d, type:"Operative"}' % k,
                         tur='durum', kosul=lambda v: v['k'] == k and v['s'] == 'Available', beklenen=e['beklenen'])
                await self._gonder(e, r)
            except Exception as ex:
                e.update(yanit='Hata: ' + type(ex).__name__, dogrulama='yok')
                self._yay(e)
        asyncio.ensure_future(is_())
        return e

    def _yuk(self):
        simdi = time.time()
        aktif = {key: d for key, d in self.m.durum.items() if d['s'] == 'Charging' and d.get('tx') and d['cp'] in self.m.cihazlar and d['cp'] in self.u}
        self.ag_kw = sum(d.get('kw') or 0 for d in aktif.values())
        dogal = {key: self.dogal.get(key, d.get('kw') or 0) for key, d in aktif.items()}
        f_ag, t = 1.0, self.talep
        if t:
            if simdi >= t['bitis']:
                self.talep_bitir('süre doldu')
                t = None
            else:
                toplam = sum(dogal.values())
                f_ag = min(1.0, t['hedef'] / toplam) if toplam > 0 else 1.0
                e = t['eylem']
                if t['ulasildi'] is None and self.ag_kw <= t['hedef'] * 1.03 + 1:
                    t['ulasildi'] = round(simdi - t['baslangic'], 1)
                    e.update(dogrulama='dogrulandi', ms=int(t['ulasildi'] * 1000))
                    self.say['dogrulandi'] += 1
                    self.sureler.append(e['ms'])
                    self._yay(e)
                elif t['ulasildi'] is None and simdi - t['baslangic'] > 60 and e['dogrulama'] == 'bekliyor':
                    e['dogrulama'] = 'zaman_asimi'
                    self.say['zaman_asimi'] += 1
                    self._yay(e)
        lok_f = {}
        for kod, l in self.lok.items():
            ks = [key for key, d in aktif.items() if self.u[d['cp']]['lokasyon'] == kod]
            istek = sum(dogal[x] for x in ks)
            l['yuk'] = sum(aktif[x].get('kw') or 0 for x in ks)
            lok_f[kod] = min(1.0, l['sinir'] / istek) if istek > 0 else 1.0
            if lok_f[kod] < 0.98 and not l['asildi']:
                self.kural['yuk'] += 1
                e = self._eylem('ikiz', 'yuk', kod, 0, 'Gücü paylaştır', 'SetChargingProfile × %d (TxProfile)' % len(ks),
                                '%s şebeke bağlantı gücü %d kW, şarjların toplam isteği %s kW. Güç %d şarja orantılı paylaştırıldı; '
                                'hiçbir şarj kesilmedi.' % (kod, l['sinir'], kw_metin(istek), len(ks)), 'lokasyon yükü %d kW altına inmeli' % l['sinir'])
                e['_t0'] = time.perf_counter()
                l['asildi'] = e
                self._yay(e)
            elif l['asildi'] and lok_f[kod] >= 0.98 and l['yuk'] < l['sinir'] * 0.9:
                l['asildi'] = None
            if l['asildi'] and l['asildi']['dogrulama'] == 'bekliyor' and l['yuk'] <= l['sinir'] * 1.03:
                e = l['asildi']
                e.update(dogrulama='dogrulandi', yanit='Accepted', ms=int((time.perf_counter() - e['_t0']) * 1000))
                self.say['dogrulandi'] += 1
                self.sureler.append(e['ms'])
                self._yay(e)
        gonderilen = kaldirilan = 0
        for key, d in aktif.items():
            cp, k = d['cp'], d['k']
            f = min(f_ag, lok_f[self.u[cp]['lokasyon']])
            mevcut = self.oto_sinir.get(key)
            if f < 0.98:
                hedef = max(1.4, round(dogal[key] * f * 2) / 2)
                if mevcut is None or abs(hedef - mevcut) > max(1.0, mevcut * 0.08):
                    neden = 'Şebeke talebi' if f == f_ag and t else 'Lokasyon şebeke sınırı'
                    if self._otomatik('yuk', cp, k, 'oto_sinir', neden, kw=hedef, durdurucu=False, gizli=True):
                        self.oto_sinir[key] = hedef
                        gonderilen += 1
            elif mevcut is not None and kaldirilan < 6:     # sınırlar saniyede en çok 6 sokette kalkar: ani yük sıçraması olmasın
                if self._otomatik('yuk', cp, k, 'oto_kaldir', 'Sınır kalktı', durdurucu=False, gizli=True):
                    del self.oto_sinir[key]
                    kaldirilan += 1
        for key in [x for x in self.oto_sinir if x not in aktif]:
            del self.oto_sinir[key]
        if t and gonderilen:
            t['gonderilen'] += gonderilen
            t['eylem']['ocpp'] = 'SetChargingProfile × %d (TxProfile)' % t['gonderilen']
            if t['eylem']['yanit'] is None:
                t['eylem']['yanit'] = 'Accepted'
            self._yay(t['eylem'])

    def _zaman_asimi(self):
        simdi = time.time()
        for b in [b for b in self.bekleyen if simdi > b['bitis']]:
            self.bekleyen.remove(b)
            b['e']['dogrulama'] = 'zaman_asimi'
            self.say['zaman_asimi'] += 1
            self._yay(b['e'])
        for cp, (e, t0) in list(self.tatbikat.items()):
            if time.perf_counter() - t0 > 30:
                self.tatbikat.pop(cp)
                e['dogrulama'] = 'zaman_asimi'
                self._yay(e)

    async def calis(self):
        n = 0
        while True:
            await asyncio.sleep(1)
            n += 1
            try:
                self._kurallar()
                self._yuk()
                self._zaman_asimi()
                if n % 2 == 0:
                    await self._yayinla({'t': 'ikiz', 'ozet': self.ozet()})
            except Exception as ex:      # döngü bir hatada durmasın
                print('[ikiz]', repr(ex), flush=True)

    # ------------------------------------------------------------ insan komutları (kapi.py API'si çağırır; rol ve iki adımlı doğrulama orada)
    def elle_fren(self, cp, komut, kullanici):
        """'Toplu komut ve yük koruması' önlemi açıksa 60 sn'de en fazla 5 farklı cihaza durdurucu komut. Geçmiş her zaman tutulur."""
        if komut not in DURDURUCU:
            return None
        simdi = time.time()
        while self.elle_gecmis and simdi - self.elle_gecmis[0][0] > 60:
            self.elle_gecmis.popleft()
        cihazlar = {c for _, c in self.elle_gecmis}
        if 'load_guard' in self.m.onlemler and cp not in cihazlar and len(cihazlar) >= ELLE_FREN:
            self.kural['fren'] += 1
            e = self._eylem(kullanici, 'fren', cp, 0, 'Toplu komut freni', '— (gönderilmedi)',
                            '60 saniyede %d farklı cihaza durdurucu komut gönderildi. Çalınmış bir yönetici hesabıyla ağın tamamının '
                            'kapatılmasını önlemek için ikinci bir yöneticinin onayı gerekir.' % len(cihazlar), '')
            e.update(yanit='Engellendi', dogrulama='yok')
            self._yay(e)
            return 'Toplu komut freni: 60 saniyede %d\'ten fazla cihaza durdurucu komut gönderilemez (Toplu komut ve yük koruması önlemi). ' \
                   'İkinci bir yöneticinin onayı gerekir.' % ELLE_FREN
        self.elle_gecmis.append((simdi, cp))
        return None

    def _ongoru(self, komut, cp, k):
        """İkiz öngörüsü: komut sahada neyi etkiler?"""
        if komut not in ('durdur', 'hizmet_disi', 'yeniden_baslat', 'guc_siniri', 'yazilim_guncelle'):
            return ''
        etk = [d for d in self.m.durum.values() if d['cp'] == cp and d['s'] == 'Charging' and (k == 0 or d['k'] == k or komut in ('yeniden_baslat', 'yazilim_guncelle'))]
        if not etk:
            return ' İkiz öngörüsü: etkilenen aktif şarj yok.'
        return ' İkiz öngörüsü: %d aktif şarj etkilenir (%s kW).' % (len(etk), kw_metin(sum(d.get('kw') or 0 for d in etk)))

    async def elle(self, cp, k, komut, kw, kullanici):
        r = self._istek(komut, cp, k, kw)
        if isinstance(r, str):
            return r, None
        key = '%s/%d' % (cp, k)
        e = self._eylem(kullanici, 'elle', cp, k, KOMUTLAR[komut] + (' · %s kW' % kw_metin(kw) if kw else ''), r['ocpp'],
                        'Yönetici komutu, iki adımlı doğrulamayla.' + self._ongoru(komut, cp, k), r['beklenen'])
        if komut == 'guc_siniri':
            self.elle_sinir[key] = kw
        elif komut == 'sinir_kaldir':
            self.elle_sinir.pop(key, None)
        self._yay(e)
        return await self._gonder(e, r), e

    def talep_baslat(self, oran, sure_sn, kullanici):
        if self.talep:
            self.talep_bitir('yeni talep geldi')
        ag0 = self.ag_kw
        hedef = ag0 * (1 - oran)
        e = self._eylem(kullanici, 'talep', '*', 0, 'Şebeke talebi · yükü %%%d azalt' % round(oran * 100), 'SetChargingProfile × 0 (TxProfile)',
                        'Dağıtım şirketinden puant talebi (%d dk). Ağ yükü %s kW, hedef %s kW. İkiz gücü aktif şarjlara orantılı paylaştırır; '
                        'hiçbir şarj kesilmez.' % (sure_sn, kw_metin(ag0), kw_metin(hedef)), 'ağ yükü %s kW altına inmeli' % kw_metin(hedef))
        self.talep = {'oran': oran, 'baslangic': time.time(), 'bitis': time.time() + sure_sn, 'sure': sure_sn, 'ag0': round(ag0, 1),
                      'hedef': round(hedef, 1), 'ulasildi': None, 'eylem': e, 'gonderilen': 0}
        self.kural['yuk'] += 1
        self._yay(e)
        self._yuk()
        return e

    def talep_bitir(self, neden):
        t, self.talep = self.talep, None
        if not t:
            return False
        e = self._eylem('ikiz', 'yuk', '*', 0, 'Şebeke talebi bitti', 'ClearChargingProfile × %d (TxProfile)' % len(self.oto_sinir),
                        'Talep bitti (%s). Yük birden sıçramasın diye sınırlar saniyede en çok 6 sokette kaldırılıyor.' % neden, '')
        e.update(yanit='Accepted', dogrulama='yanit')
        self._yay(e)
        return True

    async def tatbikat_baslat(self, cp, kullanici):
        e = self._eylem(kullanici, 'tatbikat', cp, 0, 'Tatbikat: imzasız yazılım',
                        'DataTransfer {vendorId:"Miselyum", messageId:"Tatbikat.ImzasizYazilim"}',
                        'Kırmızı takım tatbikatı: cihaza imzasız bir yazılım paketi gönderiliyor (gerçekte bakım portundan ya da ele geçirilmiş '
                        'bir güncelleme sunucusundan gelir).', 'cihaz paketi reddetmeli ya da ikiz cihazı karantinaya almalı')
        c = self.m.cihazlar.get(cp)
        if not c:
            e.update(yanit='Cihaz bağlı değil', dogrulama='yok')
            self._yay(e)
            return e
        self.tatbikat[cp] = (e, time.perf_counter())
        self.m.gunluk(cp, '←', e['ocpp'], 'attack')
        self._yay(e)
        try:
            y = await c.call(call.DataTransfer(vendor_id='Miselyum', message_id='Tatbikat.ImzasizYazilim'))
            e['yanit'] = str(getattr(y.status, 'value', y.status))
        except Exception as ex:
            e['yanit'] = 'Hata: ' + type(ex).__name__
        if e['yanit'] not in ('Accepted', 'Rejected'):
            self.tatbikat.pop(cp, None)
            e['dogrulama'] = 'yok'
        self._yay(e)
        return e

    # ------------------------------------------------------------ panele özet
    def liste(self, n=40):
        return [{k: v for k, v in e.items() if not k.startswith('_')} for e in list(self.eylemler)[-n:]]

    def ozet(self):
        simdi = time.time()
        while self.okunan and simdi - self.okunan[0] > 60:
            self.okunan.popleft()
        t = self.talep
        d, z = self.say['dogrulandi'], self.say['zaman_asimi']
        return {
            'okuma_dk': len(self.okunan), 'say': dict(self.say), 'kural': dict(self.kural),
            'ort_ms': int(statistics.median(self.sureler)) if self.sureler else None,
            'dogrulama_orani': round(d / (d + z), 3) if d + z else None,
            'onarim_sn': round(statistics.mean(self.onarim_sn), 1) if self.onarim_sn else None, 'onarim_n': len(self.onarim_sn),
            'dogal_ariza_sn': DOGAL_ARIZA_SN,
            'karantina': {cp: v['neden'] for cp, v in self.karantina.items()},
            'oto_sinir': dict(self.oto_sinir), 'elle_sinir': dict(self.elle_sinir), 'ag_kw': round(self.ag_kw, 1),
            'talep': None if not t else {'oran': t['oran'], 'kalan_sn': max(0, int(t['bitis'] - simdi)), 'sure': t['sure'], 'ag0': t['ag0'],
                                         'hedef': t['hedef'], 'ulasildi': t['ulasildi'], 'gonderilen': t['gonderilen']},
            'lokasyon': {kod: {'sinir': l['sinir'], 'yuk': round(l['yuk'], 1)} for kod, l in self.lok.items()},
            'frenli': simdi < self.frenli_bitis, 'imza': 'signed_fw' in self.m.onlemler, 'toplu_fren': 'load_guard' in self.m.onlemler,
            'is_emri': sum(1 for i in self.is_emirleri if i['durum'] == 'açık'), 'bekleyen': len(self.bekleyen)
        }
