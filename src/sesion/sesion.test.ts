import type { Integrante } from '@/logica/tipos';

import { crearCola, esErrorDeRed, type Almacen, type Op } from '@/datos/cola';

import { estadoDeSesion, integranteDeLaCola, salirSinCola } from './estado';

const ana: Integrante = {
  id: 'ejemplo-ana',
  nombre: 'Ana',
  sueldo: null,
  email: 'ana@example.com',
  activo: true,
  baja_desde: null,
  tipo: 'integrante',
  creado: '2026-01-01T12:00:00.000Z',
  admin: true,
  color: null,
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

describe('integranteDeLaCola', () => {
  test('solo con la sesión lista pasa el id del integrante a la capa de datos', () => {
    expect(integranteDeLaCola('lista', ana)).toBe('ejemplo-ana');
    expect(integranteDeLaCola('cargando', ana)).toBeNull();
    expect(integranteDeLaCola('ajena', ana)).toBeNull();
    expect(integranteDeLaCola('sin-sesion', ana)).toBeNull();
    expect(integranteDeLaCola('lista', null)).toBeNull();
  });
});

describe('salirSinCola', () => {
  function almacen(): Almacen {
    const m = new Map<string, string>();
    return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v) };
  }

  // La cola real con un integrante que maneja la sesión, y una op de Ana pendiente (se cargó sin red).
  async function conOpPendiente() {
    const sesion = { yo: 'ejemplo-ana' as string | null };
    const red = { hay: false };
    const ejecutar = vi.fn(async (o: Op) => {
      if (!red.hay) throw new TypeError('Network request failed');
      return o.id;
    });
    const cola = crearCola({ almacen: almacen(), ejecutar, esErrorDeRed, integranteActual: () => sesion.yo });
    await cola.encolar({ id: 'a', tipo: 'guardarGasto', datos: {} });
    ejecutar.mockClear();
    red.hay = true;
    const fijar = vi.fn((id: string | null) => {
      sesion.yo = id;
    });
    return { cola, ejecutar, fijar };
  }

  test('desde que empieza a salir no se manda ninguna op pendiente, y quedan guardadas', async () => {
    const { cola, ejecutar, fijar } = await conOpPendiente();
    // Mientras se cierra la sesión vuelve la red y algo pide vaciar la cola.
    const cerrar = vi.fn(async () => {
      await cola.vaciar();
    });
    await salirSinCola(cerrar, fijar, 'ejemplo-ana');
    expect(fijar).toHaveBeenCalledWith(null);
    expect(fijar.mock.invocationCallOrder[0]).toBeLessThan(cerrar.mock.invocationCallOrder[0]);
    expect(ejecutar).not.toHaveBeenCalled();
    expect(await cola.pendientes()).toHaveLength(1);
  });

  test('si no se pudo cerrar la sesión, la cola vuelve a ser de quien estaba', async () => {
    const { fijar } = await conOpPendiente();
    const falla = new Error('sin red');
    await expect(salirSinCola(async () => Promise.reject(falla), fijar, 'ejemplo-ana')).rejects.toBe(falla);
    expect(fijar.mock.calls).toEqual([[null], ['ejemplo-ana']]);
  });
});
