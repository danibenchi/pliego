import asyncio
from playwright.async_api import async_playwright
async def gate(pg):
    await pg.goto("http://localhost:8765/index.html"); await pg.wait_for_timeout(500)
    if await pg.query_selector("#code"):
        await pg.fill("#code", "PLIEGO451"); await pg.click("button[type=submit]"); await pg.wait_for_timeout(400)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1500, "height": 940}, accept_downloads=True)
        pg = await ctx.new_page(); logs=[]
        pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}")); pg.on("pageerror", lambda e: logs.append(f"PAGEERR {e}"))
        await gate(pg)
        await pg.set_input_files(".drop > input[type=file]", "corpus/libro-v2.pdf")
        await pg.wait_for_selector(".results", timeout=60000); await pg.wait_for_timeout(1500)
        # abrir huérfanas y marcar el primer ítem
        for c in await pg.query_selector_all(".fcard .fhead"):
            if "huérfanas" in (await c.inner_text()): await c.click(); break
        await pg.wait_for_timeout(300)
        await pg.hover(".fcard.open .items li >> nth=0")
        await pg.click(".fcard.open .items li >> nth=0 >> .imark button >> nth=1")
        await pg.wait_for_timeout(200)
        # marcar el perfil de salida como revisado
        for c in await pg.query_selector_all(".fcard .fhead"):
            if "Perfil de salida" in (await c.inner_text()): await c.click(); break
        await pg.click(".fcard.open .markbar button >> nth=0")
        await pg.wait_for_timeout(300)
        await pg.click(".marked summary")
        await pg.screenshot(path="shots/20-marks.png")
        async with pg.expect_download(timeout=60000) as dl:
            await pg.click("text=Descargar informe en PDF")
        d = await dl.value
        await d.save_as("shots/informe.pdf"); print("PDF", d.suggested_filename)
        # lote
        await pg.click(".brand"); await pg.wait_for_timeout(300)
        await pg.set_input_files(".drop > input[type=file]", ["corpus/libro-v1.pdf", "corpus/interior-correcto.pdf", "corpus/interior-con-errores.pdf", "corpus/casos-tecnicos-color.pdf"])
        await pg.wait_for_selector(".batch", timeout=20000)
        await pg.wait_for_function("document.querySelectorAll('.batch tr.done, .batch tr.error').length >= 4", timeout=120000)
        await pg.screenshot(path="shots/21-batch.png")
        async with pg.expect_download(timeout=60000) as dl:
            await pg.click("text=Informe del lote en PDF")
        d = await dl.value; await d.save_as("shots/lote.pdf"); print("LOTE", d.suggested_filename)
        await pg.click(".batch tr.done >> nth=0"); await pg.wait_for_selector(".results", timeout=60000); await pg.wait_for_timeout(1500)
        await pg.screenshot(path="shots/22-batch-open.png")
        await pg.click(".backlink"); await pg.wait_for_timeout(300)
        await pg.click(".batch tr.done >> nth=3"); await pg.wait_for_selector(".results", timeout=60000); await pg.wait_for_timeout(1200)
        print("\n".join(l for l in logs if "rror" in l or "PAGEERR" in l)[-3000:])
        await b.close()
asyncio.run(main())
