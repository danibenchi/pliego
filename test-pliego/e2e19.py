import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1500, "height": 940}, accept_downloads=True)
        await ctx.route("**/rest/v1/**", lambda r: r.abort())
        pg = await ctx.new_page(); logs=[]
        pg.on("pageerror", lambda e: logs.append(f"PAGEERR {e}"))
        await pg.goto("http://127.0.0.1:4173/"); await pg.wait_for_timeout(1000)
        await pg.screenshot(path="shots/98-gate-logo.png")
        await pg.fill("#code", "PLIEGO451"); await pg.click("button[type=submit]"); await pg.wait_for_timeout(500)
        await pg.set_input_files(".drop > input[type=file]", "/home/claude/preflight/corpus/libro-v2.pdf")
        await pg.wait_for_selector(".results", timeout=120000); await pg.wait_for_timeout(800)
        await pg.screenshot(path="shots/99-header-logo.png", clip={"x":0,"y":0,"width":1500,"height":90})
        async with pg.expect_download(timeout=60000) as d:
            await pg.click("text=Descargar informe en PDF")
        dl = await d.value; await dl.save_as("/tmp/informe.pdf"); print("pdf ok")
        print("\n".join(logs))
        await b.close()
asyncio.run(main())
