import { conCola, crearCola, ejecutorDe, esErrorDeRed, type Almacen, type Op, type OpNueva } from './cola';
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

  test('un error que no es de red no se reintenta: sale de la cola y se informa', async () => {
    const permiso = { message: 'permiso denegado', code: '42501' };
    let red = false;
    const ejecutar = jest.fn(async (o: Op) => {
      if (!red) throw sinRed();
      if (o.id === 'b') throw permiso;
      return o.id;
    });
    const alDescartar = jest.fn();
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed, alDescartar, integranteActual: comoAna });
    await cola.encolar(op('a'));
    await cola.encolar(op('b'));
    await cola.encolar(op('c'));
    red = true;
    await cola.vaciar();
    expect(alDescartar).toHaveBeenCalledWith(deAna('b'), permiso);
    expect(await cola.pendientes()).toEqual([]);
    await cola.vaciar();
    // b se intentó una sola vez (la del 42501): ni el segundo vaciar la vuelve a mandar.
    expect(ejecutar.mock.calls.filter(([o]) => o.id === 'b')).toHaveLength(1);
    expect(ejecutar.mock.calls.filter(([o]) => o.id === 'c').length).toBeGreaterThan(0);
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
});
