import asyncio, time, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173/"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1500, "height": 940})
        pg = await ctx.new_page(); logs=[]
        pg.on("pageerror", lambda e: logs.append(f"PAGEERR {e}"))
        await pg.goto(URL); await pg.wait_for_timeout(800)
        if await pg.query_selector("#code"):
            await pg.fill("#code", "PLIEGO451"); await pg.click("button[type=submit]"); await pg.wait_for_timeout(400)
        # 1) libro chico sin diferencias: arranca directo
        await pg.set_input_files(".drop > input[type=file]", "corpus/libro-v2.pdf")
        await pg.wait_for_selector(".results", timeout=90000); print("libro-v2 sin aviso:", await pg.query_selector(".precheck") is None)
        await pg.click(".brand"); await pg.wait_for_timeout(300)
        # 2) libro escolar: aviso antes de revisar
        t = time.time()
        await pg.set_input_files(".drop > input[type=file]", "/home/claude/calib/libro.pdf")
        await pg.wait_for_selector(".precheck", timeout=120000)
        print("aviso en", round(time.time() - t), "s:", (await pg.inner_text(".precheck ul")).replace("\n", " | ")[:500])
        await pg.screenshot(path="shots/90-precheck.png")
        t = time.time()
        await pg.click(".precheck .btn.primary")
        await pg.wait_for_selector(".results", timeout=600000); await pg.wait_for_timeout(1500)
        print("revisión", round(time.time() - t), "s; banner posterior:", await pg.query_selector(".suggest") is not None)
        print("TALLY:", (await pg.inner_text(".tally")).replace("\n", " "))
        # 3) tinta en detalle
        await pg.click(".fcard:has-text('Exceso de tinta') .fhead"); await pg.wait_for_timeout(500)
        await pg.screenshot(path="shots/91-tac.png")
        await pg.click(".tacdetail .btn.primary")
        t = time.time()
        await pg.wait_for_selector(".tacmsg", timeout=900000)
        print("detalle", round(time.time() - t), "s:", await pg.inner_text(".tacmsg"))
        print("tac:", (await pg.inner_text(".fcard:has-text('Exceso de tinta') .fhead p"))[:300])
        print("TALLY:", (await pg.inner_text(".tally")).replace("\n", " "))
        await pg.screenshot(path="shots/92-tac-hecho.png")
        print("\n".join(logs)[-800:])
        await b.close()
asyncio.run(main())
