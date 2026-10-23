import {
  participantesDelMes, pagadoresDelMes, repartoDelMes, calcularReparto, calcularTransferencias, integrantesConPeso,
} from './reparto';
import type { IntegranteReparto, ResultadoReparto } from './reparto';

const A: IntegranteReparto = { id: 'a', nombre: 'A', peso: 150_000_000, activo: true, baja_desde: null };
const B: IntegranteReparto = { id: 'b', nombre: 'B', peso: 75_000_000, activo: true, baja_desde: null };
const C: IntegranteReparto = { id: 'c', nombre: 'C', peso: 75_000_000, activo: true, baja_desde: null };
const gasto = (pagado_por: string, total: number) => ({ pagado_por, total });

// El resultado del reparto es una unión: esto afirma que salió bien y lo deja tipado para leer filas.
function exito(r: ResultadoReparto) {
  if (!r.ok) throw new Error(`el reparto falló: ${r.error}`);
  return r;
}

test('reparte lo gastado en proporción al sueldo (ejemplo del spec)', () => {
  const r = exito(calcularReparto([A, B, C], [gasto('a', 80_000_000), gasto('b', 30_000_000), gasto('c', 10_000_000)]));
  expect(r.ok).toBe(true);
  expect(r.total).toBe(120_000_000);
  expect(r.filas.map((f) => [f.id, f.leCorresponde, f.pago, f.saldo])).toStrictEqual([
    ['a', 60_000_000, 80_000_000, 20_000_000],
    ['b', 30_000_000, 30_000_000, 0],
    ['c', 30_000_000, 10_000_000, -20_000_000],
  ]);
  expect(r.transferencias).toStrictEqual([{ de: 'c', a: 'a', monto: 20_000_000 }]);
});

test('los pesos reflejan el sueldo', () => {
  const r = exito(calcularReparto([A, B, C], []));
  expect(r.filas.map((f) => f.peso)).toStrictEqual([0.5, 0.25, 0.25]);
});

test('el redondeo reparte el centavo sobrante y la suma da exacta', () => {
  const iguales = [A, { ...B, peso: 150_000_000 }, { ...C, peso: 150_000_000 }];
  const r = exito(calcularReparto(iguales, [gasto('a', 100)]));
  expect(r.filas.map((f) => f.leCorresponde)).toStrictEqual([34, 33, 33]);
});

test('montos grandes no pierden precisión', () => {
  const r = exito(calcularReparto(
    [{ ...A, peso: 98_765_432_100 }, { ...B, peso: 12_345_678_900 }, C],
    [gasto('a', 999_999_999_999)],
  ));
  expect(r.filas.reduce((s, f) => s + f.leCorresponde, 0)).toBe(999_999_999_999);
  expect(r.filas.reduce((s, f) => s + f.saldo, 0)).toBe(0);
});

test('si una persona pagó todo, los otros dos le transfieren', () => {
  const r = exito(calcularReparto([A, B, C], [gasto('a', 120_000_000)]));
  expect(r.transferencias).toStrictEqual([
    { de: 'b', a: 'a', monto: 30_000_000 },
    { de: 'c', a: 'a', monto: 30_000_000 },
  ]);
});

test('sin gastos todo da cero y no hay transferencias', () => {
  const r = exito(calcularReparto([A, B, C], []));
  expect(r.total).toBe(0);
  expect(r.filas.every((f) => f.leCorresponde === 0 && f.saldo === 0)).toBeTruthy();
  expect(r.transferencias).toStrictEqual([]);
});

test('un sueldo vacío o en cero impide calcular y dice de quién es', () => {
  const r = calcularReparto([A, { ...B, peso: null }, { ...C, peso: 0 }], []);
  expect(r).toMatchObject({ ok: false, error: 'sueldo', sinSueldo: ['B', 'C'] });
});

test('un gasto pagado por alguien que no figura entre los integrantes no se reparte en silencio', () => {
  const r = calcularReparto([A, B], [gasto('x', 1000)]);
  expect(r.ok).toBe(false);
  expect(r).toMatchObject({ error: 'pagador' });
});

test('sin participantes no hay reparto', () => {
  expect(calcularReparto([], [])).toMatchObject({ error: 'sin_participantes' });
});

test('quien se dio de baja este mes sigue en el reparto de este mes', () => {
  const bajaAhora = { ...C, activo: false, baja_desde: '2026-11' };
  const bajaVieja = { ...B, activo: false, baja_desde: '2026-09' };
  expect(participantesDelMes([A, bajaVieja, bajaAhora], '2026-10').map((p) => p.id)).toStrictEqual(['a', 'c']);
  expect(participantesDelMes([A, bajaVieja, bajaAhora], '2026-11').map((p) => p.id)).toStrictEqual(['a']);
});

