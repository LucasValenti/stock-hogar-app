// Chip (DESIGN.md, Chip): píldora con borde, alto ≥ `medida.tactil`, `peso.fuerte`; activo = `acento` lleno.
// Con `activo` es una opción (aria-pressed); sin `activo` es un botón (con `flecha`, abre una hoja).
// Con `rol="radio"` es una de las opciones de un grupo de elección única (aria-checked).
import type { ButtonHTMLAttributes } from 'react';

import estilos from './Chip.module.css';
import { Icono } from './Icono';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  texto: string;
  /** Presente en las opciones: dice si está elegida. */
  activo?: boolean;
  /** `radio`: una opción de un grupo de elección única (va dentro de un `radiogroup`). */
  rol?: 'radio';
  flecha?: boolean;
  bloqueado?: boolean;
};

export function Chip({ texto, activo, rol, flecha = false, bloqueado = false, className, ...resto }: Props) {
  const esOpcion = activo !== undefined;
  const esRadio = rol === 'radio';
  return (
    <button
      type="button"
      role={esRadio ? 'radio' : undefined}
      className={[estilos.chip, bloqueado && estilos.bloqueado, className].filter(Boolean).join(' ')}
      aria-pressed={esRadio ? undefined : esOpcion ? activo : undefined}
      aria-checked={esRadio ? activo === true : undefined}
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
