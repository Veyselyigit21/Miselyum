"""Sanal saha: Akımyolu'nun 95 şarj ünitesini gerçek OCPP 1.6J istemcisi olarak Miselyum Kapısı'na bağlar.

Her ünite kendi güvenlik profiliyle bağlanır (ikizdeki modelle aynı):
  Profil 1  ws://127.0.0.1:9080/ocpp/<kimlik>   şifresiz bağlantı + temel parola (AC22-A)
  Profil 2  wss://127.0.0.1:9443/ocpp/<kimlik>  TLS + temel parola                 (DC60-B, DC120-C)
  Profil 3  wss://127.0.0.1:9444/ocpp/<kimlik>  karşılıklı TLS (cihaz sertifikası)  (DC180-D)

Kapı Profil 1'i kapatırsa (panelde "OCPP güvenlik profili geçişi" önlemi açılınca) şifresiz bağlantı reddedilir;
cihaz yapılandırmasını Profil 2'ye yükseltip TLS ile yeniden bağlanır. Gerçek sahada bu, OCPP'nin
SetVariables(SecurityProfile) / ChangeConfiguration komutuyla yapılır.

Seviye 3 ikizin gönderdiği komutları gerçek bir cihaz gibi uygular:
  RemoteStart/StopTransaction, ChangeAvailability (soketi yeniden başlatmak yazılımsal arızayı temizler),
  SetChargingProfile / ClearChargingProfile (güç sınırı; sınır değişince hemen ölçüm gönderir), Reset (yeniden açılış),
  UpdateFirmware (indir, kur, yeniden aç), ChangeConfiguration (FirmwareSignatureRequired) ve tatbikat için
  DataTransfer "Tatbikat.ImzasizYazilim": imza zorunluysa paketi reddeder (SecurityEventNotification), değilse
  oynanmış yazılımla yeniden açılır. Yazılım sürümü, yapılandırma ve kullanılabilirlik yeniden açılışta korunur.

Zaman sıkıştırılmıştır: 1 gerçek saniye = 1 simülasyon dakikası (panel canlı modda aynı hızda çalışır).
"""
import asyncio
import base64
import json
import os
import random
import ssl
import sys
import time
from datetime import datetime, timezone

import websockets
from ocpp.routing import on
from ocpp.v16 import ChargePoint, call, call_result
from ocpp.v16.enums import (Action, AvailabilityStatus, AvailabilityType, ChargePointErrorCode, ChargePointStatus, ChargingProfileStatus,
                            ClearChargingProfileStatus, ConfigurationStatus, DataTransferStatus, FirmwareStatus, Measurand, Reason,
                            RemoteStartStopStatus, ResetStatus, UnitOfMeasure)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ikiz_veri  # noqa: E402

VERI = os.environ.get('MISELYUM_VERI') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'veri')
SERT = os.path.join(VERI, 'sertifikalar')
_P = os.environ.get('MISELYUM_OCPP_PORTLAR', '9080,9443,9444').split(',')
ADRES = {1: 'ws://127.0.0.1:%s/ocpp/' % _P[0], 2: 'wss://127.0.0.1:%s/ocpp/' % _P[1], 3: 'wss://127.0.0.1:%s/ocpp/' % _P[2]}
YOGUNLUK = {'AC': 300, 'DC': 110}       # iki şarj arasındaki ortalama boşluk (gerçek saniye; gün ortası yoğunluğu)
HATALAR = [ChargePointErrorCode.ground_failure, ChargePointErrorCode.connector_lock_failure, ChargePointErrorCode.over_current_failure,
           ChargePointErrorCode.power_meter_failure, ChargePointErrorCode.high_temperature]
# Soketi yeniden başlatınca geçen arızalar (yazılımsal); topraklama ve aşırı sıcaklık ancak sahada giderilir
YAZILIMSAL = {ChargePointErrorCode.connector_lock_failure, ChargePointErrorCode.over_current_failure, ChargePointErrorCode.power_meter_failure}


def simdi():
    return datetime.now(timezone.utc).isoformat()


def deger(x):
    return str(getattr(x, 'value', x))


