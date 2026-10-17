// Cliente de Supabase con la URL y la clave pública de .env (EXPO_PUBLIC_*).
// La sesión queda en AsyncStorage, que en la web usa localStorage: no hay que volver a entrar.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

export function crearCliente(): SupabaseClient {
  // Expo reemplaza process.env.EXPO_PUBLIC_* al compilar: hay que nombrarlas así, completas.
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const clave = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) {
    throw new Error(
      'Faltan EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en .env (o usá EXPO_PUBLIC_DATOS=memoria).',
    );
  }

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
