// Compartir un comprobante a la app desde otra app (Android): el que llega se guarda acá y, con la
// sesión lista, se manda a Cargar una sola vez. Cargar lo toma con `tomarPendiente`.

import { router } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { useSesion } from '@/sesion/sesion';

import { alCompartir, tomarCompartido } from './compartido';
import type { ArchivoCompartido } from './compartido';

// El comprobante compartido esperando a que Cargar lo lea. Vive en el módulo: lo escriben el hook
// y el propio Cargar (con `tomarPendiente`).
let pendiente: ArchivoCompartido | null = null;

/** Deja listo el comprobante compartido para que Cargar lo tome. */
export function guardarPendiente(a: ArchivoCompartido): void {
  pendiente = a;
}

/** Toma el comprobante compartido y lo borra: la próxima vez devuelve null. */
export function tomarPendiente(): ArchivoCompartido | null {
  const a = pendiente;
  pendiente = null;
  return a;
}

/** Lleva a Cargar el comprobante compartido cuando la sesión está lista, una sola vez. */
export function useCompartidoPendiente(): void {
  const { estado } = useSesion();
  const listo = estado === 'lista';

  const llevarACargar = useCallback((a: ArchivoCompartido | null) => {
    // Si ya hay uno esperando a Cargar, no navega de nuevo.
    if (!a || pendiente !== null) return;
    guardarPendiente(a);
    router.push('/cargar?compartido=1');
  }, []);

  // Lo que había al abrir la app (o al quedar la sesión lista).
  useEffect(() => {
    if (!listo) return;
    let vigente = true;
    void tomarCompartido().then((a) => {
      if (vigente) llevarACargar(a);
    });
    return () => {
      vigente = false;
    };
  }, [listo, llevarACargar]);

  // Lo que llega con la app abierta.
  useEffect(() => {
    // Sin sesión no se toma: el módulo lo guarda y el efecto de arriba lo lleva cuando la sesión esté lista.
    const desuscribir = alCompartir(() => {
      if (listo) void tomarCompartido().then(llevarACargar);
    });
    return desuscribir;
  }, [listo, llevarACargar]);
}
