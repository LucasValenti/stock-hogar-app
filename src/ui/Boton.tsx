// Botón píldora (DESIGN.md, Botones). `lleno`: la acción de la pantalla, uno por pantalla u hoja.
// `borde`: la otra, sobre `superficie` con borde. Alto ≥ `medida.tactil`; el texto crece y baja de renglón.
import type { ButtonHTMLAttributes } from 'react';

import estilos from './Boton.module.css';
import { Icono, type NombreIcono } from './Icono';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  texto: string;
  variante?: 'lleno' | 'borde';
  icono?: NombreIcono;
  /** Mientras algo se envía: no se puede tocar de nuevo y se ve que está trabajando. */
  ocupado?: boolean;
};

export function Boton({ texto, variante = 'lleno', icono, ocupado = false, type = 'button', className, ...resto }: Props) {
  return (
    <button
      type={type}
      className={[estilos.boton, estilos[variante], className].filter(Boolean).join(' ')}
      disabled={ocupado || resto.disabled}
      aria-busy={ocupado || undefined}
      {...resto}
    >
      {ocupado ? <span className={estilos.girando} aria-hidden="true" /> : icono ? <Icono nombre={icono} tamano={20} /> : null}
      <span>{texto}</span>
    </button>
  );
}
