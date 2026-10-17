import { normalizarTimestamp } from './fechas';

describe('normalizarTimestamp', () => {
  test.each([
    // PostgREST: ISO con 6 decimales y +00:00.
    ['2026-10-18T12:34:56.123456+00:00', '2026-10-18T12:34:56.123Z'],
    // Postgres en texto: espacio en vez de T y offset corto.
    ['2026-10-18 12:34:56.123456+00', '2026-10-18T12:34:56.123Z'],
    // Menos de 3 decimales, y ninguno.
    ['2026-10-18T12:34:56.5+00:00', '2026-10-18T12:34:56.500Z'],
    ['2026-10-18T12:34:56+00:00', '2026-10-18T12:34:56.000Z'],
    // Más de 6 decimales: se trunca, no se redondea hacia arriba.
    ['2026-10-18T12:34:56.123999999Z', '2026-10-18T12:34:56.123Z'],
    // Ya normalizada: queda igual.
    ['2026-10-18T12:34:56.123Z', '2026-10-18T12:34:56.123Z'],
    // Otro huso: se pasa a UTC (y puede cambiar el día).
    ['2026-10-18 22:30:00.250000-03', '2026-10-19T01:30:00.250Z'],
    ['2026-10-18T22:30:00-03:00', '2026-10-19T01:30:00.000Z'],
    ['2026-10-18T05:00:00+05:30', '2026-10-17T23:30:00.000Z'],
    ['2026-10-18T05:00:00+0530', '2026-10-17T23:30:00.000Z'],
    // Sin huso: la base siempre lo manda; si faltara se toma como UTC.
    ['2026-10-18T12:34:56.123456', '2026-10-18T12:34:56.123Z'],
  ])('%s → %s', (entrada, salida) => {
    expect(normalizarTimestamp(entrada)).toBe(salida);
  });

  test('la salida se lee igual en cualquier motor: tres decimales y Z', () => {
    const r = normalizarTimestamp('2026-10-18 12:34:56.123456+00');
    expect(r).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Date.parse(r)).toBe(Date.UTC(2026, 9, 18, 12, 34, 56, 123));
  });

  test('un valor que no se entiende pasa sin tocar, en vez de romper la lista entera', () => {
    expect(normalizarTimestamp('ayer')).toBe('ayer');
    expect(normalizarTimestamp('')).toBe('');
    expect(normalizarTimestamp(undefined as unknown as string)).toBeUndefined();
    expect(normalizarTimestamp(null as unknown as string)).toBeNull();
  });

  test('una fecha que no existe (31 de febrero) pasa sin tocar', () => {
    expect(normalizarTimestamp('2026-02-31T10:00:00+00:00')).toBe('2026-02-31T10:00:00+00:00');
  });
});
