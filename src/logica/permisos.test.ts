import { capacidades, puedeTocarIntegrante } from './permisos';
import type { Acceso } from './tipos';

const comun: Acceso = { admin: false, permisos: [] };
const sueldos: Acceso = { admin: false, permisos: ['sueldos'] };
const altasBajas: Acceso = { admin: false, permisos: ['altas_bajas'] };
const ambos: Acceso = { admin: false, permisos: ['sueldos', 'altas_bajas'] };
const admin: Acceso = { admin: true, permisos: [] };

test('capacidades: sin acceso no se puede nada', () => {
  expect(capacidades(null)).toEqual({ verSueldos: false, cerrarMes: false, altasYBajas: false, darPermisos: false });
});

test('capacidades: un integrante común no puede nada extra', () => {
  expect(capacidades(comun)).toEqual({ verSueldos: false, cerrarMes: false, altasYBajas: false, darPermisos: false });
});

test('capacidades: «sueldos» da ver sueldos y cerrar el mes, nada más', () => {
  expect(capacidades(sueldos)).toEqual({ verSueldos: true, cerrarMes: true, altasYBajas: false, darPermisos: false });
});

test('capacidades: «altas_bajas» da altas y bajas, nada más', () => {
  expect(capacidades(altasBajas)).toEqual({ verSueldos: false, cerrarMes: false, altasYBajas: true, darPermisos: false });
});

test('capacidades: con ambos permisos se suman, pero dar permisos sigue siendo del admin', () => {
  expect(capacidades(ambos)).toEqual({ verSueldos: true, cerrarMes: true, altasYBajas: true, darPermisos: false });
});

test('capacidades: el admin puede todo sin tener permisos registrados', () => {
  expect(capacidades(admin)).toEqual({ verSueldos: true, cerrarMes: true, altasYBajas: true, darPermisos: true });
});

const objetivoComun = { admin: false, permisos: [] };
const objetivoConPermisos = { admin: false, permisos: ['sueldos' as const] };
const objetivoAdmin = { admin: true, permisos: [] };

test('puedeTocarIntegrante: sin altas y bajas nunca se puede, ni sobre un integrante común', () => {
  expect(puedeTocarIntegrante(null, objetivoComun)).toBe(false);
  expect(puedeTocarIntegrante(comun, objetivoComun)).toBe(false);
  expect(puedeTocarIntegrante(sueldos, objetivoComun)).toBe(false);
});

test('puedeTocarIntegrante: con altas y bajas se toca a un integrante común', () => {
  expect(puedeTocarIntegrante(altasBajas, objetivoComun)).toBe(true);
  expect(puedeTocarIntegrante(ambos, objetivoComun)).toBe(true);
});

test('puedeTocarIntegrante: quien no es admin no toca a alguien con permisos', () => {
  expect(puedeTocarIntegrante(altasBajas, objetivoConPermisos)).toBe(false);
  expect(puedeTocarIntegrante(ambos, objetivoConPermisos)).toBe(false);
});

test('puedeTocarIntegrante: quien no es admin no toca al admin', () => {
  expect(puedeTocarIntegrante(altasBajas, objetivoAdmin)).toBe(false);
  expect(puedeTocarIntegrante(ambos, objetivoAdmin)).toBe(false);
});

test('puedeTocarIntegrante: el admin toca a cualquiera, incluso a otro admin o con permisos', () => {
  expect(puedeTocarIntegrante(admin, objetivoComun)).toBe(true);
  expect(puedeTocarIntegrante(admin, objetivoConPermisos)).toBe(true);
  expect(puedeTocarIntegrante(admin, objetivoAdmin)).toBe(true);
});
