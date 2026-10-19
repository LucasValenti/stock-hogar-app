// Tipos del dominio: una fila por tabla de supabase/schema.sql (con las migraciones 002 a 007).
// Los bigint (montos en centavos) y los numeric (stock, cantidades) llegan como number.
// Las fechas 'date' llegan como 'AAAA-MM-DD'; las timestamptz, como texto ISO.

export type TipoIntegrante = 'integrante' | 'pagador_externo';

/** Lo que el admin le da a un integrante además de lo común; el admin los tiene todos sin que se le registren. */
export type Permiso = 'sueldos' | 'altas_bajas';

/** Paleta cerrada del perfil (la de la Heladera); la base solo acepta estos valores. */
export type ColorPerfil = 'naranja' | 'verde' | 'azul' | 'rosa' | 'violeta' | 'amarillo';

/** Lo que puede hacer quien usa la app: `admin` pasa cualquier permiso; `permisos` son solo los propios registrados. */
export type Acceso = { admin: boolean; permisos: Permiso[] };

export type Integrante = {
  id: string;
  nombre: string;
  /**
   * Centavos. Null mientras no se cargó; el pagador externo no lo necesita.
   * Transición: pasa a vivir aparte (`Datos.sueldos()`), y en memoria solo lo trae quien tiene el permiso.
   */
  sueldo: number | null;
  email: string;
  activo: boolean;
  /** Mes 'AAAA-MM' desde el cual dejó de participar. */
  baja_desde: string | null;
  tipo: TipoIntegrante;
  creado: string;
  /** Uno solo en la casa; solo `cederAdmin` cambia quién es. */
  admin: boolean;
  /** Color del perfil que eligió cada uno; null si todavía no eligió. */
  color: ColorPerfil | null;
};

export type TipoCategoria = 'producto' | 'servicio';

export type Categoria = {
  id: string;
  nombre: string;
  tipo: TipoCategoria;
  /** De 1 a 365. Pasado ese tiempo sin movimiento, la app pregunta si todavía hay (por defecto 20). */
  dias_sin_movimiento: number;
};

/** Cómo se cuenta un producto. Solo kg y litro admiten decimales. */
export type Unidad = 'unidad' | 'paquete' | 'kg' | 'litro';

export type Producto = {
  id: string;
  codigo_barras: string | null;
  nombre: string;
  marca: string | null;
  categoria_id: string;
  stock: number;
  unidad: Unidad;
  /** Última vez que el stock se movió o que alguien confirmó que sigue habiendo (timestamptz ISO). */
  ultimo_movimiento: string;
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
  /** Centavos. Null en los productos tildados de una compra por total: no tienen precio propio. */
  precio_unitario: number | null;
  /** Embebido cuando la consulta pide gasto_items(productos(nombre, categoria_id)). */
  productos?: Pick<Producto, 'nombre' | 'categoria_id'> | null;
};

/** Producto tildado en una compra por total: suma stock sin precio. Va en p_gasto.tildados. */
export type Tildado = {
  producto_id: string;
  cantidad: number;
};

/** Nota suelta para la próxima compra («comprar pan»). Se borra al tildarla en un gasto (p_gasto.anotaciones). */
export type Anotacion = {
  id: string;
  /** De 1 a 120 caracteres. */
  texto: string;
  creado_por: string | null;
  creado: string;
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
