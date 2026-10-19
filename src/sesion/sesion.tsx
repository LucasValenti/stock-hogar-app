// La sesión de la app: quién entró y si esa cuenta es de la casa.
// Supabase guarda la sesión en el dispositivo (localStorage): al abrir la app no hay que volver a ingresar.
// Con VITE_DATOS=memoria no hay cuentas: se entra directo como Ana, de la casa de ejemplo.
// La demo de tiempo de ejecución (entrarDemo) hace lo mismo en el build normal, sin crear el cliente.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { datos, entrarDemo as entrarEnDemo, esModoMemoria, fijarIntegrante, salirDemo } from '@/datos';
import { obtenerCliente } from '@/datos/cliente';
import { semillaDeEjemplo } from '@/datos/memoria';
import type { Integrante } from '@/logica/tipos';

import { cerrarSesion } from './acceso';
import { estadoDeSesion, integranteDeLaCola, salirSinCola, type EstadoSesion, type SesionAuth } from './estado';

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
  /**
   * Verdadero viendo la casa de ejemplo: con la demo de tiempo de ejecución, o en el build solo-memoria.
   * En los dos casos no se habla con Supabase.
   */
  demo: boolean;
  /** Entra a la casa de ejemplo sin cuenta ni conexión, sin tocar Supabase. */
  entrarDemo(): void;
  /** Cierra la sesión de este dispositivo. Lanza el error si no pudo. En modo memoria no hace nada. */
  salir(): Promise<void>;
  /** Vuelve a intentar después de un error. */
  reintentar(): void;
};

const EMAIL_DE_ANA = semillaDeEjemplo().integrantes.find((i) => i.nombre === 'Ana')?.email ?? '';
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
  // El build solo-memoria arranca en demo; el normal la enciende con `entrarDemo`.
  const [demo, setDemo] = useState(() => esModoMemoria());
  // El integrante que corresponde a ese email (o `null` si la cuenta no es de la casa).
  const [miembro, setMiembro] = useState<{ email: string; yo: Integrante | null } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);
  // El email con el que la cola puede estar mandando ahora (se lee dentro del aviso de Supabase).
  const emailVigente = useRef<string | null>(null);
  const idEnCola = useRef<string | null>(null);

  // 1) La sesión de Supabase, ahora y cada vez que cambia (ingreso, cierre, renovación del token).
  useEffect(() => {
    // En demo no hay cuenta de Supabase que escuchar (y no se crea el cliente).
    if (demo) return;
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
      // Sin sesión o con otra cuenta, la cola deja de mandar ya, sin esperar al próximo render.
      if (!nueva || nueva.user.email !== emailVigente.current) fijarIntegrante(null);
      setSession(nueva);
      if (!nueva) setMiembro(null);
    });
    // Respaldo por si el aviso inicial no llegara: no pisa lo que el aviso ya dijo.
    auth
      .getSession()
      .then(({ data }) => setSession((previa) => (previa === undefined ? data.session : previa)))
      .catch(() => undefined);
    return () => subscription.unsubscribe();
  }, [intento, demo]);

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

  const entrarDemo = useCallback(() => {
    entrarEnDemo();
    setError(null);
    setMiembro(null);
    setSession(SESION_DE_EJEMPLO);
    setDemo(true);
  }, []);

  const salir = useCallback(async () => {
    // El build solo-memoria no tiene cuenta que cerrar.
    if (esModoMemoria()) return;
    // En la demo se sale de vuelta a la pantalla de ingreso, sin tocar Supabase.
    if (demo) {
      salirDemo();
      setError(null);
      setMiembro(null);
      setSession(null);
      setDemo(false);
      return;
    }
    await salirSinCola(cerrarSesion, fijarIntegrante, idEnCola.current);
  }, [demo]);

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
    return { estado, yo, email, error, demo, entrarDemo, salir, reintentar };
  }, [error, session, email, miembro, demo, entrarDemo, salir, reintentar]);

  // 3) La cola de escritura solo manda lo de quien tiene la sesión lista (ver datos/cola.ts).
  const idListo = integranteDeLaCola(valor.estado, valor.yo);
  useEffect(() => {
    emailVigente.current = idListo ? email : null;
    idEnCola.current = idListo;
    fijarIntegrante(idListo);
  }, [idListo, email]);

  return <Contexto value={valor}>{children}</Contexto>;
}
