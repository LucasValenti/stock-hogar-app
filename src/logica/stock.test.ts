import {
  normalizar, filtrarProductos, esPendiente, pendientes, agruparPorCategoria,
  aplicarDelta, deltaMenos, formatearCantidad, textoPendientes, productosVisibles, enStock, ocultos, accionProducto, pendientesConAnotaciones,
  redondeoPorUnidad, cantidadConUnidad,
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

// --- Pendientes con anotaciones ---

const nota = (id: string, texto: string, creado: string) => ({ id, texto, creado_por: null, creado });

test('pendientesConAnotaciones: primero los productos sin stock, después las anotaciones de la más vieja a la más nueva', () => {
  const anotaciones = [
    nota('n2', 'Comprar pan', '2026-10-10T10:00:00Z'),
    nota('n1', 'Pilas AA', '2026-10-09T10:00:00Z'),
  ];
  const r = pendientesConAnotaciones([...prods, oculto], anotaciones);
  expect(r.map((x) => `${x.tipo}:${x.id}`)).toStrictEqual(['producto:p2', 'producto:p5', 'anotacion:n1', 'anotacion:n2']);
  const primera = r[2];
  expect(primera.tipo === 'anotacion' && primera.anotacion.texto).toBe('Pilas AA');
  const p = r[0];
  expect(p.tipo === 'producto' && p.producto.nombre).toBe('Azúcar');
});

test('pendientesConAnotaciones: un oculto sin stock no aparece y el stock decimal positivo tampoco', () => {
  const r = pendientesConAnotaciones([{ id: 'o', nombre: 'Viejo', stock: 0, oculto: true }, { id: 'k', nombre: 'Queso', stock: '0.25' }], []);
  expect(r).toStrictEqual([]);
});

test('pendientesConAnotaciones: sin productos faltantes quedan solo las anotaciones, y sin nada, lista vacía', () => {
  expect(pendientesConAnotaciones(prods.filter((p) => Number(p.stock) > 0), [nota('n', 'Pan', '2026-10-10T10:00:00Z')]).map((x) => x.tipo)).toStrictEqual(['anotacion']);
  expect(pendientesConAnotaciones([], [])).toStrictEqual([]);
});

test('pendientesConAnotaciones: no modifica las listas que recibe', () => {
  const anotaciones = [nota('n2', 'B', '2026-10-10T10:00:00Z'), nota('n1', 'A', '2026-10-09T10:00:00Z')];
  pendientesConAnotaciones(prods, anotaciones);
  expect(anotaciones.map((a) => a.id)).toStrictEqual(['n2', 'n1']);
});

describe('redondeoPorUnidad (cambiar la unidad no convierte el stock)', () => {
  test('a unidades o paquetes con decimales: propone el entero más cercano', () => {
    expect(redondeoPorUnidad(1.5, 'paquete')).toBe(2);
    expect(redondeoPorUnidad(2.4, 'unidad')).toBe(2);
    expect(redondeoPorUnidad('0.75', 'unidad')).toBe(1);
  });
  test('si había algo, no lo redondea a 0: queda en 1', () => {
    expect(redondeoPorUnidad(0.3, 'paquete')).toBe(1);
  });
  test('sin decimales, o a kg/litros, no hace falta redondear', () => {
    expect(redondeoPorUnidad(2, 'paquete')).toBeNull();
    expect(redondeoPorUnidad(0, 'unidad')).toBeNull();
    expect(redondeoPorUnidad(1.5, 'kg')).toBeNull();
    expect(redondeoPorUnidad(1.5, 'litro')).toBeNull();
  });
});

describe('cantidadConUnidad', () => {
  test('kg y litros llevan la unidad; unidades y paquetes, solo el número', () => {
    expect(cantidadConUnidad(2.5, 'kg')).toBe('2,5 kg');
    expect(cantidadConUnidad('1.25', 'litro')).toBe('1,25 L');
    expect(cantidadConUnidad(3, 'paquete')).toBe('3');
    expect(cantidadConUnidad(0, 'unidad')).toBe('0');
  });
});
