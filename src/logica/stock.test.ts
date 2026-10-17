import {
  normalizar, filtrarProductos, esPendiente, pendientes, agruparPorCategoria,
  aplicarDelta, deltaMenos, formatearCantidad, textoPendientes, productosVisibles, enStock, ocultos, accionProducto,
} from './stock';

const prods = [
  { id: 'p1', nombre: 'Yerba mate', marca: 'Marca Y', categoria_id: 'k1', stock: 1 },
  { id: 'p2', nombre: 'Azúcar', marca: null, categoria_id: 'k1', stock: 0 },
  { id: 'p3', nombre: 'Leche entera', marca: 'Marca X', categoria_id: 'k2', stock: '0.5' },
  { id: 'p4', nombre: 'Arroz', marca: null, categoria_id: 'k1', stock: 3 },
  { id: 'p5', nombre: 'Velas', marca: null, categoria_id: 'borrada', stock: 0 },
];
const cats = [{ id: 'k2', nombre: 'Lácteos' }, { id: 'k1', nombre: 'Almacén' }, { id: 'k3', nombre: 'Limpieza' }];

test('normalizar saca tildes, mayúsculas y espacios de los bordes', () => {
  expect(normalizar('  Azúcar ÑANDÚ ')).toBe('azucar nandu');
  expect(normalizar(null)).toBe('');
});

test('buscar sin tildes ni mayúsculas, por nombre o marca, todas las palabras', () => {
  expect(filtrarProductos(prods, 'azucar').map((p) => p.id)).toStrictEqual(['p2']);
  expect(filtrarProductos(prods, 'YERBA').map((p) => p.id)).toStrictEqual(['p1']);
  expect(filtrarProductos(prods, 'marca x').map((p) => p.id)).toStrictEqual(['p3']);
  expect(filtrarProductos(prods, 'leche y').map((p) => p.id)).toStrictEqual([]);
  expect(filtrarProductos(prods, '   ').length).toBe(prods.length);
});

test('pendiente es lo que llegó a 0', () => {
  expect(esPendiente({ stock: 0 })).toBe(true);
  expect(esPendiente({ stock: '0' })).toBe(true);
  expect(esPendiente({ stock: '0.5' })).toBe(false);
  expect(pendientes(prods).map((p) => p.id)).toStrictEqual(['p2', 'p5']);
});

test('agrupar respeta el orden de categorías, ordena por nombre y no deja grupos vacíos', () => {
  const g = agruparPorCategoria(prods, cats);
  expect(g.map((x) => x.categoria.nombre)).toStrictEqual(['Lácteos', 'Almacén', 'Sin categoría']);
  expect(g[1].productos.map((p) => p.nombre)).toStrictEqual(['Arroz', 'Azúcar', 'Yerba mate']);
  expect(g[2].categoria.id).toBe(null);
  expect(agruparPorCategoria([], cats)).toStrictEqual([]);
});

test('sumar y restar nunca deja negativo y no acumula error de coma flotante', () => {
  expect(aplicarDelta(2, 1)).toBe(3);
  expect(aplicarDelta('0.5', -1)).toBe(0);
  expect(aplicarDelta(0, -1)).toBe(0);
  expect(aplicarDelta(0.1, 0.2)).toBe(0.3);
});

test('cantidades a la argentina', () => {
  expect(formatearCantidad(0.5)).toBe('0,5');
  expect(formatearCantidad('3')).toBe('3');
  expect(formatearCantidad(1234.25)).toBe('1234,25');
});

test('texto del aviso de pendientes', () => {
  expect(textoPendientes([])).toBe('');
  expect(textoPendientes(['Leche'])).toBe('Falta Leche.');
  expect(textoPendientes(['Leche', 'Yerba'])).toBe('Faltan Leche y Yerba.');
  expect(textoPendientes(['Leche', 'Yerba', 'Pan', 'Sal'])).toBe('Faltan Leche, Yerba y 2 más.');
});

test('en Pendientes un producto tocado en esta visita no desaparece de la lista', () => {
  const tocados = new Set(['p1']);
  expect(productosVisibles(prods, { vista: 'pendientes', busqueda: '', tocados }).map((p) => p.id)).toStrictEqual(['p1', 'p2', 'p5']);
  expect(productosVisibles(prods, { vista: 'pendientes', busqueda: 'azu' }).map((p) => p.id)).toStrictEqual(['p2']);
  expect(productosVisibles(prods, { vista: 'todo', busqueda: '' }).length).toBe(prods.length);
});

test('restar: en enteros baja 1; con decimales (por kg) baja al entero de abajo', () => {
  expect(deltaMenos(3)).toBe(-1);
  expect(deltaMenos('1.5')).toBe(-0.5);
  expect(deltaMenos(0.75)).toBe(-0.75);
  expect(deltaMenos(1.25)).toBe(-0.25);
  expect(deltaMenos(0)).toBe(0);
});

const oculto = { id: 'p9', nombre: 'Galletitas viejas', marca: null, categoria_id: 'k1', stock: 0, oculto: true };

test('un producto oculto no está en Stock, ni en pendientes, ni en el buscador', () => {
  const conOculto = [...prods, oculto];
  expect(enStock(conOculto).some((p) => p.id === 'p9')).toBe(false);
  expect(pendientes(conOculto).some((p) => p.id === 'p9')).toBe(false);
  expect(productosVisibles(conOculto, { vista: 'todo', busqueda: '' }).some((p) => p.id === 'p9')).toBe(false);
  expect(productosVisibles(conOculto, { vista: 'pendientes', busqueda: '', tocados: new Set(['p9']) }).some((p) => p.id === 'p9')).toBe(false);
});

test('la vista de ocultos muestra solo los ocultos y respeta la búsqueda', () => {
  const conOculto = [...prods, oculto];
  expect(ocultos(conOculto).map((p) => p.id)).toStrictEqual(['p9']);
  expect(productosVisibles(conOculto, { vista: 'ocultos', busqueda: '' }).map((p) => p.id)).toStrictEqual(['p9']);
  expect(productosVisibles(conOculto, { vista: 'ocultos', busqueda: 'yerba' }).map((p) => p.id)).toStrictEqual([]);
});

test('la ficha borra lo que nunca se compró, oculta lo que tiene compras y vuelve a mostrar lo oculto', () => {
  expect(accionProducto({ oculto: false }, false)).toBe('borrar');
  expect(accionProducto({ oculto: false }, true)).toBe('ocultar');
  expect(accionProducto({ oculto: true }, true)).toBe('mostrar');
  expect(accionProducto({ oculto: true }, false)).toBe('mostrar');
  expect(accionProducto({}, false)).toBe('borrar');
});
