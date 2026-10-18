// index.ts no tiene que romper al importarse, aunque falte .env: el error llega al usarlo.

import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock'));

// Cuenta los clientes de Supabase creados, sin dejar de cumplir lo que hace el real (incluido SIN_CONFIG).
const mockCliente = { creados: 0 };
jest.mock('./cliente', () => {
  const real = jest.requireActual('./cliente') as typeof import('./cliente');
  return {
    ...real,
    obtenerCliente: () => {
      mockCliente.creados++;
      return real.obtenerCliente();
    },
  };
});

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

  test('en modo memoria la capa trae anotaciones, edición de productos y «Sigue habiendo»', async () => {
    const m = importar({ EXPO_PUBLIC_DATOS: 'memoria' });
    expect((await m.datos.anotaciones()).map((x) => x.texto)).toEqual(['Comprar pan', 'Pilas AA para el control']);
    const nota = await m.datos.crearAnotacion('Sal gruesa');
    await m.datos.borrarAnotacion(nota.id);
    const yerba = (await m.datos.producto('ejemplo-yerba'))!;
    expect(await m.datos.editarProducto({ ...yerba, nombre: 'Yerba suave', unidad: 'kg' })).toMatchObject({ nombre: 'Yerba suave', unidad: 'kg', stock: 1 });
    await expect(m.datos.confirmarHay('ejemplo-arroz')).resolves.toBeUndefined();
  });

  test('la cola escribe solo con un integrante con sesión lista', async () => {
    const m = importar({ EXPO_PUBLIC_DATOS: 'memoria' });
    const gasto = { fecha: '2026-10-12', pagado_por: 'ejemplo-ana', total: 500_00, modo: 'total' as const, categoria_id: 'ejemplo-luz' };
    await expect(m.datos.guardarGasto(gasto, [])).rejects.toMatchObject({ code: 'SIN_SESION' });
    m.fijarIntegrante('ejemplo-ana');
    await expect(m.datos.guardarGasto(gasto, [])).resolves.toMatchObject({ estado: 'hecho' });
    m.fijarIntegrante(null);
    await expect(m.datos.guardarGasto(gasto, [])).rejects.toMatchObject({ code: 'SIN_SESION' });
  });

  test('entrar a la demo usa la casa de ejemplo sin crear el cliente de Supabase', async () => {
    mockCliente.creados = 0;
    const m = importar({}); // sin .env: si la demo tocara Supabase, acá reventaría.
    expect(m.enDemo()).toBe(false);
    m.entrarDemo();
    expect(m.enDemo()).toBe(true);
    expect(m.esModoMemoria()).toBe(false);
    expect((await m.datos.integrantes()).map((i) => i.nombre)).toEqual(['Ana', 'Bruno', 'Caro']);
    expect(mockCliente.creados).toBe(0);
  });

  test('un gasto de la demo se va al salir y volver a entrar', async () => {
    const m = importar({});
    const gasto = { fecha: '2099-01-01', pagado_por: 'ejemplo-ana', total: 500_00, modo: 'total' as const, categoria_id: 'ejemplo-luz' };
    m.entrarDemo();
    m.fijarIntegrante('ejemplo-ana');
    await expect(m.datos.guardarGasto(gasto, [])).resolves.toMatchObject({ estado: 'hecho' });
    expect(await m.datos.gastosEntre('2099-01-01', '2099-01-02')).toHaveLength(1);

    m.salirDemo();
    m.entrarDemo();
    m.fijarIntegrante('ejemplo-ana');
    expect(await m.datos.gastosEntre('2099-01-01', '2099-01-02')).toHaveLength(0);
  });

  test('la cola de la demo no toca AsyncStorage y la real queda igual al entrar y salir', async () => {
    const real = JSON.stringify([{ id: 'real-1', tipo: 'guardarGasto', datos: {}, duenio: 'ejemplo-bruno' }]);
    await AsyncStorage.setItem('cola-escritura', real);
    (AsyncStorage.setItem as jest.Mock).mockClear();

    const m = importar({});
    m.entrarDemo();
    m.fijarIntegrante('ejemplo-ana');
    await m.datos.guardarGasto(
      { fecha: '2099-01-01', pagado_por: 'ejemplo-ana', total: 500_00, modo: 'total', categoria_id: 'ejemplo-luz' },
      [],
    );
    m.salirDemo();

    const escrituras = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(([k]) => k === 'cola-escritura');
    expect(escrituras).toEqual([]);
    expect(await AsyncStorage.getItem('cola-escritura')).toBe(real);
  });
});
