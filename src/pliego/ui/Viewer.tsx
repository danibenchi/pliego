import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Report, Finding, PageInfo, Rect } from "../engine/analyze";
import { resolve } from "../engine/profiles";
import type { Engine } from "./client";
import { SevDot } from "./bits";

export interface Paper { stock: string; through: boolean; binding: string }
export interface Layers { marks: boolean; boxes: boolean; tac: boolean; mode: "color" | "plates" | "proof"; plates: [boolean, boolean, boolean, boolean]; spread: boolean; paper?: Paper }
// Papeles para la simulación: tono del papel, si es sin estucar (absorbe y apaga el color) y opacidad
export const STOCKS: { id: string; name: string; tint: [number, number, number]; uncoated: boolean; through: number }[] = [
  { id: "estucado", name: "Estucado brillo o seda", tint: [255, 255, 255], uncoated: false, through: 0.03 },
  { id: "estucado-mate", name: "Estucado mate", tint: [252, 252, 249], uncoated: false, through: 0.035 },
  { id: "obra", name: "Obra blanco 80 g", tint: [250, 249, 244], uncoated: true, through: 0.06 },
  { id: "ahuesado", name: "Ahuesado / crema 80 g", tint: [246, 238, 219], uncoated: true, through: 0.06 },
  { id: "ahuesado90", name: "Ahuesado 90 g", tint: [245, 237, 217], uncoated: true, through: 0.045 },
  { id: "bulky", name: "Bulky editorial 70 g", tint: [244, 239, 226], uncoated: true, through: 0.08 },
  { id: "biblia", name: "Biblia / fino 40 g", tint: [247, 244, 236], uncoated: true, through: 0.17 },
  { id: "reciclado", name: "Reciclado", tint: [236, 233, 223], uncoated: true, through: 0.07 },
];
export const BINDINGS: { id: string; name: string; shadeMm: number; lostMm: number }[] = [
  { id: "fresada", name: "Rústica fresada (pegada)", shadeMm: 9, lostMm: 3 },
  { id: "cosida", name: "Rústica cosida", shadeMm: 7, lostMm: 1.5 },
  { id: "tapadura", name: "Tapa dura cosida", shadeMm: 8, lostMm: 2 },
  { id: "espiral", name: "Espiral o anillado", shadeMm: 0, lostMm: 8 },
  { id: "grapa", name: "Grapa (revista, cuadernillo)", shadeMm: 4, lostMm: 0.5 },
];
export function defaultPaper(report: Report): Paper {
  const sys = report.profile.systemId, pid = report.profile.paperId ?? "";
  const stock = /estucado/.test(pid) || sys === "offset-estucado" ? "estucado" : /ahuesado90/.test(pid) ? "ahuesado90" : /ahuesado/.test(pid) ? "ahuesado" : /bulky/.test(pid) ? "bulky" : "obra";
  return { stock, through: true, binding: report.profile.coverType === "tapadura" ? "tapadura" : "fresada" };
}
const INKS = [[0, 163, 224], [229, 0, 125], [255, 212, 0], [20, 22, 24]];
const PLATE_NAMES = ["C", "M", "Y", "K"];
const MM = 72 / 25.4;

