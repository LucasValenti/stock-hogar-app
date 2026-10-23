// El texto del aviso de los domingos (F9). Sin imports: lo usa la Edge Function resumen-semanal (Deno) y se
// prueba con Vitest. Los textos y el formato de montos son los mismos que Inicio (src/logica/stock.ts y
// src/logica/dinero.ts); los tests comparan con esas funciones para que no se separen.

export type Resumen = { titulo: string; cuerpo: string };

export type DatosResumen = {
  /** Total de cada gasto de la semana, en centavos. */
  gastos: number[];
  /** Lo que falta, ya en orden (ver faltantesEnOrden). */
  faltantes: string[];
};

const TITULO = 'Stock del hogar';
const sinCentavos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const conCentavos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

/** «Tu semana en la casa: $ 45.200 en 3 gastos. Faltan Leche, Yerba y 2 más.» o `null` si no hay nada que contar. */
export function armarResumen({ gastos, faltantes }: DatosResumen): Resumen | null {
  const partes: string[] = [];
  if (gastos.length) {
    const total = gastos.reduce((suma, g) => suma + g, 0);
    partes.push(`Tu semana en la casa: ${formatearMonto(total)} en ${gastos.length} ${gastos.length === 1 ? 'gasto' : 'gastos'}.`);
  }
  if (faltantes.length) partes.push(textoFaltantes(faltantes));
  return partes.length ? { titulo: TITULO, cuerpo: partes.join(' ') } : null;
}

/** Igual que textoPendientes de Inicio. */
export function textoFaltantes(nombres: string[]): string {
  if (!nombres.length) return '';
  if (nombres.length === 1) return `Falta ${nombres[0]}.`;
  if (nombres.length === 2) return `Faltan ${nombres[0]} y ${nombres[1]}.`;
  return `Faltan ${nombres[0]}, ${nombres[1]} y ${nombres.length - 2} más.`;
}

/** Igual que formatear de la app: sin centavos cuando el monto es entero. */
export function formatearMonto(centavos: number): string {
  return (centavos % 100 === 0 ? sinCentavos : conCentavos).format(centavos / 100);
}

/** Como Inicio: primero los productos sin stock (en el orden recibido), después las anotaciones, de la más vieja a la más nueva. */
export function faltantesEnOrden(productos: string[], anotaciones: Array<{ texto: string; creado: string }>): string[] {
  const notas = [...anotaciones].sort((a, b) => Date.parse(a.creado) - Date.parse(b.creado)).map((a) => a.texto);
  return [...productos, ...notas];
}

const HORAS_ARGENTINA = -3; // UTC−3, sin horario de verano.
const DIA_MS = 24 * 60 * 60 * 1000;

/** De lunes a domingo (AAAA-MM-DD) de la semana de ese instante, con la hora de Argentina. */
export function semanaDe(instante: Date): { desde: string; hasta: string } {
  const enArgentina = new Date(instante.getTime() + HORAS_ARGENTINA * 60 * 60 * 1000);
  const diaSemana = (enArgentina.getUTCDay() + 6) % 7; // lunes = 0 … domingo = 6
  const lunes = new Date(enArgentina.getTime() - diaSemana * DIA_MS);
  const domingo = new Date(lunes.getTime() + 6 * DIA_MS);
  return { desde: lunes.toISOString().slice(0, 10), hasta: domingo.toISOString().slice(0, 10) };
}
