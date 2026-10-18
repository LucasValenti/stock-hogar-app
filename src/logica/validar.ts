// Validación de formularios. Devuelve mensajes listos para mostrar al lado de cada campo.
import { mesDe } from './meses';
import { aCantidad, aCentavos } from './dinero';
import type { Integrante, ModoGasto, Producto, Tildado, TipoCategoria, TipoIntegrante, Unidad } from './tipos';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Un ítem tal como lo arma el formulario: el precio puede faltar mientras se tipea.
export type ItemFormulario = { producto_id?: string; cantidad: number; precio_unitario: number | null };

// Un gasto tal como lo arma el formulario, antes de validarlo.
export type GastoFormulario = {
  fecha?: string | null;
  pagado_por?: string | null;
  modo?: ModoGasto | '' | null;
  total?: number | null;
  categoria_id?: string | null;
  items?: ItemFormulario[] | null;
  /** Solo en modo 'total': productos que se suman al stock sin precio propio. */
  tildados?: Tildado[] | null;
};

export type CampoGasto = 'fecha' | 'pagado_por' | 'total' | 'categoria_id' | 'items' | 'modo' | 'tildados';
export type ErroresGasto = Partial<Record<CampoGasto, string>>;
export type ResultadoGasto = { ok: boolean; errores: ErroresGasto; total: number };

export type DatosIntegrante = {
  nombre?: string | null;
  sueldo?: string | number | null;
  email?: string | null;
  /** Cualquier valor que no sea 'pagador_externo' cuenta como integrante. */
  tipo?: string | null;
};
export type ErroresIntegrante = Partial<Record<'nombre' | 'sueldo' | 'email', string>>;
export type ResultadoIntegrante = {
  ok: boolean;
  errores: ErroresIntegrante;
  /** `sueldo` falta cuando es pagador externo: no se envía, así el que ya tuviera guardado queda como está. */
  valor: { nombre: string; tipo: TipoIntegrante; email: string; sueldo?: number | null };
};

const UNIDADES: readonly Unidad[] = ['unidad', 'paquete', 'kg', 'litro'];
const DECIMALES_MAX = 3;
const SIN_CANTIDAD = 'Ingresá una cantidad mayor a 0.';

export type DatosProducto = {
  nombre?: string | null;
  marca?: string | null;
  categoria_id?: string | null;
  /** Cualquier valor que no sea una unidad conocida es un error. */
  unidad?: string | null;
};
export type ErroresProducto = Partial<Record<'nombre' | 'categoria_id' | 'unidad', string>>;
export type ResultadoProducto = {
  ok: boolean;
  errores: ErroresProducto;
  valor: { nombre: string; marca: string | null; categoria_id: string; unidad: Unidad };
};

export type ResultadoCantidad = { ok: true; valor: number } | { ok: false; error: string };

/** Solo lo que se pesa o se mide admite decimales. */
export function admiteDecimales(u: Unidad): boolean {
  return u === 'kg' || u === 'litro';
}

// Mensaje de error de una cantidad ya convertida a número, o null si sirve para esa unidad.
function errorDeCantidad(u: Unidad, n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return SIN_CANTIDAD;
  if (!admiteDecimales(u)) return Number.isInteger(n) ? null : 'Para unidades y paquetes, solo números enteros.';
  // La app muestra hasta 3 decimales: más sería guardar algo que nadie ve.
  const factor = 10 ** DECIMALES_MAX;
  return Math.round(n * factor) / factor === n ? null : `Usá hasta ${DECIMALES_MAX} decimales, por ejemplo 1,25.`;
}

// Cantidad tipeada («1,5») según cómo se cuenta el producto.
export function validarCantidad(u: Unidad, texto: string): ResultadoCantidad {
  const n = aCantidad(texto);
  // aCantidad rechaza texto, vacío, negativos y cero.
  if (n === null) return { ok: false, error: SIN_CANTIDAD };
  const error = errorDeCantidad(u, n);
  return error === null ? { ok: true, valor: n } : { ok: false, error };
}

