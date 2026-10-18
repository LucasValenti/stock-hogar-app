// Junta los ítems de texto de pdf.js en renglones legibles para extraerComprobante.
import { extraerComprobante } from '@/logica/comprobante';
import { armarLineas } from './lineas';

type Item = { str: string; hasEOL?: boolean; transform: number[]; height?: number };
const item = (str: string, x: number, y: number, extra: Partial<Item> = {}): Item => ({
  str,
  transform: [1, 0, 0, 1, x, y],
  ...extra,
});

test('un renglón con un espacio entre ítems, y los centavos en superíndice pegados', () => {
  const items = [item('$', 100, 500), item('56.900', 120, 500), item('00', 180, 503, { height: 12 })];
  expect(armarLineas(items)).toBe('$ 56.90000');
});

test('los renglones distintos van en líneas distintas, de arriba hacia abajo', () => {
  const items = [item('Segunda', 100, 480), item('Primera', 100, 500)];
  expect(armarLineas(items)).toBe('Primera\nSegunda');
});

test('hasEOL corta el renglón aunque la y sea la misma', () => {
  const items = [item('uno', 100, 500, { hasEOL: true }), item('dos', 100, 500)];
  expect(armarLineas(items)).toBe('uno\ndos');
});

// Comprobante de PAGO de fantasía (los nombres reales no van al repo), con los centavos en superíndice.
test('el texto armado por renglón lo lee extraerComprobante', () => {
  const itemsDePago: Item[] = [
    item('Comprobante de pago', 80, 900),
    item('Domingo, 18 de octubre de 2026, 10:03 hs.', 80, 880),
    item('$ 56.900', 80, 860, { height: 12 }),
    item('00', 150, 863, { height: 12 }),
    item('Origen y destino', 80, 840),
    item('Ana Ejemplo', 80, 820),
    item('CUIL: 00-00000000-0', 80, 800),
    item('Mercado Pago', 80, 780),
    item('La Verduleria', 80, 760),
    item('CUIT: 00-00000000-0', 80, 740),
    item('Mercado Pago', 80, 720),
    item('N.º de operación de Mercado Pago', 80, 700),
    item('123456789012', 80, 680),
  ];
  expect(extraerComprobante(armarLineas(itemsDePago))).toStrictEqual({
    fecha: '2026-10-18',
    centavos: 5690000,
    origen: 'Ana Ejemplo',
    destino: 'La Verduleria',
    operacion: '123456789012',
  });
});
