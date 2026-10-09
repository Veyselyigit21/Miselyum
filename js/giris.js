/* Miselyum Kapısı · giriş sayfası. Satır içi betik yoktur (CSP: script-src 'self'); bütün davranış bu dosyadadır.
   Akış: kullanıcı adı + parola → (rolde varsa) iki adımlı doğrulama kodu → panel. Sunucu her adımı ayrıca denetler. */
(function () {
  'use strict';

  // Panelde seçilen tema giriş sayfasında da geçerli olsun
  try { const t = JSON.parse(localStorage.getItem('miselyum:theme')); if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; } catch (e) { /* depo kapalı */ }

  const $ = id => document.getElementById(id);
  const fParola = $('adim-parola'), fKod = $('adim-kod');
  let gecici = null;

  const NEDEN = {
    sure: 'Oturumunuz uzun süre işlem yapılmadığı için kapandı. Yeniden giriş yapın.',
    kapandi: 'Oturumunuz kapatıldı (başka bir cihazdan giriş ya da yönetici kararı). Yeniden giriş yapın.',
    cikis: 'Çıkış yaptınız. Oturumunuz sunucuda silindi.'
  };
  try {
    const n = new URLSearchParams(location.search).get('neden');
    if (NEDEN[n]) ileti($('ileti'), NEDEN[n], true);
  } catch (e) { /* eski tarayıcı */ }

  function ileti(el, metin, bilgi) {
    el.textContent = metin;
    el.classList.toggle('is-bilgi', !!bilgi);
    el.hidden = !metin;
  }

  async function gonder(yol, veri) {
    let r;
    try {
      r = await fetch(yol, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(veri) });
    } catch (e) {
      return { durum: 0, veri: { hata: 'Miselyum Kapısı çalışmıyor. baslat-miselyum-kapi.bat ile başlatın ya da simülasyon modunda açın.' } };
    }
    let j = {};
    try { j = await r.json(); } catch (e) { /* boş yanıt */ }
    return { durum: r.status, veri: j };
  }

  $('goster').addEventListener('click', () => {
    const p = $('parola'), acik = p.type === 'password';
    p.type = acik ? 'text' : 'password';
    $('goster').textContent = acik ? 'Gizle' : 'Göster';
    $('goster').setAttribute('aria-pressed', String(acik));
    $('goster').setAttribute('aria-label', acik ? 'Parolayı gizle' : 'Parolayı göster');
  });

  fParola.addEventListener('submit', async ev => {
    ev.preventDefault();
    const k = $('kullanici').value.trim(), p = $('parola').value;
    if (!k || !p) { ileti($('ileti'), 'Kullanıcı adı ve parolayı girin.'); return; }
    $('gonder').disabled = true;
    $('gonder').textContent = 'Denetleniyor…';
    const { durum, veri } = await gonder('api/giris', { kullanici: k, parola: p });
    $('gonder').disabled = false;
    $('gonder').textContent = 'Giriş yap';
    if (durum === 200 && veri.mfa) {
      gecici = veri.gecici;
      $('parola').value = '';
      fParola.hidden = true;
      fKod.hidden = false;
      ileti($('ileti-kod'), '');
      $('kod').value = '';
      $('kod').focus();
      return;
    }
    if (durum === 200 && veri.ok) { location.replace(veri.yonlendir || 'baslat.html'); return; }
    $('parola').value = '';
    ileti($('ileti'), veri.hata || 'Giriş yapılamadı.');
    $('parola').focus();
  });

  $('kod').addEventListener('input', () => {
    $('kod').value = $('kod').value.replace(/\D/g, '').slice(0, 6);
    if ($('kod').value.length === 6) fKod.requestSubmit();
  });

  fKod.addEventListener('submit', async ev => {
    ev.preventDefault();
    const kod = $('kod').value;
    if (!/^\d{6}$/.test(kod)) { ileti($('ileti-kod'), '6 haneli kodu girin.'); return; }
    $('dogrula').disabled = true;
    const { durum, veri } = await gonder('api/giris/mfa', { gecici, kod });
    $('dogrula').disabled = false;
    if (durum === 200 && veri.ok) { location.replace(veri.yonlendir || 'baslat.html'); return; }
    $('kod').value = '';
    ileti($('ileti-kod'), veri.hata || 'Kod doğrulanamadı.');
    if (durum === 401 && /yeniden giriş/.test(veri.hata || '')) setTimeout(geri, 1600);
    else $('kod').focus();
  });

  function geri() {
    gecici = null;
    fKod.hidden = true;
    fParola.hidden = false;
    $('kullanici').focus();
  }
  $('geri').addEventListener('click', geri);

  $('kullanici').focus();
})();
