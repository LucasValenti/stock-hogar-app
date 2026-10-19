// «Cómo viene el reparto» (Inicio y Análisis en curso): una fila por persona con su inicial, la parte,
// lo que puso y el saldo con signo y palabra («recibe», «pone»); nunca solo color. Si no se puede
// repartir, el motivo: el sueldo que falta lo ven todos, y a quien puede cargarlo se le dice dónde. En Análisis (`detallado`) la fila suma lo que le toca en pesos, como la maqueta.
import { formatear, formatearPorcentaje } from '@/logica/dinero';
import type { ResultadoReparto } from '@/logica/reparto';
import { enMayuscula } from '@/logica/texto';
import type { FilaReparto, Integrante, Transferencia } from '@/logica/tipos';

import estilos from './Reparto.module.css';
import { Monto, type NombreColorMonto } from '../Monto';
import { Tarjeta } from '../Tarjeta';

/** Por qué no se puede repartir, con dónde se arregla. Ajustes → Integrantes solo para quien ve los sueldos. */
export function motivoSinReparto(
  reparto: Extract<ResultadoReparto, { ok: false }>,
  hayIntegrantes: boolean,
  verSueldos: boolean,
): string {
  if (reparto.error === 'sueldo') {
    const falta = `Para repartir falta el sueldo de ${reparto.sinSueldo.join(', ')}.`;
    return verSueldos ? `${falta} Se carga en Ajustes → Integrantes.` : falta;
  }
  if (reparto.error === 'pagador') return 'Hay un gasto de alguien que ya no está en la casa: revisalo para poder repartir.';
  return hayIntegrantes ? 'Este mes no hay integrantes para repartir.' : 'Todavía no hay integrantes en la casa.';
}

type Props = {
  reparto: ResultadoReparto;
  integrantes: Pick<Integrante, 'id'>[];
  /** Quien puede ver (y cargar) sueldos: el aviso del sueldo que falta le dice dónde se carga. */
  verSueldos: boolean;
  detallado?: boolean;
};

export function Reparto({ reparto, integrantes, verSueldos, detallado = false }: Props) {
  return (
    <>
      <h2 className={estilos.seccion}>Cómo viene el reparto</h2>
      <Tarjeta className={estilos.tarjeta}>
        <ul role="list" className={estilos.lista}>
          {reparto.ok ? (
            reparto.filas.map((f, i) => <FilaDeReparto key={f.id} fila={f} primera={i === 0} detallado={detallado} />)
          ) : (
            <li className={estilos.motivo}>
              <p className={estilos.texto}>{motivoSinReparto(reparto, integrantes.length > 0, verSueldos)}</p>
            </li>
          )}
        </ul>
      </Tarjeta>
    </>
  );
}

function FilaDeReparto({ fila, primera, detallado }: { fila: FilaReparto; primera: boolean; detallado: boolean }) {
  const palabra = fila.saldo > 0 ? 'recibe' : fila.saldo < 0 ? 'pone' : 'está al día';
  const parte = fila.participa ? `${detallado ? 'le toca' : 'parte'} ${formatearPorcentaje(fila.peso)}` : 'no participa';
  const color: NombreColorMonto = fila.saldo > 0 ? 'hay' : fila.saldo < 0 ? 'falta' : 'texto';
  const leToca = detallado && fila.participa ? ` (${formatear(fila.leCorresponde)})` : '';
  return (
    <li
      aria-label={`${fila.nombre}, ${parte}${leToca}, puso ${formatear(fila.pago)}. ${
        fila.saldo === 0 ? palabra : `${enMayuscula(palabra)} ${formatear(Math.abs(fila.saldo))}`
      }.`}
      className={[estilos.fila, !primera && estilos.separador].filter(Boolean).join(' ')}
    >
      <span className={estilos.inicial} aria-hidden="true">
        {fila.nombre.charAt(0).toUpperCase()}
      </span>
      <span className={estilos.datos}>
        <span className={estilos.nombre}>{fila.nombre}</span>
        {detallado ? (
          <>
            <span className={estilos.sub}>
              {fila.participa ? (
                <>
                  {`${parte} · `}
                  <span className="tabular">{formatear(fila.leCorresponde)}</span>
                </>
              ) : (
                parte
              )}
            </span>
            <span className={estilos.sub}>
              {'puso '}
              <span className="tabular">{formatear(fila.pago)}</span>
            </span>
          </>
        ) : (
          <span className={estilos.sub}>
            {`${parte} · puso `}
            <span className="tabular">{formatear(fila.pago)}</span>
          </span>
        )}
      </span>
      <span className={estilos.saldo}>
        <Monto centavos={fila.saldo} tamano="fila" signo color={color} />
        <span className={estilos.palabra}>{palabra}</span>
      </span>
    </li>
  );
}

/** El círculo «quien»: la inicial con borde. El color por persona llega en F7. */
export function Inicial({ nombre }: { nombre: string }) {
  return (
    <span className={estilos.inicial} aria-hidden="true">
      {nombre.charAt(0).toUpperCase()}
    </span>
  );
}

/** «Bruno le pasa a Ana». */
export function textoTransferencia(t: Transferencia, nombres: Map<string, string>): string {
  return `${nombres.get(t.de) ?? 'Alguien'} le pasa a ${nombres.get(t.a) ?? 'alguien'}`;
}

type PropsTransferencias = { transferencias: Transferencia[]; filas: Pick<FilaReparto, 'id' | 'nombre'>[] };

/** Las transferencias del reparto en vivo (Análisis en curso), en una tarjeta plana. */
export function Transferencias({ transferencias, filas }: PropsTransferencias) {
  const nombres = new Map(filas.map((f) => [f.id, f.nombre]));
  return (
    <>
      <h2 className={estilos.seccion}>Para quedar a mano</h2>
      <Tarjeta className={estilos.tarjeta}>
        <ul role="list" className={estilos.lista}>
          {transferencias.length ? (
            transferencias.map((t, i) => (
              <li
                key={`${t.de}-${t.a}`}
                aria-label={`${textoTransferencia(t, nombres)}: ${formatear(t.monto)}.`}
                className={[estilos.transferencia, i > 0 && estilos.separador].filter(Boolean).join(' ')}
              >
                <span className={estilos.textoTransferencia}>{textoTransferencia(t, nombres)}</span>
                <span className={estilos.montoTransferencia}>
                  <Monto centavos={t.monto} tamano="fila" />
                </span>
              </li>
            ))
          ) : (
            <li className={estilos.motivo}>
              <p className={estilos.texto}>Están todos al día: nadie le pasa nada a nadie.</p>
            </li>
          )}
        </ul>
      </Tarjeta>
    </>
  );
}
