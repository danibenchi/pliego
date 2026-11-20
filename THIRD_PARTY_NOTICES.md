# Componentes de terceros

Pliego se distribuye bajo la licencia AGPL-3.0-or-later (ver `LICENSE`). Incluye o usa estos componentes, cada uno con su licencia:

| Componente | Uso en Pliego | Licencia |
|---|---|---|
| MuPDF / mupdf.js (Artifex) | Lectura, análisis y renderizado del PDF | AGPL-3.0 |
| Hunspell (vía hunspell-asm) | Corrector ortográfico | MPL-1.1 / GPL-2.0+ / LGPL-2.1+ (Hunspell); MIT (hunspell-asm) |
| Diccionarios dictionary-* (LibreOffice, wooorm/dictionaries) | Ortografía en 19 variantes | Cada uno la suya: ver `src/assets/dict/LICENSE.txt` |
| ZXing (@zxing/library) | Lectura del código de barras EAN-13 | Apache-2.0 |
| pdf-lib y @pdf-lib/fontkit | Informe en PDF | MIT |
| fflate | Lectura de archivos .docx y diccionarios comprimidos | MIT |
| Geist y Geist Mono (Vercel) | Tipografía de la interfaz y del informe | SIL Open Font License 1.1 |
| FOGRA39L Coated | Perfil de color CMYK de referencia | Libre de restricciones de copyright conocidas (distribuido con TeX Live) |
| React | Interfaz | MIT |
| emscripten-wasm-loader, nanoid | Carga del corrector | MIT |

Los diccionarios se distribuyen como datos independientes, en archivos separados que se cargan solo cuando hacen falta; cada uno conserva su propia licencia. El diccionario de euskera (GPL-2.0) se incluye en esas condiciones.
