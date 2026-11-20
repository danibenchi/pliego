import asyncio
from playwright.async_api import async_playwright
async def gate(pg):
    await pg.goto("http://localhost:8765/index.html"); await pg.wait_for_timeout(500)
    if await pg.query_selector("#code"):
        await pg.fill("#code", "PLIEGO451"); await pg.click("button[type=submit]"); await pg.wait_for_timeout(400)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1500, "height": 940})
        pg = await ctx.new_page(); logs=[]
        pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}")); pg.on("pageerror", lambda e: logs.append(f"PAGEERR {e}"))
        await gate(pg)
        # interior solo, ortografía y capítulos en impar
        await pg.click('button[role=radio]:has-text("Interior") >> nth=0')
        await pg.check('text=Los capítulos empiezan siempre en página impar')
        await pg.screenshot(path="shots/10-setup.png", full_page=True)
        await pg.set_input_files(".drop > input[type=file]", "corpus/libro-v2.pdf")
        await pg.wait_for_selector(".results", timeout=60000); await pg.wait_for_timeout(2500)
        await pg.screenshot(path="shots/11-libro.png")
        titles = await pg.eval_on_selector_all(".fcard h3", "els => els.map(e => e.textContent)")
        print("FINDINGS:", titles)
        # comparar con v1
        await pg.set_input_files(".versions input[type=file]", "corpus/libro-v1.pdf")
        await pg.wait_for_selector(".versions .fcard", timeout=60000); await pg.wait_for_timeout(1500)
        await pg.eval_on_selector(".versions", "e => e.scrollIntoView()")
        await pg.screenshot(path="shots/12-versiones.png")
        print("DIFF:", await pg.eval_on_selector_all(".versions .fcard", "els => els.map(e => e.innerText.replace(/\\n/g,' | '))"))
        await pg.click(".versions .fcard .fhead >> nth=0"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path="shots/13-diffsel.png")
        await pg.click("text=Archivo y libro"); await pg.wait_for_timeout(400)
        await pg.screenshot(path="shots/14-archivo.png")
        await pg.eval_on_selector(".filetab", "e => e.parentElement.scrollTop = 600")
        await pg.screenshot(path="shots/14b-archivo.png")
        # combinado
        await pg.click(".brand"); await pg.wait_for_timeout(400)
        await pg.click('button[role=radio]:has-text("Interior + cubierta")')
        await pg.set_input_files(".drop > input[type=file]", ["corpus/libro-v2.pdf", "corpus/libro-cubierta-mal.pdf"])
        await pg.wait_for_timeout(300)
        await pg.screenshot(path="shots/15-slots.png")
        await pg.click("text=Revisar los dos")
        await pg.wait_for_selector(".results", timeout=90000); await pg.wait_for_timeout(2500)
        await pg.screenshot(path="shots/16-comb-int.png")
        await pg.click('.docswitch button:has-text("Cubierta")'); await pg.wait_for_timeout(2500)
        await pg.screenshot(path="shots/17-comb-cov.png")
        print("COVER:", await pg.eval_on_selector_all(".fcard h3", "els => els.map(e => e.textContent)"))
        await pg.click("text=Archivo y libro"); await pg.wait_for_timeout(400)
        await pg.screenshot(path="shots/18-cov-archivo.png")
        print("\n".join(l for l in logs if "error" in l.lower() or "PAGEERR" in l)[-3000:])
        await b.close()
asyncio.run(main())
