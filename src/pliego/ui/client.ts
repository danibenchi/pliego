// Cliente del worker con cola de prioridades: la vista principal pasa delante de las miniaturas.
import type { Report, Progress, RenderOut, Peek, Inspect, TacPage } from "../engine/analyze";
import type { Profile } from "../engine/profiles";
import type { CompareResult } from "../engine/compare";
import type { OrigResult } from "../engine/original";

type Job = { id: number; msg: any; resolve: (v: any) => void; reject: (e: any) => void; onProgress?: (p: Progress) => void; prio: number; transfer?: Transferable[] };

// Error de memoria del motor: el navegador cortó el análisis por falta de memoria.
export const isOom = (e: any) => /OOM|out of memory|memory access out of bounds|Array buffer allocation failed|Aborted\(|Cannot enlarge memory|could not allocate/i.test(String(e?.message ?? e));

export class Engine {
  private w!: Worker;
  private queue: Job[] = [];
  private busy: Job | null = null;
  private seq = 1;
  ready: Promise<void>;
  state: "loading" | "ready" | "error" = "loading";
  onState?: (s: "loading" | "ready" | "error") => void;

  constructor() { this.ready = this.start(); }

  private start() {
    this.w = new Worker(new URL("../worker.ts", import.meta.url), { type: "module" });
    let ok: () => void, ko: (e: any) => void, started = false;
    const ready = new Promise<void>((r, j) => { ok = r; ko = j; });
    ready.catch(() => {});
    this.w.onerror = (e) => {
      if (!started) { this.state = "error"; this.onState?.("error"); return ko(e); }
      // el worker se cayó en medio de un trabajo (casi siempre, falta de memoria): se rearma
      e.preventDefault?.();
      this.restart(new Error("Aborted(OOM): " + (e.message || "worker")));
    };
    this.w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "ready") { started = true; this.state = "ready"; this.onState?.("ready"); return ok(); }
      const job = this.busy;
      if (!job || m.id !== job.id) return;
      if (m.type === "progress") return job.onProgress?.(m.progress);
      this.busy = null;
      if (m.type === "error") {
        const err = new Error(m.error);
        // tras quedarse sin memoria, el motor de MuPDF queda inutilizable: se arranca uno nuevo
        if (isOom(err)) { job.reject(err); return this.restart(err); }
        job.reject(err);
      } else job.resolve(m.report ?? m.out);
      this.pump();
    };
    return ready;
  }

  /** Termina el worker, rechaza lo pendiente y arranca uno nuevo (se pierden los documentos abiertos). */
  private restart(err: Error) {
    try { this.w.terminate(); } catch { /* */ }
    const pending = [...(this.busy ? [this.busy] : []), ...this.queue];
    this.busy = null; this.queue = [];
    for (const j of pending) j.reject(err);
    this.state = "loading"; this.onState?.("loading");
    this.ready = this.start();
    this.ready.then(() => this.pump(), () => {});
  }

  private pump() {
    if (this.busy || !this.queue.length) return;
    this.queue.sort((a, b) => b.prio - a.prio);
    const job = this.queue.shift()!;
    this.busy = job;
    this.w.postMessage({ ...job.msg, id: job.id }, job.transfer ?? []);
  }

  private run<T>(msg: any, prio: number, onProgress?: (p: Progress) => void, transfer?: Transferable[]): Promise<T> {
    return new Promise<T>((resolve, reject) => { this.queue.push({ id: this.seq++, msg, resolve, reject, onProgress, prio, transfer }); this.pump(); });
  }

  analyze(data: ArrayBuffer, name: string, profile: Profile, onProgress: (p: Progress) => void, icc?: { data: ArrayBuffer; name: string } | null, key = "main", light = false) {
    this.queue = this.queue.filter(j => j.msg.type !== "render");
    return this.run<Report>({ type: "analyze", data, name, profile, icc: icc?.data ? icc.data.slice(0) : null, iccName: icc?.name ?? null, key, light }, 10, onProgress, [data]);
  }
  render(page: number, scale: number, cmyk: boolean, prio = 5, proof = false, key = "main") { return this.run<RenderOut>({ type: "render", page, scale, cmyk, proof, key }, prio); }
  compare(data: ArrayBuffer, key: string, onProgress: (p: Progress) => void) { return this.run<CompareResult>({ type: "compare", data, key }, 10, onProgress, [data]); }
  original(data: ArrayBuffer, name: string, key: string) { return this.run<OrigResult>({ type: "original", data, name, key }, 10, undefined, [data]); }
  tac(key: string, pages: number[], limit: number, rgb: number[], onProgress: (p: Progress) => void) { return this.run<TacPage[]>({ type: "tac", key, pages, limit, rgb }, 10, onProgress); }
  inspect(data: ArrayBuffer) { return this.run<Inspect>({ type: "inspect", data }, 10, undefined, [data]); }
  peek(data: ArrayBuffer) { return this.run<Peek>({ type: "peek", data }, 10, undefined, [data]); }
  has(key: string) { return this.run<boolean>({ type: "has", key }, 10); }
  dropThumbs() { this.queue = this.queue.filter(j => j.prio > 1); }
}
