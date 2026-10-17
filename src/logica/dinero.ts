// Montos en centavos enteros. Entrada tipeada a la argentina: punto de miles, coma decimal.

const conCentavos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const sinCentavos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const porcentaje = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 });

export function aCentavos(texto: string | number | null | undefined): number | null {
  // Se sacan el $ y todo espacio, también el duro (U+00A0) que mete Intl o el teclado.
  const t = String(texto ?? '').replace(/[$\s ]/g, '');
  if (!t) return null;
  let m: RegExpMatchArray | null;
  let entero: string;
  let decimales = '';
  if ((m = t.match(/^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/))) {
    entero = m[1].replace(/\./g, '');
    decimales = m[2];
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(t)) {
    entero = t.replace(/\./g, '');
  } else if ((m = t.match(/^(\d+)(?:\.(\d{1,2}))?$/))) {
    entero = m[1];
    decimales = m[2] ?? '';
  } else {
    return null;
  }
  return Number(entero) * 100 + Number(decimales.padEnd(2, '0'));
}

export function formatear(centavos: number): string {
  return (centavos % 100 === 0 ? sinCentavos : conCentavos).format(centavos / 100);
}

export function centavosATexto(centavos: number): string {
  const entero = Math.trunc(centavos / 100);
  const resto = centavos % 100;
  return resto ? `${entero},${String(resto).padStart(2, '0')}` : String(entero);
}

export function aCantidad(texto: string | null | undefined): number | null {
  const t = String(texto ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

export function formatearPorcentaje(peso: number): string {
  return porcentaje.format(peso);
}
