import { validarGasto, validarIntegrante, totalItems, avisoCambioTipo, admiteDecimales, validarCantidad, validarProducto, validarAnotacion } from './validar';
import type { GastoFormulario } from './validar';

const base: GastoFormulario = { fecha: '2026-10-07', pagado_por: 'a', modo: 'total', total: 850000, categoria_id: 'cat', items: [] };

test('un gasto por total válido pasa y devuelve el total', () => {
  expect(validarGasto(base)).toStrictEqual({ ok: true, errores: {}, total: 850000 });
});

test('un gasto por total necesita monto mayor a cero y categoría', () => {
  const r = validarGasto({ ...base, total: null, categoria_id: '' });
  expect(r.ok).toBe(false);
  expect(r.errores.total).toBeTruthy();
  expect(r.errores.categoria_id).toBeTruthy();
  expect(validarGasto({ ...base, total: 0 }).errores.total).toBeTruthy();
});

test('falta fecha o quién pagó', () => {
  const r = validarGasto({ ...base, fecha: '', pagado_por: '' });
  expect(r.errores.fecha).toBeTruthy();
  expect(r.errores.pagado_por).toBeTruthy();
});

test('un gasto por productos suma sus ítems redondeando por ítem', () => {
  const items = [
    { producto_id: 'p1', cantidad: 2, precio_unitario: 1000 },
    { producto_id: 'p2', cantidad: 0.5, precio_unitario: 999 },
  ];
  expect(totalItems(items)).toBe(2500);
  expect(validarGasto({ ...base, modo: 'productos', total: null, categoria_id: null, items })).toStrictEqual({ ok: true, errores: {}, total: 2500 });
});

test('un gasto por productos sin ítems, con cantidad inválida o sin precio no pasa', () => {
  const p: GastoFormulario = { ...base, modo: 'productos', categoria_id: null };
  expect(validarGasto({ ...p, items: [] }).errores.items).toBeTruthy();
  expect(validarGasto({ ...p, items: [{ producto_id: 'p1', cantidad: 0, precio_unitario: 100 }] }).errores.items).toBeTruthy();
  expect(validarGasto({ ...p, items: [{ producto_id: 'p1', cantidad: 1, precio_unitario: null }] }).errores.items).toBeTruthy();
});

test('no se carga en un mes cerrado, pero sí en un mes anterior abierto', () => {
  const cerrados = new Set(['2026-09']);
  expect(validarGasto({ ...base, fecha: '2026-09-30' }, { mesesCerrados: cerrados }).errores.fecha).toBeTruthy();
  expect(validarGasto({ ...base, fecha: '2026-08-31' }, { mesesCerrados: cerrados }).ok).toBe(true);
});

test('validarIntegrante normaliza email y sueldo', () => {
  expect(validarIntegrante({ nombre: ' Ana ', sueldo: '1.500.000', email: ' Ana@Example.com ' })).toStrictEqual({
    ok: true, errores: {}, valor: { nombre: 'Ana', tipo: 'integrante', sueldo: 150000000, email: 'ana@example.com' },
  });
  expect(validarIntegrante({ nombre: 'Ana', sueldo: '', email: 'ana@example.com' }).valor.sueldo).toBe(null);
});

test('validarIntegrante marca nombre vacío, sueldo inválido y email mal escrito', () => {
  const r = validarIntegrante({ nombre: ' ', sueldo: 'mucho', email: 'ana@' });
  expect(Object.keys(r.errores).sort()).toStrictEqual(['email', 'nombre', 'sueldo']);
});

test('validarIntegrante: un pagador externo no pide sueldo ni lo envía', () => {
  const r = validarIntegrante({ nombre: 'Tía', sueldo: 'mucho', email: 'tia@example.com', tipo: 'pagador_externo' });
  expect(r).toStrictEqual({ ok: true, errores: {}, valor: { nombre: 'Tía', tipo: 'pagador_externo', email: 'tia@example.com' } });
  expect('sueldo' in r.valor).toBe(false);
});

test('validarIntegrante: un tipo desconocido o ausente cuenta como integrante', () => {
  expect(validarIntegrante({ nombre: 'Ana', sueldo: '', email: 'ana@example.com' }).valor.tipo).toBe('integrante');
  expect(validarIntegrante({ nombre: 'Ana', sueldo: '', email: 'ana@example.com', tipo: 'otro' }).valor.tipo).toBe('integrante');
});

test('avisoCambioTipo: avisa al pasar a alguien de integrante a externo y al revés', () => {
  const ana = { nombre: 'Ana', tipo: 'integrante' };
  expect(avisoCambioTipo(ana, 'pagador_externo')).toMatch(/Ana pasa a ser pagador externo.*meses que no están cerrados.*Los meses cerrados no cambian/);
  expect(avisoCambioTipo({ ...ana, tipo: 'pagador_externo' }, 'integrante')).toMatch(/Ana pasa a participar del reparto.*Los meses cerrados no cambian/);
});

