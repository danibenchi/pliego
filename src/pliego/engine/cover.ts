// Geometría de cubierta: rústica (con o sin solapas), tapa dura (cartoné) y sobrecubierta.
// Los valores por defecto son habituales del sector; cada imprenta da los suyos.

export type CoverType = "rustica" | "tapadura" | "sobrecubierta";
export interface CoverParams { type: CoverType; trimW: number; trimH: number; spine: number; flapMm: number; boardMm: number; cejaMm: number; turnInMm: number; hingeMm: number }
export interface Panel { name: string; x0: number; x1: number; kind: "flap" | "back" | "spine" | "front" | "turnin" | "hinge" }
export interface CoverGeometry { totalW: number; totalH: number; folds: number[]; hfolds: number[]; panels: Panel[]; breakdown: string; boardArea?: { x0: number; x1: number; y0: number; y1: number }[] }

const f = (v: number) => (Math.round(v * 10) / 10).toLocaleString("es", { maximumFractionDigits: 1 });

export function coverGeometry(p: CoverParams): CoverGeometry {
  if (p.type === "tapadura") {
    const boardW = p.trimW, boardH = p.trimH + 2 * p.cejaMm, caseSpine = p.spine + 2 * p.boardMm;
    const t = p.turnInMm, hg = p.hingeMm;
    const xs = [t, t + boardW, t + boardW + hg, t + boardW + hg + caseSpine, t + boardW + 2 * hg + caseSpine, t + 2 * boardW + 2 * hg + caseSpine];
    const totalW = xs[5] + t, totalH = boardH + 2 * t;
    return {
      totalW, totalH, folds: xs, hfolds: [t, t + boardH],
      panels: [
        { name: "Vuelta", x0: 0, x1: t, kind: "turnin" }, { name: "Contratapa", x0: xs[0], x1: xs[1], kind: "back" },
        { name: "Cajo", x0: xs[1], x1: xs[2], kind: "hinge" }, { name: "Lomo", x0: xs[2], x1: xs[3], kind: "spine" },
        { name: "Cajo", x0: xs[3], x1: xs[4], kind: "hinge" }, { name: "Tapa", x0: xs[4], x1: xs[5], kind: "front" },
        { name: "Vuelta", x0: xs[5], x1: totalW, kind: "turnin" },
      ],
      boardArea: [{ x0: xs[0], x1: xs[1], y0: t, y1: t + boardH }, { x0: xs[2], x1: xs[3], y0: t, y1: t + boardH }, { x0: xs[4], x1: xs[5], y0: t, y1: t + boardH }],
      breakdown: `vuelta ${f(t)} + contratapa ${f(boardW)} + cajo ${f(hg)} + lomo ${f(caseSpine)} + cajo ${f(hg)} + tapa ${f(boardW)} + vuelta ${f(t)} = ${f(totalW)} mm de ancho; ${f(t)} + ${f(boardH)} + ${f(t)} = ${f(totalH)} mm de alto`,
    };
  }
  if (p.type === "sobrecubierta") {
    const panel = p.trimW + p.cejaMm, h = p.trimH + 2 * p.cejaMm, sp = p.spine + 2 * p.boardMm + 2, fl = p.flapMm;
    const xs = [fl, fl + panel, fl + panel + sp, fl + 2 * panel + sp];
    return {
      totalW: xs[3] + fl, totalH: h, folds: xs, hfolds: [],
      panels: [{ name: "Solapa", x0: 0, x1: xs[0], kind: "flap" }, { name: "Contratapa", x0: xs[0], x1: xs[1], kind: "back" }, { name: "Lomo", x0: xs[1], x1: xs[2], kind: "spine" }, { name: "Tapa", x0: xs[2], x1: xs[3], kind: "front" }, { name: "Solapa", x0: xs[3], x1: xs[3] + fl, kind: "flap" }],
      breakdown: `solapa ${f(fl)} + contratapa ${f(panel)} + lomo ${f(sp)} + tapa ${f(panel)} + solapa ${f(fl)} = ${f(xs[3] + fl)} mm de ancho; ${f(h)} mm de alto`,
    };
  }
  const fl = p.flapMm, xs = [fl, fl + p.trimW, fl + p.trimW + p.spine, fl + 2 * p.trimW + p.spine];
  const panels: Panel[] = [{ name: "Contratapa", x0: xs[0], x1: xs[1], kind: "back" }, { name: "Lomo", x0: xs[1], x1: xs[2], kind: "spine" }, { name: "Tapa", x0: xs[2], x1: xs[3], kind: "front" }];
  if (fl > 0) { panels.unshift({ name: "Solapa", x0: 0, x1: fl, kind: "flap" }); panels.push({ name: "Solapa", x0: xs[3], x1: xs[3] + fl, kind: "flap" }); }
  return {
    totalW: xs[3] + fl, totalH: p.trimH, folds: fl > 0 ? xs : [xs[1], xs[2]], hfolds: [], panels,
    breakdown: `${fl > 0 ? `solapa ${f(fl)} + ` : ""}contratapa ${f(p.trimW)} + lomo ${f(p.spine)} + tapa ${f(p.trimW)}${fl > 0 ? ` + solapa ${f(fl)}` : ""} = ${f(xs[3] + fl)} mm de ancho; ${f(p.trimH)} mm de alto`,
  };
}
