// Intérprete del flujo de contenido de una página. MuPDF no simula la sobreimpresión ni la
// expone por el dispositivo de dibujo, así que la seguimos acá: estado gráfico (sobreimpresión
// de relleno y de trazo, espacio y valor de color, matriz de transformación) y la caja
// aproximada de cada objeto pintado, en coordenadas de página (origen arriba a la izquierda).

type Obj = any; // PDFObject de mupdf
type M = [number, number, number, number, number, number];
export type Box = [number, number, number, number];

export interface PaintEvent {
  kind: "fill" | "stroke" | "text";
  rect: Box | null;
  op: boolean;            // sobreimpresión activa para este tipo de pintura
  cs: string;             // Gray | RGB | CMYK | Sep:NOMBRE | DeviceN | Lab | Other
  color: number[];
  size?: number;          // cuerpo aproximado (texto)
}

interface GState {
  ctm: M; opF: boolean; opS: boolean;
  csF: string; csS: string; fill: number[]; stroke: number[];
  tr: number; font: string; fsize: number; tl: number; tz: number;
}

const FILL_OPS = new Set(["f", "F", "f*", "B", "B*", "b", "b*"]);
const STROKE_OPS = new Set(["S", "s", "B", "B*", "b", "b*"]);
const TEXT_OPS = new Set(["Tj", "TJ", "'", '"']);
const mul = (a: M, b: M): M => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
const tp = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function* tokens(s: string): Generator<string> {
  const n = s.length;
  let i = 0;
  const ws = (c: string) => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0";
  const delim = (c: string) => "()<>[]{}/%".includes(c);
  while (i < n) {
    const c = s[i];
    if (ws(c)) { i++; continue; }
    if (c === "%") { while (i < n && s[i] !== "\n" && s[i] !== "\r") i++; continue; }
    if (c === "(") {
      let depth = 1, len = 0; i++;
      while (i < n && depth > 0) { const d = s[i]; if (d === "\\") { i++; len++; } else if (d === "(") depth++; else if (d === ")") depth--; if (depth > 0) len++; i++; }
      yield "(str:" + len; continue;
    }
    if (c === "<") {
      if (s[i + 1] === "<") { i += 2; yield "<<"; continue; }
      const j = s.indexOf(">", i); const len = Math.max(0, Math.floor((j - i - 1) / 2)); i = j < 0 ? n : j + 1; yield "(str:" + len; continue;
    }
    if (c === ">" && s[i + 1] === ">") { i += 2; yield ">>"; continue; }
    if (c === "[" || c === "]" || c === "{" || c === "}") { i++; yield c; continue; }
    let j = i + 1;
    while (j < n && !ws(s[j]) && !delim(s[j])) j++;
    const t = s.slice(i, j);
    i = j;
    if (t === "BI") { const k = s.indexOf("EI", s.indexOf("ID", i)); i = k < 0 ? n : k + 2; continue; }
    yield t;
  }
}

export interface ScanResult {
  events: PaintEvent[];
  overprintUsed: boolean;
  usedFonts: Set<string>;
}

