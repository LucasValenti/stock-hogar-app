// Lo que la cola de escritura tiene del integrante con sesión: cuántos gastos esperan conexión y los que
// la base rechazó (con el motivo y «Descartar»). Las ops de otra cuenta en el mismo teléfono no se muestran.
// Se vuelve a leer al montar, cuando cambia algo en la casa (sale lo pendiente), cuando la base rechaza
// una op y cuando la pantalla lo pide (`refresco`, por ejemplo después de guardar).

import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { datos, escucharDescartes, obtenerCola, type Rechazada } from '@/datos';
import { formatear } from '@/logica/dinero';
import { mensajeError } from '@/logica/errores';
import { fechaCorta } from '@/logica/meses';
import { useSesion } from '@/sesion/sesion';
import { useTema } from '@/tema/tema';

import { Boton } from './Boton';
import { Icono } from './Icono';
import { Tarjeta } from './Tarjeta';
import { Texto } from './Texto';

type Estado = { pendientes: number; rechazadas: Rechazada[] };

/** «el gasto del 12/10 por $ 500», si la op trae esos datos. */
function queEra(r: Rechazada): string {
  const g = (r.op.datos as { gasto?: { fecha?: unknown; total?: unknown } } | null)?.gasto;
  if (typeof g?.fecha === 'string' && typeof g.total === 'number') {
    return `el gasto del ${fechaCorta(g.fecha)} por ${formatear(g.total)}`;
  }
  return 'un gasto';
}

/** `soloRechazadas`: la pantalla ya dice que hay algo esperando (Cargar en cola); los rechazos se muestran igual. */
export function AvisoCola({ refresco = 0, soloRechazadas = false }: { refresco?: number; soloRechazadas?: boolean }) {
  const tema = useTema();
  const { yo } = useSesion();
  const yoId = yo?.id ?? null;
  const [estado, setEstado] = useState<Estado>({ pendientes: 0, rechazadas: [] });
  const vigente = useRef(true);

  const leer = useCallback(async () => {
    if (!yoId) return;
    try {
      const cola = obtenerCola();
      const [pendientes, rechazadas] = await Promise.all([cola.pendientes(), cola.rechazadas()]);
      if (!vigente.current) return;
      setEstado({
        pendientes: pendientes.filter((o) => o.duenio === yoId).length,
        rechazadas: rechazadas.filter((r) => r.op.duenio === yoId),
      });
    } catch {
      // Sin configuración o sin almacenamiento: no hay nada que avisar acá.
    }
  }, [yoId]);

  useEffect(() => {
    vigente.current = true;
    void leer();
    const dejar: Array<() => void> = [];
    try {
      dejar.push(escucharDescartes(() => void leer()));
      dejar.push(datos.escucharCambios(() => void leer()));
    } catch {
      // Sin configuración: la pantalla ya muestra ese error.
    }
    return () => {
      vigente.current = false;
      dejar.forEach((f) => f());
    };
  }, [leer, refresco]);

  async function descartar(opId: string) {
    try {
      await obtenerCola().olvidarRechazada(opId);
    } finally {
      await leer();
    }
  }

  const { rechazadas } = estado;
  const pendientes = soloRechazadas ? 0 : estado.pendientes;
  if (!pendientes && !rechazadas.length) return null;
  return (
    <Tarjeta accessibilityLiveRegion="polite">
      {pendientes ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tema.espacio.s }}>
          <Icono nombre="nube" tamano={tema.medida.icono} color={tema.color.textoSuave} />
          <Texto style={{ flexShrink: 1 }}>
            {pendientes === 1
              ? '1 gasto guardado en el celu: se manda cuando vuelva la conexión.'
              : `${pendientes} gastos guardados en el celu: se mandan cuando vuelva la conexión.`}
          </Texto>
        </View>
      ) : null}
      {rechazadas.map((r, i) => (
        <View
          key={r.op.id}
          style={{
            gap: tema.espacio.s,
            paddingTop: pendientes || i > 0 ? tema.espacio.s : 0,
            borderTopWidth: pendientes || i > 0 ? tema.medida.borde : 0,
            borderTopColor: tema.color.borde,
          }}
        >
          <Texto variante="fuerte">{`No se pudo guardar ${queEra(r)}.`}</Texto>
          <Texto variante="sub">{mensajeError({ code: r.code, message: r.message })}</Texto>
          <Boton texto="Descartar" variante="borde" onPress={() => void descartar(r.op.id)} />
        </View>
      ))}
    </Tarjeta>
  );
}
