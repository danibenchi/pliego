# Pliego · Preflight de imprenta

Pliego revisa el PDF de imprenta de un libro antes de mandarlo a la imprenta: aspectos técnicos
(sangrado, tinta total, resolución, color, fuentes, PDF/X), la cubierta y el lomo, y el libro como
texto (ortografía, ortotipografía, composición, notas, índice, correcciones de la prueba anterior y
cotejo con el original aprobado). Es una herramienta de la Academia Proyecto451.

**Todo corre en el navegador.** Los PDF y los Word nunca se suben a ningún servidor. Lo único que puede
salir son estadísticas anónimas de uso, sin datos del libro, que cada persona puede ver y apagar
(ver `docs/estadisticas/`).

Es una revisión automática previa: no certifica PDF/X ni reemplaza la preimpresión ni las pruebas de la
imprenta. El alcance completo está en la propia herramienta («Qué hace y qué no hace Pliego»).

## Estructura

- `src/pliego/`: la herramienta completa (motor de análisis, interfaz, worker, diccionarios, perfiles).
  - `engine/`: MuPDF (WebAssembly) en un Web Worker; un archivo por familia de controles.
  - `ui/`: interfaz en React con su propia hoja de estilos (`pliego.css`), sin Tailwind ni shadcn.
- `src/routes/index.tsx`: carga Pliego solo en el navegador (la ruta no se renderiza en el servidor).
- `corpus/`: PDF de prueba con errores puestos a propósito y los scripts que los generan.
- `test-pliego/`: pruebas del motor (Node) y de punta a punta (Playwright).
- `docs/estadisticas/`: esquema y función para recibir las estadísticas anónimas.

## Desarrollo

```sh
bun install
bun run dev      # desarrollo
bun run build    # compilación
```

Para recibir estadísticas, compilar con `VITE_PLIEGO_STATS_URL` apuntando a la función `pliego-stats`.
Sin esa variable no se envía nada.

Los diccionarios, las fuentes del informe y el perfil FOGRA39 ya están en `src/pliego/assets/`. Para
regenerarlos: instalar como dependencias de desarrollo `geist` y los paquetes `dictionary-*` (ca,
ca-valencia, de, en, en-gb, es, es-ar, es-cl, es-co, es-mx, es-pe, es-uy, es-ve, eu, fr, gl, it, pt,
pt-pt) y correr `bun run assets`.

## Licencia

Software libre bajo la [GNU Affero General Public License v3.0 o posterior](LICENSE).
Copyright © 2026 Daniel Benchimol (Proyecto451). Componentes de terceros y sus licencias en
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Editor de Lovable: https://lovable.dev/projects/44fa538c-1ae8-4bf1-9e2a-6ead7e58b050
