// Cuentas de la pantalla Análisis: lógica pura.
import { normalizar } from './stock';
import { mesDe, mesAnterior } from './meses';
import type { Gasto, GastoItem } from './tipos';

// Un ítem con el producto embebido (gasto_items(productos(nombre, categoria_id))).
// La categoría puede faltar: el producto pudo quedar sin ella o no haberse traído.
export type ItemAnalisis = Pick<GastoItem, 'precio_unitario'> & {
  cantidad: number | string;
  productos?: { nombre?: string | null; categoria_id?: string | null } | null;
};

// Lo que Análisis necesita de un gasto; un Gasto con sus ítems embebidos cumple.
export type GastoAnalisis = Pick<Gasto, 'id' | 'fecha' | 'pagado_por' | 'modo' | 'categoria_id' | 'total'> & {
  nota?: string | null;
  gasto_items?: ItemAnalisis[] | null;
};

export type FiltrosGastos = { persona?: string; categoria?: string; texto?: string };
export type FilaCategoria = { id: string | null; nombre: string; monto: number; parte: number };
export type TotalMes = { mes: string; total: number };

// Un ítem sin precio (tildado de una compra por total) no suma: el monto de esa compra es su total.
const subtotal = (i: ItemAnalisis) => Math.round(Number(i.cantidad) * (i.precio_unitario ?? 0));

// Gasto por categoría. Una compra por productos se reparte según la categoría de cada producto.
export function porCategoria(gastos: GastoAnalisis[], categorias: Array<{ id: string; nombre: string }>): FilaCategoria[] {
  const nombres = new Map<string | null, string>(categorias.map((c) => [c.id, c.nombre]));
  const sumas = new Map<string | null, number>();
  const sumar = (id: string | null | undefined, monto: number) => sumas.set(id ?? null, (sumas.get(id ?? null) ?? 0) + monto);
  for (const g of gastos) {
    const items = g.gasto_items ?? [];
    if (g.modo === 'productos' && items.length) for (const i of items) sumar(i.productos?.categoria_id, subtotal(i));
    else sumar(g.modo === 'productos' ? null : g.categoria_id, g.total);
  }
  const total = [...sumas.values()].reduce((s, m) => s + m, 0);
  return [...sumas]
    .filter(([, monto]) => monto > 0)
    .map(([id, monto]) => ({ id, nombre: nombres.get(id) ?? 'Sin categoría', monto, parte: monto / total }))
    .sort((a, b) => b.monto - a.monto || a.nombre.localeCompare(b.nombre, 'es'));
}

// Total de cada uno de los últimos `cantidad` meses hasta `hasta`, del más viejo al más nuevo.
export function totalesPorMes(gastos: Array<Pick<Gasto, 'fecha' | 'total'>>, hasta: string, cantidad = 6): TotalMes[] {
  const meses = [hasta];
  while (meses.length < cantidad) meses.unshift(mesAnterior(meses[0]));
  const totales = new Map(meses.map((m) => [m, 0]));
  for (const g of gastos) {
    const m = mesDe(g.fecha);
    if (totales.has(m)) totales.set(m, (totales.get(m) ?? 0) + g.total);
  }
  return meses.map((mes) => ({ mes, total: totales.get(mes) ?? 0 }));
}

// Filtros vacíos no filtran. El texto busca en la nota y en los productos, sin tildes ni mayúsculas.
export function filtrarGastos<G extends GastoAnalisis>(gastos: G[], { persona = '', categoria = '', texto = '' }: FiltrosGastos = {}): G[] {
  const buscado = normalizar(texto);
  return gastos.filter((g) => {
    const items = g.gasto_items ?? [];
    if (persona && g.pagado_por !== persona) return false;
    if (categoria && g.categoria_id !== categoria && !items.some((i) => i.productos?.categoria_id === categoria)) return false;
    if (!buscado) return true;
    return [g.nota, ...items.map((i) => i.productos?.nombre)].some((t) => normalizar(t).includes(buscado));
  });
}

export function tituloCompra(items: ItemAnalisis[] | null | undefined): string {
  const nombres = (items ?? []).map((i) => i.productos?.nombre).filter((n): n is string => Boolean(n));
  if (!nombres.length) return 'Compra por productos';
  if (nombres.length <= 3) return nombres.join(', ');
  return `${nombres.slice(0, 2).join(', ')} y ${nombres.length - 2} más`;
}

// Total de los gastos; con categoría, solo la parte de esa categoría (lo mismo que muestra porCategoria).
export function totalDe(gastos: GastoAnalisis[], categoria = ''): number {
  if (!categoria) return gastos.reduce((s, g) => s + g.total, 0);
  return porCategoria(gastos, []).find((x) => x.id === categoria)?.monto ?? 0;
}
