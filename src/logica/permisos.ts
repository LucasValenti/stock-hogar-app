// Qué puede hacer cada quien según su acceso. Es la misma regla que aplica la base: acá solo
// decide qué se muestra y qué botones se habilitan; el permiso de verdad lo exige la base.

import type { Acceso, Permiso } from './tipos';

export type Capacidades = {
  /** Ver y editar los sueldos (de todos). */
  verSueldos: boolean;
  /** Cerrar el mes y reabrirlo. */
  cerrarMes: boolean;
  /** Sumar integrantes y darlos de baja. */
  altasYBajas: boolean;
  /** Dar y quitar permisos, y ceder el rol de admin: solo el admin. */
  darPermisos: boolean;
};

const NINGUNA: Capacidades = { verSueldos: false, cerrarMes: false, altasYBajas: false, darPermisos: false };

/** `null` es quien todavía no tiene acceso resuelto (sin sesión o sin cargar): no puede nada. */
export function capacidades(acceso: Acceso | null): Capacidades {
  if (!acceso) return NINGUNA;
  const tiene = (p: Permiso) => acceso.admin || acceso.permisos.includes(p);
  return {
    verSueldos: tiene('sueldos'),
    cerrarMes: tiene('sueldos'),
    altasYBajas: tiene('altas_bajas'),
    darPermisos: acceso.admin,
  };
}

/**
 * Si quien llama puede modificar al integrante `objetivo` (su email, su tipo, su baja).
 * Con «altas y bajas» alcanza para un integrante común; al admin y a quien tiene permisos
 * (que son cosas que da el admin) solo los toca el admin.
 */
export function puedeTocarIntegrante(
  acceso: Acceso | null,
  objetivo: { admin: boolean; permisos: Permiso[] },
): boolean {
  if (!capacidades(acceso).altasYBajas) return false;
  if (acceso?.admin) return true;
  return !objetivo.admin && objetivo.permisos.length === 0;
}
