import asyncio, sys
from playwright.async_api import async_playwright
async def main(with_icc):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1500, "height": 920}); logs=[]
        pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
        await pg.goto("http://localhost:8765/index.html"); await pg.wait_for_timeout(400)
        if await pg.query_selector("#code"):
            await pg.fill("#code", "PLIEGO451"); await pg.click("button[type=submit]"); await pg.wait_for_timeout(400)
        await pg.click('button.card:has-text("Offset estucado")'); await pg.click('.chips button:has-text("Infantil")')
        if with_icc: await pg.set_input_files("input[accept='.icc,.icm']", "src/assets/FOGRA39L_coated.bin")
        await pg.set_input_files("input[accept='application/pdf,.pdf']", "corpus/casos-tecnicos-color.pdf")
        await pg.wait_for_selector(".results", timeout=30000)
        await pg.click('.thumb[data-i="4"]'); await pg.wait_for_timeout(2500)
        v = await pg.evaluate("""() => { const c = document.querySelector('.pagebox canvas'); const ctx = c.getContext('2d'); const sx = c.width/443; return [c.width, [...ctx.getImageData(Math.round(300*sx), Math.round(420*sx), 1, 1).data], [...ctx.getImageData(Math.round(150*sx), Math.round(185*sx), 1, 1).data]]; }""")
        print("icc" if with_icc else "auto", v, [l for l in logs if "error" in l.lower()][-5:])
        await b.close()
asyncio.run(main(False)); asyncio.run(main(True))
