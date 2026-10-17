// Reparto del mes en proporción al sueldo. Función pura, montos en centavos enteros.
// Participan los integrantes. Los pagadores externos y los ex integrantes que pagaron algo
// ese mes suman al total y cobran lo que pusieron, sin cuota.

import type { FilaReparto, Gasto, Integrante, Transferencia } from './tipos';

// Lo que el reparto necesita de cada integrante; un Integrante completo cumple.
// `tipo` ausente cuenta como integrante común.
export type IntegranteReparto = Pick<Integrante, 'id' | 'nombre' | 'sueldo' | 'activo' | 'baja_desde'> & {
  tipo?: Integrante['tipo'];
};
export type ParticipanteReparto = Pick<Integrante, 'id' | 'nombre' | 'sueldo'>;
export type OtroReparto = Pick<Integrante, 'id' | 'nombre'>;
export type GastoReparto = Pick<Gasto, 'pagado_por' | 'total'>;

export type ResultadoReparto =
  | { ok: false; error: 'sin_participantes'; total: number }
  | { ok: false; error: 'sueldo'; sinSueldo: string[]; total: number }
  | { ok: false; error: 'pagador'; total: number }
  | { ok: true; total: number; filas: FilaReparto[]; transferencias: Transferencia[] };

// Sigue en la casa ese mes: activo, o dado de baja desde un mes posterior.
const vigente = (i: IntegranteReparto, mes: string) => i.activo || (i.baja_desde != null && i.baja_desde > mes);

export function participantesDelMes<I extends IntegranteReparto>(integrantes: I[], mes: string): I[] {
  return integrantes.filter((i) => i.tipo !== 'pagador_externo' && vigente(i, mes));
}

// Quienes pueden figurar como pagadores de un gasto: los que participan y los externos que aún tienen acceso.
export function pagadoresDelMes<I extends IntegranteReparto>(integrantes: I[], mes: string): I[] {
  return [
    ...participantesDelMes(integrantes, mes),
    ...integrantes.filter((i) => i.tipo === 'pagador_externo' && vigente(i, mes)),
  ];
}

export function repartoDelMes(integrantes: IntegranteReparto[], mes: string, gastos: GastoReparto[]): ResultadoReparto {
  const participantes = participantesDelMes(integrantes, mes);
  const ids = new Set(participantes.map((p) => p.id));
  return calcularReparto(participantes, gastos, integrantes.filter((i) => !ids.has(i.id)));
}

export function calcularReparto(
  participantes: ParticipanteReparto[],
  gastos: GastoReparto[],
  otros: OtroReparto[] = [],
): ResultadoReparto {
  const total = gastos.reduce((s, g) => s + g.total, 0);
  if (!participantes.length) return { ok: false, error: 'sin_participantes', total };

  const sinSueldo = participantes.filter((p) => !((p.sueldo ?? 0) > 0)).map((p) => p.nombre);
  if (sinSueldo.length) return { ok: false, error: 'sueldo', sinSueldo, total };

  const ids = new Set(participantes.map((p) => p.id));
  const aparte = new Map(otros.filter((o) => !ids.has(o.id)).map((o) => [o.id, o]));
  if (gastos.some((g) => !ids.has(g.pagado_por) && !aparte.has(g.pagado_por))) return { ok: false, error: 'pagador', total };

  // Método del mayor resto, en BigInt para no perder precisión con montos grandes.
  // Ya se descartó el sueldo vacío o en cero, así que `?? 0` no cambia nada.
  const sueldos = participantes.map((p) => p.sueldo ?? 0);
  const sumaSueldos = sueldos.reduce((s, x) => s + x, 0);
  const T = BigInt(total);
  const S = BigInt(sumaSueldos);
  const partes = sueldos.map((sueldo, idx) => {
    const num = T * BigInt(sueldo);
    return { idx, piso: Number(num / S), resto: num % S };
  });
  const sobrante = total - partes.reduce((s, x) => s + x.piso, 0);
  const porResto = [...partes].sort((x, y) => (y.resto > x.resto ? 1 : y.resto < x.resto ? -1 : x.idx - y.idx));
  for (let k = 0; k < sobrante; k++) porResto[k].piso += 1;

  const filas: FilaReparto[] = participantes.map((p, idx) => {
    const leCorresponde = partes[idx].piso;
    const pago = gastos.filter((g) => g.pagado_por === p.id).reduce((s, g) => s + g.total, 0);
    return { id: p.id, nombre: p.nombre, participa: true, peso: sueldos[idx] / sumaSueldos, leCorresponde, pago, saldo: pago - leCorresponde };
  });
  for (const o of aparte.values()) {
    const pago = gastos.filter((g) => g.pagado_por === o.id).reduce((s, g) => s + g.total, 0);
    if (pago > 0) filas.push({ id: o.id, nombre: o.nombre, participa: false, peso: 0, leCorresponde: 0, pago, saldo: pago });
  }

  return { ok: true, total, filas, transferencias: calcularTransferencias(filas) };
}

export function calcularTransferencias(saldos: Array<{ id: string; saldo: number }>): Transferencia[] {
  const deudores = saldos.filter((s) => s.saldo < 0).map((s) => ({ id: s.id, monto: -s.saldo }));
  const acreedores = saldos.filter((s) => s.saldo > 0).map((s) => ({ id: s.id, monto: s.saldo }));
  const transferencias: Transferencia[] = [];
  while (deudores.length && acreedores.length) {
    deudores.sort((x, y) => y.monto - x.monto);
    acreedores.sort((x, y) => y.monto - x.monto);
    const d = deudores[0];
    const a = acreedores[0];
    const monto = Math.min(d.monto, a.monto);
    transferencias.push({ de: d.id, a: a.id, monto });
    d.monto -= monto;
    a.monto -= monto;
    if (!d.monto) deudores.shift();
    if (!a.monto) acreedores.shift();
  }
  return transferencias;
}
