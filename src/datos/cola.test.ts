import { crearCola, esErrorDeRed, type Almacen, type Op } from './cola';

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
const op = (id: string, tipo: Op['tipo'] = 'ajustarStock'): Op => ({ id, tipo, datos: { id } });

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
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed });
    await expect(cola.encolar(op('a'))).resolves.toEqual({ estado: 'hecho', resultado: 'ok-a' });
    expect(await cola.pendientes()).toEqual([]);
  });

  test('sin red, encolar devuelve en-cola y la op queda pendiente', async () => {
    const { estado, ejecutar } = servidor();
    estado.hayRed = false;
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed });
    await expect(cola.encolar(op('a'))).resolves.toEqual({ estado: 'en-cola' });
    expect(await cola.pendientes()).toEqual([op('a')]);
  });

  test('vaciar ejecuta las pendientes en orden y las saca', async () => {
    const { estado, ejecutar } = servidor();
    estado.hayRed = false;
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed });
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
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed });
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
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed, alDescartar });
    await cola.encolar(op('a'));
    await cola.encolar(op('b'));
    await cola.encolar(op('c'));
    red = true;
    await cola.vaciar();
    expect(alDescartar).toHaveBeenCalledWith(op('b'), permiso);
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
    });
    await expect(cola.encolar(op('a'))).rejects.toBe(permiso);
    expect(await cola.pendientes()).toEqual([]);
  });

  test('si la red se corta a mitad de vaciar, quedan las que faltan en el mismo orden', async () => {
    const { estado, ejecutar } = servidor();
    estado.hayRed = false;
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed });
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
    expect(await cola.pendientes()).toEqual([op('b')]);
  });

  test('la cola sobrevive a un reinicio', async () => {
    const almacen = almacenEnMemoria();
    const { estado, ejecutar } = servidor();
    estado.hayRed = false;
    await crearCola({ almacen, ejecutar, esErrorDeRed }).encolar(op('a', 'guardarGasto'));

    const despues = crearCola({ almacen, ejecutar, esErrorDeRed });
    expect(await despues.pendientes()).toEqual([op('a', 'guardarGasto')]);
    estado.hayRed = true;
    await despues.vaciar();
    expect(estado.ejecutadas).toEqual(['a']);
  });

  test('una op vaciada dos veces no se ejecuta dos veces', async () => {
    const { estado, ejecutar } = servidor();
    estado.hayRed = false;
    const cola = crearCola({ almacen: almacenEnMemoria(), ejecutar, esErrorDeRed });
    await cola.encolar(op('a'));
    estado.hayRed = true;
    await Promise.all([cola.vaciar(), cola.vaciar()]);
    await cola.vaciar();
    expect(estado.ejecutadas).toEqual(['a']);
  });
});
