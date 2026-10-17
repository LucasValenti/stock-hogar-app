import {
  hoy, mesDe, mesActual, mesSiguiente, mesAnterior, rangoMes, nombreMes, fechaCorta, fechaLarga, ultimoDia, diaSiguiente,
} from './meses';

test('hoy y mesActual usan la fecha local', () => {
  expect(hoy(new Date(2026, 0, 5))).toBe('2026-01-05');
  expect(mesActual(new Date(2026, 9, 31, 23, 59))).toBe('2026-10');
});

test('mesDe toma año y mes de una fecha', () => {
  expect(mesDe('2026-10-07')).toBe('2026-10');
});

test('mesSiguiente y mesAnterior cruzan el año', () => {
  expect(mesSiguiente('2026-12')).toBe('2027-01');
  expect(mesSiguiente('2026-03')).toBe('2026-04');
  expect(mesAnterior('2026-01')).toBe('2025-12');
});

test('rangoMes da el primer día y el primer día del mes siguiente', () => {
  expect(rangoMes('2026-12')).toStrictEqual({ desde: '2026-12-01', hastaExcl: '2027-01-01' });
});

test('nombreMes y fechaCorta en castellano', () => {
  expect(nombreMes('2026-10')).toBe('octubre de 2026');
  expect(fechaCorta('2026-10-07')).toBe('07/10');
});

test('fecha con año para el historial', () => {
  expect(fechaLarga('2026-10-07')).toBe('07/10/2026');
});

test('último día del mes y día siguiente, con años bisiestos y fin de año', () => {
  expect(ultimoDia('2026-10')).toBe('2026-10-31');
  expect(ultimoDia('2028-02')).toBe('2028-02-29');
  expect(diaSiguiente('2026-12-31')).toBe('2027-01-01');
  expect(diaSiguiente('2026-02-28')).toBe('2026-03-01');
});
