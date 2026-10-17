// «Cómo viene el reparto» (Inicio y Análisis en curso): una fila por persona con su inicial, la parte,
// lo que puso y el saldo con signo y palabra («recibe», «pone»); nunca solo color. Si no se puede
// repartir, el motivo. En Análisis (`detallado`) la fila suma lo que le toca en pesos, como la maqueta.

import { View } from 'react-native';

import { formatear, formatearPorcentaje } from '@/logica/dinero';
import type { ResultadoReparto } from '@/logica/reparto';
import type { FilaReparto, Integrante, Transferencia } from '@/logica/tipos';
import { useTema } from '@/tema/tema';

import { Monto } from '../Monto';
import { Tarjeta } from '../Tarjeta';
import { Texto } from '../Texto';

const enMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Por qué no se puede repartir, con dónde se arregla. */
export function motivoSinReparto(reparto: Extract<ResultadoReparto, { ok: false }>, hayIntegrantes: boolean): string {
  if (reparto.error === 'sueldo') return `Para repartir falta el sueldo de ${reparto.sinSueldo.join(', ')}. Se carga en Ajustes → Integrantes.`;
  if (reparto.error === 'pagador') return 'Hay un gasto de alguien que ya no está en la casa: revisalo para poder repartir.';
  return hayIntegrantes ? 'Este mes no hay integrantes para repartir.' : 'Todavía no hay integrantes en la casa.';
}

type Props = { reparto: ResultadoReparto; integrantes: Pick<Integrante, 'id'>[]; detallado?: boolean };

export function Reparto({ reparto, integrantes, detallado = false }: Props) {
  const tema = useTema();
  const contenido = reparto.ok ? (
    reparto.filas.map((f, i) => <FilaDeReparto key={f.id} fila={f} primera={i === 0} detallado={detallado} />)
  ) : (
    <View style={{ paddingVertical: tema.espacio.m }}>
      <Texto>{motivoSinReparto(reparto, integrantes.length > 0)}</Texto>
    </View>
  );
  return (
    <>
      <Texto variante="seccion" accessibilityRole="header" aria-level={2}>
        Cómo viene el reparto
      </Texto>
      <Tarjeta style={{ paddingVertical: 0, gap: 0 }}>{contenido}</Tarjeta>
    </>
  );
}

function FilaDeReparto({ fila, primera, detallado }: { fila: FilaReparto; primera: boolean; detallado: boolean }) {
  const tema = useTema();
  const palabra = fila.saldo > 0 ? 'recibe' : fila.saldo < 0 ? 'pone' : 'está al día';
  const parte = fila.participa ? `${detallado ? 'le toca' : 'parte'} ${formatearPorcentaje(fila.peso)}` : 'no participa';
  const color = fila.saldo > 0 ? 'hay' : fila.saldo < 0 ? 'falta' : 'texto';
  const leToca = detallado && fila.participa ? ` (${formatear(fila.leCorresponde)})` : '';
  const cifra = (centavos: number) => (
    <Texto variante="subMedio" style={{ fontVariant: ['tabular-nums'] }}>
      {formatear(centavos)}
    </Texto>
  );
  return (
    <View
      accessible
      accessibilityLabel={`${fila.nombre}, ${parte}${leToca}, puso ${formatear(fila.pago)}. ${
        fila.saldo === 0 ? palabra : `${enMayuscula(palabra)} ${formatear(Math.abs(fila.saldo))}`
      }.`}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: tema.espacio.m,
        minHeight: tema.medida.fila,
        paddingVertical: tema.espacio.s,
        borderTopWidth: primera ? 0 : tema.medida.borde,
        borderTopColor: tema.color.borde,
      }}
    >
      <Inicial nombre={fila.nombre} />
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: tema.medida.fila * 2 }}>
        <Texto variante="fuerte" numberOfLines={2}>
          {fila.nombre}
        </Texto>
        {detallado ? (
          <>
            <Texto variante="sub">
              {fila.participa ? (
                <>
                  {`${parte} · `}
                  {cifra(fila.leCorresponde)}
                </>
              ) : (
                parte
              )}
            </Texto>
            <Texto variante="sub">
              {'puso '}
              {cifra(fila.pago)}
            </Texto>
          </>
        ) : (
          <Texto variante="sub">
            {`${parte} · puso `}
            {cifra(fila.pago)}
          </Texto>
        )}
      </View>
      <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
        <Monto centavos={fila.saldo} tamano="fila" signo color={color} />
        <Texto variante="sub">{palabra}</Texto>
      </View>
    </View>
  );
}

/** El círculo «quien»: la inicial con borde. El color por persona llega en F7. */
export function Inicial({ nombre }: { nombre: string }) {
  const tema = useTema();
  return (
    <View
      style={{
        minWidth: tema.medida.indicadorAlto,
        aspectRatio: 1,
        padding: tema.espacio.s,
        borderRadius: tema.radio.chip,
        borderWidth: tema.medida.borde,
        borderColor: tema.color.borde,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Texto variante="seccion" color="texto">
        {nombre.charAt(0).toUpperCase()}
      </Texto>
    </View>
  );
}

/** «Bruno le pasa a Ana». */
export function textoTransferencia(t: Transferencia, nombres: Map<string, string>): string {
  return `${nombres.get(t.de) ?? 'Alguien'} le pasa a ${nombres.get(t.a) ?? 'alguien'}`;
}

type PropsTransferencias = { transferencias: Transferencia[]; filas: Pick<FilaReparto, 'id' | 'nombre'>[] };

/** Las transferencias del reparto en vivo (Análisis en curso), en una tarjeta plana. */
export function Transferencias({ transferencias, filas }: PropsTransferencias) {
  const tema = useTema();
  const nombres = new Map(filas.map((f) => [f.id, f.nombre]));
  return (
    <>
      <Texto variante="seccion" accessibilityRole="header" aria-level={2}>
        Para quedar a mano
      </Texto>
      <Tarjeta style={{ paddingVertical: 0, gap: 0 }}>
        {transferencias.length ? (
          transferencias.map((t, i) => (
            <View
              key={`${t.de}-${t.a}`}
              accessible
              accessibilityLabel={`${textoTransferencia(t, nombres)}: ${formatear(t.monto)}.`}
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: tema.espacio.m,
                minHeight: tema.medida.tactil,
                paddingVertical: tema.espacio.s,
                borderTopWidth: i === 0 ? 0 : tema.medida.borde,
                borderTopColor: tema.color.borde,
              }}
            >
              <Texto style={{ flexGrow: 1, flexShrink: 1 }}>{textoTransferencia(t, nombres)}</Texto>
              <Monto centavos={t.monto} tamano="fila" style={{ marginLeft: 'auto' }} />
            </View>
          ))
        ) : (
          <View style={{ paddingVertical: tema.espacio.m }}>
            <Texto>Están todos al día: nadie le pasa nada a nadie.</Texto>
          </View>
        )}
      </Tarjeta>
    </>
  );
}
