import asyncio, time
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1500, "height": 940})
        pg = await ctx.new_page(); logs=[]
        pg.on("pageerror", lambda e: logs.append(f"PAGEERR {e}")); pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        await pg.goto("http://localhost:8765/index.html"); await pg.wait_for_timeout(500)
        if await pg.query_selector("#code"):
            await pg.fill("#code", "PLIEGO451"); await pg.click("button[type=submit]"); await pg.wait_for_timeout(400)
        await pg.wait_for_function("document.body.innerText.includes('listo') || document.body.innerText.includes('Listo')", timeout=30000)
        await pg.set_input_files(".drop > input[type=file]", "corpus/pesado/enorme-891mb.pdf")
        await pg.wait_for_selector(".err", timeout=60000)
        print("ERR:", await pg.inner_text(".err"))
        await pg.screenshot(path="shots/60-limite.png")
        t = time.time()
        await pg.set_input_files(".drop > input[type=file]", "corpus/pesado/ilustrado-160p.pdf")
        await pg.wait_for_selector(".running", timeout=60000); await pg.wait_for_timeout(4000)
        await pg.screenshot(path="shots/61-pesado-run.png")
        await pg.wait_for_selector(".results", timeout=600000); await pg.wait_for_timeout(2000)
        print("tiempo", round(time.time() - t), "s")
        await pg.screenshot(path="shots/62-pesado-results.png")
        txt = await pg.inner_text(".results")
        print("lightMode" , "Revisión adaptada" in txt or "notas para saber" in txt)
        # navegar páginas del visor
        for _ in range(3): await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(700)
        await pg.screenshot(path="shots/63-pesado-visor.png")
        print("\n".join(logs)[-1500:])
        await b.close()
asyncio.run(main())
