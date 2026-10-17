import { porCategoria, totalesPorMes, filtrarGastos, tituloCompra, totalDe } from './analisis';
import type { GastoAnalisis, ItemAnalisis } from './analisis';

const cats = [{ id: 'k1', nombre: 'Almacén' }, { id: 'k2', nombre: 'Lácteos' }, { id: 'k3', nombre: 'Servicios' }];
const item = (nombre: string, categoria_id: string | null, cantidad: number, precio_unitario: number): ItemAnalisis =>
  ({ cantidad, precio_unitario, productos: { nombre, categoria_id } });
const compra: GastoAnalisis = { id: 'g1', fecha: '2026-10-06', pagado_por: 'a', modo: 'productos', categoria_id: null, total: 5000 + 1500, nota: 'Súper',
  gasto_items: [item('Yerba', 'k1', 1, 5000), item('Leche', 'k2', 0.5, 3000)] };
const luz: GastoAnalisis = { id: 'g2', fecha: '2026-10-05', pagado_por: 'b', modo: 'total', categoria_id: 'k3', total: 10000, nota: 'Luz', gasto_items: [] };

test('una compra por productos se reparte por la categoría de cada producto', () => {
  const r = porCategoria([compra, luz], cats);
  expect(r.map((x) => [x.nombre, x.monto])).toStrictEqual([['Servicios', 10000], ['Almacén', 5000], ['Lácteos', 1500]]);
  expect(r.reduce((s, x) => s + x.monto, 0)).toBe(compra.total + luz.total);
  expect(r[0].parte).toBe(10000 / 16500);
});

test('sin categoría y sin gastos', () => {
  const huerfano = { ...compra, gasto_items: [item('Raro', null, 1, 700)], total: 700 };
  expect(porCategoria([huerfano], cats).map((x) => [x.id, x.nombre])).toStrictEqual([[null, 'Sin categoría']]);
  expect(porCategoria([{ ...compra, gasto_items: [] }], cats).map((x) => [x.nombre, x.monto])).toStrictEqual([['Sin categoría', 6500]]);
  expect(porCategoria([], cats)).toStrictEqual([]);
});

test('totales de los últimos meses, con ceros donde no hubo gastos', () => {
  const r = totalesPorMes([compra, luz, { ...luz, fecha: '2026-08-20', total: 300 }, { ...luz, fecha: '2026-05-01' }], '2026-10', 3);
  expect(r).toStrictEqual([{ mes: '2026-08', total: 300 }, { mes: '2026-09', total: 0 }, { mes: '2026-10', total: 16500 }]);
  expect(totalesPorMes([], '2026-01', 2)[0].mes).toBe('2025-12');
});

test('filtros por persona, categoría y texto sin tildes', () => {
  const g = [compra, luz];
  expect(filtrarGastos(g, { persona: 'b' }).map((x) => x.id)).toStrictEqual(['g2']);
  expect(filtrarGastos(g, { categoria: 'k2' }).map((x) => x.id)).toStrictEqual(['g1']);
  expect(filtrarGastos(g, { categoria: 'k3' }).map((x) => x.id)).toStrictEqual(['g2']);
  expect(filtrarGastos(g, { texto: 'SUPER' }).map((x) => x.id)).toStrictEqual(['g1']);
  expect(filtrarGastos(g, { texto: 'leche' }).map((x) => x.id)).toStrictEqual(['g1']);
  expect(filtrarGastos(g, { persona: '', categoria: '', texto: '  ' }).map((x) => x.id)).toStrictEqual(['g1', 'g2']);
});

test('título de una compra con sus productos', () => {
  const items = compra.gasto_items ?? [];
  expect(tituloCompra(items)).toBe('Yerba, Leche');
  expect(tituloCompra([...items, item('A', 'k1', 1, 1), item('B', 'k1', 1, 1)])).toBe('Yerba, Leche y 2 más');
  expect(tituloCompra([])).toBe('Compra por productos');
  expect(tituloCompra(undefined)).toBe('Compra por productos');
});

test('con filtro de categoría, el total cuenta solo lo de esa categoría (igual que Categorías)', () => {
  expect(totalDe([compra, luz], 'k2')).toBe(1500);
  expect(totalDe([compra, luz], 'k3')).toBe(10000);
  expect(totalDe([compra, luz], '')).toBe(16500);
});
