// El cliente de Supabase es uno solo: lo comparten la capa de datos y el ingreso (auth).

const mockCrear = jest.fn(() => ({ auth: {} }));
jest.mock('@supabase/supabase-js', () => ({ createClient: () => mockCrear() }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const ENV = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'] as const;
const original = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

function importar(): typeof import('./cliente') {
  let modulo!: typeof import('./cliente');
  jest.isolateModules(() => {
    modulo = require('./cliente');
  });
  return modulo;
}

beforeEach(() => mockCrear.mockClear());
afterEach(() => {
  for (const k of ENV) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe('obtenerCliente', () => {
  test('sin .env lanza SIN_CONFIG y no crea nada', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const { obtenerCliente } = importar();
    expect(() => obtenerCliente()).toThrow(expect.objectContaining({ code: 'SIN_CONFIG' }));
    expect(mockCrear).not.toHaveBeenCalled();
  });

  test('crea el cliente en el primer uso y después devuelve el mismo', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'clave-de-prueba';
    const { obtenerCliente } = importar();
    expect(mockCrear).not.toHaveBeenCalled();
    expect(obtenerCliente()).toBe(obtenerCliente());
    expect(mockCrear).toHaveBeenCalledTimes(1);
  });
});
