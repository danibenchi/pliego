// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

// Pliego: hunspell-asm importa nanoid y su runtime de Emscripten como espacio de nombres y después
// los llama como funciones; en ESM eso falla, así que se reescriben como import por defecto.
const fixNanoid: Plugin = {
  name: "pliego-fix-hunspell-nanoid",
  enforce: "pre",
  transform(code, id) {
    if (!/hunspell-asm|emscripten-wasm-loader/.test(id)) return null;
    let out = code;
    out = out.replace("import * as nanoid from 'nanoid'", "import nanoid from 'nanoid'");
    out = out.replace("import * as runtime from './lib/node/hunspell'", "import runtime from './lib/browser/hunspell'");
    return out === code ? null : out;
  },
};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [fixNanoid],
    // el motor de Pliego (MuPDF, Hunspell) corre en un Web Worker con módulos ES
    worker: { format: "es", plugins: () => [fixNanoid] },
    optimizeDeps: { exclude: ["mupdf"] },
    build: { assetsInlineLimit: 0, chunkSizeWarningLimit: 4000 },
  },
});