test('calcularTransferencias salda todo con el mayor deudor al mayor acreedor', () => {
  const t = calcularTransferencias([{ id: 'a', saldo: 500 }, { id: 'b', saldo: -200 }, { id: 'c', saldo: -300 }]);
  expect(t).toStrictEqual([{ de: 'c', a: 'a', monto: 300 }, { de: 'b', a: 'a', monto: 200 }]);
});

const EXT: IntegranteReparto = { id: 'e', nombre: 'Externo', peso: null, activo: true, baja_desde: null, tipo: 'pagador_externo' };
const exC = { ...C, activo: false, baja_desde: '2026-09' };

test('el pagador externo cobra lo que pagó y no entra a la cuota (ejemplo del spec)', () => {
  const ana: IntegranteReparto = { id: 'ana', nombre: 'Ana', peso: 100_000_000, activo: true, baja_desde: null };
  const beto: IntegranteReparto = { id: 'beto', nombre: 'Beto', peso: 50_000_000, activo: true, baja_desde: null };
  const r = exito(repartoDelMes([ana, beto, EXT], '2026-10', [gasto('ana', 10_000_000), gasto('e', 20_000_000)]));
  expect(r.ok).toBe(true);
  expect(r.total).toBe(30_000_000);
  expect(r.filas.map((f) => [f.id, f.participa, f.leCorresponde, f.pago, f.saldo])).toStrictEqual([
    ['ana', true, 20_000_000, 10_000_000, -10_000_000],
    ['beto', true, 10_000_000, 0, -10_000_000],
    ['e', false, 0, 20_000_000, 20_000_000],
  ]);
  expect(r.transferencias).toStrictEqual([
    { de: 'ana', a: 'e', monto: 10_000_000 },
    { de: 'beto', a: 'e', monto: 10_000_000 },
  ]);
});

test('un ex integrante que pagó tras su baja cobra sin cuota y no hay error de pagador', () => {
  const r = exito(repartoDelMes([A, B, exC], '2026-10', [gasto('c', 3000)]));
  expect(r.ok).toBe(true);
  expect(r.filas.map((f) => [f.id, f.participa, f.leCorresponde, f.saldo])).toStrictEqual([
    ['a', true, 2000, -2000],
    ['b', true, 1000, -1000],
    ['c', false, 0, 3000],
  ]);
  expect(r.transferencias).toStrictEqual([{ de: 'a', a: 'c', monto: 2000 }, { de: 'b', a: 'c', monto: 1000 }]);
});

test('con un externo y un ex integrante a la vez los saldos suman cero y la cuota suma el total', () => {
  const r = exito(repartoDelMes([A, B, exC, EXT], '2026-10', [gasto('a', 1001), gasto('c', 777), gasto('e', 5555)]));
  expect(r.ok).toBe(true);
  expect(r.total).toBe(7333);
  expect(r.filas.reduce((s, f) => s + f.saldo, 0)).toBe(0);
  expect(r.filas.reduce((s, f) => s + f.leCorresponde, 0)).toBe(7333);
  expect(r.filas.map((f) => f.id)).toStrictEqual(['a', 'b', 'c', 'e']);
});

test('un pagador externo que no pagó nada ese mes no aparece en las filas', () => {
  const r = exito(repartoDelMes([A, B, EXT], '2026-10', [gasto('a', 1000)]));
  expect(r.filas.map((f) => f.id)).toStrictEqual(['a', 'b']);
});

test('el externo no necesita sueldo y, si tiene uno guardado, no cambia la cuota de los demás', () => {
  expect(repartoDelMes([A, B, EXT], '2026-10', []).ok).toBe(true);
  const conSueldo = { ...EXT, peso: 999_999_999 };
  const r = exito(repartoDelMes([A, B, conSueldo], '2026-10', [gasto('e', 2250)]));
  expect(r.filas.map((f) => [f.id, f.leCorresponde])).toStrictEqual([['a', 1500], ['b', 750], ['e', 0]]);
});

test('el sueldo faltante solo se reclama a quienes participan', () => {
  const r = repartoDelMes([A, { ...B, peso: null }, EXT], '2026-10', []);
  expect(r).toMatchObject({ ok: false, error: 'sueldo', sinSueldo: ['B'] });
});

test('si solo hay un externo no hay a quién repartirle y no se divide por cero', () => {
  expect(repartoDelMes([EXT], '2026-10', [gasto('e', 1000)])).toMatchObject({ error: 'sin_participantes' });
});

test('el externo nunca participa, aunque esté activo o tenga baja futura', () => {
  const extConBaja = { ...EXT, id: 'e2', activo: false, baja_desde: '2026-12' };
  expect(participantesDelMes([A, EXT, extConBaja], '2026-10').map((p) => p.id)).toStrictEqual(['a']);
});

