import type { Integrante } from '@/logica/tipos';

import { estadoDeSesion } from './estado';

const ana: Integrante = {
  id: 'ejemplo-ana',
  nombre: 'Ana',
  sueldo: null,
  email: 'ana@example.com',
  activo: true,
  baja_desde: null,
  tipo: 'integrante',
  creado: '2026-01-01T12:00:00.000Z',
};

describe('estadoDeSesion', () => {
  test('sin sesión pide ingresar', () => {
    expect(estadoDeSesion(null, null)).toBe('sin-sesion');
  });

  test('sin sesión manda aunque haya un integrante viejo', () => {
    expect(estadoDeSesion(null, ana)).toBe('sin-sesion');
  });

  test('con sesión pero sin integrante, la cuenta es ajena a la casa', () => {
    expect(estadoDeSesion({ user: { email: 'otra@example.com' } }, null)).toBe('ajena');
  });

  test('con sesión e integrante, la sesión está lista', () => {
    expect(estadoDeSesion({ user: { email: 'ana@example.com' } }, ana)).toBe('lista');
  });
});