export function validarProducto({ nombre, marca, categoria_id, unidad }: DatosProducto): ResultadoProducto {
  const errores: ErroresProducto = {};
  const unidadValida = UNIDADES.find((u) => u === unidad);
  const valor: ResultadoProducto['valor'] = {
    nombre: String(nombre ?? '').trim(),
    marca: String(marca ?? '').trim() || null,
    categoria_id: categoria_id ?? '',
    unidad: unidadValida ?? 'unidad',
  };
  if (!valor.nombre) errores.nombre = 'Escribí un nombre.';
  if (!valor.categoria_id) errores.categoria_id = 'Elegí una categoría.';
  if (!unidadValida) errores.unidad = 'Elegí cómo se cuenta.';
  return { ok: Object.keys(errores).length === 0, errores, valor };
}

const ANOTACION_MAX = 120;

/** Texto de una anotación rápida, como lo guarda la base: sin espacios sobrantes, de 1 a 120 caracteres. */
export function validarAnotacion(texto: string): { ok: true; valor: string } | { ok: false; error: string } {
  const valor = texto.trim();
  if (!valor) return { ok: false, error: 'Escribí qué falta.' };
  if (valor.length > ANOTACION_MAX) return { ok: false, error: `Usá hasta ${ANOTACION_MAX} caracteres.` };
  return { ok: true, valor };
}

// Los tildados de una compra por total: cada producto existe, una sola vez, con una cantidad que su unidad admite.
function errorDeTildados(tildados: Tildado[], productos: ReadonlyArray<Pick<Producto, 'id' | 'unidad'>>): string | null {
  const unidades = new Map(productos.map((p) => [p.id, p.unidad]));
  const vistos = new Set<string>();
  for (const t of tildados) {
    const unidad = unidades.get(t.producto_id);
    if (!unidad) return 'Hay un producto tildado que ya no existe.';
    if (vistos.has(t.producto_id)) return 'Hay un producto tildado más de una vez.';
    vistos.add(t.producto_id);
    const error = errorDeCantidad(unidad, t.cantidad);
    if (error) return error;
  }
  return null;
}

export function totalItems(items: ReadonlyArray<{ cantidad: number; precio_unitario: number }>): number {
  return items.reduce((s, i) => s + Math.round(i.cantidad * i.precio_unitario), 0);
}

export type OpcionesGasto = {
  mesesCerrados?: Set<string>;
  /** Los productos de la casa: de ahí sale la unidad que decide si un tildado admite decimales. */
  productos?: ReadonlyArray<Pick<Producto, 'id' | 'unidad'>>;
};

export function validarGasto(g: GastoFormulario, { mesesCerrados = new Set<string>(), productos = [] }: OpcionesGasto = {}): ResultadoGasto {
  const errores: ErroresGasto = {};
  let total = 0;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.fecha ?? '')) errores.fecha = 'Elegí una fecha.';
  else if (mesesCerrados.has(mesDe(g.fecha as string))) errores.fecha = 'Ese mes está cerrado. Reabrilo desde Análisis para cargar gastos.';

  if (!g.pagado_por) errores.pagado_por = 'Elegí quién pagó.';

  if (g.modo === 'total') {
    if (!Number.isInteger(g.total) || (g.total as number) <= 0) errores.total = 'Ingresá un monto mayor a 0, por ejemplo 85.000.';
    else total = g.total as number;
    if (!g.categoria_id) errores.categoria_id = 'Elegí una categoría.';
    const error = g.tildados?.length ? errorDeTildados(g.tildados, productos) : null;
    if (error) errores.tildados = error;
  } else if (g.modo === 'productos') {
    const items = g.items ?? [];
    if (!items.length) errores.items = 'Agregá al menos un producto.';
    else if (items.some((i) => !(i.cantidad > 0))) errores.items = 'Cada producto necesita una cantidad mayor a 0.';
    else if (items.some((i) => !Number.isInteger(i.precio_unitario) || (i.precio_unitario as number) < 0)) errores.items = 'Revisá los precios: falta alguno o no es un monto válido.';
    else {
      // Ya se comprobó que todos los precios son enteros.
      total = totalItems(items as Array<{ cantidad: number; precio_unitario: number }>);
      if (total <= 0) errores.items = 'El total de la compra tiene que ser mayor a 0.';
    }
  } else {
    errores.modo = 'Elegí cómo cargar el gasto.';
  }

  return { ok: Object.keys(errores).length === 0, errores, total };
}

