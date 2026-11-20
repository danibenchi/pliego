import asyncio
from playwright.async_api import async_playwright
async def gate(pg):
    await pg.goto("http://localhost:8765/index.html"); await pg.wait_for_timeout(500)
    if await pg.query_selector("#code"):
        await pg.fill("#code", "PLIEGO451"); await pg.click("button[type=submit]"); await pg.wait_for_timeout(400)
async def titles(pg): return await pg.eval_on_selector_all(".list > .fcard h3", "els => els.map(e => e.textContent)")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1500, "height": 940}, accept_downloads=True)
        pg = await ctx.new_page(); logs=[]
        pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}")); pg.on("pageerror", lambda e: logs.append(f"PAGEERR {e}"))
        await gate(pg)
        await pg.screenshot(path="shots/30-setup.png", full_page=True)
        # correcciones: v3 corregido contra la prueba marcada v1
        await pg.set_input_files(".drop > input[type=file]", "corpus/libro-v3-corregido.pdf")
        await pg.wait_for_selector(".results", timeout=90000); await pg.wait_for_timeout(1500)
        print("V3:", await titles(pg))
        await pg.screenshot(path="shots/31-v3.png")
        await pg.set_input_files(".versions >> nth=0 >> input[type=file]", "corpus/libro-v1-marcado.pdf")
        await pg.wait_for_selector(".corrsum", timeout=60000); await pg.wait_for_timeout(800)
        print("CORR:", await pg.inner_text(".versions >> nth=0 >> .corrsum"))
        print("V3+corr:", await titles(pg))
        await pg.eval_on_selector(".versions", "e => e.scrollIntoView()")
        await pg.screenshot(path="shots/32-corr.png")
        for c in await pg.query_selector_all(".list > .fcard .fhead"):
            if "sin aplicar" in (await c.inner_text()): await c.click(); break
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path="shots/33-corr-open.png")
        # cotejo con el Word
        await pg.click(".brand"); await pg.wait_for_timeout(300)
        await pg.set_input_files(".drop > input[type=file]", "corpus/libro-v1.pdf")
        await pg.wait_for_selector(".results", timeout=90000); await pg.wait_for_timeout(1000)
        await pg.set_input_files(".versions >> nth=1 >> input[type=file]", "corpus/libro-original.docx")
        await pg.wait_for_function("document.querySelectorAll('.versions')[1].querySelector('.corrsum')", timeout=60000)
        print("ORIG:", await pg.inner_text(".versions >> nth=1 >> .corrsum"))
        print("V1+orig:", await titles(pg))
        for c in await pg.query_selector_all(".list > .fcard .fhead"):
            if "falta" in (await c.inner_text()).lower(): await c.click(); break
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path="shots/34-orig.png")
        async with pg.expect_download(timeout=90000) as dl:
            await pg.click("text=Descargar informe en PDF")
        d = await dl.value; await d.save_as("shots/informe2.pdf")
        # ortotipografía + simular papel
        await pg.click(".brand"); await pg.wait_for_timeout(300)
        await pg.set_input_files(".drop > input[type=file]", "corpus/libro-ortotipografia.pdf")
        await pg.wait_for_selector(".results", timeout=90000); await pg.wait_for_timeout(1500)
        print("ORTO:", await titles(pg))
        await pg.screenshot(path="shots/35-orto.png")
        await pg.click('button.tg:has-text("Simular papel")'); await pg.wait_for_timeout(2500)
        await pg.screenshot(path="shots/36-papel.png")
        await pg.select_option(".grp.paper select >> nth=0", "biblia"); await pg.wait_for_timeout(2500)
        await pg.screenshot(path="shots/37-biblia.png")
        print("\n".join(l for l in logs if "rror" in l or "PAGEERR" in l or "diccionario" in l)[-3000:])
        await b.close()
asyncio.run(main())
