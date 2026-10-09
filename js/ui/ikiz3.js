/* Seviye 3 · iki yönlü ikiz paneli (saha ikizinde, Akımyolu). Panel Kapı ile canlı açılınca çalışır:
   ikiz sahadan okur, kendisi karar verir, cihaza OCPP komutu yazar ve cihazın sonraki mesajıyla doğrular (kapi/ikiz3.py).
   Şebeke talebi, tatbikat ve elle komut yalnız yöneticiye açıktır ve iki adımlı doğrulama ister; asıl denetim sunucudadır. */
(function (SK) {
  'use strict';
  const h = SK.h, F = SK.fmt;

  const KURAL = [
    ['onarim', 'Kendini onarma', 'Yazılımsal arıza 15 sn\'de geçmezse yeniden başlatır. Diğer sokette şarj varsa yalnız arızalı soket yeniden başlar.'],
    ['emniyet', 'Emniyet kilidi', 'Topraklama ya da aşırı sıcaklıkta soketi kilitler, iş emri açar; arıza giderilince hizmete alır.'],
    ['karantina', 'Güvenlik karantinası', 'Onaysız yazılımla açılan ya da anma gücünü aşan cihazı ağdan ayırır; onaylı yazılıma dönünce kaldırır.'],
    ['yuk', 'Yük yönetimi', 'Lokasyonun şebeke gücü aşılırsa ya da şebeke talebi gelirse gücü şarjlara paylaştırır; şarj kesilmez.'],
    ['fren', 'Otomasyon freni', '60 sn\'de en çok 10 otomatik durdurma. Sahte mesajla ikizi kendi ağını kapatmaya zorlamak mümkün değil.']
  ];
  const ADIM = [
    ['Sahadan oku', 'OCPP mesajları ikize akar'],
    ['İkizde karar ver', 'kural ve öngörü'],
    ['Sahaya yaz', 'cihaza OCPP komutu'],
    ['Geri doğrula', 'cihazın sonraki mesajıyla']
  ];
  const KOMUT = [['durdur', 'Şarjı durdur'], ['baslat', 'Şarjı başlat'], ['hizmet_disi', 'Hizmet dışı al'], ['hizmette', 'Hizmete al'],
    ['guc_siniri', 'Güç sınırı koy'], ['sinir_kaldir', 'Sınırı kaldır'], ['yeniden_baslat', 'Yeniden başlat']];
  const kw = v => F.n1(v).replace(/,0$/, '') + ' kW';
  const saat = t => new Date(t * 1000).toLocaleTimeString('tr-TR');
  const toplam = o => Object.keys(o).reduce((a, k) => a + o[k], 0);
  const sure = ms => ms < 1000 ? F.n(ms) + ' ms' : F.n1(ms / 1000) + ' sn';

  function dogrulamaChip(e) {
    if (e.dogrulama === 'dogrulandi') return SK.chip('ok', sure(e.ms));
    if (e.dogrulama === 'bekliyor') return SK.chip('info', 'bekliyor');
    if (e.dogrulama === 'zaman_asimi') return SK.chip('crit', 'zaman aşımı');
    if (e.yanit === 'Engellendi' || e.yanit === 'Bekletildi') return SK.chip('warn', e.yanit.toLocaleLowerCase('tr-TR'));
    if (e.dogrulama === 'yanit') return SK.chip('off', 'yalnız yanıt');
    return SK.chip('off', '—');
  }
  function kaynak(e) {
    if (e.kaynak === 'ikiz') return h('span', { class: 'src src-ikiz' }, 'İkiz');
    if (e.kaynak === 'cihaz') return h('span', { class: 'src' }, 'Cihaz');
    return h('span', { class: 'src src-user' }, e.kaynak);
  }

  // Bir komutun sonucunu izle: cihaz yanıtı ve ikizin doğrulaması geldikçe metni günceller
  function izle(id, out, once) {
    if (!id) return;
    const off = SK.on('eylem', e => {
      if (e.id !== id) return;
      if (e.dogrulama === 'dogrulandi') {
        out.textContent = e.sonuc ? '✓ ' + e.sonuc + ' Süre: ' + sure(e.ms) + '.' : once + ' · ikiz doğruladı, ' + sure(e.ms) + ' (beklenen: ' + e.beklenen + ')';
        off();
      } else if (e.dogrulama === 'zaman_asimi') { out.textContent = once + ' · ✕ doğrulanamadı (beklenen: ' + e.beklenen + ')'; off(); }
    });
    setTimeout(off, 90000);
  }

  SK.ikiz3Panel = function () {
    const offs = [];
    const yetkili = SK.kapi && SK.kapi.can('cihaz_komutu');
    const el = h('section', { class: 'panel stack l3', id: 'seviye3' });
    const durumChip = h('span');

    // ---- Döngü ----
    const vals = ADIM.map(() => h('b', { class: 'loop-v' }, '–'));
    const loop = h('ol', { class: 'loop', 'aria-label': 'İkizin döngüsü' }, ADIM.map((a, i) => h('li', { class: 'loop-step' },
      h('span', { class: 'loop-n' }, String(i + 1)), h('div', { class: 'loop-b' }, h('span', { class: 'loop-t' }, a[0]), vals[i], h('span', { class: 'note' }, a[1])))));

    // ---- Kurallar ----
    const kural = {};
    const rules = h('div', { class: 'rules' }, KURAL.map(([k, t, d]) => {
      const n = h('span', { class: 'rule-n' }, '0'), st = h('span', { class: 'rule-st' }, ' ');
      kural[k] = { n, st };
      return h('article', { class: 'rule' }, h('div', { class: 'rule-head' }, h('h3', null, t), n), h('p', { class: 'cell-sub' }, d), st);
    }));

    // ---- Şebeke talebi ----
    const oran = h('select', { class: 'inp inp-sm', 'aria-label': 'Azaltma oranı' }, [20, 30, 40].map(v => h('option', { value: v / 100, selected: v === 30 }, '%' + v)));
    const sureSel = h('select', { class: 'inp inp-sm', 'aria-label': 'Talep süresi' }, [[30, '30 dk'], [60, '1 saat'], [120, '2 saat']].map(([v, l]) => h('option', { value: v, selected: v === 60 }, l)));
    oran.value = '0.3'; sureSel.value = '60';
    const drBtn = h('button', { type: 'button', class: 'btn btn-primary btn-sm', disabled: !yetkili, onclick: talep }, 'Talebi uygula');
    const drStop = h('button', { type: 'button', class: 'btn btn-sm', hidden: true, disabled: !yetkili, onclick: () => SK.kapi.kritik('api/ikiz/talep', { iptal: true }) }, 'Talebi bitir');
    const drPred = h('p', { class: 'cell-sub' });
    const drNow = h('span', { class: 'dr-now' }), drTarget = h('span', { class: 'dr-target' });
    const drBar = h('div', { class: 'dr-bar', hidden: true, role: 'img', 'aria-label': 'Ağ yükü ve talep hedefi' }, drNow, drTarget);
    const drOut = h('p', { class: 'note', role: 'status' });
    async function talep() {
      drOut.textContent = 'Gönderiliyor…';
      const r = await SK.kapi.kritik('api/ikiz/talep', { oran: +oran.value, sure_dk: +sureSel.value });
      drOut.textContent = r.ok ? 'Talep uygulandı: ikiz ' + kw(r.data.ag0) + ' yükü ' + kw(r.data.hedef) + ' hedefine indiriyor.' : '✕ ' + (r.data.hata || 'Talep uygulanamadı');
    }
    const drBox = h('div', { class: 'l3-box stack' },
      h('h3', null, 'Şebeke talebi (puant)'),
      h('p', { class: 'cell-sub' }, 'Dağıtım şirketi puant saatinde yükün azaltılmasını ister. İkiz gücü aktif şarjlara orantılı paylaştırır (SetChargingProfile); hiçbir şarj kesilmez, yalnız yavaşlar. Talep bitince sınırlar kademeli kalkar.'),
      h('div', { class: 'cta-row tight' }, oran, sureSel, drBtn, drStop), drPred, drBar, drOut);

    // ---- Tatbikat ----
    const units = SK.twin.units;
    const tbSel = h('select', { class: 'inp', 'aria-label': 'Tatbikat ünitesi' }, units.map(u => h('option', { value: u.id, selected: u.id === 'AKY-ANK-01-1' }, u.id + ' · ' + SK.models[u.model].label)));
    tbSel.value = 'AKY-ANK-01-1';
    const tbImza = h('p', { class: 'cell-sub' });
    const tbOut = h('p', { class: 'note', role: 'status' });
    const tbAttack = h('button', { type: 'button', class: 'btn btn-sm btn-attack', disabled: !yetkili, onclick: tatbikat }, 'İmzasız yazılım gönder');
    const tbOta = h('button', { type: 'button', class: 'btn btn-sm', disabled: !yetkili, onclick: ota }, 'Onaylı yazılımı yükle (OTA)');
    async function tatbikat() {
      tbOut.textContent = 'Paket gönderiliyor…';
      const r = await SK.kapi.kritik('api/ikiz/tatbikat', { cp: tbSel.value });
      if (!r.ok) { tbOut.textContent = '✕ ' + (r.data.hata || 'Gönderilemedi'); return; }
      const once = r.data.sonuc === 'Rejected' ? 'Cihaz paketi reddetti' : r.data.sonuc === 'Accepted' ? 'Cihaz paketi kabul etti, yeniden açılıyor' : 'Cihazın yanıtı: ' + r.data.sonuc;
      tbOut.textContent = once + '…';
      izle(r.data.eylem, tbOut, once);
    }
    async function ota() {
      tbOut.textContent = 'Onaylı yazılım gönderiliyor…';
      const r = await SK.kapi.kritik('api/cihaz/komut', { cp: tbSel.value, konnektor: 0, komut: 'yazilim_guncelle' });
      if (!r.ok) { tbOut.textContent = '✕ ' + (r.data.hata || 'Gönderilemedi'); return; }
      const once = r.data.sonuc === 'Accepted' ? 'Cihaz güncellemeyi kabul etti' : 'Cihazın yanıtı: ' + r.data.sonuc;
      tbOut.textContent = once + '…';
      izle(r.data.eylem, tbOut, once);
    }
    const tbBox = h('div', { class: 'l3-box stack' },
      h('h3', null, 'Tatbikat: imzasız yazılım'),
      h('p', { class: 'cell-sub' }, 'Kırmızı takım bir üniteye imzasız yazılım paketi gönderir (gerçekte bakım portundan ya da ele geçirilmiş güncelleme sunucusundan). Ya cihaz paketi reddeder ya da ikiz açılışta yakalayıp üniteyi karantinaya alır.'),
      tbSel, tbImza, h('div', { class: 'cta-row tight' }, tbAttack, tbOta), tbOut);

    // ---- Elle komut (ikiz öngörüsüyle) ----
    const unitSel = h('select', { class: 'inp', 'aria-label': 'Ünite' }, units.map(u => h('option', { value: u.id }, u.id + ' · ' + SK.models[u.model].label)));
    const konSel = h('select', { class: 'inp inp-sm', 'aria-label': 'Soket' });
    const kwIn = h('input', { class: 'inp inp-sm', type: 'number', min: 1.4, step: 0.5, value: 11, 'aria-label': 'Güç sınırı (kW)', style: { width: '84px' } });
    const pred = h('p', { class: 'cell-sub' });
    const cmdOut = h('p', { class: 'note', role: 'status' });
    function fillKon() {
      const u = SK.twin.unitMap[unitSel.value];
      SK.clear(konSel);
      u.connectors.forEach((c, i) => konSel.appendChild(h('option', { value: i + 1 }, 'Soket ' + (i + 1))));
      kwIn.max = SK.models[u.model].kw;
      ongoru();
    }
    function ongoru() {
      const u = SK.twin.unitMap[unitSel.value], c = u.connectors[+konSel.value - 1];
      if (!c) return;
      const st = SK.connState(c), se = c.session;
      const diger = u.connectors.filter(x => x !== c && x.session && x.state === 'Charging');
      pred.textContent = 'İkiz öngörüsü · ' + SK.STATE_LABEL[st].toLocaleLowerCase('tr-TR') + (se ? ' (' + kw(se.kw) + ', ' + F.n1(se.kwh) + ' kWh)' : '') +
        (c.limitKw ? ' · güç sınırı ' + kw(c.limitKw) : '') + (c.quarantine ? ' · ünite karantinada' : '') + '. ' +
        (se ? 'Şarjı durdurmak ya da hizmet dışı almak bu şarjı keser. ' : 'Bu sokette kesilecek şarj yok. ') +
        (diger.length ? 'Yeniden başlatmak üniteyi kapatır: diğer soketteki şarj (' + kw(diger[0].session.kw) + ') da kesilir.' : 'Yeniden başlatmak başka şarjı etkilemez.');
    }
    unitSel.addEventListener('change', fillKon);
    konSel.addEventListener('change', ongoru);
    async function komut(k) {
      const body = { cp: unitSel.value, konnektor: +konSel.value, komut: k };
      if (k === 'guc_siniri') body.kw = +kwIn.value;
      cmdOut.textContent = 'Gönderiliyor…';
      const r = await SK.kapi.kritik('api/cihaz/komut', body);
      if (r.iptal || !r.ok) { cmdOut.textContent = '✕ ' + (r.data.hata || 'Reddedildi'); return; }
      const once = r.data.sonuc === 'Accepted' ? '✓ Cihaz kabul etti' : '• Cihazın yanıtı: ' + r.data.sonuc;
      cmdOut.textContent = once;
      izle(r.data.eylem, cmdOut, once);
    }
    const cmdBox = h('div', { class: 'l3-box stack' },
      h('h3', null, 'Elle komut'),
      h('p', { class: 'cell-sub' }, 'İkiz komuttan önce sahadaki etkisini söyler, sonra cihazın cevabıyla uygulandığını doğrular.'),
      h('div', { class: 'cta-row tight' }, unitSel, konSel), pred,
      h('div', { class: 'cta-row tight' }, KOMUT.map(([k, t]) => k === 'guc_siniri'
        ? h('span', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-sm', disabled: !yetkili, onclick: () => komut(k) }, t), kwIn)
        : h('button', { type: 'button', class: 'btn btn-sm', disabled: !yetkili, onclick: () => komut(k) }, t))),
      cmdOut);

    // ---- Eylem kaydı ----
    const tbody = h('tbody');
    const filt = h('input', { type: 'checkbox', id: 'l3-yalniz' });
    const table = h('div', { class: 'table-wrap' }, h('table', { class: 'data l3-log' },
      h('thead', null, h('tr', null, ['Saat', 'Kaynak', 'Cihaz', 'Karar ve neden', 'OCPP komutu', 'Yanıt', 'Doğrulama'].map(t => h('th', null, t)))), tbody));
    function renderLog() {
      const I = SK.ikiz3;
      SK.clear(tbody);
      const list = (I ? I.eylemler : []).filter(e => !filt.checked || e.kaynak === 'ikiz').slice(-12).reverse();
      if (!list.length) { tbody.appendChild(h('tr', null, h('td', { colspan: 7, class: 'note' }, 'Henüz eylem yok. İkiz bir arıza, karantina ya da yük olayı gördüğünde burada görünür.'))); return; }
      list.forEach(e => tbody.appendChild(h('tr', { class: e.kural === 'tatbikat' || e.kural === 'karantina' ? 'is-sec' : '' },
        h('td', { class: 'mono note' }, saat(e.zaman)), h('td', null, kaynak(e)),
        h('td', { class: 'mono' }, e.cp === '*' ? 'Tüm ağ' : e.cp + (e.k ? '/' + e.k : '')),
        h('td', null, h('div', { class: 'cell-title' }, e.komut), h('div', { class: 'cell-sub' }, e.neden), e.sonuc ? h('div', { class: 'cell-sub l3-sonuc' }, e.sonuc) : null),
        h('td', { class: 'mono cell-sub' }, e.ocpp), h('td', { class: 'mono' }, e.yanit || '…'), h('td', null, dogrulamaChip(e)))));
    }
    filt.addEventListener('change', renderLog);

    const live = h('div', { class: 'stack' },
      loop, rules,
      h('div', { class: 'grid-3 l3-grid' }, drBox, tbBox, cmdBox),
      h('div', { class: 'panel-head' }, h('h3', null, 'İkizin eylem kaydı'), h('label', { class: 'row note', for: 'l3-yalniz' }, filt, 'Yalnız ikizin kendi kararları')),
      table,
      h('p', { class: 'note' }, 'Süreler yerel ağda ölçülür; gerçek sahada cihaz tepkisi birkaç saniye sürebilir. Talep ve tatbikat süreleri simülasyon zamanıdır (1 sn = 1 dk). ' +
        (yetkili ? 'Talep, tatbikat ve komutlar iki adımlı doğrulama ister.' : 'Talep, tatbikat ve komutlar yalnız yöneticiye açık; bu rolde düğmeler kapalı ve sunucu da reddeder.')));
    const off = h('div', { class: 'stack' }, loop.cloneNode(true),
      h('p', { class: 'callout' }, 'Seviye 3 Miselyum Kapısı ile açılınca çalışır: ikiz 95 sanal şarj cihazından okur, kendisi karar verip komut gönderir ve sonucu doğrular. Proje klasöründe baslat-miselyum-kapi.bat dosyasını çalıştırın.'));

    el.append(h('div', { class: 'panel-head' },
      h('div', null, h('div', { class: 'eyebrow' }, 'Seviye 3 · iki yönlü dijital ikiz'), h('h2', null, 'İkiz sahaya kendisi yazıyor')), durumChip),
      h('p', { class: 'lead l3-lead' }, 'Seviye 2\'de veri yalnız cihazdan ikize akıyordu. Şimdi ikiz bu veriye bakıp kendisi karar veriyor, cihaza OCPP komutu gönderiyor ve komutun sahada gerçekten uygulandığını cihazın bir sonraki mesajından doğruluyor.'),
      live, off);

    function update() {
      const L = SK.link, I = SK.ikiz3, o = I && I.ozet, on = L.mode === 'canli' && !!o;
      live.hidden = !on; off.hidden = on;
      SK.clear(durumChip).appendChild(on ? SK.chip('ok', 'Döngü çalışıyor') : SK.chip('off', L.mode === 'kopuk' ? 'Bağlantı koptu' : 'Kapı ile çalışır'));
      if (!on) return;
      vals[0].textContent = F.n(o.okuma_dk) + ' mesaj/dk';
      vals[1].textContent = F.n(toplam(o.kural)) + ' karar';
      vals[2].textContent = F.n(o.say.otomatik) + ' otomatik · ' + F.n(o.say.elle) + ' elle';
      vals[3].textContent = (o.dogrulama_orani == null ? '–' : F.pct(o.dogrulama_orani)) + (o.ort_ms != null ? ' · medyan ' + F.n(o.ort_ms) + ' ms' : '');
      KURAL.forEach(([k]) => { kural[k].n.textContent = F.n(o.kural[k] || 0); });
      kural.onarim.st.textContent = o.onarim_sn != null ? 'Ortalama ' + F.n1(o.onarim_sn) + ' sn\'de hizmette (kendiliğinden ~' + o.dogal_ariza_sn + ' sn)' : 'Arıza bekleniyor';
      kural.emniyet.st.textContent = o.is_emri ? o.is_emri + ' açık iş emri' : 'Açık iş emri yok';
      const kar = Object.keys(o.karantina);
      kural.karantina.st.textContent = kar.length ? 'Karantinada: ' + kar.join(', ') : 'Karantinada cihaz yok';
      const sinirli = Object.keys(o.oto_sinir).length + Object.keys(o.elle_sinir).length;
      kural.yuk.st.textContent = sinirli ? F.n(sinirli) + ' şarj güç sınırlı · ağ ' + kw(o.ag_kw) : 'Sınır yok · ağ ' + kw(o.ag_kw);
      kural.fren.st.textContent = (o.frenli ? 'Şu an devrede' : 'Devrede değil') + (o.toplu_fren ? ' · insanlar için de açık (60 sn\'de 5 cihaz)' : '');
      kural.fren.st.classList.toggle('is-warn', !!o.frenli);
      // Talep
      const t = o.talep;
      drStop.hidden = !t; drBtn.hidden = !!t; drBar.hidden = !t;
      if (t) {
        const max = Math.max(t.ag0, o.ag_kw, 1);
        drNow.style.width = (o.ag_kw / max * 100) + '%';
        drTarget.style.left = (t.hedef / max * 100) + '%';
        drPred.textContent = 'Ağ yükü ' + kw(t.ag0) + ' → hedef ' + kw(t.hedef) + ' · şu an ' + kw(o.ag_kw) + ' · ' + F.n(t.gonderilen) + ' güç profili gönderildi · kalan ' + F.n(t.kalan_sn) + ' dk';
        drOut.textContent = t.ulasildi != null ? '✓ Hedefe ' + F.n1(t.ulasildi) + ' sn\'de ulaşıldı; cihazların ölçümü doğruladı.' : 'Hedefe iniliyor…';
      } else {
        const ch = SK.twin.connectors.filter(c => c.state === 'Charging' && c.session).length;
        drPred.textContent = 'İkiz öngörüsü: ağ yükü ' + kw(o.ag_kw) + ' → ' + kw(o.ag_kw * (1 - oran.value)) + '; ' + F.n(ch) + ' aktif şarj yavaşlar, hiçbiri kesilmez.';
      }
      tbImza.textContent = o.imza ? '"İmzalı firmware doğrulaması" önlemi açık: cihaz paketi kendisi reddetmeli.' : '"İmzalı firmware doğrulaması" önlemi kapalı: cihaz paketi kabul eder; ikiz açılışta yakalamalı.';
      tbOta.classList.toggle('btn-primary', !!o.karantina[tbSel.value]);
    }
    oran.addEventListener('change', update);
    tbSel.addEventListener('change', update);
    fillKon();
    update(); renderLog();
    offs.push(SK.on('ikiz3', () => { update(); ongoru(); }), SK.on('eylem', renderLog), SK.on('link', update));
    return { el, destroy: () => offs.forEach(f => f()) };
  };
})(window.SK);
