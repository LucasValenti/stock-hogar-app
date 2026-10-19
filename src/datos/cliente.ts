// Cliente de Supabase con la URL y la clave pública de .env (VITE_*).
// La sesión queda en localStorage: no hay que volver a entrar.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { ErrorConCodigo } from './cola';

/** Falta la configuración de Supabase: la UI lo muestra en vez de caerse. */
export function errorSinConfig(): ErrorConCodigo {
  return Object.assign(
    new Error(
      'Falta configurar la conexión: completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env, o usá VITE_DATOS=memoria.',
    ),
    { code: 'SIN_CONFIG' },
  );
}

let unico: SupabaseClient | null = null;

/**
 * El cliente de la app, creado en el primer uso (no al importar) y compartido: la capa de datos
 * y el ingreso (auth) tienen que usar el mismo, porque cada cliente maneja su propia sesión.
 * Lanza SIN_CONFIG si falta .env; en ese caso no queda nada a medias y el próximo uso reintenta.
 */
export function obtenerCliente(): SupabaseClient {
  unico ??= crearCliente();
  return unico;
}

function crearCliente(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const clave = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !clave) throw errorSinConfig();

  return createClient(url, clave, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // En la web la sesión no llega por la URL.
      detectSessionInUrl: false,
    },
  });
}
