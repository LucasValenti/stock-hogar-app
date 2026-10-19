// Chip (DESIGN.md, Chip): píldora con borde, alto ≥ `medida.tactil`, `peso.fuerte`; activo = `acento` lleno.
// Con `activo` es una opción (aria-pressed); sin `activo` es un botón (con `flecha`, abre una hoja).
import type { ButtonHTMLAttributes } from 'react';

import estilos from './Chip.module.css';
import { Icono } from './Icono';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  texto: string;
  /** Presente en las opciones: dice si está elegida. */
  activo?: boolean;
  flecha?: boolean;
  bloqueado?: boolean;
};

export function Chip({ texto, activo, flecha = false, bloqueado = false, className, ...resto }: Props) {
  const esOpcion = activo !== undefined;
  return (
    <button
      type="button"
      className={[estilos.chip, bloqueado && estilos.bloqueado, className].filter(Boolean).join(' ')}
      aria-pressed={esOpcion ? activo : undefined}
      disabled={bloqueado || resto.disabled}
      {...resto}
    >
      <span className={estilos.texto}>{texto}</span>
      {flecha ? (
        <span className={estilos.icono}>
          <Icono nombre="abajo" tamano={20} />
        </span>
      ) : null}
    </button>
  );
}
