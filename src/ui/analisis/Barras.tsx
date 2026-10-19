// Barras horizontales a escala (Categorías y Evolución): el valor va escrito y la barra es apoyo
// (DESIGN.md: «los gráficos son apoyo»). Cada barra mide su parte del máximo; el lector lee la fila
// entera («Almacén: $ 700, 70 %») y la barra queda oculta. Al pie, el total si se pasa.
// Color de la barra: `textoSuave` sobre `fondo`, que da ≥ 3:1 (objeto gráfico); el acento queda
// para la acción de la pantalla.
import type { CSSProperties } from 'react';

import { formatear } from '@/logica/dinero';

import estilos from './Barras.module.css';
import { Monto } from '../Monto';
import { Tarjeta } from '../Tarjeta';

export type FilaBarra = { clave: string; rotulo: string; centavos: number; detalle?: string };

type Props = { titulo: string; filas: FilaBarra[]; total?: { rotulo: string; centavos: number } };

export function Barras({ titulo, filas, total }: Props) {
  const maximo = Math.max(0, ...filas.map((f) => f.centavos));
  return (
    <Tarjeta>
      <h2 className={estilos.titulo}>{titulo}</h2>
      <ul role="list" className={estilos.filas}>
        {filas.map((f) => {
          const parte = maximo > 0 ? Math.max(0, Math.min(1, f.centavos / maximo)) : 0;
          return (
            <li key={f.clave} aria-label={`${f.rotulo}: ${formatear(f.centavos)}${f.detalle ? `, ${f.detalle}` : ''}`} className={estilos.fila}>
              <div className={estilos.linea}>
                <div className={estilos.textos}>
                  <p className={estilos.rotulo}>{f.rotulo}</p>
                  {f.detalle ? <p className={estilos.detalle}>{f.detalle}</p> : null}
                </div>
                <Monto centavos={f.centavos} tamano="fila" className={estilos.monto} />
              </div>
              <span className={estilos.barra} aria-hidden="true">
                <span className={estilos.relleno} style={{ '--proporcion': parte } as CSSProperties} />
              </span>
            </li>
          );
        })}
      </ul>
      {total ? <FilaTotal rotulo={total.rotulo} centavos={total.centavos} /> : null}
    </Tarjeta>
  );
}

/** El renglón que cierra una lista: «Total» y el monto, en `peso.fuerte`, con una línea arriba. */
export function FilaTotal({ rotulo, centavos }: { rotulo: string; centavos: number }) {
  return (
    <div className={estilos.total} aria-label={`${rotulo}: ${formatear(centavos)}`}>
      <span className={estilos.totalRotulo}>{rotulo}</span>
      <Monto centavos={centavos} tamano="fila" className={estilos.monto} />
    </div>
  );
}
