// Cliente de Supabase con la URL y la clave pública de .env (EXPO_PUBLIC_*).
// La sesión queda en AsyncStorage, que en la web usa localStorage: no hay que volver a entrar.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { ErrorConCodigo } from './cola';

/** Falta la configuración de Supabase: la UI lo muestra en vez de caerse. */
export function errorSinConfig(): ErrorConCodigo {
  return Object.assign(
    new Error(
      'Falta configurar la conexión: completá EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en .env, o usá EXPO_PUBLIC_DATOS=memoria.',
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
  // Expo reemplaza process.env.EXPO_PUBLIC_* al compilar: hay que nombrarlas así, completas.
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const clave = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) throw errorSinConfig();

  const cliente = createClient(url, clave, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      // En el teléfono no hay URL de donde leer la sesión.
      detectSessionInUrl: false,
    },
  });

  // En el teléfono, el token se renueva solo mientras la app está en primer plano.
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void cliente.auth.startAutoRefresh();
      else void cliente.auth.stopAutoRefresh();
    });
  }
  return cliente;
}
