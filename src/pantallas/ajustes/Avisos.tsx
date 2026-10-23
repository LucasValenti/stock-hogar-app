// Avisos (Ajustes): cada uno prende o apaga el resumen de los domingos en este navegador. Prendido quiere
// decir que el navegador está suscripto y que esa suscripción está en la base a su nombre (si se la llevó otra
// cuenta en un dispositivo compartido, figura apagado). Donde no se puede, explica por qué.
import { useEffect, useMemo, useState } from 'react';

import { CLAVE_PUBLICA, entornoAvisos, pedirPermiso, suscribir, suscripcionDelNavegador } from '@/avisos/navegador';
import { datos } from '@/datos';
import { aSuscripcion, estadoAvisos, textoEstado } from '@/logica/avisos';
import { mensajeError } from '@/logica/errores';
import { useSesion } from '@/sesion/sesion';
import { Interruptor } from '@/ui/Interruptor';
import { MensajeError } from '@/ui/MensajeError';
import { Tarjeta } from '@/ui/Tarjeta';

import comunes from '../Ajustes.module.css';

export function Avisos() {
  const { demo } = useSesion();
  const entorno = useMemo(() => entornoAvisos(demo), [demo]);
  const [permiso, setPermiso] = useState(entorno.permiso);
  const estado = estadoAvisos({ ...entorno, permiso });
  // `null` mientras se averigua si ya estaban prendidos.
  const [activo, setActivo] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (estado !== 'disponible') return;
    let vigente = true;
    (async () => {
      try {
        const sub = await suscripcionDelNavegador();
        const mias = sub ? await datos.misSuscripciones() : [];
        if (vigente) setActivo(!!sub && mias.includes(sub.endpoint));
      } catch (e) {
        if (!vigente) return;
        setActivo(false);
        setError(mensajeError(e));
      }
    })();
    return () => {
      vigente = false;
    };
  }, [estado]);

  async function activar() {
    setError(null);
    setOcupado(true);
    let sub: PushSubscription | null = null;
    // Solo se deshace la suscripción que crea este toque: una que ya estaba (de otra cuenta, o de antes) sigue.
    let creadaAhora = false;
    try {
      const respuesta = await pedirPermiso();
      setPermiso(respuesta);
      if (respuesta === 'default') setError('Para recibir el resumen, aceptá el permiso de avisos que pide el navegador.'); // [PENDIENTE: validar con Lucas]
      if (respuesta !== 'granted') return;
      const previa = await suscripcionDelNavegador();
      sub = previa ?? (await suscribir(CLAVE_PUBLICA));
      creadaAhora = !previa;
      const suscripcion = aSuscripcion(sub.toJSON());
      if (!suscripcion) throw new Error('El navegador no dio una suscripción para los avisos.'); // [PENDIENTE: validar con Lucas]
      await datos.guardarSuscripcion(suscripcion);
      setActivo(true);
    } catch (e) {
      // Sin la base no hay avisos: el navegador no queda suscripto a medias.
      if (creadaAhora) await sub?.unsubscribe().catch(() => undefined);
      setActivo(false);
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setError(null);
    setOcupado(true);
    try {
      const sub = await suscripcionDelNavegador();
      if (sub) {
        await datos.borrarSuscripcion(sub.endpoint);
        await sub.unsubscribe();
      }
      setActivo(false);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  }

  const porQue = textoEstado(estado);
  return (
    <>
      {/* [PENDIENTE: validar con Lucas] */}
      <p className={comunes.sub}>Te llega los domingos a las 20 con lo que se gastó en la semana y lo que falta.</p>
      {porQue ? (
        <p className={comunes.sub}>{porQue}</p>
      ) : (
        <Tarjeta>
          <Interruptor
            texto="Resumen de los domingos" // [PENDIENTE: validar con Lucas]
            activo={activo === true}
            ocupado={ocupado || activo === null}
            alCambiar={(prender) => void (prender ? activar() : desactivar())}
          />
        </Tarjeta>
      )}
      <MensajeError texto={error} />
    </>
  );
}
