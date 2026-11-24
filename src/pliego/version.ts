// Versión de Pliego e historial de cambios. Es la única fuente: la usan la documentación,
// el informe en PDF y las estadísticas anónimas. Al publicar cambios, sumar una entrada arriba.

export const VERSION = "1.2";
export const VERSION_DATE = "24 de noviembre de 2026";

export interface Release { version: string; date: string; status?: string; notes: string[] }

export const CHANGELOG: Release[] = [
  {
    version: "1.2", date: "24 de noviembre de 2026", status: "Referencias de imprenta y de colección",
    notes: [
      "«Guardar como referencia» en el informe: un PDF que ya salió bien queda como referencia de una imprenta, de una colección o de las dos. Antes de guardar muestra qué se toma y, si el archivo tiene bloqueantes, pide confirmar que se imprimió bien.",
      "Referencia de imprenta: sangrado, PDF/X, perfil de salida, versión, tinta total, resolución de las imágenes, RGB y tintas planas. Con la cubierta, mide el papel real a partir del lomo y los próximos lomos se calculan con ese espesor.",
      "Referencia de colección: formato, color, tipografía y cuerpo del texto, interlineado, márgenes de la caja, posición de los folios, apertura de capítulos, tipo de cubierta, solapas y código de barras.",
      "Nuevo grupo de hallazgos «Referencia» con lo que cambia; si todo coincide, figura entre los controles superados. Las colecciones se eligen, exportan e importan desde el perfil, como las imprentas.",
      "Solo se guardan medidas y nombres de fuentes, en el navegador: nunca el PDF, su texto, sus imágenes ni su ISBN.",
    ],
  },
  {
    version: "1.1", date: "20 de noviembre de 2026", status: "Calibrada con diez libros reales ya impresos",
    notes: [
      "La tinta total y el color se miden solo dentro de la caja de corte: las marcas de corte y de registro (al 400 %) ya no cuentan como parte del libro.",
      "En un interior a una tinta no se mide la tinta total (todo sale en una plancha); el color se sigue avisando.",
      "Cubierta: límite de tinta de cartulina estucada (330 %), solapas desiguales detectadas por el texto del lomo, pliegues ubicados con el lomo del archivo y texto revisado letra por letra.",
      "Código de barras: entre 70 y 80 % es informativo (es lo habitual en libros); aviso por debajo de 70 % y bloqueante por debajo de 55 %. El color de fondo y de barras se mide sin mezclar barras con espacios.",
      "Aviso previo: detecta títulos u ornamentos en color en un libro a una tinta, y tapa dura o rústica por las medidas de la cubierta.",
      "Sin PDF/X ni perfil de salida es informativo, salvo que haya RGB sin perfil. Las páginas fuera de pliego también son informativas.",
      "Menos falsas alarmas: signos de apertura (preguntas que siguen en otra página, anidadas, en inglés o con signos dobles), diálogos con semirraya como estilo de la casa, guiones de corte con espacio, viudas y huérfanas, altura de página (una línea de diferencia es práctica habitual), notas al pie (llamadas pegadas a años o comillas, notas largas, listas numeradas en citas), índice con títulos numerados o repetidos, líneas de puntos del índice y «lorem ipsum» usado como muestra tipográfica.",
      "Páginas en blanco agregadas sin caja de corte: se avisan como caja de corte, no como otro formato. Elementos al corte más tolerantes con texturas claras.",
    ],
  },
  {
    version: "1.0", date: "20 de noviembre de 2026", status: "Versión de prueba con miembros de la Academia",
    notes: [
      "Revisión técnica del PDF de imprenta: sangrado, corte, tinta total, color, imágenes, fuentes, filetes, sobreimpresión y reglas PDF/X.",
      "Cubierta: medidas, lomo calculado según papel y páginas, solapas, tapa dura, código de barras e ISBN, cruce con el interior.",
      "El libro: créditos, ISBN, folios, índice, cabeceras, capítulos, viudas, huérfanas, guiones, palabras repetidas y ortografía en 19 diccionarios.",
      "Ortotipografía, composición y aparato: comillas, rayas, espacios, signos de apertura, líneas abiertas, altura de página, notas, remisiones y figuras.",
      "Comparación de versiones, verificación de las correcciones marcadas en Acrobat y cotejo con el Word aprobado.",
      "Perfil de la imprenta guardable, aviso antes de revisar cuando el perfil no coincide con el PDF, y resumen de 30 segundos.",
      "Archivos pesados de hasta 500 MB, con modo liviano y medición de la tinta en detalle a pedido.",
      "Informe en PDF con huella del archivo, pasos según el programa de maquetación y alcance de la revisión.",
      "Calibrada con un libro escolar real de 256 páginas a cuatro colores: menos falsas alarmas en registro, notas, palabras repetidas y signos de apertura.",
      "Beta: comentarios desde la herramienta («¿Algo está mal? Contanos») y estadísticas anónimas de uso, que se pueden ver y apagar.",
    ],
  },
];
