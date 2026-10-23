// Permisos (Ajustes, solo el admin): por cada integrante (no pagador externo) un interruptor por permiso y
// «Ceder el rol de admin», que se confirma en una hoja. El admin no figura: ya lo puede todo.
// Un cambio se ve al toque y se confirma con la recarga en vivo (los permisos de la casa que llegan de nuevo).
import { useEffect, useState } from 'react';

import { datos } from '@/datos';
import { mensajeError } from '@/logica/errores';
import type { Integrante, Permiso } from '@/logica/tipos';
import { Avatar } from '@/ui/Avatar';
import { Boton } from '@/ui/Boton';
import { EstadoVacio } from '@/ui/EstadoVacio';
import { Hoja } from '@/ui/Hoja';
import { Interruptor } from '@/ui/Interruptor';
import { MensajeError } from '@/ui/MensajeError';
import { Tarjeta } from '@/ui/Tarjeta';

import comunes from '../Ajustes.module.css';
import estilos from './ajustes.module.css';

// [PENDIENTE: validar con Lucas] los nombres de los permisos
const PERMISOS: Array<{ permiso: Permiso; texto: string }> = [
  { permiso: 'sueldos', texto: 'Ver y cambiar sueldos' },
  { permiso: 'altas_bajas', texto: 'Altas y bajas' },
];

type Props = {
  integrantes: Integrante[];
  permisos: Record<string, Permiso[]>;
  /** Después de ceder el rol: el aviso para la pantalla. */
  alCeder(aviso: string): void;
};

export function Permisos({ integrantes, permisos, alCeder }: Props) {
  const candidatos = integrantes.filter((i) => i.tipo === 'integrante' && !i.admin);
  // Lo recién cambiado, hasta que llegan los permisos de la base.
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ceder, setCeder] = useState<Integrante | null>(null);
  const [cediendo, setCediendo] = useState(false);
  const [errorCeder, setErrorCeder] = useState<string | null>(null);

  useEffect(() => setLocal({}), [permisos]);

  async function cambiar(i: Integrante, permiso: Permiso, activo: boolean) {
    const clave = `${i.id}:${permiso}`;
    setError(null);
    setOcupado(clave);
    try {
      if (activo) await datos.darPermiso(i.id, permiso);
      else await datos.quitarPermiso(i.id, permiso);
      setLocal((l) => ({ ...l, [clave]: activo }));
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(null);
    }
  }

  function abrirCeder(i: Integrante) {
    setErrorCeder(null);
    setCeder(i);
  }

  async function confirmarCeder() {
    if (!ceder) return;
    setErrorCeder(null);
    setCediendo(true);
    try {
      await datos.cederAdmin(ceder.id);
      const nombre = ceder.nombre;
      setCeder(null);
      alCeder(`Ahora ${nombre} es admin.`); // [PENDIENTE: validar con Lucas]
    } catch (e) {
      setErrorCeder(mensajeError(e));
    } finally {
      setCediendo(false);
    }
  }

  return (
    <>
      {candidatos.length ? (
        candidatos.map((i) => (
          <Tarjeta key={i.id} role="group" aria-label={i.nombre} className={estilos.persona}>
            <div className={estilos.quien}>
              <Avatar nombre={i.nombre} color={i.color} />
              <p className={comunes.fuerte}>{i.nombre}</p>
            </div>
            {PERMISOS.map(({ permiso, texto }) => {
              const clave = `${i.id}:${permiso}`;
              return (
                <Interruptor
                  key={permiso}
                  texto={texto}
                  activo={local[clave] ?? (permisos[i.id] ?? []).includes(permiso)}
                  ocupado={ocupado === clave}
                  alCambiar={(activo) => void cambiar(i, permiso, activo)}
                />
              );
            })}
            <Boton texto="Ceder el rol de admin" variante="borde" disabled={!i.activo} onClick={() => abrirCeder(i)} />
            {i.activo ? null : (
              // [PENDIENTE: validar con Lucas]
              <p className={comunes.sub}>{`Para cederle el rol, ${i.nombre} tiene que estar activo.`}</p>
            )}
          </Tarjeta>
        ))
      ) : (
        // [PENDIENTE: validar con Lucas]
        <EstadoVacio icono="casa" titulo="Todavía no hay a quién darle permisos." />
      )}
      <MensajeError texto={error} />

      <Hoja
        visible={ceder !== null}
        titulo={`¿Ceder el rol de admin a ${ceder?.nombre ?? ''}?`} // [PENDIENTE: validar con Lucas]
        subtitulo={
          // [PENDIENTE: validar con Lucas]
          `${ceder?.nombre ?? ''} va a poder hacer todo, también dar permisos y ceder el rol. Vos dejás de ser admin y conservás los dos permisos: «Ver y cambiar sueldos» y «Altas y bajas».`
        }
        alCerrar={() => setCeder(null)}
        pie={
          <>
            <MensajeError texto={errorCeder} />
            <Boton texto="Ceder el rol" ocupado={cediendo} onClick={() => void confirmarCeder()} />
            <Boton texto="Volver" variante="borde" onClick={() => setCeder(null)} />
          </>
        }
      />
    </>
  );
}
