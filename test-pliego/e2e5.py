import asyncio
from playwright.async_api import async_playwright
JS = """async () => {
  const w = new Worker('/assets/worker-XmtXkjbJ.js', {type:'module'});
  const call = (msg, tr=[]) => new Promise((res, rej) => { const h = e => { if (e.data.type==='ready') return; if (e.data.type==='progress') return; w.removeEventListener('message', h); e.data.type==='error' ? rej(e.data.error) : res(e.data.report ?? e.data.out); }; w.addEventListener('message', h); w.postMessage(msg, tr); });
  await new Promise(r => { const h = e => { if (e.data.type==='ready') { w.removeEventListener('message', h); r(); } }; w.addEventListener('message', h); });
  const data = await (await fetch('/t.pdf')).arrayBuffer();
  const rep = await call({type:'analyze', id:1, data, name:'t', profile:{systemId:'offset-estucado',contentId:'infantil',piece:'interior',colorMode:'cmyk',country:'es'}, icc:null, iccName:null}, [data]);
  const res = [];
  const probe = (out) => { const s = out.w/443; const o = (Math.round(420*s)*out.w+Math.round(300*s))*4; return Array.from(out.rgba.slice(o,o+3)); };
  res.push(probe(await call({type:'render', id:2, page:4, scale:0.93, cmyk:true, proof:false})));
  res.push(probe(await call({type:'render', id:3, page:4, scale:0.23, cmyk:false, proof:false})));
  for (let i=0;i<8;i++) await call({type:'render', id:10+i, page:i, scale:0.9, cmyk:true, proof:false});
  res.push(probe(await call({type:'render', id:30, page:4, scale:0.93, cmyk:true, proof:false})));
  return [rep.verdict, rep.color, res];
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page(); logs=[]
        pg.on("console", lambda m: logs.append(m.text))
        await pg.goto("http://localhost:8765/index.html")
        print(await pg.evaluate(JS), logs[-5:])
        await b.close()
asyncio.run(main())
