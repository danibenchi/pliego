import asyncio, sys
from playwright.async_api import async_playwright
D = "/mnt/user-data/uploads/Downloads/PDFs Dani prueba/"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1500, "height": 940})
        await ctx.route("**/rest/v1/**", lambda r: r.abort())
        pg = await ctx.new_page(); logs=[]
        pg.on("pageerror", lambda e: logs.append(f"PAGEERR {e}"))
        await pg.goto("http://127.0.0.1:4173/"); await pg.wait_for_timeout(800)
        if await pg.query_selector("#code"):
            await pg.fill("#code", "PLIEGO451"); await pg.click("button[type=submit]"); await pg.wait_for_timeout(400)
        await pg.set_input_files(".drop > input[type=file]", D + "Medawar INTERIOR 03.pdf")
        await pg.wait_for_selector(".precheck", timeout=200000)
        print("AVISO2:", (await pg.inner_text(".precheck ul")).replace("\n", " | ")[:600])
        await pg.screenshot(path="shots/97-precheck-medawar.png")
        print("\n".join(logs)[-500:])
        await b.close()
asyncio.run(main())