export function scanContent(contents: string[], resources: Obj, pageMatrix: M, readForm: (xobj: Obj) => string | null,
  depth = 0, inherited?: GState, out: ScanResult = { events: [], overprintUsed: false, usedFonts: new Set() }): ScanResult {
  let st: GState = inherited ? { ...inherited, fill: [...inherited.fill], stroke: [...inherited.stroke] }
    : { ctm: pageMatrix, opF: false, opS: false, csF: "Gray", csS: "Gray", fill: [0], stroke: [0], tr: 0, font: "", fsize: 12, tl: 0, tz: 1 };
  const stack: GState[] = [];
  let ops: string[] = [];
  let path: Box | null = null;
  let cx = 0, cy = 0;
  let tm: M = [1, 0, 0, 1, 0, 0], tlm: M = [1, 0, 0, 1, 0, 0];
  const get = (dictName: string, key: string) => {
    try { const d = resources?.get(dictName); if (!d || d.isNull()) return null; const v = d.get(key); return v && !v.isNull() ? v : null; } catch { return null; }
  };
  const csName = (name: string) => {
    if (name === "DeviceGray" || name === "CalGray" || name === "G") return "Gray";
    if (name === "DeviceRGB" || name === "CalRGB" || name === "RGB") return "RGB";
    if (name === "DeviceCMYK" || name === "CMYK") return "CMYK";
    if (name === "Pattern") return "Pattern";
    const r = get("ColorSpace", name);
    if (r) {
      const first = r.isArray() ? r.get(0).asName() : r.isName() ? r.asName() : "";
      if (first === "ICCBased") { const nComp = r.get(1).get("N").asNumber(); return nComp === 4 ? "CMYK" : nComp === 3 ? "RGB" : "Gray"; }
      if (first === "Separation") { try { return "Sep:" + r.get(1).asName(); } catch { return "Sep:?"; } }
      if (first === "DeviceN") return "DeviceN";
      if (first === "Lab") return "Lab";
      if (first === "DeviceCMYK") return "CMYK";
      if (first === "DeviceRGB") return "RGB";
      if (first === "DeviceGray") return "Gray";
      if (first === "Pattern") return "Pattern";
      return first || "Other";
    }
    return "Other";
  };
  const grow = (x: number, y: number) => {
    const [X, Y] = tp(st.ctm, x, y);
    path = path ? [Math.min(path[0], X), Math.min(path[1], Y), Math.max(path[2], X), Math.max(path[3], Y)] : [X, Y, X, Y];
  };
  const nums = () => ops.filter(o => o[0] !== "/" && o[0] !== "(" && o !== "[" && o !== "]").map(parseFloat);
  const emitText = (chars: number) => {
    const sz = st.fsize;
    const m = mul(tm, st.ctm);
    const w = Math.max(1, chars) * sz * 0.5 * st.tz;
    let r: Box | null = null;
    for (const [x, y] of [[0, -0.22 * sz], [w, -0.22 * sz], [0, 0.78 * sz], [w, 0.78 * sz]]) {
      const [X, Y] = tp(m, x, y);
      r = r ? [Math.min(r[0], X), Math.min(r[1], Y), Math.max(r[2], X), Math.max(r[3], Y)] : [X, Y, X, Y];
    }
    const scale = Math.hypot(m[2], m[3]);
    if (st.tr % 4 === 0 || st.tr % 4 === 2) out.events.push({ kind: "text", rect: r, op: st.opF, cs: st.csF, color: [...st.fill], size: scale * sz });
    tm = mul([1, 0, 0, 1, w, 0], tm);
    if (st.font) {
      const f = get("Font", st.font);
      const b = f?.get("BaseFont");
      out.usedFonts.add(b && !b.isNull() ? b.asName().replace(/^[A-Z]{6}\+/, "") : f?.get("Subtype")?.asName() === "Type3" ? "Type 3" : "Sin nombre");
    }
  };
  const charsIn = (list: string[]) => list.filter(o => o.startsWith("(str:")).reduce((a, o) => a + parseInt(o.slice(5)), 0);

  for (const text of contents) {
    for (const t of tokens(text)) {
      const ch = t.charCodeAt(0);
      const isOperand = t.startsWith("(str") || t === "[" || t === "]" || t === "<<" || t === ">>" || t[0] === "/" || (ch >= 48 && ch <= 57) || t[0] === "-" || t[0] === "." || t[0] === "+" || t === "true" || t === "false" || t === "null";
      if (isOperand) { ops.push(t); continue; }
      const n = nums();
      switch (t) {
        case "q": stack.push({ ...st, fill: [...st.fill], stroke: [...st.stroke] }); break;
        case "Q": st = stack.pop() ?? st; break;
        case "cm": if (n.length >= 6) st.ctm = mul(n.slice(0, 6) as M, st.ctm); break;
        case "gs": {
          const g = get("ExtGState", ops[ops.length - 1]?.slice(1));
          if (g) {
            const OP = g.get("OP"), op = g.get("op");
            if (OP && !OP.isNull()) { st.opS = OP.asBoolean(); if (!op || op.isNull()) st.opF = st.opS; }
            if (op && !op.isNull()) st.opF = op.asBoolean();
            if (st.opF || st.opS) out.overprintUsed = true;
          }
          break;
        }
        case "g": st.csF = "Gray"; st.fill = [n[0]]; break;
        case "G": st.csS = "Gray"; st.stroke = [n[0]]; break;
        case "rg": st.csF = "RGB"; st.fill = n.slice(0, 3); break;
        case "RG": st.csS = "RGB"; st.stroke = n.slice(0, 3); break;
        case "k": st.csF = "CMYK"; st.fill = n.slice(0, 4); break;
        case "K": st.csS = "CMYK"; st.stroke = n.slice(0, 4); break;
        case "cs": st.csF = csName(ops[ops.length - 1]?.slice(1)); st.fill = st.csF === "CMYK" ? [0, 0, 0, 1] : st.csF === "RGB" ? [0, 0, 0] : [st.csF.startsWith("Sep") ? 1 : 0]; break;
        case "CS": st.csS = csName(ops[ops.length - 1]?.slice(1)); st.stroke = st.csS === "CMYK" ? [0, 0, 0, 1] : st.csS === "RGB" ? [0, 0, 0] : [st.csS.startsWith("Sep") ? 1 : 0]; break;
        case "sc": case "scn": if (n.length) st.fill = n; break;
        case "SC": case "SCN": if (n.length) st.stroke = n; break;
        case "m": cx = n[0]; cy = n[1]; grow(cx, cy); break;
        case "l": cx = n[0]; cy = n[1]; grow(cx, cy); break;
        case "c": grow(n[0], n[1]); grow(n[2], n[3]); cx = n[4]; cy = n[5]; grow(cx, cy); break;
        case "v": case "y": grow(n[0], n[1]); cx = n[2]; cy = n[3]; grow(cx, cy); break;
        case "re": grow(n[0], n[1]); grow(n[0] + n[2], n[1] + n[3]); break;
        case "n": path = null; break;
        case "BT": tm = [1, 0, 0, 1, 0, 0]; tlm = [1, 0, 0, 1, 0, 0]; break;
        case "Tf": st.font = ops[0]?.slice(1) ?? ""; st.fsize = n[0] || st.fsize; break;
        case "Tz": st.tz = (n[0] ?? 100) / 100; break;
        case "TL": st.tl = n[0] ?? 0; break;
        case "Tr": st.tr = n[0] ?? 0; break;
        case "Tm": if (n.length >= 6) { tm = n.slice(0, 6) as M; tlm = [...tm] as M; } break;
        case "Td": tlm = mul([1, 0, 0, 1, n[0], n[1]], tlm); tm = [...tlm] as M; break;
        case "TD": st.tl = -n[1]; tlm = mul([1, 0, 0, 1, n[0], n[1]], tlm); tm = [...tlm] as M; break;
        case "T*": tlm = mul([1, 0, 0, 1, 0, -st.tl], tlm); tm = [...tlm] as M; break;
        case "Tj": case "TJ": emitText(charsIn(ops)); break;
        case "'": case '"': tlm = mul([1, 0, 0, 1, 0, -st.tl], tlm); tm = [...tlm] as M; emitText(charsIn(ops)); break;
        case "Do": {
          if (depth > 8) break;
          const x = get("XObject", ops[ops.length - 1]?.slice(1));
          if (!x) break;
          const sub = x.get("Subtype").asName();
          if (sub === "Form") {
            const body = readForm(x);
            const xres = x.get("Resources");
            const mtx = x.get("Matrix");
            const fm: M = mtx && mtx.isArray() ? [0, 1, 2, 3, 4, 5].map(k => mtx.get(k).asNumber()) as M : [1, 0, 0, 1, 0, 0];
            const sub2 = { ...st, ctm: mul(fm, st.ctm) };
            if (body) scanContent([body], xres && !xres.isNull() ? xres : resources, pageMatrix, readForm, depth + 1, sub2, out);
          }
          break;
        }
        default: break;
      }
      if (FILL_OPS.has(t) || STROKE_OPS.has(t)) {
        if (FILL_OPS.has(t)) out.events.push({ kind: "fill", rect: path, op: st.opF, cs: st.csF, color: [...st.fill] });
        if (STROKE_OPS.has(t)) out.events.push({ kind: "stroke", rect: path, op: st.opS, cs: st.csS, color: [...st.stroke] });
        path = null;
      }
      ops = [];
    }
  }
  return out;
}

// Matriz que lleva el espacio de usuario del PDF al de página de MuPDF (y hacia abajo, origen en la CropBox).
export function pageMatrixFor(pobj: Obj): M {
  const box = (k: string) => { const b = pobj.getInheritable(k); return b && b.isArray() ? [0, 1, 2, 3].map(i => b.get(i).asNumber()) : null; };
  const cb = box("CropBox") ?? box("MediaBox") ?? [0, 0, 612, 792];
  const x0 = Math.min(cb[0], cb[2]), y1 = Math.max(cb[1], cb[3]);
  return [1, 0, 0, -1, -x0, y1];
}
