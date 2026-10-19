import { COLORES_PERFIL, iniciales } from './perfil';

test('COLORES_PERFIL es la paleta cerrada, en su orden', () => {
  expect(COLORES_PERFIL).toEqual(['naranja', 'verde', 'azul', 'rosa', 'violeta', 'amarillo']);
});

test('iniciales: una palabra da una letra', () => {
  expect(iniciales('Ana')).toBe('A');
});

test('iniciales: dos palabras dan dos letras en mayúscula', () => {
  expect(iniciales('ana pérez')).toBe('AP');
});

test('iniciales: ignora espacios de más y se queda con las dos primeras palabras', () => {
  expect(iniciales('  María   José  ')).toBe('MJ');
  expect(iniciales('Juan Carlos Pérez')).toBe('JC');
});

test('iniciales: sube a mayúscula también las letras con tilde', () => {
  expect(iniciales('élida')).toBe('É');
});

test('iniciales: sube a mayúscula también la tilde escrita como letra + acento suelto', () => {
  expect(iniciales('élida')).toBe('É');
});

test('iniciales: descarta lo que no es letra, y una palabra sin letras no ocupa lugar', () => {
  expect(iniciales('😀 Sol')).toBe('S');
  expect(iniciales('😀 Sol Pérez')).toBe('SP');
  expect(iniciales('😀Sol')).toBe('S');
  expect(iniciales('1 2 Sol')).toBe('S');
  expect(iniciales('(Ana) O\'Brien')).toBe('AO');
});

test('iniciales: nunca pasa de dos letras', () => {
  expect(iniciales('ß ß ß')).toBe('SS');
});

test('iniciales: sin nada que mostrar da «?»', () => {
  expect(iniciales('')).toBe('?');
  expect(iniciales('  ')).toBe('?');
  expect(iniciales('😀')).toBe('?');
});