class Unite(ChargePoint):
    def __init__(self, u, baglanti, saha):
        super().__init__(u['kimlik'], baglanti)
        self.u, self.saha = u, saha
        self.d = saha.cihaz[u['kimlik']]          # yeniden açılışta korunan durum
        self.hizmet_disi = self.d['hizmet_disi']
        self.soketler = range(1, u['soket'] + 1)
        self.oturum: dict[int, dict] = {}         # soket → {tx, kwh, kw, istek, sinir}
        self.ariza, self.ariza_bitis = {}, {}
        self.uzaktan: dict[int, str] = {}
        self.uyari = {k: asyncio.Event() for k in self.soketler}
        self.son: dict[int, tuple] = {}
        self.kapaniyor = False

    def _hedef(self, connector_id):
        return list(self.soketler) if not connector_id else ([connector_id] if connector_id in self.soketler else [])

    # ---------------------------------------------------------------- merkezden gelen komutlar
    @on(Action.remote_stop_transaction)
    async def uzaktan_durdur(self, transaction_id, **kw):
        for o in self.oturum.values():
            if o and o.get('tx') == transaction_id:
                o['durdur'] = 'Remote'
                return call_result.RemoteStopTransaction(status=RemoteStartStopStatus.accepted)
        return call_result.RemoteStopTransaction(status=RemoteStartStopStatus.rejected)

    @on(Action.remote_start_transaction)
    async def uzaktan_baslat(self, id_tag, connector_id=None, **kw):
        k = connector_id or next((x for x in self.soketler if self._bos(x)), None)
        if not k or not self._bos(k):
            return call_result.RemoteStartTransaction(status=RemoteStartStopStatus.rejected)
        self.uzaktan[k] = id_tag
        self.uyari[k].set()
        return call_result.RemoteStartTransaction(status=RemoteStartStopStatus.accepted)

    def _bos(self, k):
        return k in self.soketler and k not in self.hizmet_disi and not self.ariza.get(k) and not self.oturum.get(k)

    @on(Action.change_availability)
    async def kullanilabilirlik(self, connector_id, type, **kw):
        hedef = self._hedef(connector_id)
        if not hedef:
            return call_result.ChangeAvailability(status=AvailabilityStatus.rejected)
        for k in hedef:
            if deger(type) == AvailabilityType.inoperative.value:
                self.hizmet_disi.add(k)
                if self.oturum.get(k):
                    self.oturum[k]['durdur'] = 'Other'
                if self.ariza.get(k) in YAZILIMSAL:
                    self.ariza[k] = None          # soketi yeniden başlatmak yazılımsal arızayı temizler
            else:
                self.hizmet_disi.discard(k)
            self.uyari[k].set()
        return call_result.ChangeAvailability(status=AvailabilityStatus.accepted)

    @on(Action.set_charging_profile)
    async def guc_profili(self, connector_id, cs_charging_profiles, **kw):
        p = cs_charging_profiles
        amac = deger(p.get('charging_profile_purpose'))
        try:
            plan = p['charging_schedule']
            sinir = float(plan['charging_schedule_period'][0]['limit'])
            kwt = sinir / 1000 if deger(plan.get('charging_rate_unit', 'W')) == 'W' else sinir * 0.69   # 3 faz 400 V: 1 A ≈ 0,69 kW
        except (KeyError, IndexError, TypeError, ValueError):
            return call_result.SetChargingProfile(status=ChargingProfileStatus.rejected)
        hedef = self._hedef(connector_id)
        if amac not in ('TxProfile', 'TxDefaultProfile') or not hedef:
            return call_result.SetChargingProfile(status=ChargingProfileStatus.not_supported)
        for k in hedef:
            if amac == 'TxProfile':
                o = self.oturum.get(k)
                if not o or (p.get('transaction_id') and p['transaction_id'] != o['tx']):
                    return call_result.SetChargingProfile(status=ChargingProfileStatus.rejected)
                o['sinir'] = kwt
            else:
                self.d['varsayilan'][k] = kwt
            self._guc(k)
        return call_result.SetChargingProfile(status=ChargingProfileStatus.accepted)

    @on(Action.clear_charging_profile)
    async def guc_profili_sil(self, id=None, connector_id=None, charging_profile_purpose=None, **kw):
        amac = deger(charging_profile_purpose) if charging_profile_purpose else None
        for k in self._hedef(connector_id):
            if amac in (None, 'TxProfile') and self.oturum.get(k):
                self.oturum[k].pop('sinir', None)
            if amac in (None, 'TxDefaultProfile'):
                self.d['varsayilan'].pop(k, None)
            self._guc(k)
        return call_result.ClearChargingProfile(status=ClearChargingProfileStatus.accepted)

    def _guc(self, k):
        """Geçerli güç: aracın isteği ile bütün güç profillerinin en küçüğü. Değişirse hemen ölçüm gönderilir."""
        o = self.oturum.get(k)
        if not o:
            return
        yeni = min([o['istek']] + [x for x in (o.get('sinir'), self.d['varsayilan'].get(k)) if x is not None])
        if abs(yeni - o['kw']) > 0.05:
            o['kw'] = yeni
            asyncio.ensure_future(self._olcum(k, o))

    @on(Action.reset)
    async def sifirla(self, type, **kw):
        asyncio.ensure_future(self._yeniden_ac('SoftReset' if deger(type) == 'Soft' else 'HardReset'))
        return call_result.Reset(status=ResetStatus.accepted)

    @on(Action.update_firmware)
    async def yazilim_guncelle(self, location, retrieve_date, **kw):
        asyncio.ensure_future(self._yazilim(location))
        return call_result.UpdateFirmware()

    @on(Action.change_configuration)
    async def yapilandir(self, key, value, **kw):
        if key == 'FirmwareSignatureRequired':
            self.d['imza'] = str(value).lower() == 'true'
            return call_result.ChangeConfiguration(status=ConfigurationStatus.accepted)
        return call_result.ChangeConfiguration(status=ConfigurationStatus.not_supported)

    @on(Action.data_transfer)
    async def veri_aktarimi(self, vendor_id, message_id=None, data=None, **kw):
        if vendor_id != 'Miselyum':
            return call_result.DataTransfer(status=DataTransferStatus.unknown_vendor_id)
        if message_id != 'Tatbikat.ImzasizYazilim':
            return call_result.DataTransfer(status=DataTransferStatus.unknown_message_id)
        if self.d['imza']:
            asyncio.ensure_future(self._imza_reddi())
            return call_result.DataTransfer(status=DataTransferStatus.rejected, data='imza dogrulanamadi')
        asyncio.ensure_future(self._oynanmis_yukle())
        return call_result.DataTransfer(status=DataTransferStatus.accepted)

    # ---------------------------------------------------------------- yazılım ve yeniden açılış
    async def _yeniden_ac(self, neden):
        if self.kapaniyor:
            return
        self.kapaniyor = True
        await asyncio.sleep(0.3)
        for o in self.oturum.values():
            if o:
                o['durdur'] = neden
        for _ in range(30):                 # açık işlemler kapansın (en çok 3 sn)
            if not any(self.oturum.values()):
                break
            await asyncio.sleep(0.1)
        await self._connection.close()

    async def _yazilim(self, yer):
        surum = yer.rsplit('/', 1)[-1].rsplit('.bin', 1)[0]
        for st, t in ((FirmwareStatus.downloading, 0.4), (FirmwareStatus.downloaded, 1.2), (FirmwareStatus.installing, 0.6)):
            await asyncio.sleep(t)
            await self.call(call.FirmwareStatusNotification(status=st))
        await asyncio.sleep(0.8)            # Kapı'nın paketleri üretici imzalıdır: imza denetiminden geçer
        self.d.update(fw=surum, oynanmis=False)
        await self.call(call.FirmwareStatusNotification(status=FirmwareStatus.installed))
        await self._yeniden_ac('Reboot')

    async def _imza_reddi(self):
        await asyncio.sleep(0.3)
        await self.call(call.SecurityEventNotification(type='InvalidFirmwareSignature', timestamp=simdi(),
                                                       tech_info='imzasiz paket reddedildi, yuklenmedi'))

    async def _oynanmis_yukle(self):
        await asyncio.sleep(0.4)
        await self.call(call.FirmwareStatusNotification(status=FirmwareStatus.installing))
        await asyncio.sleep(1.0)
        self.d.update(fw=self.u['fw'] + '+mod', oynanmis=True)
        await self._yeniden_ac('Reboot')

    # ---------------------------------------------------------------- cihazdan merkeze
    async def durum(self, k, st, hata=ChargePointErrorCode.no_error):
        anahtar = (deger(st), deger(hata))
        if self.son.get(k) == anahtar:
            return
        self.son[k] = anahtar
        await self.call(call.StatusNotification(connector_id=k, error_code=hata, status=st, timestamp=simdi()))

    async def _olcum(self, k, o):
        if self.oturum.get(k) is not o:
            return
        await self.call(call.MeterValues(connector_id=k, transaction_id=o['tx'], meter_value=[{
            'timestamp': simdi(), 'sampledValue': [
                {'value': '%.0f' % (o['kwh'] * 1000), 'measurand': Measurand.energy_active_import_register.value, 'unit': UnitOfMeasure.wh.value},
                {'value': '%.1f' % o['kw'], 'measurand': Measurand.power_active_import.value, 'unit': UnitOfMeasure.kw.value}]}]))

    async def _bekle(self, k, sure, kosul):
        """sure saniye ya da kosul() doğru olana kadar bekler; merkezden gelen komutlar beklemeyi uyandırır."""
        bitis = time.monotonic() + sure
        while not kosul():
            kalan = bitis - time.monotonic()
            if kalan <= 0:
                return
            try:
                await asyncio.wait_for(self.uyari[k].wait(), kalan)
            except asyncio.TimeoutError:
                return
            self.uyari[k].clear()

    async def _bosta(self, k, sure):
        await self._bekle(k, sure, lambda: k in self.uzaktan or k in self.hizmet_disi)

    async def soket(self, k, ilk):
        """Bir soketin yaşam döngüsü: boşta bekle → şarj → (bazen arıza) → tekrar."""
        bosluk = YOGUNLUK[self.u['tur']]
        await asyncio.sleep(random.uniform(0.2, 2.0))
        if not ilk or random.random() > 0.35:
            await self._bosta(k, random.expovariate(1 / bosluk))
        while True:
            if self.ariza.get(k):
                # Arıza süresi dolana (sahada giderilene) ya da yazılımsal arıza yeniden başlatmayla temizlenene kadar sürer
                kilitli = False
                while self.ariza.get(k) and time.monotonic() < self.ariza_bitis[k]:
                    if k in self.hizmet_disi and not kilitli:
                        kilitli = True
                        await self.durum(k, ChargePointStatus.unavailable, self.ariza[k])
                    await self._bekle(k, self.ariza_bitis[k] - time.monotonic(),
                                      lambda: not self.ariza.get(k) or (k in self.hizmet_disi and not kilitli))
                self.ariza[k] = None
                if k not in self.hizmet_disi:
                    await self.durum(k, ChargePointStatus.available)
                    await self._bosta(k, random.expovariate(1 / bosluk))
                    continue
            if k in self.hizmet_disi:
                await self.durum(k, ChargePointStatus.unavailable)
                await self._bekle(k, 1e9, lambda: k not in self.hizmet_disi)
                await self.durum(k, ChargePointStatus.available)
                continue
            etiket = self.uzaktan.pop(k, None)
            if not etiket and random.random() < 0.035:
                self.ariza[k] = random.choice(HATALAR)
                self.ariza_bitis[k] = time.monotonic() + random.uniform(40, 140)
                await self.durum(k, ChargePointStatus.faulted, self.ariza[k])
                continue
            await self.sarj(k, etiket)
            await self._bosta(k, random.expovariate(1 / bosluk))

    async def sarj(self, k, etiket=None):
        m = self.u
        etiket = etiket or 'RFID-%06X' % random.randrange(0xFFFFFF)
        await self.call(call.Authorize(id_tag=etiket))
        await self.durum(k, ChargePointStatus.preparing)
        r = await self.call(call.StartTransaction(connector_id=k, id_tag=etiket, meter_start=0, timestamp=simdi()))
        # Oynanmış yazılım güç sınırını aşar (anma gücünün %30 üstü): ikizin ölçüm kuralı bunu yakalar
        istek = m['kw'] * 1.3 if self.d['oynanmis'] else min(m['kw'], m['ort_kw'] * random.uniform(0.75, 1.25))
        o = {'tx': r.transaction_id, 'kwh': 0.0, 'istek': istek, 'kw': istek}
        self.oturum[k] = o
        self._guc(k)
        await self.durum(k, ChargePointStatus.charging)
        sure = max(8, m['ort_dk'] * random.uniform(0.45, 1.55))     # simülasyon dakikası = gerçek saniye
        gecen, son_olcum = 0.0, -9.0
        while gecen < sure and not o.get('durdur'):
            await asyncio.sleep(1)
            gecen += 1
            o['kwh'] += o['kw'] / 60
            if gecen - son_olcum >= 12:
                son_olcum = gecen
                await self._olcum(k, o)
        neden = o.get('durdur') or Reason.ev_disconnected.value
        await self.call(call.StopTransaction(meter_stop=int(o['kwh'] * 1000), timestamp=simdi(), transaction_id=o['tx'], reason=neden))
        self.oturum[k] = None
        if not self.kapaniyor:
            await self.durum(k, ChargePointStatus.finishing)
            if k not in self.hizmet_disi:        # hizmet dışına alındıysa döngü Unavailable bildirir
                await self.durum(k, ChargePointStatus.available)

    async def calis(self, ilk):
        await self.call(call.BootNotification(charge_point_vendor=self.u['uretici'], charge_point_model=self.u['model'],
                                              firmware_version=self.d['fw'], charge_point_serial_number=self.id))
        for k in self.soketler:
            await self.durum(k, ChargePointStatus.unavailable if k in self.hizmet_disi else ChargePointStatus.available)
        gorevler = [asyncio.ensure_future(self.soket(k, ilk)) for k in self.soketler]

        async def nabiz():
            while True:
                await asyncio.sleep(random.uniform(25, 35))
                await self.call(call.Heartbeat())
        gorevler.append(asyncio.ensure_future(nabiz()))
        try:
            await asyncio.gather(*gorevler)
        finally:
            for g in gorevler:
                g.cancel()


