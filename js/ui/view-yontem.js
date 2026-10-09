/* Yöntem ve kaynaklar: Miselyum'un katmanları, PUKÖ eşlemesi, bağlı şirketin veri kökeni (gerçek / varsayım), hesap yöntemi,
   sektördeki boşluk, yol haritası ve kaynaklar. Şirkete özgü kısımlar paketten (SK.company.yontem) gelir. */
(function (SK) {
  'use strict';
  const h = SK.h, F = SK.fmt;


  SK.registerView('yontem', {
    title: 'Yöntem ve kaynaklar',
    mount(main) {
      const econ = SK.twin.econ, Y = SK.company.yontem;
      main.appendChild(SK.viewHead('Proje', 'Yöntem ve kaynaklar',
        'Miselyum, şirketlerin kopuk sistemlerini dipten birbirine bağlayıp risk haritasına ve olasılık analizine veri besleyen bir BGYS dijital ikiz ağıdır. Şu an bağlı şirket: ' + SK.company.name + '.'));

      // Miselyum'un katmanları: doğadaki miselyum ağı gibi
      main.appendChild(h('div', { class: 'panel stack' }, h('h2', null, 'Miselyum nasıl çalışır'),
        h('div', { class: 'pdca' },
          [['1', 'Hif ajanları', 'Her tesiste cihazların dilini konuşan toplayıcı: OCPP, OPC UA, Modbus, Syslog, bulut API. Olayları ortak biçime çevirir.'],
           ['2', 'Miselyum ağı', 'Ajanlarla çekirdek arasında karşılıklı TLS ile şifrelenmiş olay akışı. Cihazlar sanal da olabilir gerçek de; çekirdek farkı bilmez.'],
           ['3', 'Çekirdek', 'Miselyum Kapısı (giriş, oturum, yetki, istek sınırı, WAF) ve ikiz, risk ve senaryo motorları. Her şirket bir paket: lokasyon, kat planı, risk, önlem, senaryo, mevzuat.'],
           ['4', 'Mantar: panel', 'Toprağın üstünde görünen kısım. Ağın küçük bir parçası ama bütün ağın durumunu gösterir.']]
            .map(([l, t, d]) => h('div', { class: 'pdca-step' }, h('span', { class: 'nav-letter' }, l), h('h3', null, t), h('p', { class: 'cell-sub' }, d))))));

      main.appendChild(h('div', { class: 'panel stack' }, h('h2', null, 'PUKÖ döngüsü bu araçta nasıl işler'),
        h('div', { class: 'pdca' },
          [['P', 'Planla', 'Varlık envanteri ikizden çıkar; ' + SK.risks.length + ' risk puanlanır ve yıllık kaybı TL olarak hesaplanır.', '#riskler'],
           ['U', 'Uygula', 'ISO 27001 Ek A\'ya eşlenmiş ' + SK.controls.length + ' kontrol açılıp kapatılır; maliyet ve fayda anında görünür.', '#kontroller'],
           ['K', 'Kontrol et', 'Kontroller canlı ikizde ' + SK.scenarios.length + ' olay senaryosuyla sınanır: siber, fiziksel, çevresel, tedarikçi ve insan kaynaklı.', '#saldiri'],
           ['Ö', 'Önlem al', 'Kalan riskler için sigorta ve yasal uyum eksikleri çıkarılır, öneri seti güncellenir. Döngü yeniden başlar.', '#sigorta']]
            .map(([l, t, d, href]) => h('div', { class: 'pdca-step' }, h('span', { class: 'nav-letter' }, l), h('h3', null, t), h('p', { class: 'cell-sub' }, d), h('a', { href, class: 'note' }, 'Ekrana git'))))));

      main.appendChild(h('div', { class: 'panel stack' }, h('h2', null, 'Veri kökeni: hangisi gerçek, hangisi varsayım?'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, h('th', null, 'Veri'), h('th', null, 'Tür'), h('th', null, 'Açıklama'))),
          h('tbody', null, (typeof Y.provenance === 'function' ? Y.provenance() : Y.provenance).map(([a, b, c]) => h('tr', null, h('td', { class: 'cell-title' }, a),
            h('td', null, SK.chip(b === 'Gerçek' ? 'info' : b === 'Gerçeğe kalibre' ? 'ok' : b === 'Kurgusal' ? 'off' : 'warn', b, b === 'Gerçek' ? 'chip-real' : '')),
            h('td', { class: 'cell-sub' }, c))))))));

      main.appendChild(h('div', { class: 'grid-even' },
        h('div', { class: 'panel stack' }, h('h2', null, 'Sektördeki boşluk'),
          Y.gap.map(t => h('p', null, t)),
          h('p', { class: 'callout' }, 'Miselyum\'un farkı: açık kaynak ve Türkçe; tek bir şirkete değil her sektöre paketle uyarlanıyor; gerçek harita ve gerçek veriyle kalibre edilmiş canlı ikiz; riskleri TL olarak hesaplıyor, sigortaya bağlıyor ve şirketin kendi mevzuatına eşliyor.')),
        h('div', { class: 'panel stack' }, h('h2', null, 'Hesap yöntemi'),
          h('dl', { class: 'kv' },
            h('dt', null, 'Yıllık beklenen kayıp'), h('dd', null, 'ALE = SLE × ARO (tek seferlik kayıp × yıllık sıklık)'),
            h('dt', null, 'Kontrol etkisi'), h('dd', null, 'Olasılık kontrolü ARO\'yu, etki kontrolü SLE\'yi (1 − etkinlik) ile çarpar'),
            h('dt', null, 'Risk skoru'), h('dd', null, 'Olasılık (1–5) × etki (1–5); 10 ve üzeri major'),
            h('dt', null, 'Kontrol önerisi'), h('dd', null, 'Net faydası en yüksek kontrol eklenir; fayda maliyeti aştıkça tekrarlanır'),
            h('dt', null, 'Senaryo kaybı'), h('dd', null, 'Etkilenen ' + SK.T('endpoint') + ' sayısının beklenen saatlik değeri × kesinti süresi + müdahale, ceza ve itibar kalemleri'),
            h('dt', null, SK.T('revenueTitle')), h('dd', null, F.tlShort(econ.dailyRevenue) + ' / gün, ' + F.tlShort(econ.annualRevenue) + ' / yıl (' + Y.revenue() + ')')))));

      main.appendChild(h('div', { class: 'panel stack' }, h('h2', null, 'Yol haritası'),
        h('ol', { class: 'plain' },
          h('li', null, h('b', null, 'Canlı veri (yapıldı): '), 'Miselyum Kapısı sanal şarj cihazlarını gerçek OCPP protokolüyle bağlıyor (Seviye 2).'),
          h('li', null, h('b', null, 'İki yönlü ikiz (yapıldı): '), 'İkiz sahadan okuyup kendisi karar veriyor, cihaza OCPP komutu gönderiyor ve sonucu doğruluyor (Seviye 3): kendini onarma, emniyet kilidi, karantina, yük yönetimi, otomasyon freni. Sırada gerçek bir cihaz ya da açık kaynak EVerest yazılımı.'),
          h('li', null, h('b', null, 'Çok sektör (yapıldı): '), 'Şirket paketiyle ikinci bir sektör eklendi (elektrikli otomobil üretimi). Sırada paket hazırlama sihirbazı ve kat planı içe aktarma (SVG, DXF).'),
          h('li', null, h('b', null, 'Yeni bağlayıcılar: '), 'OPC UA ve Modbus için hif ajanları; SIEM (Wazuh) ve bulut hesaplarından olay akışı.'),
          h('li', null, h('b', null, 'Yerel yapay zekâ: '), 'Bilgisayarda çalışan açık kaynak bir dil modeliyle risk kaydından BGYS politikası, uygulanabilirlik bildirgesi ve risk raporu taslağı üretilmesi. Veri şirket dışına çıkmaz.'))));

      main.appendChild(h('div', { class: 'panel stack' }, h('h2', null, 'Kaynaklar'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, h('th', null, 'Konu'), h('th', null, 'Kaynak'))),
          h('tbody', null, Y.sources.map(([k, t, u]) => h('tr', null, h('td', null, h('span', { class: 'tag' }, k)), h('td', null, u ? h('a', { href: u, target: '_blank', rel: 'noopener' }, t) : t))))))));
    }
  });
})(window.SK);
