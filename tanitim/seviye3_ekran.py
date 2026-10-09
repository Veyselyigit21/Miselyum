"""Sunum için Seviye 3 ekran görüntüleri: döngü ve kurallar, şebeke talebi + tatbikat, eylem kaydı.
Kendi geçici Kapı örneğini ve sanal sahayı açar (kayit.py ile aynı yöntem, farklı portlar). Kullanım: python tanitim/seviye3_ekran.py"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kayit  # noqa: E402

kayit.KAPI_PORT, kayit.KAPI_OCPP = 8778, (9580, 9943, 9944)
kayit.BASE = 'http://127.0.0.1:%d' % kayit.KAPI_PORT
from playwright.async_api import async_playwright  # noqa: E402

BIRIM = 'AKY-ANK-01-1'


async def main():
    k = kayit.Kapi()
    try:
        await asyncio.sleep(8)
        async with async_playwright() as p:
            b = await p.chromium.launch(channel='msedge', headless=True, args=['--enable-gpu', '--use-angle=d3d11', '--hide-scrollbars'])
            ctx = await b.new_context(viewport={'width': kayit.W, 'height': kayit.H}, device_scale_factor=kayit.DPR, locale='tr-TR')
            await ctx.add_init_script("try { localStorage.setItem('miselyum:theme', '\"light\"'); localStorage.setItem('miselyum:tasindi', '1'); } catch (e) {}")
            page = await ctx.new_page()
            await page.goto(kayit.BASE + '/')
            await page.fill('#kullanici', 'yonetici')
            await page.fill('#parola', k.parola('yonetici'))
            await page.click('#gonder')
            await page.wait_for_selector('#kod:visible')
            await page.fill('#kod', k.kod('yonetici'))
            await page.wait_for_url('**/baslat.html**', timeout=20000)
            await kayit.bekle(page, "window.SK && SK.plans && SK.link.mode === 'canli' && SK.ikiz3 && SK.ikiz3.ozet", 40000)
            await page.evaluate("SK.go('saha')")
            # Birkaç otomatik onarım ve yük kararı birikmesi için bekle (iki adımlı doğrulama girişte yapıldı, 120 sn geçerli)
            await page.wait_for_timeout(40000)

            async def cek(secici, ad, ofset=-100):
                await page.evaluate("([s, o]) => { document.querySelector(s).scrollIntoView({ block: 'start' }); scrollBy(0, o); }", [secici, ofset])
                await page.wait_for_timeout(1200)
                await page.mouse.move(kayit.W * 0.7, 6)
                await page.screenshot(path=os.path.join(kayit.SHOTS, ad + '.png'))

            await page.click('#seviye3 button:has-text("Talebi uygula")')
            await kayit.bekle(page, "SK.ikiz3.ozet.talep && SK.ikiz3.ozet.talep.ulasildi != null", 20000)
            await page.wait_for_timeout(3000)
            await cek('#seviye3', '38-seviye3', -90)
            await page.click('#seviye3 button:has-text("İmzasız yazılım gönder")')
            await kayit.bekle(page, "!!SK.ikiz3.ozet.karantina['%s']" % BIRIM, 20000)
            await page.wait_for_timeout(2500)
            await cek('#seviye3 .l3-grid', '39-seviye3-tatbikat', -110)
            await page.click('#seviye3 button:has-text("Onaylı yazılımı yükle")')
            await kayit.bekle(page, "!SK.ikiz3.ozet.karantina['%s']" % BIRIM, 30000)
            await page.wait_for_timeout(2500)
            await cek('#seviye3 .l3-log', '40-seviye3-kayit', -150)
            ozet = await page.evaluate("() => SK.ikiz3.ozet")
            print('talep:', ozet['talep'], '· onarım:', ozet['onarim_sn'], 'sn ·', ozet['say'], '· medyan', ozet['ort_ms'], 'ms')
            await b.close()
    finally:
        k.kapat()
    print('Seviye 3 ekran görüntüleri alındı')


if __name__ == '__main__':
    asyncio.run(main())
