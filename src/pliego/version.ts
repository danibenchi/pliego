// Versión de Pliego e historial de cambios. Es la única fuente: la usan la documentación,
// el informe en PDF y las estadísticas anónimas. Al publicar cambios, sumar una entrada arriba.

export const VERSION = "1.0";
export const VERSION_DATE = "20 de noviembre de 2026";

export interface Release { version: string; date: string; status?: string; notes: string[] }

export const CHANGELOG: Release[] = [
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
    ],
  },
];
