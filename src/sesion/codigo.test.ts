import { codigoValido, emailValido, mensajeDeCodigo, normalizarCodigo, normalizarEmail } from './codigo';

describe('email', () => {
  test('se limpia: sin espacios en los bordes y en minúsculas', () => {
    expect(normalizarEmail('  Ana@Example.COM ')).toBe('ana@example.com');
  });

  test('acepta emails con forma de email', () => {
    expect(emailValido('ana@example.com')).toBe(true);
    expect(emailValido('a.b+c@sub.example.com.ar')).toBe(true);
  });

  test('rechaza lo que no tiene forma de email', () => {
    for (const malo of ['', 'ana', 'ana@', '@example.com', 'ana@example', 'ana @example.com', 'ana@exa mple.com']) {
      expect(emailValido(malo)).toBe(false);
    }
  });
});

describe('código', () => {
  test('se le quitan los espacios (el email lo suele mostrar en grupos)', () => {
    expect(normalizarCodigo(' 123 456 ')).toBe('123456');
  });

  test('son entre 6 y 10 números', () => {
    expect(codigoValido('123456')).toBe(true);
    expect(codigoValido('1234567890')).toBe(true);
    expect(codigoValido('12345')).toBe(false);
    expect(codigoValido('12345678901')).toBe(false);
    expect(codigoValido('12345a')).toBe(false);
    expect(codigoValido('')).toBe(false);
  });
});

describe('mensajeDeCodigo', () => {
  test('código rechazado: no se dice por qué (inválido o vencido)', () => {
    expect(mensajeDeCodigo({ status: 403, message: 'Token has expired or is invalid' })).toBe(
      'El código no es válido o venció. Pedí uno nuevo.',
    );
  });

  test('demasiados intentos: el mensaje de mensajeError', () => {
    expect(mensajeDeCodigo({ status: 429, message: 'rate limit' })).toMatch(/Esperá unos minutos/);
  });

  test('sin conexión no se confunde con un código malo', () => {
    expect(mensajeDeCodigo(new TypeError('Failed to fetch'))).toMatch(/Sin conexión/);
  });
});