test('avisoCambioTipo: sin cambio de tipo, o al crear a alguien, no avisa', () => {
  expect(avisoCambioTipo({ nombre: 'Ana', tipo: 'integrante' }, 'integrante')).toBe(null);
  expect(avisoCambioTipo({ nombre: 'Ana' }, 'integrante')).toBe(null);
  expect(avisoCambioTipo(null, 'pagador_externo')).toBe(null);
});

// --- Unidades, cantidades y productos (app nativa) ---

test('admiteDecimales: solo kg y litro', () => {
  expect(admiteDecimales('kg')).toBe(true);
  expect(admiteDecimales('litro')).toBe(true);
  expect(admiteDecimales('unidad')).toBe(false);
  expect(admiteDecimales('paquete')).toBe(false);
});

test('validarCantidad: en kg y litro acepta 1,5 (coma o punto) y enteros', () => {
  expect(validarCantidad('kg', '1,5')).toStrictEqual({ ok: true, valor: 1.5 });
  expect(validarCantidad('kg', '1.5')).toStrictEqual({ ok: true, valor: 1.5 });
  expect(validarCantidad('litro', ' 0,25 ')).toStrictEqual({ ok: true, valor: 0.25 });
  expect(validarCantidad('kg', '2')).toStrictEqual({ ok: true, valor: 2 });
  expect(validarCantidad('kg', '0,125')).toStrictEqual({ ok: true, valor: 0.125 });
});

test('validarCantidad: en unidad y paquete acepta enteros', () => {
  expect(validarCantidad('unidad', '3')).toStrictEqual({ ok: true, valor: 3 });
  expect(validarCantidad('paquete', '12')).toStrictEqual({ ok: true, valor: 12 });
  expect(validarCantidad('unidad', '2,0')).toStrictEqual({ ok: true, valor: 2 });
});

test('validarCantidad: en unidad y paquete rechaza decimales con el mensaje exacto', () => {
  const error = 'Para unidades y paquetes, solo números enteros.';
  expect(validarCantidad('unidad', '1,5')).toStrictEqual({ ok: false, error });
  expect(validarCantidad('paquete', '2.5')).toStrictEqual({ ok: false, error });
  expect(validarCantidad('unidad', '0,5')).toStrictEqual({ ok: false, error });
});

test('validarCantidad: rechaza cero, negativos, vacío y texto en cualquier unidad', () => {
  const error = 'Ingresá una cantidad mayor a 0.';
  for (const u of ['unidad', 'paquete', 'kg', 'litro'] as const) {
    for (const t of ['0', '0,0', '-1', '-1,5', '', '   ', 'abc', '1,2,3', '1e3']) {
      expect(validarCantidad(u, t)).toStrictEqual({ ok: false, error });
    }
  }
});

test('validarCantidad: una cifra desorbitada (Infinity) no pasa', () => {
  expect(validarCantidad('kg', '9'.repeat(400)).ok).toBe(false);
  expect(validarCantidad('unidad', '9'.repeat(400)).ok).toBe(false);
});

test('validarCantidad: kg y litro admiten hasta 3 decimales (los que muestra la app)', () => {
  expect(validarCantidad('kg', '1,005')).toStrictEqual({ ok: true, valor: 1.005 });
  expect(validarCantidad('kg', '1,2345')).toStrictEqual({ ok: false, error: 'Usá hasta 3 decimales, por ejemplo 1,25.' });
});

test('validarProducto: un producto válido sale recortado y con la marca vacía como null', () => {
  expect(validarProducto({ nombre: '  Yerba  ', marca: ' ', categoria_id: 'k1', unidad: 'paquete' })).toStrictEqual({
    ok: true,
    errores: {},
    valor: { nombre: 'Yerba', marca: null, categoria_id: 'k1', unidad: 'paquete' },
  });
  expect(validarProducto({ nombre: 'Queso', marca: ' La Paulina ', categoria_id: 'k2', unidad: 'kg' }).valor).toStrictEqual({
    nombre: 'Queso',
    marca: 'La Paulina',
    categoria_id: 'k2',
    unidad: 'kg',
  });
});

test('validarProducto: pide nombre, categoría y una unidad conocida', () => {
  const r = validarProducto({ nombre: '   ', marca: null, categoria_id: '', unidad: 'caja' });
  expect(r.ok).toBe(false);
  expect(r.errores.nombre).toBe('Escribí un nombre.');
  expect(r.errores.categoria_id).toBe('Elegí una categoría.');
  expect(r.errores.unidad).toBe('Elegí cómo se cuenta.');
  expect(validarProducto({ nombre: 'x', categoria_id: null, unidad: null }).ok).toBe(false);
  expect(validarProducto({ nombre: 'x', categoria_id: 'k', unidad: 'unidad' }).ok).toBe(true);
});

