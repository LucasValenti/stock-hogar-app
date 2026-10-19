// Encabezado de una pantalla que se abre encima de las pestañas (Cargar, la ficha de un producto):
// «Volver» de `medida.tactil` y el título Fredoka, que baja de renglón si es largo.
// Sin `alVolver`, vuelve con el historial de la app; si no hay, va a Inicio.
import { useLocation } from 'wouter';

import { volver } from './volver';
import estilos from './Encabezado.module.css';
import { Icono } from './Icono';

type Props = { titulo: string; alVolver?: () => void };

export function Encabezado({ titulo, alVolver }: Props) {
  const [, navegar] = useLocation();

  function alTocar() {
    if (alVolver) {
      alVolver();
      return;
    }
    volver(navegar);
  }

  return (
    <header className={estilos.encabezado}>
      <button type="button" className={estilos.volver} aria-label="Volver" onClick={alTocar}>
        <Icono nombre="atras" tamano={20} />
      </button>
      <h1 className={estilos.titulo}>{titulo}</h1>
    </header>
  );
}
