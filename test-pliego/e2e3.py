import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1500, "height": 920})
        pg = await ctx.new_page(); logs=[]
        pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}")); pg.on("pageerror", lambda e: logs.append(f"PAGEERR {e}"))
        await pg.goto("http://localhost:8765/index.html"); await pg.wait_for_timeout(500)
        await pg.fill("#code", "PLIEGO451"); await pg.click("button[type=submit]"); await pg.wait_for_timeout(500)
        await pg.click('button.card:has-text("Offset estucado")')
        await pg.click('.chips button:has-text("Infantil")')
        await pg.set_input_files("input[accept='.icc,.icm']", "src/assets/FOGRA39L_coated.bin"); await pg.wait_for_timeout(300)
        await pg.evaluate("document.querySelector('.profile').scrollTop = 9999; window.scrollTo(0, 9999)")
        await pg.screenshot(path="shots/20-setup-icc.png", full_page=True)
        await pg.set_input_files("input[accept='application/pdf,.pdf']", "corpus/casos-tecnicos-color.pdf")
        await pg.wait_for_selector(".results", timeout=30000); await pg.wait_for_timeout(2000)
        await pg.screenshot(path="shots/21-casos.png")
        # página 5: tintas y troquel
        await pg.click('.thumb[data-i="4"]'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path="shots/22-p5.png")
        await pg.click('button.tg:has-text("Simular papel")'); await pg.wait_for_timeout(2000)
        await pg.screenshot(path="shots/23-proof.png")
        await pg.click('.tabs button:has-text("Archivo")'); await pg.wait_for_timeout(400)
        await pg.screenshot(path="shots/24-archivo.png")
        await pg.click('.thumb[data-i="3"]'); await pg.wait_for_timeout(1500)
        await pg.click('button.tg:has-text("Simular papel")'); await pg.wait_for_timeout(1200)
        await pg.screenshot(path="shots/25-contornos.png")
        print("\n".join(logs[-15:]))
        await b.close()
asyncio.run(main())
