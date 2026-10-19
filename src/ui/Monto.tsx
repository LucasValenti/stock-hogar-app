// Monto en pesos: Rubik con cifras tabulares, siempre escrito entero y en un renglón.
import type { HTMLAttributes } from 'react';

import { formatear } from '@/logica/dinero';

import estilos from './Monto.module.css';

type TamanoMonto = 'total' | 'fila' | 'sub';
export type NombreColorMonto = 'texto' | 'textoSuave' | 'acento' | 'sobreAcento' | 'falta' | 'hay' | 'cerrado';

type Props = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  centavos: number;
  tamano?: TamanoMonto;
  /** Saldo: «+» o «−» (U+2212) delante del monto. */
  signo?: boolean;
  color?: NombreColorMonto;
};

export function textoMonto(centavos: number, signo = false): string {
  if (!signo || centavos === 0) return formatear(centavos);
  return `${centavos > 0 ? '+' : '−'} ${formatear(Math.abs(centavos))}`;
}

export function Monto({ centavos, tamano = 'total', signo = false, color = 'texto', className, ...resto }: Props) {
  return (
    <span className={['tabular', estilos.monto, estilos[tamano], estilos[color], className].filter(Boolean).join(' ')} {...resto}>
      {textoMonto(centavos, signo)}
    </span>
  );
}
