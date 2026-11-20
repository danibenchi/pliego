// Prepara las miniaturas marcadas y descarga el informe en PDF.
import type { Report, Finding } from "../engine/analyze";
import type { Engine } from "./client";
import type { Applied } from "./review";
import type { Thumb, PdfInput, BatchRow } from "./reportPdf";
import { saveFile } from "./save";

const STROKE: Record<string, string> = { error: "#e11d48", warn: "#e89a00", info: "#64748b", ok: "#0d9a6b" };

export async function makeThumbs(engine: Engine, report: Report, findings: Finding[], max = 9): Promise<Thumb[]> {
  const byPage = new Map<number, { sev: number; labels: Set<string> }>();
  const rank = (s: string) => (s === "error" ? 3 : s === "warn" ? 2 : 1);
  for (const f of findings) {
    if (f.sev === "info" || f.sev === "ok") continue;
    for (const p of new Set(f.marks.map(m => m.page))) {
      const e = byPage.get(p) ?? { sev: 0, labels: new Set<string>() };
      e.sev = Math.max(e.sev, rank(f.sev)); e.labels.add(f.title); byPage.set(p, e);
    }
  }
  const pages = [...byPage.entries()].sort((a, b) => b[1].sev - a[1].sev || b[1].labels.size - a[1].labels.size || a[0] - b[0]).slice(0, report.profile.piece === "cubierta" ? 1 : max).map(e => e[0]).sort((a, b) => a - b);
  const out: Thumb[] = [];
  for (const p of pages) {
    const info = report.pages[p], b = info.bounds;
    const wPt = b[2] - b[0], hPt = b[3] - b[1];
    const target = wPt > hPt * 1.15 ? 1500 : 560;
    const scale = Math.min(3, target / wPt);
    const r = await engine.render(p, scale, false, 3, false, report.key);
    const c = document.createElement("canvas"); c.width = r.w; c.height = r.h;
    const ctx = c.getContext("2d")!;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(r.rgba), r.w, r.h), 0, 0);
    ctx.lineWidth = Math.max(2, r.w / 260);
    for (const f of findings) {
      if (f.sev === "info") continue;
      for (const m of f.marks) {
        if (m.page !== p) continue;
        ctx.strokeStyle = STROKE[f.sev];
        const x = (m.rect[0] - b[0]) * r.scale - 3, y = (m.rect[1] - b[1]) * r.scale - 3;
        ctx.strokeRect(x, y, (m.rect[2] - m.rect[0]) * r.scale + 6, (m.rect[3] - m.rect[1]) * r.scale + 6);
      }
    }
    const blob: Blob = await new Promise(res => c.toBlob(bl => res(bl!), "image/jpeg", 0.82));
    out.push({ page: p, jpg: new Uint8Array(await blob.arrayBuffer()), w: r.w, h: r.h, labels: [...byPage.get(p)!.labels] });
  }
  return out;
}

export async function exportPdf(inputs: PdfInput[], fileName: string, batch?: BatchRow[]) {
  const { buildReportPdf } = await import("./reportPdf");
  const bytes = await buildReportPdf(inputs, batch);
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const res = await saveFile(fileName, blob);
  return { res, size: bytes.length };
}

export const reportName = (name: string) => `Preflight - ${name.replace(/\.pdf$/i, "")}.pdf`;
export type { Applied };
