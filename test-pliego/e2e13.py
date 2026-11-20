import asyncio, time, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/index.html"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1500, "height": 940})
        pg = await ctx.new_page(); logs=[]
        pg.on("pageerror", lambda e: logs.append(f"PAGEERR {e}"))
        await pg.goto(URL); await pg.wait_for_timeout(800)
        if await pg.query_selector("#code"):
            await pg.fill("#code", "PLIEGO451"); await pg.click("button[type=submit]"); await pg.wait_for_timeout(400)
        t = time.time()
        await pg.set_input_files(".drop > input[type=file]", "/home/claude/calib/libro.pdf")
        await pg.wait_for_selector(".results", timeout=600000); await pg.wait_for_timeout(1500)
        print("1ª revisión", round(time.time() - t), "s")
        print("SUGERENCIA:", (await pg.inner_text(".suggest")).replace("\n", " | "))
        await pg.screenshot(path="shots/80-sugerencia.png")
        t = time.time()
        await pg.click(".suggest .btn")
        await pg.wait_for_selector(".running", timeout=30000)
        await pg.wait_for_selector(".results", timeout=600000); await pg.wait_for_timeout(1500)
        print("2ª revisión", round(time.time() - t), "s; sugerencia:", await pg.query_selector(".suggest") is not None)
        print("TALLY:", (await pg.inner_text(".tally")).replace("\n", " "))
        await pg.screenshot(path="shots/81-revisado.png")
        print("\n".join(logs)[-800:])
        await b.close()
asyncio.run(main())
