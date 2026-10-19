// El cliente de Supabase es uno solo: lo comparten la capa de datos y el ingreso (auth).

const mockCrear = vi.hoisted(() => vi.fn(() => ({ auth: {} })));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => mockCrear() }));

const ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;
const original = Object.fromEntries(ENV.map((k) => [k, import.meta.env[k]]));

async function importar(): Promise<typeof import('./cliente')> {
  vi.resetModules();
  return import('./cliente');
}

beforeEach(() => mockCrear.mockClear());
afterEach(() => {
  for (const k of ENV) {
    if (original[k] === undefined) delete import.meta.env[k];
    else import.meta.env[k] = original[k];
  }
});

describe('obtenerCliente', () => {
  test('sin .env lanza SIN_CONFIG y no crea nada', async () => {
    delete import.meta.env.VITE_SUPABASE_URL;
    delete import.meta.env.VITE_SUPABASE_ANON_KEY;
    const { obtenerCliente } = await importar();
    expect(() => obtenerCliente()).toThrow(expect.objectContaining({ code: 'SIN_CONFIG' }));
    expect(mockCrear).not.toHaveBeenCalled();
  });

  test('crea el cliente en el primer uso y después devuelve el mismo', async () => {
    import.meta.env.VITE_SUPABASE_URL = 'http://localhost:54321';
    import.meta.env.VITE_SUPABASE_ANON_KEY = 'clave-de-prueba';
    const { obtenerCliente } = await importar();
    expect(mockCrear).not.toHaveBeenCalled();
    expect(obtenerCliente()).toBe(obtenerCliente());
    expect(mockCrear).toHaveBeenCalledTimes(1);
  });
});
