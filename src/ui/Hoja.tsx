// Hoja inferior (DESIGN.md, Hoja inferior): `superficie`, `radio.hoja` arriba, borde arriba, asa y `velo` detrás.
// Título Fredoka, subtítulo, una lista que se desplaza y el pie con la acción (un solo botón lleno).
// Entra con `--mov-normal` (sube un poco y aparece); con movimiento reducido, solo un fundido corto.
// Usa <dialog> nativo: el foco queda atrapado y Escape la cierra. El velo también la cierra.
import { useEffect, useId, useRef, type ReactNode } from 'react';

import estilos from './Hoja.module.css';

type Props = {
  visible: boolean;
  titulo: string;
  subtitulo?: string;
  alCerrar(): void;
  children?: ReactNode;
  /** La acción de la hoja, fija abajo («Sumar 3 al gasto»). */
  pie?: ReactNode;
};

export function Hoja({ visible, titulo, subtitulo, alCerrar, children, pie }: Props) {
  const hoja = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    if (!visible) return;
    const elemento = hoja.current;
    if (elemento && !elemento.open) elemento.showModal();
  }, [visible]);

  if (!visible) return null;

  return (
    <dialog
      ref={hoja}
      className={estilos.hoja}
      aria-labelledby={idTitulo}
      onClose={alCerrar}
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <span className={estilos.asa} aria-hidden="true" />
      <div className={estilos.encabezado}>
        <div className={estilos.titulos}>
          <h2 id={idTitulo} className={estilos.titulo}>
            {titulo}
          </h2>
          {subtitulo ? <p className={estilos.subtitulo}>{subtitulo}</p> : null}
        </div>
        <button type="button" className={estilos.cerrar} onClick={alCerrar}>
          Cerrar
        </button>
      </div>
      <div className={estilos.contenido}>{children}</div>
      {pie ? <div className={estilos.pie}>{pie}</div> : null}
    </dialog>
  );
}
