// Lo que la cola de escritura tiene del integrante con sesión: cuántos gastos esperan conexión y los que
// la base rechazó (con el motivo y «Descartar»). Las ops de otra cuenta en el mismo teléfono no se muestran.
// Se vuelve a leer al montar, cuando cambia algo en la casa (sale lo pendiente), cuando la base rechaza
// una op y cuando la pantalla lo pide (`refresco`, por ejemplo después de guardar).
import { useCallback, useEffect, useRef, useState } from 'react';

import { datos, escucharDescartes, obtenerCola, type Rechazada } from '@/datos';
import { formatear } from '@/logica/dinero';
import { mensajeError } from '@/logica/errores';
import { fechaCorta } from '@/logica/meses';
import { useSesion } from '@/sesion/sesion';

import estilos from './AvisoCola.module.css';
import { Boton } from './Boton';
import { Icono } from './Icono';
import { Tarjeta } from './Tarjeta';

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
    <Tarjeta aria-live="polite" className={estilos.aviso}>
      {pendientes ? (
        <div className={estilos.fila}>
          <span className={estilos.icono}>
            <Icono nombre="nube" tamano={20} />
          </span>
          <p className={estilos.texto}>
            {pendientes === 1
              ? '1 gasto guardado en el celu: se manda cuando vuelva la conexión.'
              : `${pendientes} gastos guardados en el celu: se mandan cuando vuelva la conexión.`}
          </p>
        </div>
      ) : null}
      {rechazadas.map((r, i) => (
        <div key={r.op.id} className={[estilos.rechazada, (pendientes || i > 0) && estilos.separada].filter(Boolean).join(' ')}>
          <p className={estilos.titulo}>{`No se pudo guardar ${queEra(r)}.`}</p>
          <p className={estilos.motivo}>{mensajeError({ code: r.code, message: r.message })}</p>
          <Boton texto="Descartar" variante="borde" onClick={() => void descartar(r.op.id)} />
        </div>
      ))}
    </Tarjeta>
  );
}