// --- Compra por total con productos tildados ---

const productosU = [
  { id: 'p1', unidad: 'unidad' as const },
  { id: 'p2', unidad: 'kg' as const },
  { id: 'p3', unidad: 'paquete' as const },
];
const conTildados = (tildados: Array<{ producto_id: string; cantidad: number }> | null | undefined): GastoFormulario => ({ ...base, tildados });

test('un gasto por total con tildados válidos pasa y no cambia el total', () => {
  const t = [{ producto_id: 'p1', cantidad: 2 }, { producto_id: 'p2', cantidad: 1.5 }];
  expect(validarGasto(conTildados(t), { productos: productosU })).toStrictEqual({ ok: true, errores: {}, total: 850000 });
});

test('un gasto por total sin tildados (o con la lista vacía) sigue andando sin pasar productos', () => {
  expect(validarGasto(conTildados(undefined))).toStrictEqual({ ok: true, errores: {}, total: 850000 });
  expect(validarGasto(conTildados(null))).toStrictEqual({ ok: true, errores: {}, total: 850000 });
  expect(validarGasto(conTildados([]))).toStrictEqual({ ok: true, errores: {}, total: 850000 });
});

test('tildados: kg acepta 1,5 pero unidad no', () => {
  expect(validarGasto(conTildados([{ producto_id: 'p2', cantidad: 1.5 }]), { productos: productosU }).ok).toBe(true);
  const r = validarGasto(conTildados([{ producto_id: 'p1', cantidad: 1.5 }]), { productos: productosU });
  expect(r.ok).toBe(false);
  expect(r.errores.tildados).toBe('Para unidades y paquetes, solo números enteros.');
  expect(validarGasto(conTildados([{ producto_id: 'p3', cantidad: 0.5 }]), { productos: productosU }).errores.tildados).toBe(
    'Para unidades y paquetes, solo números enteros.',
  );
});

test('tildados: cantidad cero, negativa o no numérica no pasa', () => {
  for (const cantidad of [0, -1, NaN, Infinity]) {
    const r = validarGasto(conTildados([{ producto_id: 'p2', cantidad }]), { productos: productosU });
    expect(r.ok).toBe(false);
    expect(r.errores.tildados).toBe('Ingresá una cantidad mayor a 0.');
  }
});

test('tildados: un producto repetido no pasa', () => {
  const r = validarGasto(conTildados([{ producto_id: 'p1', cantidad: 1 }, { producto_id: 'p1', cantidad: 2 }]), { productos: productosU });
  expect(r.ok).toBe(false);
  expect(r.errores.tildados).toBe('Hay un producto tildado más de una vez.');
});

test('tildados: un producto que no existe (o sin lista de productos) no pasa', () => {
  const t = [{ producto_id: 'fantasma', cantidad: 1 }];
  expect(validarGasto(conTildados(t), { productos: productosU }).errores.tildados).toBe('Hay un producto tildado que ya no existe.');
  expect(validarGasto(conTildados([{ producto_id: 'p1', cantidad: 1 }])).errores.tildados).toBe('Hay un producto tildado que ya no existe.');
});

test('tildados: no afecta al gasto por productos, que valida como siempre', () => {
  const items = [{ producto_id: 'p1', cantidad: 2, precio_unitario: 1000 }];
  const g: GastoFormulario = { ...base, modo: 'productos', total: null, categoria_id: null, items, tildados: [{ producto_id: 'p1', cantidad: 1.5 }] };
  expect(validarGasto(g)).toStrictEqual({ ok: true, errores: {}, total: 2000 });
});

test('tildados: los otros errores del gasto siguen apareciendo junto al de tildados', () => {
  const r = validarGasto({ ...base, pagado_por: '', tildados: [{ producto_id: 'p1', cantidad: 1.5 }] }, { productos: productosU });
  expect(r.errores.pagado_por).toBeTruthy();
  expect(r.errores.tildados).toBeTruthy();
});

describe('validarAnotacion', () => {
  test('saca los espacios sobrantes y acepta hasta 120 caracteres', () => {
    expect(validarAnotacion('  Comprar pan ')).toEqual({ ok: true, valor: 'Comprar pan' });
    expect(validarAnotacion('a'.repeat(120))).toMatchObject({ ok: true });
  });
  test('vacía o de más de 120, con mensaje', () => {
    expect(validarAnotacion('   ')).toEqual({ ok: false, error: 'Escribí qué falta.' });
    expect(validarAnotacion('a'.repeat(121))).toEqual({ ok: false, error: 'Usá hasta 120 caracteres.' });
  });
});
