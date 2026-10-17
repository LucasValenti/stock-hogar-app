// Las llamadas de ingreso a Supabase Auth. Lanzan el error de Supabase si fallan:
// la pantalla lo traduce con mensajeError / mensajeDeCodigo.

import { obtenerCliente } from '@/datos/cliente';

/** Manda el código de un solo uso. Solo a cuentas que ya existen: así nadie de afuera usa el ingreso para mandar correos. */
export async function pedirCodigo(email: string): Promise<void> {
  const { error } = await obtenerCliente().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) throw error;
}

/** Si el código sirve, Supabase guarda la sesión y avisa (SIGNED_IN): SesionProvider hace el resto. */
export async function verificarCodigo(email: string, codigo: string): Promise<void> {
  const { error } = await obtenerCliente().auth.verifyOtp({ email, token: codigo, type: 'email' });
  if (error) throw error;
}

/** Cierra solo en este dispositivo (scope local): no necesita red y no saca a la persona de sus otros dispositivos. */
export async function cerrarSesion(): Promise<void> {
  const { error } = await obtenerCliente().auth.signOut({ scope: 'local' });
  if (error) throw error;
}
