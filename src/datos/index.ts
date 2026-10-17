// La capa de datos de la app: memoria o Supabase según EXPO_PUBLIC_DATOS, con la cola de escritura.
// guardarGasto y ajustarStock pasan por la cola: sin red quedan pendientes y salen al volver la conexión.

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import { crearCliente } from './cliente';
import { conCola, crearCola, ejecutorDe, esErrorDeRed, type DatosConCola, type Op } from './cola';
import { crearDatosEnMemoria, semillaDeEjemplo } from './memoria';
import { crearDatosSupabase } from './supabase';
import type { Datos } from './tipos';

export type { Datos } from './tipos';
export type { AjusteDeStock, DatosConCola, GuardadoDeGasto, Op } from './cola';

const base: Datos =
  process.env.EXPO_PUBLIC_DATOS === 'memoria'
    ? crearDatosEnMemoria(semillaDeEjemplo)
    : crearDatosSupabase(crearCliente());

type AlDescartar = (op: Op, error: unknown) => void;
const oyentesDeDescarte = new Set<AlDescartar>();

/** Avisa cuando una escritura pendiente se descartó porque la base la rechazó (no por red). */
export function escucharDescartes(fn: AlDescartar): () => void {
  oyentesDeDescarte.add(fn);
  return () => {
    oyentesDeDescarte.delete(fn);
  };
}

export const cola = crearCola({
  almacen: AsyncStorage,
  ejecutar: ejecutorDe(base),
  esErrorDeRed,
  alDescartar: (op, error) => oyentesDeDescarte.forEach((f) => f(op, error)),
});

export const datos: DatosConCola = conCola(base, cola);

// NetInfo anda en nativo y en la web (ahí escucha los eventos online/offline del navegador).
// Avisa también al arrancar: si quedó algo de la sesión anterior, sale ahora.
NetInfo.addEventListener((estado) => {
  if (estado.isConnected !== false) cola.vaciar().catch(() => undefined);
});
