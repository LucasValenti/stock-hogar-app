// Un error que el lector de pantalla anuncia al aparecer.
import type { HTMLAttributes } from 'react';

import estilos from './Alerta.module.css';

export function Alerta({ className, ...resto }: HTMLAttributes<HTMLParagraphElement>) {
  return <p role="alert" className={[estilos.alerta, className].filter(Boolean).join(' ')} {...resto} />;
}