export function Viewer({ engine, report, page, setPage, layers, setLayers, selected, onSelect }: {
  engine: Engine; report: Report; page: number; setPage: (n: number) => void; layers: Layers; setLayers: (l: Layers) => void;
  selected: Finding | null; onSelect: (f: Finding | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const n = report.pages.length;
  const cover = report.profile.piece === "cubierta";
  const spread = layers.spread && !cover && n > 1;
  const pair = useMemo(() => {
    if (!spread) return [page];
    if (page === 0) return [-1, 0];
    const left = page % 2 === 1 ? page : page - 1;
    return [left, left + 1 < n ? left + 1 : -1];
  }, [page, spread, n]);

  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const ref = report.pages[page];
  const pw = (ref.bounds[2] - ref.bounds[0]) * (spread ? 2 : 1), ph = ref.bounds[3] - ref.bounds[1];
  const fit = Math.max(0.1, Math.min((size.w - 64) / pw, (size.h - 64) / ph));
  const z = zoom === "fit" ? fit : zoom;

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,select,textarea")) return;
      const step = spread ? 2 : 1;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); setPage(Math.min(n - 1, page + (spread && page === 0 ? 1 : step))); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); setPage(Math.max(0, page - step)); }
      if (e.key === "t") setLayers({ ...layers, tac: !layers.tac });
      if (e.key === "p") setLayers({ ...layers, mode: layers.mode === "plates" ? "color" : "plates" });
      if (e.key === "s" && report.color.softProof) setLayers({ ...layers, mode: layers.mode === "proof" ? "color" : "proof" });
      if (e.key === "m") setLayers({ ...layers, marks: !layers.marks });
      if (e.key === "c") setLayers({ ...layers, boxes: !layers.boxes });
      if (e.key === "+" || e.key === "=") setZoom(Math.min(8, z * 1.25));
      if (e.key === "-") setZoom(Math.max(0.1, z / 1.25));
      if (e.key === "0") setZoom("fit");
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [page, n, spread, layers, z]);

  const L = (patch: Partial<Layers>) => setLayers({ ...layers, ...patch });
  const tacLimit = resolve(report.profile).system.tac;

  return (
    <section className="viewer" aria-label="Visor de páginas">
      <div className="vbar">
        <div className="grp" role="group" aria-label="Capas">
          <Toggle on={layers.marks} onClick={() => L({ marks: !layers.marks })} label="Problemas" k="M" />
          <Toggle on={layers.boxes} onClick={() => L({ boxes: !layers.boxes })} label="Cajas" k="C" />
          <Toggle on={layers.tac} onClick={() => L({ tac: !layers.tac })} label="Tinta total" k="T" />
          <Toggle on={layers.mode === "plates"} onClick={() => L({ mode: layers.mode === "plates" ? "color" : "plates" })} label="Planchas" k="P" />
          {report.color.softProof && <Toggle on={layers.mode === "proof"} onClick={() => L({ mode: layers.mode === "proof" ? "color" : "proof" })} label="Simular papel" k="S" />}
          {!cover && n > 1 && <Toggle on={layers.spread} onClick={() => L({ spread: !layers.spread })} label="Doble página" />}
        </div>
        {layers.mode === "plates" && (
          <div className="grp plates" role="group" aria-label="Planchas visibles">
            {PLATE_NAMES.map((p, i) => (
              <button key={p} className={"plate p" + p + (layers.plates[i] ? " on" : "")} aria-pressed={layers.plates[i]}
                onClick={() => { const pl = [...layers.plates] as Layers["plates"]; pl[i] = !pl[i]; L({ plates: pl }); }}
                onDoubleClick={() => L({ plates: [0, 1, 2, 3].map(j => j === i) as Layers["plates"] })} title="Doble clic: ver solo esta plancha">{p}</button>
            ))}
          </div>
        )}
        {layers.mode === "proof" && !cover && (
          <div className="grp paper" role="group" aria-label="Papel simulado">
            <select value={(layers.paper ?? defaultPaper(report)).stock} onChange={e => L({ paper: { ...(layers.paper ?? defaultPaper(report)), stock: e.target.value } })} aria-label="Papel">
              {STOCKS.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
            <select value={(layers.paper ?? defaultPaper(report)).binding} onChange={e => L({ paper: { ...(layers.paper ?? defaultPaper(report)), binding: e.target.value } })} aria-label="Encuadernación">
              {BINDINGS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button className={"tg" + ((layers.paper ?? defaultPaper(report)).through ? " on" : "")} onClick={() => { const pp = layers.paper ?? defaultPaper(report); L({ paper: { ...pp, through: !pp.through } }); }} title="Lo que se ve de la página de atrás"><i />Transparencia</button>
          </div>
        )}
        <div className="grp zoom" role="group" aria-label="Zoom">
          <button onClick={() => setZoom(Math.max(0.1, z / 1.25))} aria-label="Alejar">−</button>
          <button className="pct" onClick={() => setZoom("fit")} title="Ajustar a la ventana (0)">{zoom === "fit" ? "Ajustar" : `${Math.round(z / (96 / 72) * 100)} %`}</button>
          <button onClick={() => setZoom(Math.min(8, z * 1.25))} aria-label="Acercar">+</button>
        </div>
      </div>

      <div className="stage" ref={box}>
        <div className="spread" style={{ gap: spread ? 0 : undefined }}>
          {pair.map((p, k) => p < 0
            ? <div key={"e" + k} className="ghost" style={{ width: (ref.bounds[2] - ref.bounds[0]) * z, height: ph * z }} />
            : <PageCanvas key={p} engine={engine} report={report} info={report.pages[p]} z={z} layers={layers} tacLimit={tacLimit}
                selected={selected} onSelect={onSelect} side={spread ? (k === 0 ? "left" : "right") : "single"} onFocus={() => setPage(p)} />)}
        </div>
        <div className="pager">
          <button onClick={() => setPage(Math.max(0, page - (spread ? 2 : 1)))} disabled={page === 0} aria-label="Página anterior">‹</button>
          <span>{spread && pair.filter(p => p >= 0).length === 2 ? `Págs. ${pair[0] + 1}–${pair[1] + 1}` : `Pág. ${page + 1}`} <em>de {n}</em></span>
          <button onClick={() => setPage(Math.min(n - 1, page + (spread ? (page === 0 ? 1 : 2) : 1)))} disabled={page >= n - 1} aria-label="Página siguiente">›</button>
        </div>
      </div>

      {n > 1 && <Thumbs engine={engine} report={report} page={page} setPage={setPage} />}
    </section>
  );
}

function Toggle({ on, onClick, label, k }: { on: boolean; onClick: () => void; label: string; k?: string }) {
  return <button className={"tg" + (on ? " on" : "")} aria-pressed={on} onClick={onClick} title={k ? `Atajo: ${k}` : undefined}><i />{label}</button>;
}

function PageCanvas({ engine, report, info, z, layers, tacLimit, selected, onSelect, side, onFocus }: {
  engine: Engine; report: Report; info: PageInfo; z: number; layers: Layers; tacLimit: number;
  selected: Finding | null; onSelect: (f: Finding | null) => void; side: "left" | "right" | "single"; onFocus: () => void;
}) {
  const base = useRef<HTMLCanvasElement>(null);
  const heat = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<{ w: number; h: number; rgba: Uint8ClampedArray; cmyk?: Uint8ClampedArray; proof?: Uint8ClampedArray; z: number } | null>(null);
  const [probe, setProbe] = useState<{ x: number; y: number; v: number[] } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [back, setBack] = useState<{ w: number; h: number; rgba: Uint8ClampedArray; z: number } | null>(null);
  const isCoverPiece = report.profile.piece === "cubierta";
  const paper = layers.paper ?? defaultPaper(report);
  const stock = STOCKS.find(x => x.id === paper.stock) ?? STOCKS[2];
  const backIndex = isCoverPiece ? -1 : info.index % 2 === 0 ? info.index + 1 : info.index - 1;
  const b = info.bounds;
  const W = (b[2] - b[0]) * z, H = (b[3] - b[1]) * z;

  // render con retardo para no saturar al hacer zoom
  useEffect(() => {
    let alive = true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let scale = z * dpr;
    const maxPx = 14e6, area = (b[2] - b[0]) * (b[3] - b[1]);
    if (area * scale * scale > maxPx) scale = Math.sqrt(maxPx / area);
    const t = setTimeout(() => {
      engine.render(info.index, scale, true, 9, layers.mode === "proof", report.key).then(out => { if (alive) setData({ w: out.w, h: out.h, rgba: out.rgba, cmyk: out.cmyk, proof: out.proof, z }); }).catch(() => {});
    }, data ? 120 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [info.index, Math.round(z * 100), layers.mode === "proof"]);

  // página del dorso de la hoja, para la transparencia del papel
  useEffect(() => {
    if (layers.mode !== "proof" || !paper.through || backIndex < 0 || backIndex >= report.pages.length || !data) { setBack(null); return; }
    let alive = true;
    const scale = data.w / ((b[2] - b[0]));
    engine.render(backIndex, scale, false, 7, false, report.key).then(out => { if (alive) setBack({ w: out.w, h: out.h, rgba: out.rgba, z: data.z }); }).catch(() => {});
    return () => { alive = false; };
  }, [layers.mode, paper.through, backIndex, data?.w]);

  useEffect(() => {
    const c = base.current; if (!c || !data) return;
    c.width = data.w; c.height = data.h;
    const ctx = c.getContext("2d")!;
    let img: ImageData;
    if (layers.mode === "plates" && data.cmyk) {
      const out = new Uint8ClampedArray(data.w * data.h * 4), cm = data.cmyk, on = layers.plates;
      for (let i = 0; i < out.length; i += 4) {
        let r = 1, g = 1, bl = 1;
        for (let k = 0; k < 4; k++) if (on[k]) { const a = cm[i + k] / 255; r *= 1 - a + a * INKS[k][0] / 255; g *= 1 - a + a * INKS[k][1] / 255; bl *= 1 - a + a * INKS[k][2] / 255; }
        out[i] = r * 255; out[i + 1] = g * 255; out[i + 2] = bl * 255; out[i + 3] = 255;
      }
      img = new ImageData(out, data.w, data.h);
    } else if (layers.mode === "proof" && data.proof) {
      const out = new Uint8ClampedArray(data.proof);
      const [tr, tg, tb] = stock.tint, op = paper.through && back && !isCoverPiece ? stock.through : 0;
      const W = data.w, H = data.h, bw = back?.w ?? 0, bh = back?.h ?? 0, br = back?.rgba;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let r = out[i], g = out[i + 1], bl = out[i + 2];
        if (stock.uncoated) {
          // papel sin estucar: la tinta se abre (más ganancia de punto) y el color pierde saturación
          const l = 0.3 * r + 0.59 * g + 0.11 * bl;
          r = l + (r - l) * 0.86; g = l + (g - l) * 0.86; bl = l + (bl - l) * 0.86;
          r = 255 * Math.pow(r / 255, 1.12); g = 255 * Math.pow(g / 255, 1.12); bl = 255 * Math.pow(bl / 255, 1.12);
        }
        r = r * tr / 255; g = g * tg / 255; bl = bl * tb / 255;
        if (op && br) {
          const xx = W - 1 - x; // el dorso se ve espejado
          if (xx < bw && y < bh) { const j = (y * bw + xx) * 4; const d = 1 - op * (1 - (0.3 * br[j] + 0.59 * br[j + 1] + 0.11 * br[j + 2]) / 255); r *= d; g *= d; bl *= d; }
        }
        out[i] = r; out[i + 1] = g; out[i + 2] = bl;
      }
      img = new ImageData(out, data.w, data.h);
    }
    else img = new ImageData(new Uint8ClampedArray(data.rgba), data.w, data.h);
    ctx.putImageData(img, 0, 0);
  }, [data, layers.mode, layers.plates.join(), back, paper.stock, paper.through]);
  const proofNote = layers.mode === "proof" ? report.color.name : null;

  useEffect(() => {
    const c = heat.current; if (!c || !data?.cmyk) return;
    c.width = data.w; c.height = data.h;
    const ctx = c.getContext("2d")!;
    if (!layers.tac) { ctx.clearRect(0, 0, c.width, c.height); return; }
    const out = new Uint8ClampedArray(data.w * data.h * 4), cm = data.cmyk, lim = tacLimit * 2.55;
    for (let i = 0; i < out.length; i += 4) {
      const s = cm[i] + cm[i + 1] + cm[i + 2] + cm[i + 3];
      if (s > lim) { out[i] = 236; out[i + 1] = 18; out[i + 2] = 64; out[i + 3] = 225; }
      else if (s > 510) { const t = (s - 510) / Math.max(1, lim - 510); out[i] = 255; out[i + 1] = 196 - 70 * t; out[i + 2] = 0; out[i + 3] = 60 + 120 * t; }
    }
    ctx.putImageData(new ImageData(out, data.w, data.h), 0, 0);
  }, [data, layers.tac, tacLimit]);

  const marks = useMemo(() => {
    const out: { f: Finding; r: Rect; label: string }[] = [];
    const seen = new Set<string>();
    for (const f of report.findings) for (const m of f.marks) {
      if (m.page !== info.index) continue;
      const k = f.id + m.rect.map(v => Math.round(v)).join(",");
      if (seen.has(k)) continue; seen.add(k);
      out.push({ f, r: m.rect, label: m.label });
    }
    // los más chicos arriba, para que se puedan señalar
    return out.sort((a, b) => (b.r[2] - b.r[0]) * (b.r[3] - b.r[1]) - (a.r[2] - a.r[0]) * (a.r[3] - a.r[1]));
  }, [report, info.index]);

  const move = (e: React.MouseEvent) => {
    if (!data?.cmyk) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
    const x = Math.floor(fx * data.w), y = Math.floor(fy * data.h);
    if (x < 0 || y < 0 || x >= data.w || y >= data.h) return setProbe(null);
    const i = (y * data.w + x) * 4;
    setProbe({ x: e.clientX - rect.left, y: e.clientY - rect.top, v: [0, 1, 2, 3].map(k => Math.round(data.cmyk![i + k] / 2.55)) });
  };

  const { content } = resolve(report.profile);
  const t = info.trim, bl = info.bleed;
  const safe = content.safetyMm * MM, gut = content.gutterMm * MM;
  const recto = info.index % 2 === 0;
  const isCover = report.profile.piece === "cubierta";
  const geo = report.coverGeo;
  const folds = geo ? geo.folds.map(v => geo.x0 + v * MM) : [];
  const hfolds = geo ? geo.hfolds.map(v => geo.y0 + v * MM) : [];
  const fs = 10.5 / z;

  return (
    <div className={"pagebox " + side} style={{ width: W, height: H, ...spreadClip(side, b, info.trim, z) }} onMouseMove={move} onMouseLeave={() => { setProbe(null); setHover(null); }} onClick={onFocus}>
      <canvas ref={base} style={{ width: W, height: H }} className={(data ? "in" : "") + (layers.tac ? " dimmed" : "")} />
      <canvas ref={heat} style={{ width: W, height: H }} className="heat" />
      {!data && <div className="loading"><span /></div>}
      {proofNote && <div className="proofnote">Simulación con {proofNote} · {stock.name}</div>}
      {layers.mode === "proof" && !isCoverPiece && report.pages.length > 1 && (() => {
        const bd = BINDINGS.find(x => x.id === paper.binding) ?? BINDINGS[0];
        const left = info.index % 2 === 0; // página impar: el lomo queda a la izquierda
        const sx = (left ? info.trim[0] - b[0] : b[2] - info.trim[2]) * z;
        return <div className={"gutterSim " + (left ? "l" : "r")} style={{ [left ? "left" : "right"]: sx, width: Math.max(bd.shadeMm, bd.lostMm) * MM * z, ["--lost" as any]: `${bd.lostMm * MM * z}px` }} title={`${bd.name}: se pierden unos ${String(bd.lostMm).replace(".", ",")} mm en el lomo`} />;
      })()}
      <svg className="ov" viewBox={`${b[0]} ${b[1]} ${b[2] - b[0]} ${b[3] - b[1]}`} preserveAspectRatio="none" style={{ width: W, height: H }}>
        {layers.boxes && <g className="boxes" vectorEffect="non-scaling-stroke">
          {(bl[0] < t[0] || bl[2] > t[2]) && <rect x={bl[0]} y={bl[1]} width={bl[2] - bl[0]} height={bl[3] - bl[1]} className="bleed" />}
          <rect x={t[0]} y={t[1]} width={t[2] - t[0]} height={t[3] - t[1]} className="trim" />
          <rect x={t[0] + safe} y={t[1] + safe} width={Math.max(0, t[2] - t[0] - 2 * safe)} height={Math.max(0, t[3] - t[1] - 2 * safe)} className="safe" />
          {!isCover && report.pages.length > 1 && <rect x={recto ? t[0] : t[2] - gut} y={t[1]} width={gut} height={t[3] - t[1]} className="gutter" />}
          {folds.map((x, k) => <line key={k} x1={x} x2={x} y1={bl[1]} y2={bl[3]} className="fold" />)}
          {hfolds.map((y, k) => <line key={"h" + k} x1={bl[0]} x2={bl[2]} y1={y} y2={y} className="fold" />)}
          {geo && geo.panels.map((pn, k) => (pn.x1 - pn.x0) * MM * z > 40 && <text key={"p" + k} x={geo.x0 + ((pn.x0 + pn.x1) / 2) * MM} y={t[1] + fs * 1.6} fontSize={fs} className="panel">{pn.name}</text>)}
        </g>}
        {layers.marks && marks.map((m, k) => {
          const on = selected ? selected.id === m.f.id : true;
          return (
            <rect key={k} x={m.r[0] - 2} y={m.r[1] - 2} width={m.r[2] - m.r[0] + 4} height={m.r[3] - m.r[1] + 4}
              className={"mk " + m.f.sev + (selected && on ? " sel" : "") + (selected && !on ? " dim" : "")}
              onMouseEnter={() => setHover(m.label)} onMouseLeave={() => setHover(null)}
              onClick={e => { e.stopPropagation(); onSelect(m.f); }} />
          );
        })}
      </svg>
      {probe && (
        <div className="probe" style={{ left: probe.x + 16, top: probe.y + 16 }}>
          {hover && <div className="pl">{hover}</div>}
          <div className="dens">
            {probe.v.map((v, k) => <span key={k} className={"p" + PLATE_NAMES[k]}>{PLATE_NAMES[k]} {v}</span>)}
            <b className={probe.v.reduce((a, c) => a + c, 0) > tacLimit ? "over" : ""}>{probe.v.reduce((a, c) => a + c, 0)} %</b>
          </div>
        </div>
      )}
    </div>
  );
}

// En doble página, las dos páginas se tocan en el corte: se oculta el sangrado del lado del lomo.
function spreadClip(side: string, b: Rect, t: Rect, z: number): React.CSSProperties {
  if (side === "left") { const d = Math.max(0, b[2] - t[2]) * z; return { clipPath: `inset(0 ${d}px 0 0)`, marginRight: -d }; }
  if (side === "right") { const d = Math.max(0, t[0] - b[0]) * z; return { clipPath: `inset(0 0 0 ${d}px)`, marginLeft: -d }; }
  return {};
}

function Thumbs({ engine, report, page, setPage }: { engine: Engine; report: Report; page: number; setPage: (n: number) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = strip.current?.querySelector(`[data-i="${page}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [page]);
  return (
    <div className="thumbs" ref={strip} role="listbox" aria-label="Páginas">
      {report.pages.map(p => <Thumb key={p.index} engine={engine} p={p} active={p.index === page} onClick={() => setPage(p.index)} root={strip} docKey={report.key} />)}
    </div>
  );
}

function Thumb({ engine, p, active, onClick, root, docKey }: { engine: Engine; p: PageInfo; active: boolean; onClick: () => void; root: React.RefObject<HTMLDivElement>; docKey: string }) {
  const c = useRef<HTMLCanvasElement>(null);
  const done = useRef(false);
  const h = 76, w = Math.max(24, h * (p.bounds[2] - p.bounds[0]) / (p.bounds[3] - p.bounds[1]));
  useEffect(() => {
    const el = c.current; if (!el) return;
    const io = new IntersectionObserver(es => {
      if (!es[0].isIntersecting || done.current) return;
      done.current = true;
      const scale = (h * 2) / (p.bounds[3] - p.bounds[1]);
      engine.render(p.index, scale, false, 1, false, docKey).then(out => {
        el.width = out.w; el.height = out.h;
        el.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(out.rgba), out.w, out.h), 0, 0);
        el.classList.add("in");
      }).catch(() => { done.current = false; });
    }, { root: root.current, rootMargin: "300px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  return (
    <button className={"thumb" + (active ? " on" : "")} data-i={p.index} onClick={onClick} role="option" aria-selected={active} aria-label={`Página ${p.index + 1}`}>
      <canvas ref={c} style={{ width: w, height: h }} />
      <span>{p.status !== "ok" && <SevDot sev={p.status} />}{p.index + 1}</span>
    </button>
  );
}
