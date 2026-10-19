// El paso (DESIGN.md, Fila de producto con − / +): píldora con borde, − y + de `medida.tactil`, y en el
// medio la cantidad tabular, que también se puede tipear (1,5 kg). Suma y resta con aplicarDelta: sin
// ruido de coma flotante. − no deja bajar de lo mínimo: para no comprar nada, se destilda.
import { aCantidad } from '@/logica/dinero';
import { aplicarDelta } from '@/logica/stock';

import estilos from './Paso.module.css';

type Props = {
  /** Para el lector: «Sumar 1 a Yerba». */
  nombre: string;
  /** La cantidad como se tipea («1,5»). */
  valor: string;
  alCambiar(texto: string): void;
  /** Kg y litros: teclado con coma. */
  decimales: boolean;
  bloqueado?: boolean;
};

const aTexto = (n: number) => String(n).replace('.', ',');

export function Paso({ nombre, valor, alCambiar, decimales, bloqueado = false }: Props) {
  const n = aCantidad(valor);
  const puedeRestar = !bloqueado && n !== null && n > 1;
  return (
    <div className={estilos.paso}>
      <button
        type="button"
        className={estilos.boton}
        aria-label={`Restar 1 a ${nombre}`}
        disabled={!puedeRestar}
        onClick={() => n !== null && alCambiar(aTexto(aplicarDelta(n, -1)))}
      >
        <span className={estilos.signo} aria-hidden="true">
          −
        </span>
      </button>
      <input
        className={[estilos.entrada, bloqueado && estilos.bloqueado].filter(Boolean).join(' ')}
        aria-label={`Cantidad de ${nombre}`}
        aria-disabled={bloqueado || undefined}
        readOnly={bloqueado || undefined}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        inputMode={decimales ? 'decimal' : 'numeric'}
      />
      <button
        type="button"
        className={estilos.boton}
        aria-label={`Sumar 1 a ${nombre}`}
        disabled={bloqueado}
        onClick={() => alCambiar(aTexto(aplicarDelta(n ?? 0, 1)))}
      >
        <span className={estilos.signo} aria-hidden="true">
          +
        </span>
      </button>
    </div>
  );
}
