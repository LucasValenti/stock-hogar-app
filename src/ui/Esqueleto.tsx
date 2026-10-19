// Esqueleto de carga (DESIGN.md, Cargando): píldora o círculo en `borde` que late solo en opacidad,
// entre `--opacidad-esqueleto-min` y `--opacidad-esqueleto-max` cada `--mov-latido`.
// Con movimiento reducido, `base.css` corta la animación y queda en el máximo.
import type { CSSProperties } from 'react';

import estilos from './Esqueleto.module.css';

type Props = { ancho?: number | string; alto: number; circulo?: boolean; testID?: string };

export function Esqueleto({ ancho = '100%', alto, circulo = false, testID }: Props) {
  // El alto y el ancho llegan por props: van como variables CSS para no repetir estilos en línea.
  const estilo = {
    '--esqueleto-alto': `${alto}px`,
    '--esqueleto-ancho': typeof ancho === 'number' ? `${ancho}px` : ancho,
  } as CSSProperties;

  return (
    <span
      className={[estilos.esqueleto, circulo && estilos.circulo].filter(Boolean).join(' ')}
      aria-hidden="true"
      data-testid={testID}
      style={estilo}
    />
  );
}
