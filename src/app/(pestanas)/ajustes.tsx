// Ajustes: por ahora solo cerrar la sesión de este dispositivo. Al cerrarla, el layout raíz vuelve solo al ingreso.

import { useState } from 'react';

import { esModoMemoria } from '@/datos';
import { mensajeError } from '@/logica/errores';
import { useSesion } from '@/sesion/sesion';
import { Boton } from '@/ui/Boton';
import { Pantalla } from '@/ui/Pantalla';
import { Tarjeta } from '@/ui/Tarjeta';
import { Texto } from '@/ui/Texto';

export default function Ajustes() {
  const { yo, salir } = useSesion();
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
    <Pantalla titulo="Ajustes">
      <Tarjeta>
        {yo ? <Texto>{`Entraste como ${yo.nombre}.`}</Texto> : null}
        {esModoMemoria() ? (
          <Texto variante="sub">Es la casa de ejemplo: no hay cuenta, así que cerrar sesión no hace nada.</Texto>
        ) : null}
        {error ? (
          <Texto variante="sub" color="falta" accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </Texto>
        ) : null}
        <Boton texto="Cerrar sesión" variante="borde" onPress={cerrar} ocupado={saliendo} />
      </Tarjeta>
    </Pantalla>
  );
}
