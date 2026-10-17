// Tipos del dominio: una fila por tabla de supabase/schema.sql (con las migraciones 002 a 006).
// Los bigint (montos en centavos) y los numeric (stock, cantidades) llegan como number.
// Las fechas 'date' llegan como 'AAAA-MM-DD'; las timestamptz, como texto ISO.

export type TipoIntegrante = 'integrante' | 'pagador_externo';

export type Integrante = {
  id: string;
  nombre: string;
  /** Centavos. Null mientras no se cargó; el pagador externo no lo necesita. */
  sueldo: number | null;
  email: string;
  activo: boolean;
  /** Mes 'AAAA-MM' desde el cual dejó de participar. */
  baja_desde: string | null;
  tipo: TipoIntegrante;
  creado: string;
};

export type TipoCategoria = 'producto' | 'servicio';

export type Categoria = {
  id: string;
  nombre: string;
  tipo: TipoCategoria;
};

export type Producto = {
  id: string;
  codigo_barras: string | null;
  nombre: string;
  marca: string | null;
  categoria_id: string;
  stock: number;
  /** Con compras viejas pero ya sin uso: sale de Stock, de pendientes y del buscador. */
  oculto: boolean;
  creado: string;
};

export type ModoGasto = 'productos' | 'total';

export type GastoItem = {
  id: string;
  gasto_id: string;
  producto_id: string;
  cantidad: number;
  /** Centavos. */
  precio_unitario: number;
  /** Embebido cuando la consulta pide gasto_items(productos(nombre, categoria_id)). */
  productos?: Pick<Producto, 'nombre' | 'categoria_id'> | null;
};

export type Gasto = {
  id: string;
  /** 'AAAA-MM-DD'. */
  fecha: string;
  pagado_por: string;
  /** Centavos. */
  total: number;
  modo: ModoGasto;
  /** Solo en modo 'total'; en modo 'productos' es null. */
  categoria_id: string | null;
  nota: string | null;
  creado_por: string | null;
  creado: string;
  /** N.º de operación del comprobante de Mercado Pago; único. */
  mp_operacion: string | null;
  /** Embebido cuando la consulta pide gasto_items(...). */
  gasto_items?: GastoItem[] | null;
};

// Lo que calcula el reparto y se guarda en cierres.detalle.
export type FilaReparto = {
  id: string;
  nombre: string;
  participa: boolean;
  /** Parte del sueldo total, de 0 a 1. */
  peso: number;
  leCorresponde: number;
  pago: number;
  saldo: number;
};

export type Transferencia = {
  de: string;
  a: string;
  monto: number;
};

export type DetalleCierre = {
  filas: FilaReparto[];
  transferencias: Transferencia[];
};

export type Cierre = {
  /** 'AAAA-MM'. */
  mes: string;
  total: number;
  detalle: DetalleCierre;
  cerrado_por: string | null;
  fecha: string;
};
