// Pestañas internas (DESIGN.md, Pestañas internas): contenedor píldora con borde, ítems de alto
// ≥ `medida.tactil` en `tamano.s` y `peso.fuerte`; la activa, `acento` lleno con `sobreAcento`
// (el relleno es la pista de forma). Si no entran, pasan a otro renglón.
// En la web, `tablist` con `tab` y `aria-selected`; las flechas izquierda/derecha mueven foco y activa.
import { useRef, type KeyboardEvent } from 'react';

import estilos from './PestanasInternas.module.css';

type Opcion<C extends string> = { clave: C; texto: string };

type Props<C extends string> = {
  /** Nombre del grupo para el lector («Vista del stock»). */
  etiqueta: string;
  opciones: Opcion<C>[];
  activa: C;
  alCambiar(clave: C): void;
};

export function PestanasInternas<C extends string>({ etiqueta, opciones, activa, alCambiar }: Props<C>) {
  const pestanas = useRef<Array<HTMLButtonElement | null>>([]);

  function alTeclear(evento: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (!opciones.length) return;
    const paso = evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowLeft' ? -1 : 0;
    if (!paso) return;
    evento.preventDefault();
    const destino = (i + paso + opciones.length) % opciones.length;
    alCambiar(opciones[destino].clave);
    pestanas.current[destino]?.focus();
  }

  return (
    <div className={estilos.pestanas} role="tablist" aria-label={etiqueta}>
      {opciones.map((o, i) => {
        const elegida = o.clave === activa;
        return (
          <button
            key={o.clave}
            type="button"
            role="tab"
            aria-selected={elegida}
            tabIndex={elegida ? 0 : -1}
            ref={(elemento) => {
              pestanas.current[i] = elemento;
            }}
            className={estilos.pestana}
            onClick={() => alCambiar(o.clave)}
            onKeyDown={(evento) => alTeclear(evento, i)}
          >
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}
