import asyncio, time, sys
from playwright.async_api import async_playwright
URL = "http://127.0.0.1:4173/"
D = "/mnt/user-data/uploads/Downloads/PDFs Dani prueba/"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1500, "height": 940})
        await ctx.route("**/rest/v1/**", lambda r: r.abort())
        pg = await ctx.new_page(); logs=[]
        pg.on("pageerror", lambda e: logs.append(f"PAGEERR {e}"))
        await pg.goto(URL); await pg.wait_for_timeout(800)
        if await pg.query_selector("#code"):
            await pg.fill("#code", "PLIEGO451"); await pg.click("button[type=submit]"); await pg.wait_for_timeout(400)
        # Arena: interior + cubierta → aviso previo con color, país y tapa dura
        await pg.set_input_files(".drop > input[type=file]", [D + "INT FINAL LE BELLOT Arena va a la plaza.pdf", D + "C_Arena va a la plaza.pdf"])
        await pg.wait_for_selector(".precheck", timeout=120000)
        print("AVISO:", (await pg.inner_text(".precheck ul")).replace("\n", " | ")[:900])
        await pg.screenshot(path="shots/95-precheck-arena.png")
        await pg.click(".precheck .btn.primary")
        await pg.wait_for_selector(".results", timeout=600000); await pg.wait_for_timeout(1500)
        print("TALLY:", (await pg.inner_text(".tally")).replace("\n", " "))
        await pg.screenshot(path="shots/96-arena.png")
        await pg.click(".brand"); await pg.wait_for_timeout(400)
        # Medawar interior: títulos en color
        await pg.set_input_files(".drop > input[type=file]", D + "Medawar INTERIOR 03.pdf")
        await pg.wait_for_selector(".precheck, .results", timeout=200000)
        if await pg.query_selector(".precheck"):
            print("AVISO2:", (await pg.inner_text(".precheck ul")).replace("\n", " | ")[:600])
            await pg.screenshot(path="shots/97-precheck-medawar.png")
        # documentación
        await pg.goto(URL + "#documentacion"); await pg.wait_for_timeout(1200)
        txt = await pg.inner_text("body")
        print("DOCS v1.1:", "Versión 1.1" in txt, "| barras:", "Código de barras" in txt, "| 1.1 notas:", "Calibrada con diez libros" in txt)
        print("\n".join(logs)[-800:])
        await b.close()
asyncio.run(main())
