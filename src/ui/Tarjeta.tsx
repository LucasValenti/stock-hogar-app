// Tarjeta «papelito» (DESIGN.md, Tarjeta e imán): `superficie`, borde y `radio.tarjeta`.
// Con `iman`, un círculo `acento` centrado sobre el borde de arriba y la sombra dura de la tarjeta.
import type { HTMLAttributes } from 'react';

import estilos from './Tarjeta.module.css';

type Props = HTMLAttributes<HTMLElement> & { iman?: boolean; como?: 'div' | 'section' | 'article' };

export function Tarjeta({ iman = false, como: Etiqueta = 'div', className, children, ...resto }: Props) {
  return (
    <Etiqueta className={[estilos.tarjeta, iman && estilos.conIman, className].filter(Boolean).join(' ')} {...resto}>
      {iman ? <span className={estilos.iman} aria-hidden="true" /> : null}
      {children}
    </Etiqueta>
  );
}
