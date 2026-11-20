import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1500, "height": 940}, accept_downloads=True)
        pg = await ctx.new_page(); logs=[]
        pg.on("pageerror", lambda e: logs.append(f"PAGEERR {e}"))
        await pg.goto("http://localhost:8765/index.html"); await pg.wait_for_timeout(500)
        if await pg.query_selector("#code"):
            await pg.fill("#code", "PLIEGO451"); await pg.click("button[type=submit]"); await pg.wait_for_timeout(400)
        await pg.click(".scopelink"); await pg.wait_for_selector(".scope")
        await pg.screenshot(path="shots/50-scope.png")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
        print("closed:", await pg.query_selector(".scope") is None)
        await pg.set_input_files(".drop > input[type=file]", "corpus/libro-v2.pdf")
        await pg.wait_for_selector(".results", timeout=90000); await pg.wait_for_timeout(1500)
        await pg.screenshot(path="shots/51-results.png")
        await pg.click(".scopeinline"); await pg.wait_for_selector(".scope")
        await pg.click(".scope .btn"); await pg.wait_for_timeout(200)
        async with pg.expect_download(timeout=60000) as d:
            await pg.click("text=Descargar informe en PDF")
        dl = await d.value; await dl.save_as("shots/informe.pdf"); print("pdf ok")
        print("\n".join(logs)[-1500:])
        await b.close()
asyncio.run(main())
