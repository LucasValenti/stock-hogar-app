// La capa de datos de la app: memoria o Supabase según EXPO_PUBLIC_DATOS, con la cola de escritura.
// guardarGasto pasa por la cola: sin red queda pendiente y sale al volver la conexión.
// Todo se arma en el primer uso, no al importar: si falta .env, el error (SIN_CONFIG) llega
// a quien llamó y la UI lo puede mostrar, en vez de romper la app al arrancar.

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState, Platform } from 'react-native';

import { obtenerCliente } from './cliente';
import { conCola, crearCola, ejecutorDe, esErrorDeRed, type Cola, type DatosConCola, type Op } from './cola';
import { crearDatosEnMemoria, semillaDeEjemplo } from './memoria';
import { vaciarAlVolver } from './reintentos';
import { crearDatosSupabase } from './supabase';
import type { Datos } from './tipos';

export type { Datos } from './tipos';
export type { Cola, DatosConCola, ErrorConCodigo, GuardadoDeGasto, Op, OpNueva, Rechazada } from './cola';

type AlDescartar = (op: Op, error: unknown) => void;
const oyentesDeDescarte = new Set<AlDescartar>();

/** Avisa cuando la base rechazó de forma definitiva una escritura pendiente: pasa a `obtenerCola().rechazadas()`. */
export function escucharDescartes(fn: AlDescartar): () => void {
  oyentesDeDescarte.add(fn);
  return () => {
    oyentesDeDescarte.delete(fn);
  };
}

/** Con EXPO_PUBLIC_DATOS=memoria la app corre con la casa de ejemplo y sin cuenta ni red. */
export const esModoMemoria = (): boolean => process.env.EXPO_PUBLIC_DATOS === 'memoria';

let capa: { datos: DatosConCola; cola: Cola } | null = null;

// El integrante con sesión lista (lo fija SesionProvider). La cola solo escribe con él.
let integranteActual: string | null = null;

/**
 * La sesión avisa quién está usando la app: `null` si no hay sesión lista.
 * Al entrar alguien, salen las escrituras que ese integrante dejó pendientes.
 */
export function fijarIntegrante(id: string | null): void {
  integranteActual = id;
  if (id && capa) capa.cola.vaciar().catch(() => undefined);
}

// Si falla (falta .env), no queda nada a medias: el próximo uso vuelve a intentar.
function iniciar(): { datos: DatosConCola; cola: Cola } {
  if (capa) return capa;
  const base: Datos =
    esModoMemoria()
      ? crearDatosEnMemoria(semillaDeEjemplo)
      : crearDatosSupabase(obtenerCliente());
  const cola = crearCola({
    almacen: AsyncStorage,
    ejecutar: ejecutorDe(base),
    esErrorDeRed,
    integranteActual: () => integranteActual,
    alDescartar: (op, error) => oyentesDeDescarte.forEach((f) => f(op, error)),
  });
  capa = { datos: conCola(base, cola), cola };
  // Reintenta al volver la red, al volver la app al frente y (web) con online/visibilitychange.
  const enLaWeb = Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined';
  vaciarAlVolver(() => void cola.vaciar().catch(() => undefined), {
    web: Platform.OS === 'web',
    netInfo: NetInfo,
    appState: AppState,
    ventana: enLaWeb ? window : undefined,
    documento: enLaWeb ? document : undefined,
  });
  return capa;
}

/** Lanza el error SIN_CONFIG si falta la configuración de Supabase. */
export const obtenerDatos = (): DatosConCola => iniciar().datos;
export const obtenerCola = (): Cola => iniciar().cola;

// Los métodos que no devuelven promesa: ahí el error se lanza; en el resto, la promesa rechaza.
const SINCRONOS = new Set<PropertyKey>(['escucharCambios']);

/** `datos.metodo(...)` arma la capa en la primera llamada. */
export const datos: DatosConCola = new Proxy({} as DatosConCola, {
  get(_, clave) {
    // Que no parezca una promesa (then) ni engañe a quien inspecciona símbolos.
    if (typeof clave === 'symbol' || clave === 'then') return undefined;
    return (...args: unknown[]) => {
      try {
        const d = iniciar().datos as unknown as Record<PropertyKey, (...a: unknown[]) => unknown>;
        return d[clave](...args);
      } catch (e) {
        if (SINCRONOS.has(clave)) throw e;
        return Promise.reject(e);
      }
    };
  },
});
