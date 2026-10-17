import { conCola, crearCola, ejecutorDe, esErrorDeRed, esRechazoDefinitivo, type Almacen, type Op, type OpNueva } from './cola';
import { crearDatosEnMemoria } from './memoria';
import type { Datos } from './tipos';

function almacenEnMemoria(): Almacen {
  const valores = new Map<string, string>();
  return {
    getItem: async (clave) => valores.get(clave) ?? null,
    setItem: async (clave, valor) => {
      valores.set(clave, valor);
    },
  };
}

const sinRed = () => new TypeError('Network request failed');
const op = (id: string): OpNueva => ({ id, tipo: 'guardarGasto', datos: { id } });
/** Cómo queda guardada en la cola: con el integrante que la creó. */
const deAna = (id: string): Op => ({ ...op(id), duenio: 'ana' });
const comoAna = () => 'ana';

// `ejecutar` de prueba: con red responde el id de la op; sin red, falla como fetch.
function servidor() {
  const estado = { hayRed: true, ejecutadas: [] as string[] };
  const ejecutar = jest.fn(async (o: Op) => {
    if (!estado.hayRed) throw sinRed();
    estado.ejecutadas.push(o.id);
    return `ok-${o.id}`;
  });
  return { estado, ejecutar };
}

describe('esErrorDeRed', () => {
  test('reconoce el corte en nativo y en la web', () => {
    expect(esErrorDeRed(new TypeError('Network request failed'))).toBe(true);
    expect(esErrorDeRed(new TypeError('Failed to fetch'))).toBe(true);
    // Así lo devuelve postgrest-js cuando fetch falla: un objeto, no un TypeError.
    expect(esErrorDeRed({ message: 'TypeError: Failed to fetch', code: '' })).toBe(true);
  });

  test('no confunde errores de la base ni otros TypeError', () => {
    expect(esErrorDeRed({ message: 'permiso denegado', code: '42501' })).toBe(false);
    expect(esErrorDeRed(new Error('CIERRE_DESACTUALIZADO'))).toBe(false);
    expect(esErrorDeRed(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(esErrorDeRed(null)).toBe(false);
  });
});

describe('esRechazoDefinitivo', () => {
  test('solo las excepciones de la RPC (P0001) y los errores 22xxx y 23xxx de Postgres', () => {
    for (const code of ['P0001', '23505', '23503', '23502', '22P02', '22003']) {
      expect(esRechazoDefinitivo({ code, message: 'x' })).toBe(true);
    }
    for (const code of ['', '42501', '57014', 'PGRST301', 'PGRST116', '08006', '40001', 'P0002']) {
      expect(esRechazoDefinitivo({ code, message: 'x' })).toBe(false);
    }
    expect(esRechazoDefinitivo(new Error('sin code'))).toBe(false);
    expect(esRechazoDefinitivo(new TypeError('Failed to fetch'))).toBe(false);
    expect(esRechazoDefinitivo(null)).toBe(false);
  });
});

describe('crearCola', () => {
  test('con red, encolar ejecuta y devuelve hecho', async () => {
    const { ejecutar } = servidor();
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed, integranteActual: comoAna });
    await expect(cola.encolar(op('a'))).resolves.toEqual({ estado: 'hecho', resultado: 'ok-a' });
    expect(await cola.pendientes()).toEqual([]);
  });

  test('sin red, encolar devuelve en-cola y la op queda pendiente', async () => {
    const { estado, ejecutar } = servidor();
    estado.hayRed = false;
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed, integranteActual: comoAna });
    await expect(cola.encolar(op('a'))).resolves.toEqual({ estado: 'en-cola' });
    expect(await cola.pendientes()).toEqual([deAna('a')]);
  });

  test('vaciar ejecuta las pendientes en orden y las saca', async () => {
    const { estado, ejecutar } = servidor();
    estado.hayRed = false;
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed, integranteActual: comoAna });
    await cola.encolar(op('a'));
    await cola.encolar(op('b'));
    await cola.encolar(op('c'));
    estado.hayRed = true;
    await cola.vaciar();
    expect(estado.ejecutadas).toEqual(['a', 'b', 'c']);
    expect(await cola.pendientes()).toEqual([]);
  });

  test('con pendientes, una op nueva espera su turno detrás de ellas', async () => {
    const { estado, ejecutar } = servidor();
    estado.hayRed = false;
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed, integranteActual: comoAna });
    await cola.encolar(op('a'));
    estado.hayRed = true;
    await expect(cola.encolar(op('b'))).resolves.toEqual({ estado: 'hecho', resultado: 'ok-b' });
    expect(estado.ejecutadas).toEqual(['a', 'b']);
  });

  test('un rechazo definitivo de la base (P0001) pasa a rechazadas, se informa y sigue con la próxima', async () => {
    const cerrado = { message: 'MES_CERRADO', code: 'P0001' };
    let red = false;
    const ejecutar = jest.fn(async (o: Op) => {
      if (!red) throw sinRed();
      if (o.id === 'b') throw cerrado;
      return o.id;
    });
    const alDescartar = jest.fn();
    const almacen = almacenEnMemoria();
    const ahora = () => new Date('2026-10-17T12:00:00.000Z');
    const cola = crearCola({ almacen, ejecutar, esErrorDeRed, alDescartar, integranteActual: comoAna, ahora });
    await cola.encolar(op('a'));
    await cola.encolar(op('b'));
    await cola.encolar(op('c'));
    red = true;
    await cola.vaciar();
    expect(alDescartar).toHaveBeenCalledWith(deAna('b'), cerrado);
    expect(await cola.pendientes()).toEqual([]);
    const esperada = { op: deAna('b'), code: 'P0001', message: 'MES_CERRADO', cuando: '2026-10-17T12:00:00.000Z' };
    expect(await cola.rechazadas()).toEqual([esperada]);
    // Queda guardada: sobrevive a un reinicio.
    expect(await crearCola({ almacen, ejecutar, esErrorDeRed, integranteActual: comoAna }).rechazadas()).toEqual([esperada]);
    await cola.vaciar();
    // b se intentó una sola vez: ni el segundo vaciar la vuelve a mandar.
    expect(ejecutar.mock.calls.filter(([o]) => o.id === 'b')).toHaveLength(1);
    expect(ejecutar.mock.calls.filter(([o]) => o.id === 'c').length).toBeGreaterThan(0);
  });

  test.each([
    ['23505', 'duplicate key value violates unique constraint'],
    ['23503', 'violates foreign key constraint'],
    ['22P02', 'invalid input syntax for type uuid'],
  ])('un error %s de la base también es definitivo: pasa a rechazadas', async (code, message) => {
    let red = false;
    const ejecutar = jest.fn(async (o: Op) => {
      if (!red) throw sinRed();
      if (o.id === 'a') throw { code, message };
      return o.id;
    });
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed, integranteActual: comoAna });
    await cola.encolar(op('a'));
    await cola.encolar(op('b'));
    red = true;
    await cola.vaciar();
    expect(await cola.pendientes()).toEqual([]);
    expect(await cola.rechazadas()).toEqual([{ op: deAna('a'), code, message, cuando: expect.any(String) }]);
  });

  test.each<[string, unknown]>([
    ['un 5xx o 520 del servidor', { message: 'Internal Server Error', code: '' }],
    ['un timeout de la base (57014)', { message: 'canceling statement due to statement timeout', code: '57014' }],
    ['un JWT vencido (PGRST301)', { message: 'JWT expired', code: 'PGRST301' }],
    ['un 42501 tras no poder renovar el token', { message: 'permission denied', code: '42501' }],
    ['un error desconocido', new Error('algo raro')],
  ])('%s no saca la op: queda en la cola, en orden, y el pase se corta ahí', async (_caso, error) => {
    let red = false;
    let falla = true;
    const ejecutadas: string[] = [];
    const ejecutar = jest.fn(async (o: Op) => {
      if (!red) throw sinRed();
      if (o.id === 'b' && falla) throw error;
      ejecutadas.push(o.id);
      return o.id;
    });
    const alDescartar = jest.fn();
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed, alDescartar, integranteActual: comoAna });
    await cola.encolar(op('a'));
    await cola.encolar(op('b'));
    await cola.encolar(op('c'));
    red = true;
    await cola.vaciar();
    // c no se adelanta a b.
    expect(ejecutadas).toEqual(['a']);
    expect(await cola.pendientes()).toEqual([deAna('b'), deAna('c')]);
    expect(await cola.rechazadas()).toEqual([]);
    expect(alDescartar).not.toHaveBeenCalled();
    // Una op nueva espera detrás de las que quedaron.
    await expect(cola.encolar(op('d'))).resolves.toEqual({ estado: 'en-cola' });
    // Cuando se arregla, salen todas en orden.
    falla = false;
    await cola.vaciar();
    expect(ejecutadas).toEqual(['a', 'b', 'c', 'd']);
    expect(await cola.pendientes()).toEqual([]);
  });

  test('olvidarRechazada saca solo esa de la lista', async () => {
    let red = false;
    const ejecutar = jest.fn(async (o: Op) => {
      if (!red) throw sinRed();
      throw { code: 'P0001', message: `MES_CERRADO ${o.id}` };
    });
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed, integranteActual: comoAna });
    await cola.encolar(op('a'));
    await cola.encolar(op('b'));
    red = true;
    await cola.vaciar();
    expect((await cola.rechazadas()).map((r) => r.op.id)).toEqual(['a', 'b']);
    await cola.olvidarRechazada('a');
    expect((await cola.rechazadas()).map((r) => r.op.id)).toEqual(['b']);
  });

  test('un valor corrupto en el almacén no bloquea: se guarda aparte y la cola arranca vacía', async () => {
    const almacen = almacenEnMemoria();
    await almacen.setItem('cola-escritura', '{no es json');
    await almacen.setItem('cola-escritura-rechazadas', '"tampoco una lista"');
    const { estado, ejecutar } = servidor();
    estado.hayRed = false;
    const cola = crearCola({ almacen, ejecutar, esErrorDeRed, integranteActual: comoAna, ahora: () => new Date(5) });
    await expect(cola.encolar(op('a'))).resolves.toEqual({ estado: 'en-cola' });
    expect(await cola.pendientes()).toEqual([deAna('a')]);
    expect(await cola.rechazadas()).toEqual([]);
    // Lo que había no se pierde: queda bajo otra clave.
    expect(await almacen.getItem('cola-escritura-corrupta-5')).toBe('{no es json');
    expect(await almacen.getItem('cola-escritura-rechazadas-corrupta-5')).toBe('"tampoco una lista"');
    estado.hayRed = true;
    await cola.vaciar();
    expect(estado.ejecutadas).toEqual(['a']);
  });

  test('si el error no es de red al encolar con la cola vacía, se rechaza y no queda pendiente', async () => {
    const permiso = { message: 'permiso denegado', code: '42501' };
    const cola = crearCola({
      almacen: almacenEnMemoria(),
      ejecutar: async () => {
        throw permiso;
      },
      esErrorDeRed,
      integranteActual: comoAna,
    });
    await expect(cola.encolar(op('a'))).rejects.toBe(permiso);
    expect(await cola.pendientes()).toEqual([]);
  });

  test('si la red se corta a mitad de vaciar, quedan las que faltan en el mismo orden', async () => {
    const { estado, ejecutar } = servidor();
    estado.hayRed = false;
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed, integranteActual: comoAna });
    await cola.encolar(op('a'));
    await cola.encolar(op('b'));
    estado.hayRed = true;
    ejecutar.mockImplementationOnce(async (o: Op) => {
      estado.ejecutadas.push(o.id);
      estado.hayRed = false;
      return o.id;
    });
    await cola.vaciar();
    expect(estado.ejecutadas).toEqual(['a']);
    expect(await cola.pendientes()).toEqual([deAna('b')]);
  });

  test('la cola sobrevive a un reinicio', async () => {
    const almacen = almacenEnMemoria();
    const { estado, ejecutar } = servidor();
    estado.hayRed = false;
    await crearCola({ almacen, ejecutar, esErrorDeRed, integranteActual: comoAna }).encolar(op('a'));

    const despues = crearCola({ almacen, ejecutar, esErrorDeRed, integranteActual: comoAna });
    expect(await despues.pendientes()).toEqual([deAna('a')]);
    estado.hayRed = true;
    await despues.vaciar();
    expect(estado.ejecutadas).toEqual(['a']);
  });

  test('una op vaciada dos veces no se ejecuta dos veces', async () => {
    const { estado, ejecutar } = servidor();
    estado.hayRed = false;
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed, integranteActual: comoAna });
    await cola.encolar(op('a'));
    estado.hayRed = true;
    await Promise.all([cola.vaciar(), cola.vaciar()]);
    await cola.vaciar();
    expect(estado.ejecutadas).toEqual(['a']);
  });
});

