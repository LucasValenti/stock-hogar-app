// Qué pantalla corresponde según la sesión de Supabase y si esa cuenta es de la casa.
// Es pura para poder probarla sin Supabase ni React.

import type { Integrante } from '@/logica/tipos';

/** Lo único que la app mira de la sesión de Supabase. */
export type SesionAuth = { user: { email?: string | null } };

export type EstadoSesion = 'cargando' | 'sin-sesion' | 'ajena' | 'lista';

/**
 * Sin sesión: hay que ingresar. Con sesión pero sin integrante con ese email: la cuenta existe
 * pero no es de la casa ('ajena'). Con los dos: se puede usar la app.
 * 'cargando' no sale de acá: es mientras todavía no se sabe alguno de los dos datos.
 */
export function estadoDeSesion(
  session: SesionAuth | null,
  integrante: Integrante | null,
): Exclude<EstadoSesion, 'cargando'> {
  if (!session) return 'sin-sesion';
  return integrante ? 'lista' : 'ajena';
}

/** El integrante con el que la cola de escritura puede mandar: solo con la sesión lista. */
export function integranteDeLaCola(estado: EstadoSesion, yo: Integrante | null): string | null {
  return estado === 'lista' && yo ? yo.id : null;
}

/**
 * Cierra la sesión sin dejar una ventana en la que la cola mande lo pendiente con la sesión cerrándose:
 * primero se le quita el integrante a la cola y recién después se cierra. Si no se pudo cerrar,
 * la cola vuelve a ser de quien estaba.
 */
export async function salirSinCola(
  cerrar: () => Promise<void>,
  fijar: (id: string | null) => void,
  idActual: string | null,
): Promise<void> {
  fijar(null);
  try {
    await cerrar();
  } catch (e) {
    fijar(idActual);
    throw e;
  }
}
