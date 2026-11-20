import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1500, "height": 920}, device_scale_factor=1)
        logs = []
        pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
        pg.on("pageerror", lambda e: logs.append(f"PAGEERR {e}"))
        await pg.goto("http://localhost:8765/index.html")
        await pg.wait_for_timeout(800)
        await pg.screenshot(path="shots/0-gate.png")
        await pg.fill("#code", "pliego-451")
        await pg.click("button[type=submit]")
        await pg.wait_for_timeout(600)
        await pg.screenshot(path="shots/1-setup.png")
        await pg.set_input_files("input[type=file]", "corpus/interior-con-errores.pdf")
        await pg.wait_for_selector(".results", timeout=30000)
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path="shots/2-results.png")
        cards = await pg.query_selector_all(".fcard .fhead")
        await cards[0].click(); await pg.wait_for_timeout(1500)
        await pg.screenshot(path="shots/3-finding.png")
        # tac
        for c in await pg.query_selector_all(".fcard .fhead"):
            t = await c.inner_text()
            if "tinta" in t.lower() and "Exceso" in t: await c.click(); break
        await pg.wait_for_timeout(1500)
        await pg.mouse.move(800, 300); await pg.wait_for_timeout(300)
        await pg.screenshot(path="shots/4-tac.png")
        await pg.keyboard.press("p"); await pg.wait_for_timeout(1200)
        await pg.screenshot(path="shots/5-plates.png")
        print("\n".join(logs[-20:]))
        await b.close()
asyncio.run(main())