describe('dueño de cada op', () => {
  // La sesión del teléfono puede cambiar con escrituras pendientes: cada una sale solo con quien la creó.
  function conSesion() {
    const sesion = { yo: 'ana' as string | null };
    const { estado, ejecutar } = servidor();
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed, integranteActual: () => sesion.yo });
    return { sesion, estado, ejecutar, cola };
  }

  test('la op guarda el id del integrante que la creó', async () => {
    const { estado, cola } = conSesion();
    estado.hayRed = false;
    await cola.encolar(op('a'));
    expect(await cola.pendientes()).toEqual([{ ...op('a'), duenio: 'ana' }]);
  });

  test('con otra cuenta en el teléfono, la op de Ana no sale y sigue pendiente', async () => {
    const { sesion, estado, cola } = conSesion();
    estado.hayRed = false;
    await cola.encolar(op('a'));
    estado.hayRed = true;
    sesion.yo = 'bruno';
    await cola.vaciar();
    expect(estado.ejecutadas).toEqual([]);
    expect(await cola.pendientes()).toEqual([deAna('a')]);
  });

  test('lo que encola Bruno sale aunque haya pendientes de Ana, y las de Ana se quedan', async () => {
    const { sesion, estado, cola } = conSesion();
    estado.hayRed = false;
    await cola.encolar(op('a'));
    estado.hayRed = true;
    sesion.yo = 'bruno';
    await expect(cola.encolar(op('b'))).resolves.toEqual({ estado: 'hecho', resultado: 'ok-b' });
    expect(estado.ejecutadas).toEqual(['b']);
    expect(await cola.pendientes()).toEqual([deAna('a')]);
  });

  test('cuando Ana vuelve a entrar, su op sale', async () => {
    const { sesion, estado, cola } = conSesion();
    estado.hayRed = false;
    await cola.encolar(op('a'));
    estado.hayRed = true;
    sesion.yo = 'bruno';
    await cola.vaciar();
    sesion.yo = 'ana';
    await cola.vaciar();
    expect(estado.ejecutadas).toEqual(['a']);
    expect(await cola.pendientes()).toEqual([]);
  });

  test('sin sesión lista no se manda nada, ni se puede encolar', async () => {
    const { sesion, estado, ejecutar, cola } = conSesion();
    estado.hayRed = false;
    await cola.encolar(op('a'));
    estado.hayRed = true;
    sesion.yo = null;
    await cola.vaciar();
    expect(ejecutar).toHaveBeenCalledTimes(1); // solo el intento sin red de encolar
    expect(await cola.pendientes()).toEqual([deAna('a')]);
    await expect(cola.encolar(op('b'))).rejects.toMatchObject({ code: 'SIN_SESION' });
    expect(await cola.pendientes()).toEqual([deAna('a')]);
  });

  test('un corte con ops de dos cuentas conserva el orden de las dos', async () => {
    const { sesion, estado, cola } = conSesion();
    estado.hayRed = false;
    await cola.encolar(op('a1'));
    sesion.yo = 'bruno';
    await cola.encolar(op('b1'));
    sesion.yo = 'ana';
    await cola.encolar(op('a2'));
    expect((await cola.pendientes()).map((o) => `${o.duenio}:${o.id}`)).toEqual(['ana:a1', 'bruno:b1', 'ana:a2']);
    estado.hayRed = true;
    await cola.vaciar();
    expect(estado.ejecutadas).toEqual(['a1', 'a2']);
    expect(await cola.pendientes()).toEqual([{ ...op('b1'), duenio: 'bruno' }]);
  });
});

