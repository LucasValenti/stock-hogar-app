import { enMayuscula } from './texto';

test('enMayuscula sube solo la primera letra', () => {
  expect(enMayuscula('octubre de 2026')).toBe('Octubre de 2026');
  expect(enMayuscula('recibe')).toBe('Recibe');
  expect(enMayuscula('')).toBe('');
});
