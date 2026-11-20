import asyncio, sys
from playwright.async_api import async_playwright
PORT = sys.argv[1] if len(sys.argv) > 1 else "8767"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1500, "height": 940}, accept_downloads=True)
        pg = await ctx.new_page(); logs=[]
        pg.on("pageerror", lambda e: logs.append(f"PAGEERR {e}"))
        await pg.goto(f"http://localhost:{PORT}/index.html"); await pg.wait_for_timeout(500)
        if await pg.query_selector("#code"):
            await pg.fill("#code", "PLIEGO451"); await pg.click("button[type=submit]"); await pg.wait_for_timeout(400)
        await pg.set_input_files(".drop > input[type=file]", "corpus/libro-v2.pdf")
        await pg.wait_for_selector(".results", timeout=90000); await pg.wait_for_timeout(2500)
        print("privacy:", (await pg.inner_text(".results .privacy")).replace("\n", " | "))
        await pg.click(".statsline button"); await pg.wait_for_selector(".scope.stats")
        await pg.screenshot(path=f"shots/70-stats-{PORT}.png")
        await pg.click(".scope.stats .switch input"); await pg.wait_for_timeout(200)
        await pg.click(".scope.stats .btn")
        async with pg.expect_download(timeout=60000) as d:
            await pg.click("text=Descargar informe en PDF")
        await (await d.value).save_as("/tmp/x.pdf"); await pg.wait_for_timeout(800)
        print("privacy off:", (await pg.inner_text(".results .privacy")).replace("\n", " | "))
        print("\n".join(logs)[-800:])
        await b.close()
asyncio.run(main())
