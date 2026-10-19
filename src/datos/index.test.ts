// index.ts no tiene que romper al importarse, aunque falte .env: el error llega al usarlo.

// Cuenta los clientes de Supabase creados, sin dejar de cumplir lo que hace el real (incluido SIN_CONFIG).
const mockCliente = vi.hoisted(() => ({ creados: 0 }));
vi.mock('./cliente', async () => {
  const real = await vi.importActual<typeof import('./cliente')>('./cliente');
  return {
    ...real,
    obtenerCliente: () => {
      mockCliente.creados++;
      return real.obtenerCliente();
    },
  };
});

const ENV = ['VITE_DATOS', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;
const original = Object.fromEntries(ENV.map((k) => [k, import.meta.env[k]]));

async function importar(env: Partial<Record<(typeof ENV)[number], string>>): Promise<typeof import('./index')> {
  for (const k of ENV) {
    if (env[k] === undefined) delete import.meta.env[k];
    else import.meta.env[k] = env[k];
  }
  vi.resetModules();
  return import('./index');
}

afterEach(() => {
  for (const k of ENV) {
    if (original[k] === undefined) delete import.meta.env[k];
    else import.meta.env[k] = original[k];
  }
});

describe('@/datos', () => {
  test('en modo supabase sin .env, importar no lanza y usar rechaza con SIN_CONFIG', async () => {
    const m = await importar({});
    expect(m.datos).toBeDefined();
    await expect(m.datos.integrantes()).rejects.toMatchObject({ code: 'SIN_CONFIG' });
    expect(() => m.datos.escucharCambios(() => undefined)).toThrow(expect.objectContaining({ code: 'SIN_CONFIG' }));
    expect(() => m.obtenerCola()).toThrow(expect.objectContaining({ code: 'SIN_CONFIG' }));
  });

  test('el proxy no parece una promesa', async () => {
    const m = await importar({});
    expect((m.datos as unknown as { then?: unknown }).then).toBeUndefined();
  });

  test('en modo memoria anda con la casa de ejemplo', async () => {
    const m = await importar({ VITE_DATOS: 'memoria' });
    expect((await m.datos.integrantes()).map((i) => i.nombre)).toEqual(['Ana', 'Bruno', 'Caro']);
    expect(await m.datos.ajustarStock('ejemplo-yerba', 1)).toBe(2);
    expect(await m.obtenerCola().pendientes()).toEqual([]);
  });

  test('en modo memoria la capa trae anotaciones, edición de productos y «Sigue habiendo»', async () => {
    const m = await importar({ VITE_DATOS: 'memoria' });
    expect((await m.datos.anotaciones()).map((x) => x.texto)).toEqual(['Comprar pan', 'Pilas AA para el control']);
    const nota = await m.datos.crearAnotacion('Sal gruesa');
    await m.datos.borrarAnotacion(nota.id);
    const yerba = (await m.datos.producto('ejemplo-yerba'))!;
    expect(await m.datos.editarProducto({ ...yerba, nombre: 'Yerba suave', unidad: 'kg' })).toMatchObject({ nombre: 'Yerba suave', unidad: 'kg', stock: 1 });
    await expect(m.datos.confirmarHay('ejemplo-arroz')).resolves.toBeUndefined();
  });

  test('la cola escribe solo con un integrante con sesión lista', async () => {
    const m = await importar({ VITE_DATOS: 'memoria' });
    const gasto = { fecha: '2026-10-12', pagado_por: 'ejemplo-ana', total: 500_00, modo: 'total' as const, categoria_id: 'ejemplo-luz' };
    await expect(m.datos.guardarGasto(gasto, [])).rejects.toMatchObject({ code: 'SIN_SESION' });
    m.fijarIntegrante('ejemplo-ana');
    await expect(m.datos.guardarGasto(gasto, [])).resolves.toMatchObject({ estado: 'hecho' });
    m.fijarIntegrante(null);
    await expect(m.datos.guardarGasto(gasto, [])).rejects.toMatchObject({ code: 'SIN_SESION' });
  });

  test('entrar a la demo usa la casa de ejemplo sin crear el cliente de Supabase', async () => {
    mockCliente.creados = 0;
    const m = await importar({}); // sin .env: si la demo tocara Supabase, acá reventaría.
    expect(m.enDemo()).toBe(false);
    m.entrarDemo();
    expect(m.enDemo()).toBe(true);
    expect(m.esModoMemoria()).toBe(false);
    expect((await m.datos.integrantes()).map((i) => i.nombre)).toEqual(['Ana', 'Bruno', 'Caro']);
    expect(mockCliente.creados).toBe(0);
  });

  test('un gasto de la demo se va al salir y volver a entrar', async () => {
    const m = await importar({});
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

  test('la cola de la demo no toca localStorage y la real queda igual al entrar y salir', async () => {
    const real = JSON.stringify([{ id: 'real-1', tipo: 'guardarGasto', datos: {}, duenio: 'ejemplo-bruno' }]);
    localStorage.setItem('cola-escritura', real);
    const escribir = vi.spyOn(Storage.prototype, 'setItem');

    const m = await importar({});
    m.entrarDemo();
    m.fijarIntegrante('ejemplo-ana');
    await m.datos.guardarGasto(
      { fecha: '2099-01-01', pagado_por: 'ejemplo-ana', total: 500_00, modo: 'total', categoria_id: 'ejemplo-luz' },
      [],
    );
    m.salirDemo();

    const escrituras = escribir.mock.calls.filter(([k]) => k === 'cola-escritura');
    expect(escrituras).toEqual([]);
    expect(localStorage.getItem('cola-escritura')).toBe(real);
    escribir.mockRestore();
  });
});
