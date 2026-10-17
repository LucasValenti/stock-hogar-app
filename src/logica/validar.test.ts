import { validarGasto, validarIntegrante, totalItems, avisoCambioTipo } from './validar';
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
