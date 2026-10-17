// index.ts no tiene que romper al importarse, aunque falte .env: el error llega al usarlo.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock'));

const ENV = ['EXPO_PUBLIC_DATOS', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'] as const;
const original = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

function importar(env: Partial<Record<(typeof ENV)[number], string>>): typeof import('./index') {
  for (const k of ENV) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  let modulo!: typeof import('./index');
  jest.isolateModules(() => {
    modulo = require('./index');
  });
  return modulo;
}

afterEach(() => {
  for (const k of ENV) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe('@/datos', () => {
  test('en modo supabase sin .env, importar no lanza y usar rechaza con SIN_CONFIG', async () => {
    const m = importar({});
    expect(m.datos).toBeDefined();
    await expect(m.datos.integrantes()).rejects.toMatchObject({ code: 'SIN_CONFIG' });
    expect(() => m.datos.escucharCambios(() => undefined)).toThrow(expect.objectContaining({ code: 'SIN_CONFIG' }));
    expect(() => m.obtenerCola()).toThrow(expect.objectContaining({ code: 'SIN_CONFIG' }));
  });

  test('el proxy no parece una promesa', () => {
    const m = importar({});
    expect((m.datos as unknown as { then?: unknown }).then).toBeUndefined();
  });

  test('en modo memoria anda con la casa de ejemplo', async () => {
    const m = importar({ EXPO_PUBLIC_DATOS: 'memoria' });
    expect((await m.datos.integrantes()).map((i) => i.nombre)).toEqual(['Ana', 'Bruno', 'Caro']);
    expect(await m.datos.ajustarStock('ejemplo-yerba', 1)).toBe(2);
    expect(await m.obtenerCola().pendientes()).toEqual([]);
  });
});
