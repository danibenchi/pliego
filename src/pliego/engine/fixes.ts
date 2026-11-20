// «Cómo se arregla» según el programa que generó el PDF (se detecta por Creator/Producer).
export type AppId = "indesign" | "affinity" | "quark" | "scribus" | "word" | "writer" | "canva" | "latex" | "pages" | "vellum" | "gdocs" | "illustrator" | "otro";
export const APPS: { id: AppId; name: string }[] = [
  { id: "indesign", name: "InDesign" }, { id: "affinity", name: "Affinity Publisher" }, { id: "quark", name: "QuarkXPress" },
  { id: "scribus", name: "Scribus" }, { id: "word", name: "Word" }, { id: "writer", name: "LibreOffice Writer" },
  { id: "canva", name: "Canva" }, { id: "latex", name: "LaTeX" }, { id: "pages", name: "Pages" }, { id: "vellum", name: "Vellum" },
  { id: "gdocs", name: "Google Docs" }, { id: "illustrator", name: "Illustrator" }, { id: "otro", name: "Otro programa" },
];

export function detectApp(creator: string, producer: string): AppId | null {
  const s = `${creator} ${producer}`;
  if (/InDesign/i.test(s)) return "indesign";
  if (/Affinity/i.test(s)) return "affinity";
  if (/Quark/i.test(s)) return "quark";
  if (/Scribus/i.test(s)) return "scribus";
  if (/Microsoft.*Word|Word for|Microsoft® Word/i.test(s)) return "word";
  if (/LibreOffice|OpenOffice|Writer/i.test(s)) return "writer";
  if (/Canva/i.test(s)) return "canva";
  if (/TeX|LuaLaTeX|XeLaTeX|pdflatex/i.test(s)) return "latex";
  if (/Vellum/i.test(s)) return "vellum";
  if (/Pages|Quartz PDFContext/i.test(s)) return "pages";
  if (/Google Docs|Skia\/PDF/i.test(s)) return "gdocs";
  if (/Illustrator/i.test(s)) return "illustrator";
  return null;
}

