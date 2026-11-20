import asyncio
from playwright.async_api import async_playwright
async def gate(pg):
    await pg.goto("http://localhost:8765/index.html"); await pg.wait_for_timeout(500)
    if await pg.query_selector("#code"):
        await pg.fill("#code", "PLIEGO451"); await pg.click("button[type=submit]"); await pg.wait_for_timeout(400)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1500, "height": 940}, accept_downloads=True)
        pg = await ctx.new_page(); logs=[]
        pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}")); pg.on("pageerror", lambda e: logs.append(f"PAGEERR {e}"))
        await gate(pg)
        await pg.screenshot(path="shots/40-setup.png")
        # abrir valores de imprenta y guardar una
        await pg.click("details.more >> nth=0 >> summary")
        await pg.fill('label:has-text("Sangrado (mm)") input', "5")
        await pg.fill('label:has-text("Tinta máxima") input', "260")
        await pg.click("text=Guardar como mi imprenta")
        await pg.fill(".savename input", "Imprenta Romanyà")
        await pg.click(".savename button.primary"); await pg.wait_for_timeout(300)
        await pg.screenshot(path="shots/41-imprenta.png", full_page=True)
        # cubierta sola: pide datos
        await pg.set_input_files(".drop > input[type=file]", "corpus/libro-cubierta.pdf")
        await pg.wait_for_selector(".coverneed", timeout=20000)
        await pg.screenshot(path="shots/42-coverneed.png")
        await pg.select_option(".coverneed select", "140x210")
        await pg.fill('.coverneed input[placeholder="240"]', "30")
        await pg.click("text=Revisar la cubierta")
        await pg.wait_for_selector(".results", timeout=60000); await pg.wait_for_timeout(1200)
        await pg.screenshot(path="shots/43-cover.png")
        # interior + cubierta juntos, autodetectados
        await pg.click(".brand"); await pg.wait_for_timeout(300)
        await pg.set_input_files(".drop > input[type=file]", ["corpus/libro-v2.pdf", "corpus/libro-cubierta-mal.pdf"])
        await pg.wait_for_selector(".docswitch", timeout=90000); await pg.wait_for_timeout(1500)
        await pg.screenshot(path="shots/44-auto-both.png")
        print("TODO:", await pg.eval_on_selector_all(".todo li", "els => els.map(e => e.textContent)"))
        print("\n".join(l for l in logs if "rror" in l or "PAGEERR" in l)[-2000:])
        await b.close()
asyncio.run(main())
