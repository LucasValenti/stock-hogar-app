// La sesión de la app: quién entró y si esa cuenta es de la casa.
// Supabase guarda la sesión en el dispositivo (AsyncStorage): al abrir la app no hay que volver a ingresar.
// Con EXPO_PUBLIC_DATOS=memoria no hay cuentas: se entra directo como Ana, de la casa de ejemplo.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { datos, esModoMemoria, fijarIntegrante } from '@/datos';
import { obtenerCliente } from '@/datos/cliente';
import { semillaDeEjemplo } from '@/datos/memoria';
import type { Integrante } from '@/logica/tipos';

import { cerrarSesion } from './acceso';
import { estadoDeSesion, type EstadoSesion, type SesionAuth } from './estado';

export { estadoDeSesion } from './estado';
export type { EstadoSesion, SesionAuth } from './estado';

export type Sesion = {
  estado: EstadoSesion;
  /** El integrante de la casa que usa la app; solo en `lista`. */
  yo: Integrante | null;
  /** Email de la cuenta con sesión (en `ajena`, para decir cuál no está en la casa). */
  email: string | null;
  /**
   * Por qué todavía no se pudo saber el estado: falta .env (SIN_CONFIG), sin conexión, etc. `null` si no hubo.
   * Mientras haya error, `estado` queda en `cargando`: la pantalla lo muestra con `mensajeError(error)`.
   */
  error: unknown;
  /** Cierra la sesión de este dispositivo. Lanza el error si no pudo. En modo memoria no hace nada. */
  salir(): Promise<void>;
  /** Vuelve a intentar después de un error. */
  reintentar(): void;
};

const EMAIL_DE_ANA = semillaDeEjemplo.integrantes.find((i) => i.nombre === 'Ana')?.email ?? '';
const SESION_DE_EJEMPLO: SesionAuth = { user: { email: EMAIL_DE_ANA } };

const Contexto = createContext<Sesion | null>(null);

export function useSesion(): Sesion {
  const sesion = useContext(Contexto);
  if (!sesion) throw new Error('useSesion se usa dentro de <SesionProvider>.');
  return sesion;
}

export function SesionProvider({ children }: { children: ReactNode }) {
  // `undefined`: todavía no se sabe si hay sesión. `null`: se sabe que no hay.
  const [session, setSession] = useState<SesionAuth | null | undefined>(() =>
    esModoMemoria() ? SESION_DE_EJEMPLO : undefined,
  );
  // El integrante que corresponde a ese email (o `null` si la cuenta no es de la casa).
  const [miembro, setMiembro] = useState<{ email: string; yo: Integrante | null } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);

  // 1) La sesión de Supabase, ahora y cada vez que cambia (ingreso, cierre, renovación del token).
  useEffect(() => {
    if (esModoMemoria()) return;
    let auth;
    try {
      auth = obtenerCliente().auth;
    } catch (e) {
      setError(e); // Falta .env: la pantalla lo explica en vez de caerse.
      return;
    }
    // Dentro de este aviso no se llama a Supabase (se traba esperando a sí mismo): solo se guarda el estado.
    const {
      data: { subscription },
    } = auth.onAuthStateChange((_evento, nueva) => {
      setSession(nueva);
      if (!nueva) setMiembro(null);
    });
    // Respaldo por si el aviso inicial no llegara: no pisa lo que el aviso ya dijo.
    auth
      .getSession()
      .then(({ data }) => setSession((previa) => (previa === undefined ? data.session : previa)))
      .catch(() => undefined);
    return () => subscription.unsubscribe();
  }, [intento]);

  // 2) A qué integrante corresponde ese email. Se repite solo si cambia el email, no en cada renovación del token.
  const email = session?.user.email ?? null;
  useEffect(() => {
    if (!email) return;
    let vigente = true;
    datos.miIntegrante(email).then(
      (yo) => {
        if (!vigente) return;
        setMiembro({ email, yo });
        setError(null);
      },
      (e: unknown) => {
        if (vigente) setError(e);
      },
    );
    return () => {
      vigente = false;
    };
  }, [email, intento]);

  const salir = useCallback(async () => {
    if (esModoMemoria()) return;
    await cerrarSesion();
  }, []);

  const reintentar = useCallback(() => {
    setError(null);
    setIntento((n) => n + 1);
  }, []);

  const valor = useMemo<Sesion>(() => {
    let estado: EstadoSesion = 'cargando';
    let yo: Integrante | null = null;
    if (error === null && session !== undefined) {
      if (session === null) estado = 'sin-sesion';
      else if (!email) estado = estadoDeSesion(session, null);
      else if (miembro?.email === email) {
        yo = miembro.yo;
        estado = estadoDeSesion(session, yo);
      }
    }
    return { estado, yo, email, error, salir, reintentar };
  }, [error, session, email, miembro, salir, reintentar]);

  // 3) La cola de escritura solo manda lo de quien tiene la sesión lista (ver datos/cola.ts).
  const idListo = valor.estado === 'lista' ? (valor.yo?.id ?? null) : null;
  useEffect(() => {
    fijarIntegrante(idListo);
  }, [idListo]);

  return <Contexto value={valor}>{children}</Contexto>;
}
