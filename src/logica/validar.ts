// Validación de formularios. Devuelve mensajes listos para mostrar al lado de cada campo.
import { mesDe } from './meses';
import { aCentavos } from './dinero';
import type { Integrante, ModoGasto, TipoIntegrante } from './tipos';

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
};

export type CampoGasto = 'fecha' | 'pagado_por' | 'total' | 'categoria_id' | 'items' | 'modo';
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

export function totalItems(items: ReadonlyArray<{ cantidad: number; precio_unitario: number }>): number {
  return items.reduce((s, i) => s + Math.round(i.cantidad * i.precio_unitario), 0);
}

export function validarGasto(g: GastoFormulario, { mesesCerrados = new Set<string>() }: { mesesCerrados?: Set<string> } = {}): ResultadoGasto {
  const errores: ErroresGasto = {};
  let total = 0;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.fecha ?? '')) errores.fecha = 'Elegí una fecha.';
  else if (mesesCerrados.has(mesDe(g.fecha as string))) errores.fecha = 'Ese mes está cerrado. Reabrilo desde Análisis para cargar gastos.';

  if (!g.pagado_por) errores.pagado_por = 'Elegí quién pagó.';

  if (g.modo === 'total') {
    if (!Number.isInteger(g.total) || (g.total as number) <= 0) errores.total = 'Ingresá un monto mayor a 0, por ejemplo 85.000.';
    else total = g.total as number;
    if (!g.categoria_id) errores.categoria_id = 'Elegí una categoría.';
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