describe('conCola', () => {
  // Memoria con un interruptor de red: sin red, guardarGasto y ajustarStock fallan como fetch.
  function datosConRed() {
    const base = crearDatosEnMemoria();
    const red = { hay: true };
    const guardarGasto = base.guardarGasto;
    const ajustarStock = base.ajustarStock;
    const conRed: Datos = {
      ...base,
      guardarGasto: (g, i) => (red.hay ? guardarGasto(g, i) : Promise.reject(sinRed())),
      ajustarStock: (p, d) => (red.hay ? ajustarStock(p, d) : Promise.reject(sinRed())),
      crearAnotacion: (t) => (red.hay ? base.crearAnotacion(t) : Promise.reject(sinRed())),
      borrarAnotacion: (id) => (red.hay ? base.borrarAnotacion(id) : Promise.reject(sinRed())),
      editarProducto: (p) => (red.hay ? base.editarProducto(p) : Promise.reject(sinRed())),
      confirmarHay: (id) => (red.hay ? base.confirmarHay(id) : Promise.reject(sinRed())),
    };
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar: ejecutorDe(conRed), esErrorDeRed, integranteActual: comoAna });
    return { base, red, cola, datos: conCola(conRed, cola) };
  }

  test('ajustarStock sin red rechaza con SIN_CONEXION y no deja nada pendiente', async () => {
    const { red, cola, datos, base } = datosConRed();
    red.hay = false;
    await expect(datos.ajustarStock('ejemplo-yerba', 1)).rejects.toMatchObject({
      code: 'SIN_CONEXION',
      message: expect.stringContaining('Sin conexión'),
    });
    expect(await cola.pendientes()).toEqual([]);
    red.hay = true;
    await cola.vaciar();
    expect((await base.producto('ejemplo-yerba'))?.stock).toBe(1); // no se aplicó nunca
  });

  test('ajustarStock con red devuelve el stock nuevo y otros errores pasan tal cual', async () => {
    const { datos } = datosConRed();
    await expect(datos.ajustarStock('ejemplo-yerba', 2)).resolves.toBe(3);
    await expect(datos.ajustarStock('no-existe', 1)).rejects.toMatchObject({ message: 'PRODUCTO_INEXISTENTE' });
  });

  test.each([
    ['crearAnotacion', (d: Datos) => d.crearAnotacion('Pan lactal')],
    ['borrarAnotacion', (d: Datos) => d.borrarAnotacion('ejemplo-nota-pan')],
    [
      'editarProducto',
      (d: Datos) =>
        d.editarProducto({ id: 'ejemplo-yerba', nombre: 'Yerba', marca: null, categoria_id: 'ejemplo-almacen', unidad: 'unidad' }),
    ],
    ['confirmarHay', (d: Datos) => d.confirmarHay('ejemplo-yerba')],
  ] as const)('%s sin red rechaza con SIN_CONEXION y no deja nada pendiente', async (_, llamar) => {
    const { red, cola, datos, base } = datosConRed();
    const antes = { notas: await base.anotaciones(), yerba: await base.producto('ejemplo-yerba') };
    red.hay = false;
    await expect(llamar(datos as unknown as Datos)).rejects.toMatchObject({
      code: 'SIN_CONEXION',
      message: expect.stringContaining('Sin conexión'),
    });
    expect(await cola.pendientes()).toEqual([]);
    red.hay = true;
    await cola.vaciar();
    expect(await base.anotaciones()).toEqual(antes.notas);
    expect(await base.producto('ejemplo-yerba')).toEqual(antes.yerba);
  });

  test('crearAnotacion con red funciona y otros errores pasan tal cual', async () => {
    const { datos } = datosConRed();
    await expect(datos.crearAnotacion('Pan lactal')).resolves.toMatchObject({ texto: 'Pan lactal' });
    await expect(datos.crearAnotacion('   ')).rejects.not.toMatchObject({ code: 'SIN_CONEXION' });
  });

  test('guardarGasto sin red queda en la cola con su nuevo_id y al volver se guarda una sola vez', async () => {
    const { red, cola, datos, base } = datosConRed();
    red.hay = false;
    const r = await datos.guardarGasto(
      { fecha: '2026-10-12', pagado_por: 'ejemplo-ana', total: 500_00, modo: 'total', categoria_id: 'ejemplo-luz' },
      [],
    );
    expect(r.estado).toBe('en-cola');
    expect(await cola.pendientes()).toHaveLength(1);
    red.hay = true;
    await cola.vaciar();
    await cola.vaciar();
    const guardado = await base.gasto(r.id);
    expect(guardado.gasto.total).toBe(500_00);
    expect((await base.gastosEntre('2026-10-12', '2026-10-13')).length).toBe(1);
  });

  const conTildados = {
    fecha: '2026-10-12',
    pagado_por: 'ejemplo-ana',
    total: 500_00,
    modo: 'total' as const,
    categoria_id: 'ejemplo-luz',
    tildados: [{ producto_id: 'ejemplo-yerba', cantidad: 2 }],
    anotaciones: ['ejemplo-nota-pan'],
  };

  test('guardarGasto con tildados y anotaciones sin red los guarda en la cola y al volver los aplica una sola vez', async () => {
    const { red, cola, datos, base } = datosConRed();
    red.hay = false;
    const r = await datos.guardarGasto(conTildados, []);
    expect(r.estado).toBe('en-cola');
    const [pendiente] = await cola.pendientes();
    expect(pendiente.datos).toMatchObject({
      gasto: { nuevo_id: r.id, tildados: conTildados.tildados, anotaciones: conTildados.anotaciones },
    });
    expect((await base.producto('ejemplo-yerba'))?.stock).toBe(1);

    red.hay = true;
    await cola.vaciar();
    await cola.vaciar();
    expect((await base.producto('ejemplo-yerba'))?.stock).toBe(3);
    expect((await base.anotaciones()).map((a) => a.id)).toEqual(['ejemplo-nota-pilas']);
  });

  test('si la base guardó pero la respuesta se perdió, el reintento no suma el stock otra vez', async () => {
    const base = crearDatosEnMemoria();
    let perderRespuesta = true;
    const guardar = base.guardarGasto;
    const conPerdida: Datos = {
      ...base,
      guardarGasto: async (g, i) => {
        const id = await guardar(g, i);
        if (perderRespuesta) {
          perderRespuesta = false;
          throw sinRed();
        }
        return id;
      },
    };
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar: ejecutorDe(conPerdida), esErrorDeRed, integranteActual: comoAna });
    const r = await conCola(conPerdida, cola).guardarGasto(conTildados, []);
    expect(r.estado).toBe('en-cola');
    expect((await base.producto('ejemplo-yerba'))?.stock).toBe(3); // la base sí lo guardó

    await cola.vaciar();
    expect(await cola.pendientes()).toEqual([]);
    expect((await base.producto('ejemplo-yerba'))?.stock).toBe(3);
    expect((await base.gasto(r.id)).items).toHaveLength(1);
  });
});
