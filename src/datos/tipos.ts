// Contrato de la capa de datos: lo mismo que stock-hogar/js/datos.js, con tipos.
// Lo implementan la base en memoria (pruebas y maquetas) y Supabase.

import type {
  Categoria,
  Cierre,
  FilaReparto,
  Gasto,
  GastoItem,
  Integrante,
  ModoGasto,
  Producto,
  Transferencia,
} from '@/logica/tipos';

/** Lo que manda la pantalla de carga a guardar_gasto: con `id` edita; sin `id`, da de alta con `nuevo_id`. */
export type GastoAGuardar = {
  id?: string | null;
  /** Elegido por la app: si el alta se reintenta tras un corte, no se duplica. */
  nuevo_id?: string | null;
  fecha: string;
  pagado_por: string;
  total: number;
  modo: ModoGasto;
  categoria_id?: string | null;
  nota?: string | null;
  mp_operacion?: string | null;
  /** Destinatario del comprobante (normalizado): aprende su categoría. */
  destino?: string | null;
};

// Una compra por productos exige precio en cada ítem; los tildados de una compra por total viajan aparte (p_gasto.tildados).
export type ItemAGuardar = Pick<GastoItem, 'producto_id' | 'cantidad'> & { precio_unitario: number };

/** Ítem como lo trae gastosEntre: sin ids, con el nombre y la categoría del producto. */
export type ItemResumen = Pick<GastoItem, 'cantidad' | 'precio_unitario'> & {
  productos: Pick<Producto, 'nombre' | 'categoria_id'> | null;
};

export type GastoConItems = Omit<Gasto, 'gasto_items'> & { gasto_items: ItemResumen[] };

export type ProductoNuevo = Pick<Producto, 'nombre' | 'categoria_id'> &
  Partial<Pick<Producto, 'codigo_barras' | 'marca' | 'stock' | 'oculto'>>;

/** Con `id` actualiza esos campos; sin `id`, da de alta. */
export type IntegranteAGuardar = Partial<Omit<Integrante, 'creado'>>;
export type CategoriaAGuardar = Partial<Categoria>;

export type GastoDeOperacion = Pick<Gasto, 'id' | 'fecha' | 'pagado_por'>;

/** El reparto calculado que se guarda al cerrar (la rama ok de ResultadoReparto). */
export type RepartoACerrar = { total: number; filas: FilaReparto[]; transferencias: Transferencia[] };
/** Con lo que se calculó el reparto: la base lo compara con lo que tiene ahora. */
export type GastoDelCalculo = Pick<Gasto, 'id' | 'total' | 'pagado_por'>;
export type IntegranteDelCalculo = Pick<Integrante, 'id' | 'sueldo' | 'tipo' | 'activo' | 'baja_desde'>;

export interface Datos {
  miIntegrante(email: string): Promise<Integrante | null>;
  integrantes(): Promise<Integrante[]>;
  categorias(): Promise<Categoria[]>;
  productos(): Promise<Producto[]>;
  producto(id: string): Promise<Producto | null>;
  /** Bordes null = sin límite; `hastaExcl` queda afuera. Más nuevos primero. */
  gastosEntre(desde: string | null, hastaExcl: string | null): Promise<GastoConItems[]>;
  gasto(id: string): Promise<{ gasto: Omit<Gasto, 'gasto_items'>; items: GastoItem[] }>;
  mesesCerrados(): Promise<Set<string>>;
  cierre(mes: string): Promise<Cierre | null>;
  crearProducto(p: ProductoNuevo): Promise<Producto>;
  borrarProducto(id: string): Promise<void>;
  ocultarProducto(id: string, oculto: boolean): Promise<void>;
  /** Devuelve el stock nuevo; nunca baja de 0. */
  ajustarStock(productoId: string, delta: number): Promise<number>;
  /** Devuelve el id del gasto guardado. */
  guardarGasto(gasto: GastoAGuardar, items: ItemAGuardar[]): Promise<string>;
  borrarGasto(id: string): Promise<void>;
  gastoPorOperacion(operacion: string): Promise<GastoDeOperacion | null>;
  categoriaDeDestino(nombre: string): Promise<string | null>;
  guardarIntegrante(i: IntegranteAGuardar): Promise<Integrante>;
  guardarCategoria(c: CategoriaAGuardar): Promise<Categoria>;
  borrarCategoria(id: string): Promise<void>;
  /** Rechaza con CIERRE_DESACTUALIZADO si los gastos o integrantes cambiaron desde el cálculo. */
  cerrarMes(
    mes: string,
    resultado: RepartoACerrar,
    gastos: GastoDelCalculo[],
    integrantes: IntegranteDelCalculo[],
  ): Promise<void>;
  reabrirMes(mes: string): Promise<void>;
  /** Avisa ante cualquier cambio; devuelve la función para dejar de escuchar. */
  escucharCambios(alCambiar: () => void): () => void;
}
