import { lecturaAFormulario, sinRepetido } from './lectura';
import { avisoLectura } from './comprobante';
import { centavosATexto } from './dinero';

// Nombres de fantasía: nada de datos reales.
const CASA = [{ id: 'a', nombre: 'Ana' }, { id: 'b', nombre: 'Beto' }];
const R = { fecha: '2026-10-08', centavos: 48600, origen: 'Ana Gómez', destino: 'Beto Salas', operacion: '123456789012' };

test('una lectura completa llena monto, fecha, pagador, nota y comprobante', () => {
  const c = lecturaAFormulario(R, CASA, '');
  expect(c.monto).toBe(centavosATexto(R.centavos));
  expect(c.fecha).toBe('2026-10-08');
  expect(c.pagadoPor).toBe('a');
  expect(c.nota).toBe('Beto Salas');
  expect(c.comprobante).toStrictEqual({ operacion: '123456789012', destino: 'beto salas' });
  expect(c.aviso).toStrictEqual(avisoLectura(R));
});

test('no pisa una nota que ya tenía algo', () => {
  expect(lecturaAFormulario(R, CASA, 'algo').nota).toBe(undefined);
});

test('si el origen no identifica a uno solo, no hay pagador', () => {
  expect(lecturaAFormulario({ ...R, origen: 'Ana' }, [...CASA, { id: 'a2', nombre: 'Ana Ruiz' }], '').pagadoPor).toBe(undefined);
  expect(lecturaAFormulario({ ...R, origen: 'Caro' }, CASA, '').pagadoPor).toBe(undefined);
});

test('una lectura vacía solo deja el aviso', () => {
  const vacia = { destino: 'Beto Salas' };
  expect(avisoLectura(vacia).tipo).toBe('nada');
  expect(lecturaAFormulario(vacia, CASA, '')).toStrictEqual({ comprobante: null, aviso: avisoLectura(vacia) });
});

test('sinRepetido vacía el monto y la nota y suelta el comprobante', () => {
  const c = lecturaAFormulario(R, CASA, '');
  const s = sinRepetido(c);
  expect(s.monto).toBe('');
  expect(s.nota).toBe('');
  expect(s.comprobante).toBe(null);
  expect(s.fecha).toBe(c.fecha);
  expect(s.pagadoPor).toBe(c.pagadoPor);
  expect(s.aviso).toBe(c.aviso);
});
