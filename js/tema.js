/* Rehber sayfası: paneldeki gece/gündüz tercihini uygular. Ayrı dosyadadır, çünkü Kapı'nın içerik güvenlik politikası
   satır içi betiğe izin vermez. */
try { document.documentElement.dataset.theme = JSON.parse(localStorage.getItem('miselyum:theme')) || 'light'; } catch (e) { document.documentElement.dataset.theme = 'light'; }
