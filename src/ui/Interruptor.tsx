// Interruptor: un permiso prendido o apagado. Es un <button role="switch"> con todo el renglón como blanco
// táctil (≥ `--medida-tactil`): el texto a la izquierda y la llave a la derecha. Prendido = `acento` lleno con
// la perilla a la derecha y un tilde (forma además de color). Espacio o Enter lo cambian; el foco es el de base.css.
import { Icono } from './Icono';
import estilos from './Interruptor.module.css';

type Props = {
  texto: string;
  activo: boolean;
  /** Recibe el valor nuevo (el contrario del actual). */
  alCambiar(activo: boolean): void;
  /** Mientras se guarda el cambio: no se puede tocar de nuevo. */
  ocupado?: boolean;
};

export function Interruptor({ texto, activo, alCambiar, ocupado = false }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-busy={ocupado || undefined}
      disabled={ocupado}
      className={estilos.interruptor}
      onClick={() => alCambiar(!activo)}
    >
      <span className={estilos.texto}>{texto}</span>
      <span className={[estilos.llave, activo && estilos.prendida].filter(Boolean).join(' ')} aria-hidden="true">
        <span className={estilos.perilla}>{activo ? <Icono nombre="ok" tamano={16} /> : null}</span>
      </span>
    </button>
  );
}
