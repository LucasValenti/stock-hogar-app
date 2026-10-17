// Stock y pendientes: lógica pura, sin DOM ni red.

// El stock y las cantidades pueden llegar como número o como texto numérico ('0.5'); siempre se pasan por Number.
export type Cantidad = number | string;

// Lo mínimo que cada función pide de un producto; un Producto completo cumple.
export type ProductoBuscable = { nombre: string; marca?: string | null };
// `object &` evita que TypeScript rechace productos que no traen `oculto` (un tipo con todo opcional es 'débil').
export type ConOculto = object & { oculto?: boolean };
export type ProductoConStock = ConOculto & { stock: Cantidad };
export type ProductoVisible = ProductoBuscable & ProductoConStock & { id: string };

export type VistaStock = 'todo' | 'pendientes' | 'ocultos';
export type AccionProducto = 'mostrar' | 'ocultar' | 'borrar';

export type GrupoCategoria<P, C extends { id: string; nombre: string }> = {
  categoria: C | { id: null; nombre: string };
  productos: P[];
};

const cantidad = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3, useGrouping: false });

export function normalizar(texto: string | null | undefined): string {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Cada palabra buscada tiene que aparecer en el nombre o la marca.
export function filtrarProductos<P extends ProductoBuscable>(productos: P[], texto: string): P[] {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return productos;
  return productos.filter((p) => {
    const donde = normalizar(`${p.nombre} ${p.marca ?? ''}`);
    return palabras.every((w) => donde.includes(w));
  });
}

export function esPendiente(p: { stock: Cantidad }): boolean {
  return Number(p.stock) <= 0;
}

// Un producto oculto (con compras viejas pero que ya no se usa) sale de Stock, de pendientes y del buscador.
export function enStock<P extends ConOculto>(productos: P[]): P[] {
  return productos.filter((p) => !p.oculto);
}

export function ocultos<P extends ConOculto>(productos: P[]): P[] {
  return productos.filter((p) => p.oculto);
}

export function pendientes<P extends ProductoConStock>(productos: P[]): P[] {
  return enStock(productos).filter(esPendiente);
}

// Lo que ofrece la ficha: borrar lo que nunca se compró, ocultar lo que sí, y volver a mostrar lo oculto.
export function accionProducto(p: ConOculto, tieneCompras: boolean): AccionProducto {
  if (p.oculto) return 'mostrar';
  return tieneCompras ? 'ocultar' : 'borrar';
}

export function agruparPorCategoria<P extends { categoria_id: string | null; nombre: string }, C extends { id: string; nombre: string }>(
  productos: P[],
  categorias: C[],
): Array<GrupoCategoria<P, C>> {
  const grupos = new Map<string | null, GrupoCategoria<P, C>>(categorias.map((c) => [c.id, { categoria: c, productos: [] }]));
  const sinCategoria: GrupoCategoria<P, C> = { categoria: { id: null, nombre: 'Sin categoría' }, productos: [] };
  for (const p of productos) (grupos.get(p.categoria_id) ?? sinCategoria).productos.push(p);
  const conProductos = [...grupos.values(), sinCategoria].filter((g) => g.productos.length);
  for (const g of conProductos) g.productos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return conProductos;
}

// Igual que la base: nunca menos de 0.
export function aplicarDelta(stock: Cantidad, delta: number): number {
  return Math.max(0, Math.round((Number(stock) + delta) * 1000) / 1000);
}

// El "−": en enteros baja 1; si hay decimales (algo por kg), baja al entero de abajo
// (1,5 → 1 → 0), así un queso de 0,75 kg se termina de un toque.
export function deltaMenos(stock: Cantidad): number {
  const n = Number(stock);
  if (n <= 0) return 0;
  const destino = Number.isInteger(n) ? n - 1 : Math.floor(n);
  return Math.round((destino - n) * 1000) / 1000;
}

export function formatearCantidad(n: Cantidad): string {
  return cantidad.format(Number(n));
}

export function textoPendientes(nombres: string[]): string {
  if (!nombres.length) return '';
  if (nombres.length === 1) return `Falta ${nombres[0]}.`;
  if (nombres.length === 2) return `Faltan ${nombres[0]} y ${nombres[1]}.`;
  return `Faltan ${nombres[0]}, ${nombres[1]} y ${nombres.length - 2} más.`;
}

// Lo que se ve en Stock. En Pendientes quedan también los tocados en esta visita,
// para que una fila no desaparezca bajo el dedo de quien la está tocando.
export function productosVisibles<P extends ProductoVisible>(
  productos: P[],
  { vista, busqueda, tocados = new Set<string>() }: { vista: VistaStock; busqueda: string; tocados?: Set<string> },
): P[] {
  if (vista === 'ocultos') return filtrarProductos(ocultos(productos), busqueda);
  const visibles = enStock(productos);
  const base = vista === 'pendientes' ? visibles.filter((p) => esPendiente(p) || tocados.has(p.id)) : visibles;
  return filtrarProductos(base, busqueda);
}
