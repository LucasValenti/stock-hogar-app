import { paraRevisar } from './revisar';

const DIA = 24 * 60 * 60 * 1000;
const AHORA = new Date('2026-10-17T12:00:00.000Z');
const haceDias = (d: number) => new Date(AHORA.getTime() - d * DIA).toISOString();

const cats = [
  { id: 'k1', dias_sin_movimiento: 20 },
  { id: 'k2', dias_sin_movimiento: 5 },
];
const prod = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  nombre: id,
  categoria_id: 'k1',
  stock: 2,
  oculto: false,
  ultimo_movimiento: haceDias(30),
  ...over,
});

test('un producto con stock 0 nunca es para revisar, por viejo que sea', () => {
  const r = paraRevisar([prod('a', { stock: 0, ultimo_movimiento: haceDias(365) }), prod('b', { stock: '0' })], cats, AHORA);
  expect(r).toStrictEqual([]);
});

test('19 días sin movimiento no alcanzan para 20; 20 días justos sí', () => {
  expect(paraRevisar([prod('a', { ultimo_movimiento: haceDias(19) })], cats, AHORA)).toStrictEqual([]);
  expect(paraRevisar([prod('a', { ultimo_movimiento: haceDias(20) })], cats, AHORA).map((p) => p.id)).toStrictEqual(['a']);
  expect(paraRevisar([prod('a', { ultimo_movimiento: haceDias(21) })], cats, AHORA).map((p) => p.id)).toStrictEqual(['a']);
});

test('un día entero menos un milisegundo todavía no cuenta como el día 20', () => {
  const casi = new Date(AHORA.getTime() - 20 * DIA + 1).toISOString();
  expect(paraRevisar([prod('a', { ultimo_movimiento: casi })], cats, AHORA)).toStrictEqual([]);
});

test('cada categoría usa su propio umbral', () => {
  const r = paraRevisar(
    [
      prod('lento', { categoria_id: 'k1', ultimo_movimiento: haceDias(6) }),
      prod('rapido', { categoria_id: 'k2', ultimo_movimiento: haceDias(6) }),
      prod('rapido-justo', { categoria_id: 'k2', ultimo_movimiento: haceDias(4) }),
    ],
    cats,
    AHORA,
  );
  expect(r.map((p) => p.id)).toStrictEqual(['rapido']);
});

test('los ocultos no se revisan', () => {
  expect(paraRevisar([prod('a', { oculto: true })], cats, AHORA)).toStrictEqual([]);
});

test('el stock puede llegar como texto numérico (kg): 0.5 se revisa, "0" no', () => {
  const r = paraRevisar([prod('a', { stock: '0.5' }), prod('b', { stock: '0' })], cats, AHORA);
  expect(r.map((p) => p.id)).toStrictEqual(['a']);
});

test('salen del más viejo al más nuevo, y a igual fecha por nombre', () => {
  const r = paraRevisar(
    [
      prod('nuevo', { nombre: 'Nuevo', ultimo_movimiento: haceDias(21) }),
      prod('viejo', { nombre: 'Viejo', ultimo_movimiento: haceDias(90) }),
      prod('medio', { nombre: 'Medio', ultimo_movimiento: haceDias(40) }),
      prod('b', { nombre: 'Bebida', ultimo_movimiento: haceDias(25) }),
      prod('a', { nombre: 'Arroz', ultimo_movimiento: haceDias(25) }),
    ],
    cats,
    AHORA,
  );
  expect(r.map((p) => p.id)).toStrictEqual(['viejo', 'medio', 'a', 'b', 'nuevo']);
});

test('no modifica la lista que recibe', () => {
  const entrada = [prod('a', { ultimo_movimiento: haceDias(21) }), prod('b', { ultimo_movimiento: haceDias(90) })];
  const copia = entrada.map((p) => p.id);
  paraRevisar(entrada, cats, AHORA);
  expect(entrada.map((p) => p.id)).toStrictEqual(copia);
});

test('una fecha ilegible o futura nunca pide revisar', () => {
  const futuro = new Date(AHORA.getTime() + 3 * DIA).toISOString();
  const r = paraRevisar([prod('a', { ultimo_movimiento: 'no-es-fecha' }), prod('b', { ultimo_movimiento: futuro })], cats, AHORA);
  expect(r).toStrictEqual([]);
});

test('una categoría que no está en la lista usa los 20 días por defecto', () => {
  const r = paraRevisar(
    [prod('a', { categoria_id: 'borrada', ultimo_movimiento: haceDias(20) }), prod('b', { categoria_id: 'borrada', ultimo_movimiento: haceDias(19) })],
    cats,
    AHORA,
  );
  expect(r.map((p) => p.id)).toStrictEqual(['a']);
});

test('sin productos o sin categorías no revienta', () => {
  expect(paraRevisar([], cats, AHORA)).toStrictEqual([]);
  expect(paraRevisar([prod('a')], [], AHORA).map((p) => p.id)).toStrictEqual(['a']);
});
