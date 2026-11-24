# Referencias: guardar un libro como referencia de imprenta y colección, y revisar otros contra ella.
import asyncio
from playwright.async_api import async_playwright
D = "/mnt/user-data/uploads/Downloads/PDFs Dani prueba/"
async def drop(pg, *files):
    await pg.set_input_files(".drop > input[type=file]", [D + f for f in files])
    for _ in range(240):
        if await pg.locator(".results").count(): break
        if await pg.locator(".precheck").count():
            await pg.click("text=Revisar con mi perfil como está")
        await pg.wait_for_timeout(500)
    await pg.wait_for_timeout(800)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1500, "height": 940})
        await ctx.route("**/rest/v1/**", lambda r: r.abort())
        pg = await ctx.new_page(); logs = []
        pg.on("pageerror", lambda e: logs.append(f"PAGEERR {e}"))
        await pg.goto("http://127.0.0.1:4173/"); await pg.wait_for_timeout(1000)
        await pg.fill("#code", "PLIEGO451"); await pg.click("button[type=submit]"); await pg.wait_for_timeout(600)
        await pg.screenshot(path="shots/r0-setup.png")
        # 1) libro de referencia: interior + cubierta
        await drop(pg, "La_espera_amorosa_interior_10-2026.pdf", "LA_ESPERA_AMOROSA_cubiertas_10-2026.pdf")
        await pg.screenshot(path="shots/r1-results.png")
        await pg.click("text=Guardar como referencia"); await pg.wait_for_timeout(400)
        await pg.fill(".refkind >> nth=0 >> input[list]", "Gráfica del Sur")
        await pg.fill(".refkind >> nth=1 >> input[list]", "Ensayo")
        await pg.screenshot(path="shots/r2-dialog.png", full_page=False)
        warn = await pg.locator(".refwarn input[type=checkbox]").count()
        if warn: await pg.check(".refwarn input[type=checkbox]")
        await pg.click(".refsave >> text=Guardar referencia"); await pg.wait_for_timeout(600)
        print("toast:", await pg.locator(".toast").inner_text())
        await pg.screenshot(path="shots/r3-saved.png")
        # 2) otro libro de la colección
        await pg.click("text=Otro PDF"); await pg.wait_for_timeout(500)
        await pg.screenshot(path="shots/r4-setup-refs.png")
        await drop(pg, "john_berger_interior_09-2026.pdf", "john_berger_cubiertas_09-2026_ok.pdf")
        await pg.screenshot(path="shots/r5-berger.png")
        print("berger interior:", await pg.locator(".fcard:has-text('Distinto de')").all_inner_texts())
        await pg.click(".tally button:nth-child(4)"); await pg.wait_for_timeout(300)
        print("berger superados con referencia:", [t for t in await pg.locator(".passed li").all_inner_texts() if "Referencia" in t])
        await pg.click(".docswitch button:has-text('Cubierta')"); await pg.wait_for_timeout(600)
        await pg.click(".tally button:nth-child(4)"); await pg.wait_for_timeout(300)
        print("berger cubierta:", await pg.locator(".fcard:has-text('Distinto de')").all_inner_texts(), [t for t in await pg.locator(".passed li").all_inner_texts() if "Referencia" in t])
        await pg.click(".docswitch button:has-text('Interior')"); await pg.wait_for_timeout(400)
        # 3) un libro de otra colección e imprenta
        await pg.click("text=Otro PDF"); await pg.wait_for_timeout(500)
        await drop(pg, "Podemos_ interior_10-2026.pdf", "Podemos_cubiertas_10-2026.pdf")
        await pg.click(".docswitch button:has-text('Cubierta')"); await pg.wait_for_timeout(600)
        await pg.screenshot(path="shots/r6-podemos-cover.png")
        cards = pg.locator(".fcard:has-text('Distinto de')")
        print("podemos cubierta:", await cards.all_inner_texts())
        if await cards.count():
            await cards.first.locator(".fhead").click(); await pg.wait_for_timeout(500)
            await pg.screenshot(path="shots/r7-podemos-open.png")
        print("\n".join(logs))
        await b.close()
asyncio.run(main())
