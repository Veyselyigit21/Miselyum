"""Sunum için ek ekran görüntüleri: OCPP profil geçişinin önce ve sonra hali (Güvenlik merkezi).
Kendi geçici Kapı örneğini açar (kayit.py ile aynı yöntem, farklı portlar). Kullanım: python tanitim/ek_ekran.py"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kayit  # noqa: E402

kayit.KAPI_PORT, kayit.KAPI_OCPP = 8774, (9480, 9843, 9844)
kayit.BASE = 'http://127.0.0.1:%d' % kayit.KAPI_PORT
from playwright.async_api import async_playwright  # noqa: E402


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
            await page.wait_for_function("window.SK && SK.plans && SK.link.mode === 'canli'", timeout=40000)
            await page.evaluate("SK.go('guvenlik')")
            await page.wait_for_timeout(5000)

            async def ocpp_panel(ad):
                await page.evaluate("document.querySelector('.ocpp-bars').closest('.panel').scrollIntoView({ block: 'start' }); scrollBy(0, -110)")
                await page.wait_for_timeout(1200)
                await page.mouse.move(kayit.W * 0.7, 6)
                await page.screenshot(path=os.path.join(kayit.SHOTS, ad + '.png'))
            await ocpp_panel('17a-profil-once')
            await page.evaluate('SK.setEnabled(SK.plans.faz1)')
            # Bekleme sayfa içinde eval gerektirmesin (Kapı'nın CSP'si unsafe-eval'a izin vermez)
            for _ in range(60):
                if await page.evaluate("() => !!(SK.link.ozet && SK.link.ozet.profil[1] === 0 && SK.link.ozet.profil[2] > 70)"):
                    break
                await page.wait_for_timeout(500)
            await page.wait_for_timeout(4500)   # Güvenlik verisi 4 sn'de bir yenilenir
            await ocpp_panel('17-profil-gecisi')
            # Kıvılcım fabrika planı: plan ekranın ortasında görünsün
            await page.evaluate("SK.switchTenant('kivilcim')")
            await page.wait_for_timeout(1500)
            await kayit.bekle(page, "window.SK && SK.plans && SK.tenantId === 'kivilcim' && document.querySelector('.main')", 30000)
            await page.evaluate("SK.go('merkez')")
            await page.wait_for_timeout(1500)
            await page.click('.view-head .seg button[data-id="uretim"]')
            await page.wait_for_timeout(1200)
            await page.evaluate("document.querySelector('svg.plan-svg').scrollIntoView({ block: 'start' }); scrollBy(0, -140)")
            await page.wait_for_timeout(1200)
            await page.mouse.move(kayit.W * 0.7, 6)
            await page.screenshot(path=os.path.join(kayit.SHOTS, '32-kivilcim-fabrika.png'))
            await b.close()
    finally:
        k.kapat()
    print('Ek ekran görüntüleri alındı')


if __name__ == '__main__':
    asyncio.run(main())