export function validarIntegrante({ nombre, sueldo, email, tipo }: DatosIntegrante): ResultadoIntegrante {
  const errores: ErroresIntegrante = {};
  const externo = tipo === 'pagador_externo';
  const valor: ResultadoIntegrante['valor'] = {
    nombre: String(nombre ?? '').trim(),
    tipo: externo ? 'pagador_externo' : 'integrante',
    email: String(email ?? '').trim().toLowerCase(),
  };
  if (!valor.nombre) errores.nombre = 'Escribí un nombre.';
  // El externo no tiene cuota: ni se valida ni se envía el sueldo, así que el que ya hubiera guardado queda como está.
  if (!externo) {
    valor.sueldo = null;
    if (String(sueldo ?? '').trim()) {
      valor.sueldo = aCentavos(sueldo);
      if (valor.sueldo === null) errores.sueldo = 'Ingresá un monto válido, por ejemplo 1.500.000.';
    }
  }
  if (!EMAIL.test(valor.email)) errores.email = 'Escribí un email válido.';
  return { ok: Object.keys(errores).length === 0, errores, valor };
}

// Al cambiar el tipo de alguien que ya existe, el reparto de los meses abiertos se recalcula.
export function avisoCambioTipo(i: Pick<Integrante, 'nombre'> & { tipo?: string | null } | null | undefined, tipoNuevo: TipoIntegrante): string | null {
  if (!i) return null;
  const antes = i.tipo === 'pagador_externo' ? 'pagador_externo' : 'integrante';
  if (antes === tipoNuevo) return null;
  return tipoNuevo === 'pagador_externo'
    ? `${i.nombre} pasa a ser pagador externo: deja de participar del reparto de los meses que no están cerrados y se le devuelve lo que pagó. Los meses cerrados no cambian.`
    : `${i.nombre} pasa a participar del reparto de los meses que no están cerrados, según su sueldo. Los meses cerrados no cambian.`;
}

export type DatosCategoria = { nombre: string; tipo: string; dias: string };
export type ErroresCategoria = Partial<Record<'nombre' | 'dias', string>>;
export type ResultadoCategoria = {
  ok: boolean;
  errores: ErroresCategoria;
  valor: { nombre: string; tipo: TipoCategoria; dias_sin_movimiento: number };
};

/** Nombre, tipo (un tipo desconocido es «producto») y los días de «¿todavía hay?»: entero de 1 a 365, como pide la base. */
export function validarCategoria({ nombre, tipo, dias }: DatosCategoria): ResultadoCategoria {
  const errores: ErroresCategoria = {};
  const n = /^\d+$/.test(dias.trim()) ? Number(dias.trim()) : NaN;
  const valor: ResultadoCategoria['valor'] = {
    nombre: nombre.trim(),
    tipo: tipo === 'servicio' ? 'servicio' : 'producto',
    dias_sin_movimiento: n,
  };
  if (!valor.nombre) errores.nombre = 'Escribí un nombre.';
  if (!(n >= 1 && n <= 365)) errores.dias = 'Poné un número de días entre 1 y 365.';
  return { ok: Object.keys(errores).length === 0, errores, valor };
}