type FixMap = Partial<Record<string, string>>;
const ID_EXPORT = "Archivo › Exportar › Adobe PDF (impresión) y elegí el ajuste PDF/X-4:2008 (o PDF/X-1a si la imprenta lo pide).";
const FIX: Partial<Record<AppId, FixMap>> = {
  indesign: {
    pdfx: ID_EXPORT, pdfxFail: `Volvé a exportar sin tocar el ajuste: ${ID_EXPORT} En Resumen, InDesign te avisa qué regla no se cumple.`,
    outputIntent: "Al exportar, en Salida: Conversión de color «Convertir en destino (mantener valores)» y Destino con el perfil de tu imprenta (por ejemplo, Coated FOGRA39 o PSO Uncoated). El ajuste PDF/X lo declara solo.",
    bleed: "Definí el sangrado en la configuración del documento (Archivo › Ajustar documento, o Configurar documento en versiones anteriores › Sangrado y anotaciones) y, al exportar, en Marcas y sangrados marcá «Usar configuración de sangrado del documento».",
    edge: "Estirá las imágenes y fondos hasta la guía roja del sangrado (no hasta el borde de la página) y exportá con «Usar configuración de sangrado del documento».",
    trimbox: ID_EXPORT,
    safety: "Mové los textos hacia adentro o ampliá los márgenes en Maquetación › Márgenes y columnas (en las páginas maestras, para todo el libro).",
    gutter: "Ampliá el margen interior en las páginas maestras (Maquetación › Márgenes y columnas › Interior).",
    fonts: "Texto › Buscar fuente para ver las faltantes o bloqueadas; instalalas o reemplazalas y volvé a exportar. En Avanzado, «Subconjunto de fuentes» al 100 %.",
    imgRgb: "Al exportar, en Salida: «Convertir en destino (mantener valores)» con el perfil de la imprenta. Para controlar el resultado, convertí antes las imágenes en Photoshop (Edición › Convertir en perfil).",
    rgbObjects: "Revisá las muestras en RGB en el panel Muestras (cambialas a CMYK) o convertí al exportar: Salida › «Convertir en destino (mantener valores)».",
    imgPpi: "En Ventana › Vínculos mirá la resolución efectiva de cada imagen: reemplazá las de menos de 300 ppp o reducí su escala.",
    tac: "Ventana › Salida › Vista previa de separaciones › Ver: Límite de tinta, con el valor de tu imprenta. Corregí esas imágenes en Photoshop convirtiéndolas con el perfil de la imprenta.",
    monoColor: "En Ventana › Salida › Vista previa de separaciones apagá el Negro: lo que siga viéndose usa color. Aplicale la muestra [Negro] o escala de grises.",
    spot: "Panel Muestras: convertí las tintas planas a cuatricromía (Opciones de muestra › Tipo de color: Cuatricromía) o, al exportar, Salida › Administrador de tintas › «Todas las tintas planas a cuatricromía».",
    spotDuplicate: "Panel Muestras › Administrador de tintas: asigná un «alias de tinta» para que las dos se impriman en la misma plancha.",
    whiteOverprint: "Seleccioná el objeto blanco y desmarcá Ventana › Salida › Atributos › «Sobreimprimir relleno». Controlalo con Ver › Previsualización de sobreimpresión.",
    colorOverprint: "Ventana › Salida › Atributos: desmarcá «Sobreimprimir relleno» en esos objetos, salvo que sea un efecto buscado.",
    blackKnockout: "Usá la muestra [Negro] para el texto: InDesign lo sobreimprime solo (Preferencias › Apariencia del negro › «Sobreimprimir muestra [Negro] al 100 %»).",
    richBlackText: "Aplicá al texto la muestra [Negro] (100 K) en vez de un negro compuesto.",
    rgbBlackText: "Aplicá al texto la muestra [Negro]; si viene de Word pegado, revisá el estilo de carácter.",
    hairline: "Ventana › Trazo: subí el grosor a 0,25 pt como mínimo.",
    transparency: "Exportá con PDF/X-4 (mantiene las transparencias) o, si la imprenta pide X-1a, usá Edición › Ajustes preestablecidos del acoplador de transparencias › Alta resolución.",
    hiddenLayers: "Ventana › Capas: borrá las capas que no van y, al exportar, en General elegí «Exportar capas: Capas visibles e imprimibles».",
    layers: "Al exportar, en General desmarcá «Crear capas de Acrobat».",
    annots: "Al exportar, en General desmarcá «Incluir hipervínculos, marcadores y elementos interactivos» (deben quedar en «No incluir»).",
    marks: "Al exportar, en Marcas y sangrados desmarcá todas las marcas, salvo que la imprenta las pida.",
    marksInBleed: "Al exportar, en Marcas y sangrados poné el «Desplazamiento» igual o mayor que el sangrado (por ejemplo, 3 mm).",
    orphan: "Menú del panel Párrafo › Opciones de separación › «Mantener líneas juntas: al principio 2 líneas» (en el estilo de párrafo del cuerpo).",
    widow: "Menú del panel Párrafo › Opciones de separación › «Mantener líneas juntas: al final 2 líneas», o ajustá el tracking del párrafo anterior.",
    hyphenLadder: "Menú del panel Párrafo › Separación por sílabas › límite de guiones consecutivos en 2 o 3 (en el estilo del cuerpo).",
    pageTurnHyphen: "Menú del panel Párrafo › Separación por sílabas: desmarcá «Separar palabras entre columnas».",
    toc: "Maquetación › Actualizar tabla de contenido, después del último cambio de paginación.",
    runningHead: "Usá una variable de texto (Texto › Variables de texto › Definir › Encabezado continuo, estilo de párrafo del título del capítulo) en la página maestra.",
    chapterOdd: "En Opciones de separación del estilo del título del capítulo: «Iniciar párrafo: en la página impar».",
    headOnOpening: "Aplicá a la página de apertura la página maestra sin cabecera (o [Ninguna]).",
    tinyText: "Subí el cuerpo en el estilo de párrafo o de carácter correspondiente.",
  },
  affinity: {
    pdfx: "Archivo › Exportar › PDF › Ajuste preestablecido «PDF/X-4» (o X-1a si la imprenta lo pide).",
    outputIntent: "Al exportar el PDF, en Más… elegí el perfil de color CMYK de la imprenta: el ajuste PDF/X lo declara.",
    bleed: "Archivo › Configuración del documento › Sangrado; al exportar, marcá «Incluir sangrado».",
    edge: "Estirá imágenes y fondos hasta la línea del sangrado y exportá con «Incluir sangrado».",
    fonts: "Texto › Administrador de fuentes: reemplazá las faltantes y exportá con las fuentes incrustadas (Más… › Incrustar fuentes).",
    imgRgb: "Al exportar, en Más… elegí espacio de color CMYK con el perfil de la imprenta, o convertí las imágenes antes en Affinity Photo.",
    imgPpi: "Ventana › Administrador de recursos muestra la resolución efectiva de cada imagen: reemplazá las de menos de 300 ppp.",
    orphan: "Panel Párrafo › Flujo: activá el control de huérfanas en el estilo del cuerpo.", widow: "Panel Párrafo › Flujo: activá el control de viudas en el estilo del cuerpo.",
    hyphenLadder: "Panel Párrafo › Separación de palabras: limitá las líneas seguidas con guion a 2 o 3.",
    toc: "Ventana › Referencias › Tabla de contenido › Actualizar.",
  },
  quark: {
    pdfx: "Archivo › Exportar › Diseño como PDF › Opciones: estilo de salida PDF/X-4 (o X-1a).",
    bleed: "En las opciones de exportación a PDF, sección Sangrado: «Sangrado simétrico» con el valor de la imprenta.",
    fonts: "Utilidades › Uso: reemplazá las fuentes faltantes antes de exportar.",
  },
  scribus: {
    pdfx: "Archivo › Exportar › Guardar como PDF › General › Compatibilidad: PDF/X-4 (o PDF/X-1a) con el perfil de la imprenta.",
    bleed: "Archivo › Configurar documento › Sangrados; al exportar, en Preimpresión marcá «Usar los ajustes de sangrado del documento».",
    fonts: "Al exportar, pestaña Fuentes: «Incrustar todas».",
    imgRgb: "Al exportar, pestaña Color: «Salida a: Impresora» con el perfil CMYK de la imprenta.",
    outputIntent: "Al exportar como PDF/X elegí el perfil de salida de la imprenta en la pestaña Color.",
  },
  word: {
    pdfx: "Word no exporta PDF/X. Guardá el PDF con Archivo › Guardar como › PDF (en Opciones, «Compatible con ISO 19005-1 (PDF/A)» para que incruste las fuentes) y avisale a la imprenta, o pasalo por Acrobat Pro (Producción de impresión › Comprobaciones preliminares › Guardar como PDF/X).",
    outputIntent: "Word no declara perfil de salida: hacelo con Acrobat Pro o pedíselo a la imprenta.",
    bleed: "Word no tiene sangrado: hacé la página 6 mm más ancha y 6 mm más alta (Disposición › Tamaño › Más tamaños de papel), estirá los fondos hasta el borde y avisale a la imprenta que el corte va 3 mm adentro.",
    edge: "Ver la indicación de sangrado: en Word hay que agrandar la página para que los fondos lleguen más allá del corte.",
    fonts: "Archivo › Opciones › Guardar › «Incrustar fuentes en el archivo» y exportá con la opción PDF/A.",
    imgRgb: "Word solo trabaja en RGB: la imprenta tiene que convertir, o convertilo en Acrobat Pro (Producción de impresión › Convertir colores).",
    rgbObjects: "Word solo trabaja en RGB: la imprenta tiene que convertir, o convertilo en Acrobat Pro (Producción de impresión › Convertir colores).",
    imgPpi: "Archivo › Opciones › Avanzadas › Tamaño y calidad de imagen: «No comprimir imágenes» y resolución «Alta fidelidad»; reemplazá las imágenes chicas.",
    orphan: "Párrafo › Líneas y saltos de página › «Control de líneas viudas y huérfanas» (en el estilo Normal).", widow: "Párrafo › Líneas y saltos de página › «Control de líneas viudas y huérfanas» (en el estilo Normal).",
    hyphenLadder: "Disposición › Guiones › Opciones de guiones › «Limitar guiones consecutivos a: 2».",
    toc: "Referencias › Actualizar tabla › Actualizar toda la tabla.",
    chapterOdd: "Antes de cada capítulo: Disposición › Saltos › «Página impar».",
    runningHead: "Cada capítulo en su sección, con el encabezado desvinculado («Vincular al anterior» apagado) o con un campo StyleRef al estilo Título 1.",
  },
  writer: {
    pdfx: "LibreOffice no exporta PDF/X: Archivo › Exportar como › Exportar como PDF › General › «Archivo PDF/A» (incrusta fuentes) y avisale a la imprenta.",
    fonts: "Exportá con Archivo › Exportar como PDF › General › «Archivo PDF/A».",
    imgPpi: "En la exportación a PDF: Imágenes › «Compresión sin pérdidas» y desmarcá «Reducir la resolución de las imágenes».",
    orphan: "Formato › Párrafo › Flujo del texto › Huérfanas: 2 líneas (en el estilo del cuerpo).", widow: "Formato › Párrafo › Flujo del texto › Viudas: 2 líneas (en el estilo del cuerpo).",
    hyphenLadder: "Formato › Párrafo › Flujo del texto › División de palabras: número máximo de guiones consecutivos 2.",
    toc: "Herramientas › Actualizar › Todos los índices y tablas.",
    imgRgb: "Writer solo exporta en RGB: la imprenta tiene que convertir, o convertilo en Acrobat Pro.",
  },
  canva: {
    pdfx: "Canva no exporta PDF/X: Compartir › Descargar › «PDF para impresión», con «Marcas de recorte y sangrado» y, si tenés Canva Pro, perfil de color CMYK.",
    bleed: "Archivo › Configuración › «Mostrar sangrado», estirá los fondos hasta el borde y descargá como «PDF para impresión» con «Marcas de recorte y sangrado».",
    edge: "Activá Archivo › Configuración › «Mostrar sangrado» y llevá los fondos hasta el borde exterior.",
    imgRgb: "Al descargar el «PDF para impresión», elegí perfil de color CMYK (requiere Canva Pro).",
    rgbObjects: "Al descargar el «PDF para impresión», elegí perfil de color CMYK (requiere Canva Pro).",
    imgPpi: "Subí las imágenes originales en alta resolución y no las agrandes más allá de su tamaño.",
    fonts: "Descargá como «PDF para impresión»: Canva incrusta las fuentes. Si usás «Aplanar PDF», el texto se convierte en imagen.",
  },
  latex: {
    pdfx: "Usá el paquete pdfx: \\usepackage[x-4]{pdfx} (o a-1b / x-1a) con un archivo .xmpdata con título y autor.",
    outputIntent: "El paquete pdfx agrega el perfil de salida: \\usepackage[x-4]{pdfx}.",
    bleed: "Definí el papel con el sangrado (geometry: paperwidth/paperheight más 6 mm y layoutoffset 3 mm) o usá el paquete crop.",
    orphan: "En el preámbulo: \\clubpenalty=10000.", widow: "En el preámbulo: \\widowpenalty=10000.",
    hyphenLadder: "Subí \\doublehyphendemerits (por ejemplo, 900000) y usá el paquete microtype.",
    chapterOdd: "Clase book con la opción openright (o \\cleardoublepage antes de cada capítulo).",
  },
  pages: {
    pdfx: "Pages no exporta PDF de imprenta (sin CMYK, sin sangrado ni PDF/X): pasá el PDF por Acrobat Pro o pedile a la imprenta que lo prepare.",
    bleed: "Pages no maneja sangrado: hacé la página 6 mm más grande en ancho y alto y estirá los fondos hasta el borde.",
  },
  vellum: {
    pdfx: "Vellum no exporta PDF/X ni CMYK: si la imprenta lo pide, convertí el PDF en Acrobat Pro (Producción de impresión › Comprobaciones preliminares).",
    orphan: "Vellum controla viudas y huérfanas solo: revisá el párrafo y, si hace falta, editá el texto o el estilo.",
  },
  gdocs: {
    pdfx: "Google Docs no exporta PDF de imprenta: descargalo como PDF y pasalo por Acrobat Pro, o armá el libro en un programa de maquetación.",
  },
  illustrator: {
    pdfx: "Archivo › Guardar como › Adobe PDF › ajuste PDF/X-4:2008, con «Usar configuración de sangrado del documento».",
    bleed: "Archivo › Configurar documento › Sangrado; al guardar el PDF, en Marcas y sangrados marcá «Usar configuración de sangrado del documento».",
    fonts: "Texto › Buscar fuente para reemplazar las faltantes; al guardar el PDF, incrustá las fuentes (Avanzado › Subconjunto 100 %).",
    whiteOverprint: "Ventana › Atributos: desmarcá «Sobreimprimir relleno» en el objeto blanco.",
    hairline: "Panel Trazo: grosor mínimo 0,25 pt.",
  },
};
FIX.indesign!.outlines = "Si el texto se convirtió en contornos sin querer (Texto › Crear contornos), volvé a componerlo como texto.";

export function appFix(app: AppId | null, check: string): string | null {
  if (!app) return null;
  return FIX[app]?.[check] ?? null;
}