class Saha:
    def __init__(self):
        self.parolalar = json.load(open(os.path.join(VERI, 'cihaz-parolalari.json'), encoding='utf-8'))
        self.cihaz = {}

    def baglanti_ayari(self, kimlik, profil):
        ek, tls = {}, None
        if profil in (1, 2):
            ek['Authorization'] = 'Basic ' + base64.b64encode((kimlik + ':' + self.parolalar[kimlik]).encode()).decode()
        if profil >= 2:
            tls = ssl.create_default_context(cafile=os.path.join(SERT, 'ca.pem'))
            tls.minimum_version = ssl.TLSVersion.TLSv1_2
            if profil == 3:
                tls.load_cert_chain(os.path.join(SERT, 'cihaz-' + kimlik + '.pem'), os.path.join(SERT, 'cihaz-' + kimlik + '-anahtar.pem'))
        return ek, tls

    async def unite(self, u, gecikme):
        await asyncio.sleep(gecikme)
        profil, ilk, bekle = u['profil'], True, 1.0
        while True:
            ek, tls = self.baglanti_ayari(u['kimlik'], profil)
            try:
                async with websockets.connect(ADRES[profil] + u['kimlik'], subprotocols=['ocpp1.6'], additional_headers=ek,
                                              ssl=tls, open_timeout=10, ping_interval=20) as ws:
                    bekle = 1.0
                    cp = Unite(u, ws, self)
                    dinle, is_ = asyncio.ensure_future(cp.start()), asyncio.ensure_future(cp.calis(ilk))
                    try:
                        await asyncio.wait([dinle, is_], return_when=asyncio.FIRST_COMPLETED)
                    finally:
                        dinle.cancel()
                        is_.cancel()
                    ilk = False
            except websockets.exceptions.InvalidStatus as e:
                if profil == 1 and e.response.status_code == 403:
                    # Merkez şifresiz bağlantıyı kapattı: cihaz yapılandırması TLS'li profile yükseltilir
                    profil = 2
                    print('[saha] %s Profil 1 reddedildi, Profil 2 (TLS) ile yeniden bağlanıyor' % u['kimlik'], flush=True)
                    continue
            except (OSError, asyncio.TimeoutError, websockets.exceptions.WebSocketException):
                pass
            except Exception as e:  # beklenmeyen durumda cihaz yeniden başlar
                print('[saha] %s hata: %s' % (u['kimlik'], type(e).__name__), flush=True)
            await asyncio.sleep(bekle + random.random())
            bekle = min(bekle * 2, 20)

    async def calistir(self):
        uniteler = ikiz_veri.uniteler()
        for u in uniteler:
            self.cihaz[u['kimlik']] = {'fw': u['fw'], 'imza': False, 'oynanmis': False, 'hizmet_disi': set(), 'varsayilan': {}}
        print('[saha] %d sanal ünite bağlanıyor' % len(uniteler), flush=True)
        await asyncio.gather(*(self.unite(u, i * 0.06) for i, u in enumerate(uniteler)))


if __name__ == '__main__':
    random.seed()
    try:
        asyncio.run(Saha().calistir())
    except KeyboardInterrupt:
        pass
