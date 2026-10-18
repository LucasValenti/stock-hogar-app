// Junta los ítems de texto que devuelve pdf.js (getTextContent) en renglones, en orden de lectura.
// Cada ítem trae su posición en transform: [.., .., .., .., x, y]; hasEOL cierra el renglón.
export type ItemTexto = {
  str: string;
  hasEOL?: boolean;
  transform: number[];
  /** Alto de la línea, para tolerar el superíndice de los centavos. Por defecto, 6. */
  height?: number;
};

const ALTO_POR_DEFECTO = 6;

// El superíndice de los centavos queda unos puntos más arriba: dos ítems van en el mismo renglón
// si su y difiere menos que medio alto. Los renglones van de arriba hacia abajo (y mayor primero).
function mismoRenglon(y: number, alto: number, refY: number, refAlto: number): boolean {
  return Math.abs(refY - y) < Math.max(alto, refAlto) / 2;
}

// Une los ítems de un renglón: un espacio entre ellos, salvo que el que sigue sean exactamente
// dos dígitos pegados a un monto (los centavos en superíndice: "$ 56.900" + "00" → "$ 56.90000").
function unir(items: ItemTexto[]): string {
  let texto = '';
  for (const it of items) {
    if (!it.str) continue;
    if (!texto) {
      texto = it.str;
      continue;
    }
    const centavos = /^\d{2}$/.test(it.str) && /\d$/.test(texto);
    texto += (centavos ? '' : ' ') + it.str;
  }
  return texto;
}

export function armarLineas(items: ItemTexto[]): string {
  const renglones: { y: number; alto: number; items: ItemTexto[]; cerrado: boolean }[] = [];
  for (const it of items) {
    const y = it.transform?.[5] ?? 0;
    const alto = it.height ?? ALTO_POR_DEFECTO;
    const actual = renglones[renglones.length - 1];
    if (actual && !actual.cerrado && mismoRenglon(y, alto, actual.y, actual.alto)) {
      actual.items.push(it);
    } else {
      renglones.push({ y, alto, items: [it], cerrado: false });
    }
    if (it.hasEOL) renglones[renglones.length - 1].cerrado = true;
  }
  for (const r of renglones) r.items.sort((a, b) => (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0));
  renglones.sort((a, b) => b.y - a.y);
  return renglones.map((r) => unir(r.items)).join('\n');
}
