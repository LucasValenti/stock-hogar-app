// Pantalla de la app: saludo, título h1 y el contenido, separado como las tarjetas.
// Mientras carga, el contenido queda marcado como ocupado para el lector de pantalla.
import type { ReactNode } from 'react';

import estilos from './Pantalla.module.css';

type Props = {
  children: ReactNode;
  /** Título de la pantalla («Octubre», «Stock»). */
  titulo?: string;
  /** Línea chica sobre el título («Hola, Ana»). */
  saludo?: string;
  /** Mientras carga: el contenido se anuncia como ocupado. */
  ocupado?: boolean;
};

export function Pantalla({ children, titulo, saludo, ocupado = false }: Props) {
  return (
    <div className={estilos.pantalla}>
      {titulo ? (
        <header className={estilos.encabezado}>
          {saludo ? <p className={estilos.saludo}>{saludo}</p> : null}
          <h1 className={estilos.titulo}>{titulo}</h1>
        </header>
      ) : null}
      <div className={estilos.contenido} aria-busy={ocupado || undefined}>
        {children}
      </div>
    </div>
  );
}
