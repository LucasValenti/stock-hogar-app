import { aCentavos, formatear, centavosATexto, aCantidad, formatearPorcentaje } from './dinero';

test('aCentavos entiende montos escritos a la argentina', () => {
  const casos: Array<[string, number]> = [
    ['1234', 123400], ['1.234', 123400], ['1.234,5', 123450], ['1.234,56', 123456],
    ['$ 1.500.000', 150000000], ['1234,5', 123450], ['12.5', 1250], ['0', 0], [' 85000 ', 8500000],
    ['1.234.567,89', 123456789],
  ];
  // El texto va dentro de lo comparado: si falla, el diff dice con qué entrada.
  for (const [texto, esperado] of casos) expect([texto, aCentavos(texto)]).toStrictEqual([texto, esperado]);
});

test('aCentavos rechaza lo que no es un monto', () => {
  for (const t of ['', '   ', 'abc', '-50', '1,234,5', '12,345', '1.2.3', null, undefined]) {
    expect([String(t), aCentavos(t)]).toStrictEqual([String(t), null]);
  }
});

test('formatear muestra pesos y oculta los centavos si son cero', () => {
  // El espacio después del $ es un espacio duro (U+00A0), como lo escribe Intl en es-AR.
  expect(formatear(123456)).toBe('$ 1.234,56');
  expect(formatear(120000000)).toBe('$ 1.200.000');
  expect(formatear(0)).toBe('$ 0');
});

test('centavosATexto deja el monto listo para editar en un input', () => {
  expect(centavosATexto(123456)).toBe('1234,56');
  expect(centavosATexto(120000)).toBe('1200');
  expect(centavosATexto(5)).toBe('0,05');
});

test('aCantidad acepta coma o punto y solo positivos', () => {
  expect(aCantidad('1')).toBe(1);
  expect(aCantidad('1,5')).toBe(1.5);
  expect(aCantidad('0.25')).toBe(0.25);
  for (const t of ['0', '-1', 'x', '', null]) expect([String(t), aCantidad(t)]).toStrictEqual([String(t), null]);
});

test('formatearPorcentaje usa coma decimal y un decimal como máximo', () => {
  expect(formatearPorcentaje(0.5)).toBe('50%');
  expect(formatearPorcentaje(1 / 3)).toBe('33,3%');
});
