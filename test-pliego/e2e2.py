import asyncio
from playwright.async_api import async_playwright
async def run(pg, f, setup=None, shot="x"):
    await pg.goto("http://localhost:8765/index.html"); await pg.wait_for_timeout(500)
    if await pg.query_selector("#code"):
        await pg.fill("#code", "PLIEGO451"); await pg.click("button[type=submit]"); await pg.wait_for_timeout(400)
    if setup: await setup(pg)
    await pg.set_input_files("input[type=file]", f)
    await pg.wait_for_selector(".results", timeout=30000); await pg.wait_for_timeout(2200)
    await pg.screenshot(path=f"shots/{shot}.png")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1500, "height": 920})
        pg = await ctx.new_page(); logs=[]
        pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}")); pg.on("pageerror", lambda e: logs.append(f"PAGEERR {e}"))
        await run(pg, "corpus/interior-correcto.pdf", shot="6-correcto")
        await pg.click('button.tg:has-text("Doble página")'); await pg.wait_for_timeout(300)
        await pg.keyboard.press("ArrowRight"); await pg.keyboard.press("ArrowRight"); await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path="shots/7-spread.png")
        await pg.click("text=Archivo y libro"); await pg.wait_for_timeout(300)
        await pg.screenshot(path="shots/8-archivo.png")
        async def cov(pg):
            await pg.click('button[role=radio]:has-text("Cubierta")'); await pg.click('button.card:has-text("Offset estucado")')
            await pg.select_option("select >> nth=0", "150x225")
            await pg.fill("input[placeholder='240']", "240"); await pg.fill("input[type=number] >> nth=1", "80")
        await run(pg, "corpus/cubierta-rustica.pdf", setup=cov, shot="9-cubierta")
        await pg.click("text=Archivo y libro"); await pg.wait_for_timeout(300); await pg.screenshot(path="shots/10-cub-archivo.png")
        m = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        pm = await m.new_page(); pm.on("pageerror", lambda e: logs.append(f"PAGEERR {e}"))
        await run(pm, "corpus/interior-con-errores.pdf", shot="11-mobile")
        await pm.screenshot(path="shots/12-mobile-full.png", full_page=True)
        print("\n".join(logs[-20:]))
        await b.close()
asyncio.run(main())