test('pueden figurar como pagadores los que participan y los externos activos', () => {
  const extViejo = { ...EXT, id: 'e2', activo: false, baja_desde: '2026-09' };
  expect(pagadoresDelMes([A, exC, EXT, extViejo], '2026-10').map((p) => p.id)).toStrictEqual(['a', 'e']);
});

test('un externo desactivado este mes sigue pudiendo figurar como pagador hasta el mes de su baja', () => {
  const extConBaja = { ...EXT, id: 'e2', activo: false, baja_desde: '2026-11' };
  expect(pagadoresDelMes([A, extConBaja], '2026-10').map((p) => p.id)).toStrictEqual(['a', 'e2']);
  expect(pagadoresDelMes([A, extConBaja], '2026-11').map((p) => p.id)).toStrictEqual(['a']);
});

describe('reparto con pesos', () => {
  test('integrantesConPeso mezcla los pesos por id y deja null a quien no tiene', () => {
    const sinPeso = [
      { id: 'a', nombre: 'A', activo: true, baja_desde: null },
      { id: 'b', nombre: 'B', activo: true, baja_desde: null, tipo: 'integrante' as const },
    ];
    expect(integrantesConPeso(sinPeso, { a: 7, x: 3 })).toStrictEqual([
      { id: 'a', nombre: 'A', activo: true, baja_desde: null, peso: 7 },
      { id: 'b', nombre: 'B', activo: true, baja_desde: null, tipo: 'integrante', peso: null },
    ]);
    expect(integrantesConPeso(sinPeso, { a: null, b: undefined }).map((i) => i.peso)).toStrictEqual([null, null]);
  });

  // Como partes_del_mes: el sueldo en partes por 10^12 del total de los participantes, redondeado.
  const ESCALA = 1_000_000_000_000n;
  function aPartes(sueldos: Record<string, number>): Record<string, number> {
    const suma = Object.values(sueldos).reduce((t, x) => t + BigInt(x), 0n);
    return Object.fromEntries(Object.entries(sueldos).map(([id, x]) => [id, Number((2n * BigInt(x) * ESCALA + suma) / (2n * suma))]));
  }

  test.each([
    [{ a: 150_000_000, b: 75_000_000, c: 75_000_000 }, 120_000_000],
    [{ a: 98_765_432_100, b: 12_345_678_900, c: 75_000_000 }, 999_999_999_999],
    [{ a: 123_457, b: 333_333, c: 1 }, 1_000_003],
    [{ a: 900_000_00, b: 600_000_00, c: 500_000_00 }, 7_777_77],
  ])('con pesos escala 10^12 cada uno paga lo mismo que con sueldos, a lo sumo 1 centavo de diferencia', (sueldos, total) => {
    const base = ['a', 'b', 'c'].map((id) => ({ id, nombre: id.toUpperCase(), activo: true, baja_desde: null }));
    const gastos = [gasto('a', total)];
    const conSueldos = exito(repartoDelMes(integrantesConPeso(base, sueldos), '2026-10', gastos));
    const conPartes = exito(repartoDelMes(integrantesConPeso(base, aPartes(sueldos)), '2026-10', gastos));
    expect(conPartes.filas.reduce((s, f) => s + f.leCorresponde, 0)).toBe(total);
    conSueldos.filas.forEach((f, i) => {
      expect(Math.abs(f.leCorresponde - conPartes.filas[i].leCorresponde)).toBeLessThanOrEqual(1);
    });
  });

  test('un participante con peso 0 o null da error de sueldo con su nombre', () => {
    expect(repartoDelMes([A, { ...B, peso: 0 }], '2026-10', [])).toMatchObject({ ok: false, error: 'sueldo', sinSueldo: ['B'] });
    expect(repartoDelMes([{ ...A, peso: null }, B], '2026-10', [])).toMatchObject({ ok: false, error: 'sueldo', sinSueldo: ['A'] });
  });

  test('una fila del reparto no lleva sueldos: sus claves son exactamente las del detalle', () => {
    const r = exito(repartoDelMes([A, B, exC, EXT], '2026-10', [gasto('a', 1000), gasto('c', 500)]));
    for (const f of r.filas) {
      expect(Object.keys(f).sort()).toStrictEqual(['id', 'leCorresponde', 'nombre', 'pago', 'participa', 'peso', 'saldo']);
    }
  });

  test('participantesDelMes y pagadoresDelMes aceptan integrantes sin peso', () => {
    const sinPeso = [{ id: 'a', nombre: 'A', activo: true, baja_desde: null }];
    expect(participantesDelMes(sinPeso, '2026-10')).toHaveLength(1);
    expect(pagadoresDelMes(sinPeso, '2026-10')).toHaveLength(1);
  });
});
