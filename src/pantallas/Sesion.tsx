// Pantallas de la sesión que no son el ingreso: cargando, error al abrir y cuenta ajena.
import { useState } from 'react';

import { mensajeError } from '@/logica/errores';
import { useSesion } from '@/sesion/sesion';
import { Alerta } from '@/ui/Alerta';
import { Boton } from '@/ui/Boton';

import { Pagina } from './Pagina';
import estilos from './Pagina.module.css';

/** Mientras carga la sesión: nunca una pantalla en blanco. */
export function PantallaCarga() {
  return (
    <main className={estilos.cargando} aria-busy="true">
      <span className={estilos.rueda} aria-hidden="true" />
      <span className="solo-lectores">Cargando</span>
    </main>
  );
}

/**
 * No se pudo saber quién es la persona: falta la configuración (.env) o no hay conexión.
 * Si hay una sesión abierta, también se puede cerrar (por ejemplo, para entrar con otra cuenta).
 */
export function PantallaError({ error, onReintentar }: { error: unknown; onReintentar: () => void }) {
  const { email } = useSesion();
  return (
    <Pagina>
      <h1>No se pudo abrir la app</h1>
      <Alerta>{mensajeError(error)}</Alerta>
      <Boton texto="Probar de nuevo" onClick={onReintentar} />
      {email ? <CerrarSesion variante="borde" /> : null}
    </Pagina>
  );
}

/** La cuenta existe pero nadie de la casa la agregó como integrante. */
export function PantallaAjena() {
  const { email } = useSesion();
  return (
    <Pagina>
      <h1>Esta cuenta no pertenece a la casa</h1>
      <p>{`Pedile a alguien de la casa que agregue ${email ?? 'tu email'} en Ajustes → Integrantes.`}</p>
      <CerrarSesion />
    </Pagina>
  );
}

/** «Cerrar sesión», con su espera y el error si no pudo. */
export function CerrarSesion({ variante }: { variante?: 'lleno' | 'borde' }) {
  const { salir } = useSesion();
  const [saliendo, setSaliendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cerrar() {
    setError(null);
    setSaliendo(true);
    try {
      await salir();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setSaliendo(false);
    }
  }

  return (
    <>
      {error ? <Alerta>{error}</Alerta> : null}
      <Boton texto="Cerrar sesión" variante={variante} onClick={cerrar} ocupado={saliendo} />
    </>
  );
}
