// Fechas 'AAAA-MM-DD' y meses 'AAAA-MM', siempre en hora local.

const dos = (n: number) => String(n).padStart(2, '0');

export function hoy(d: Date = new Date()): string {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

export function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

export function mesActual(d: Date = new Date()): string {
  return mesDe(hoy(d));
}

function mover(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${dos((total % 12) + 1)}`;
}

export const mesSiguiente = (mes: string): string => mover(mes, 1);
export const mesAnterior = (mes: string): string => mover(mes, -1);

export function rangoMes(mes: string): { desde: string; hastaExcl: string } {
  return { desde: `${mes}-01`, hastaExcl: `${mesSiguiente(mes)}-01` };
}

export function nombreMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}

export function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split('-');
  return `${d}/${m}`;
}

export function fechaLarga(fecha: string): string {
  const [a, m, d] = fecha.split('-');
  return `${d}/${m}/${a}`;
}

export function ultimoDia(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${dos(new Date(a, m, 0).getDate())}`;
}

export function diaSiguiente(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return hoy(new Date(a, m - 1, d + 1));
}

/** Fecha tipeada «dd/mm/aaaa» (también «d/m/aaaa») → 'AAAA-MM-DD'; null si no es una fecha que existe. */
export function fechaDesdeTexto(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(a, mes - 1, d);
  if (f.getFullYear() !== a || f.getMonth() !== mes - 1 || f.getDate() !== d) return null;
  return hoy(f);
}
