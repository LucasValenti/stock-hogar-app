// Fila de producto (DESIGN.md, Fila de producto con − / +): alto ≥ `--medida-fila`, nombre en peso fuerte
// hasta dos renglones, el estado debajo y lo de la derecha (el paso, un monto). Si no entra al lado del
// nombre, baja y se alinea a la derecha. Con `alTildar`, el tilde va a la izquierda y la parte del nombre
// entera es la casilla (el blanco táctil no es el tilde chico). Con `alTocar`, esa zona es un botón (abre
// la ficha del producto) y el paso de la derecha queda aparte. El separador lo pone la lista (`separador`).
import type { ReactNode } from 'react';

import estilos from './Fila.module.css';
import { Icono, type NombreIcono } from './Icono';

type Props = {
  nombre: string;
  /** Lo que va debajo del nombre (el estado, una nota). */
  detalle?: ReactNode;
  /** Lo que el lector dice después del nombre («Hay 1», «Anotación rápida»). */
  descripcion?: string;
  tildado?: boolean;
  alTildar?(): void;
  /** Sin tilde: tocar el nombre (abre la ficha, la nota). */
  alTocar?(): void;
  bloqueado?: boolean;
  derecha?: ReactNode;
  /** Línea arriba: entre una fila y la anterior. */
  separador?: boolean;
};

export function Fila({ nombre, detalle, descripcion, tildado = false, alTildar, alTocar, bloqueado = false, derecha, separador = false }: Props) {
  const etiqueta = descripcion ? `${nombre}, ${descripcion}` : nombre;
  const textos = (
    <span className={estilos.textos}>
      <span className={estilos.nombre}>{nombre}</span>
      {detalle}
    </span>
  );

  return (
    <div className={[estilos.fila, separador && estilos.separador].filter(Boolean).join(' ')}>
      {alTildar ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={tildado}
          aria-label={etiqueta}
          disabled={bloqueado}
          onClick={alTildar}
          className={[estilos.zona, estilos.zonaTilde].join(' ')}
        >
          <span data-testid="tilde" className={[estilos.tilde, tildado && estilos.tildado].filter(Boolean).join(' ')} aria-hidden="true">
            {tildado ? <Icono nombre="ok" tamano={16} /> : null}
          </span>
          {textos}
        </button>
      ) : alTocar ? (
        <button
          type="button"
          aria-label={etiqueta}
          disabled={bloqueado}
          onClick={alTocar}
          className={[estilos.zona, estilos.zonaTocar].join(' ')}
        >
          {textos}
        </button>
      ) : (
        <span className={estilos.zonaTexto}>{textos}</span>
      )}
      {derecha ? <span className={estilos.derecha}>{derecha}</span> : null}
    </div>
  );
}

const ICONO_ESTADO: Record<'falta' | 'hay' | 'cerrado', NombreIcono> = { falta: 'falta', hay: 'ok', cerrado: 'candado' };

/** Estado de un dato (DESIGN.md, Estados): ícono + palabra en su color, nunca solo color. */
export function Estado({ tipo, texto }: { tipo: 'falta' | 'hay' | 'cerrado'; texto: string }) {
  return (
    <span className={[estilos.estado, estilos[tipo]].join(' ')}>
      <Icono nombre={ICONO_ESTADO[tipo]} tamano={16} />
      <span className={estilos.estadoTexto}>{texto}</span>
    </span>
  );
}

/** Notita (DESIGN.md): ícono de nota + texto suave, para las anotaciones rápidas. */
export function Notita({ texto }: { texto: string }) {
  return (
    <span className={estilos.notita}>
      <Icono nombre="nota" tamano={16} />
      <span className={estilos.notitaTexto}>{texto}</span>
    </span>
  );
}
