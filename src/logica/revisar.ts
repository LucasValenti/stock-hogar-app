// «¿Todavía hay?»: productos con stock que hace mucho no se mueven y conviene confirmar.
import type { Cantidad } from './stock';
import type { Categoria } from './tipos';

const DIA_MS = 24 * 60 * 60 * 1000;
// Igual que el default de categorias.dias_sin_movimiento en la base.
const DIAS_POR_DEFECTO = 20;

export type ProductoRevisable = {
  nombre: string;
  categoria_id: string;
  stock: Cantidad;
  oculto?: boolean;
  /** Texto ISO (timestamptz). */
  ultimo_movimiento: string;
};

// Con stock, a la vista, y con tantos días sin movimiento como pide su categoría (20 días justos ya cuentan).
// Del que lleva más tiempo quieto al que menos; a igual fecha, por nombre.
export function paraRevisar<P extends ProductoRevisable>(
  productos: P[],
  categorias: ReadonlyArray<Pick<Categoria, 'id' | 'dias_sin_movimiento'>>,
  ahora: Date,
): P[] {
  const umbral = new Map(categorias.map((c) => [c.id, c.dias_sin_movimiento]));
  const desde = (p: P) => Date.parse(p.ultimo_movimiento);
  return productos
    .filter((p) => {
      if (p.oculto || !(Number(p.stock) > 0)) return false;
      // Una fecha ilegible da NaN y una futura, negativo: ninguna de las dos pide revisar.
      return ahora.getTime() - desde(p) >= (umbral.get(p.categoria_id) ?? DIAS_POR_DEFECTO) * DIA_MS;
    })
    .sort((a, b) => desde(a) - desde(b) || a.nombre.localeCompare(b.nombre, 'es'));
}
