import { repartoDelMes } from '@/logica/reparto';
import { paraRevisar } from '@/logica/revisar';
import type { Integrante, Producto } from '@/logica/tipos';

import { crearDatosEnMemoria, semillaDeEjemplo, type Semilla } from './memoria';
import type { Datos, GastoAGuardar } from './tipos';

const ana: Integrante = {
  id: 'i-ana',
  nombre: 'Ana',
  sueldo: 100_000_00,
  email: 'ana@example.com',
  activo: true,
  baja_desde: null,
  tipo: 'integrante',
  creado: '2026-01-01T00:00:00Z',
};
const bruno: Integrante = { ...ana, id: 'i-bruno', nombre: 'Bruno', email: 'bruno@example.com', sueldo: 50_000_00 };

const VIEJO = '2026-01-01T00:00:00Z';

function semilla(): Semilla {
  return {
    integrantes: [ana, bruno],
    categorias: [
      { id: 'c-almacen', nombre: 'Almacén', tipo: 'producto', dias_sin_movimiento: 20 },
      { id: 'c-limpieza', nombre: 'Limpieza', tipo: 'producto', dias_sin_movimiento: 30 },
    ],
    productos: [
      {
        id: 'p-yerba',
        codigo_barras: null,
        nombre: 'Yerba',
        marca: null,
        categoria_id: 'c-almacen',
        stock: 1,
        unidad: 'unidad',
        ultimo_movimiento: VIEJO,
        oculto: false,
        creado: VIEJO,
      },
      {
        id: 'p-harina',
        codigo_barras: null,
        nombre: 'Harina',
        marca: 'Molino',
        categoria_id: 'c-almacen',
        stock: 2.5,
        unidad: 'kg',
        ultimo_movimiento: VIEJO,
        oculto: false,
        creado: VIEJO,
      },
    ],
    gastos: [],
    cierres: [],
    anotaciones: [],
  };
}

const gastoTotal = (fecha: string, extra: Partial<GastoAGuardar> = {}): GastoAGuardar => ({
  fecha,
  pagado_por: 'i-ana',
  total: 1000_00,
  modo: 'total',
  categoria_id: 'c-almacen',
  ...extra,
});

describe('crearDatosEnMemoria', () => {
  test('guardarGasto con el mismo nuevo_id dos veces deja un solo gasto', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const g = gastoTotal('2026-03-10', { nuevo_id: 'g-1' });
    const id1 = await datos.guardarGasto(g, []);
    const id2 = await datos.guardarGasto(g, []);
    expect(id1).toBe('g-1');
    expect(id2).toBe('g-1');
    expect(await datos.gastosEntre(null, null)).toHaveLength(1);
  });

  test('guardarGasto de productos repetido no suma el stock dos veces', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const g: GastoAGuardar = { ...gastoTotal('2026-03-10', { nuevo_id: 'g-2' }), modo: 'productos', categoria_id: null };
    const items = [{ producto_id: 'p-yerba', cantidad: 2, precio_unitario: 3000_00 }];
    await datos.guardarGasto(g, items);
    await datos.guardarGasto(g, items);
    expect((await datos.producto('p-yerba'))?.stock).toBe(3);
    expect((await datos.gasto('g-2')).gasto.total).toBe(6000_00);
  });

  test('ajustarStock nunca baja de 0', async () => {
    const datos = crearDatosEnMemoria(semilla());
    expect(await datos.ajustarStock('p-yerba', -5)).toBe(0);
    expect((await datos.producto('p-yerba'))?.stock).toBe(0);
    expect(await datos.ajustarStock('p-yerba', 2)).toBe(2);
  });

  test('gastosEntre filtra por fecha y deja afuera hastaExcl', async () => {
    const datos = crearDatosEnMemoria(semilla());
    await datos.guardarGasto(gastoTotal('2026-02-28', { nuevo_id: 'feb' }), []);
    await datos.guardarGasto(gastoTotal('2026-03-01', { nuevo_id: 'mar-1' }), []);
    await datos.guardarGasto(gastoTotal('2026-03-31', { nuevo_id: 'mar-31' }), []);
    await datos.guardarGasto(gastoTotal('2026-04-01', { nuevo_id: 'abr' }), []);
    const marzo = await datos.gastosEntre('2026-03-01', '2026-04-01');
    expect(marzo.map((g) => g.id)).toEqual(['mar-31', 'mar-1']);
  });

  test('cerrarMes con gastos cargados después del cálculo rechaza con CIERRE_DESACTUALIZADO', async () => {
    const datos = crearDatosEnMemoria(semilla());
    await datos.guardarGasto(gastoTotal('2026-03-10', { nuevo_id: 'g-a' }), []);
    const gastos = await datos.gastosEntre('2026-03-01', '2026-04-01');
    const integrantes = await datos.integrantes();
    const r = repartoDelMes(integrantes, '2026-03', gastos);
    if (!r.ok) throw new Error('el reparto de prueba tendría que dar');

    // Otra persona carga un gasto del mes mientras se miraba el reparto.
    await datos.guardarGasto(gastoTotal('2026-03-12', { nuevo_id: 'g-b', pagado_por: 'i-bruno' }), []);

    await expect(datos.cerrarMes('2026-03', r, gastos, integrantes)).rejects.toMatchObject({
      message: expect.stringContaining('CIERRE_DESACTUALIZADO'),
    });
    expect(await datos.cierre('2026-03')).toBeNull();
  });

  test('cerrarMes al día cierra, y el mes cerrado no acepta gastos', async () => {
    const datos = crearDatosEnMemoria(semilla());
    await datos.guardarGasto(gastoTotal('2026-03-10', { nuevo_id: 'g-a' }), []);
    const gastos = await datos.gastosEntre('2026-03-01', '2026-04-01');
    const integrantes = await datos.integrantes();
    const r = repartoDelMes(integrantes, '2026-03', gastos);
    if (!r.ok) throw new Error('el reparto de prueba tendría que dar');

    await datos.cerrarMes('2026-03', r, gastos, integrantes);
    expect(await datos.mesesCerrados()).toEqual(new Set(['2026-03']));
    await expect(datos.guardarGasto(gastoTotal('2026-03-20', { nuevo_id: 'g-c' }), [])).rejects.toMatchObject({
      message: expect.stringContaining('MES_CERRADO'),
    });
  });

  test('escucharCambios avisa al escribir y deja de avisar al cortar', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const alCambiar = jest.fn();
    const dejar = datos.escucharCambios(alCambiar);
    await datos.ajustarStock('p-yerba', 1);
    dejar();
    await datos.ajustarStock('p-yerba', 1);
    expect(alCambiar).toHaveBeenCalledTimes(1);
  });

  test('semillaDeEjemplo trae la casa ficticia de Ana, Bruno y Caro', async () => {
    const datos = crearDatosEnMemoria(semillaDeEjemplo);
    const nombres = (await datos.integrantes()).map((i) => i.nombre);
    expect(nombres).toEqual(['Ana', 'Bruno', 'Caro']);
    expect((await datos.miIntegrante('ANA@example.com'))?.nombre).toBe('Ana');
  });
});

const stockDe = async (datos: Datos, id: string) => Number((await datos.producto(id))?.stock);
const movimientoDe = async (datos: Datos, id: string) => (await datos.producto(id))?.ultimo_movimiento;

describe('gastos por total con productos tildados', () => {
  test('suman el stock de cada uno, sin precio propio y sin tocar el total', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const id = await datos.guardarGasto(
      gastoTotal('2026-03-10', {
        nuevo_id: 'g-t',
        tildados: [
          { producto_id: 'p-yerba', cantidad: 2 },
          { producto_id: 'p-harina', cantidad: 1.5 },
        ],
      }),
      [],
    );
    expect(await stockDe(datos, 'p-yerba')).toBe(3);
    expect(await stockDe(datos, 'p-harina')).toBe(4);
    const { gasto, items } = await datos.gasto(id);
    expect(gasto.total).toBe(1000_00);
    expect(gasto.modo).toBe('total');
    expect(items.map((i) => [i.producto_id, i.cantidad, i.precio_unitario])).toEqual([
      ['p-yerba', 2, null],
      ['p-harina', 1.5, null],
    ]);
    const [fila] = await datos.gastosEntre(null, null);
    expect(fila.gasto_items).toEqual([
      { cantidad: 2, precio_unitario: null, productos: { nombre: 'Yerba', categoria_id: 'c-almacen' } },
      { cantidad: 1.5, precio_unitario: null, productos: { nombre: 'Harina', categoria_id: 'c-almacen' } },
    ]);
  });

  test('el mismo nuevo_id dos veces (reintento tras un corte) suma el stock una sola vez', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const g = gastoTotal('2026-03-10', { nuevo_id: 'g-r', tildados: [{ producto_id: 'p-yerba', cantidad: 2 }] });
    await datos.guardarGasto(g, []);
    await datos.guardarGasto(g, []);
    expect(await stockDe(datos, 'p-yerba')).toBe(3);
    expect((await datos.gasto('g-r')).items).toHaveLength(1);
  });

  test('editar con otros tildados resta lo viejo y suma lo nuevo', async () => {
    const datos = crearDatosEnMemoria(semilla());
    await datos.guardarGasto(
      gastoTotal('2026-03-10', { nuevo_id: 'g-e', tildados: [{ producto_id: 'p-yerba', cantidad: 2 }] }),
      [],
    );
    expect(await stockDe(datos, 'p-yerba')).toBe(3);

    await datos.guardarGasto(
      gastoTotal('2026-03-10', {
        id: 'g-e',
        tildados: [
          { producto_id: 'p-yerba', cantidad: 1 },
          { producto_id: 'p-harina', cantidad: 0.5 },
        ],
      }),
      [],
    );
    expect(await stockDe(datos, 'p-yerba')).toBe(2);
    expect(await stockDe(datos, 'p-harina')).toBe(3);
    expect((await datos.gasto('g-e')).items.map((i) => i.producto_id)).toEqual(['p-yerba', 'p-harina']);
  });

  test('editar con tildados vacíos los saca y descuenta su stock', async () => {
    const datos = crearDatosEnMemoria(semilla());
    await datos.guardarGasto(
      gastoTotal('2026-03-10', { nuevo_id: 'g-v', tildados: [{ producto_id: 'p-yerba', cantidad: 2 }] }),
      [],
    );
    await datos.guardarGasto(gastoTotal('2026-03-10', { id: 'g-v', tildados: [] }), []);
    expect(await stockDe(datos, 'p-yerba')).toBe(1);
    expect((await datos.gasto('g-v')).items).toEqual([]);
  });

  test('editar sin la clave tildados (web vieja) los conserva y cambia el resto', async () => {
    const datos = crearDatosEnMemoria(semilla());
    await datos.guardarGasto(
      gastoTotal('2026-03-10', { nuevo_id: 'g-w', tildados: [{ producto_id: 'p-yerba', cantidad: 2 }] }),
      [],
    );
    await datos.guardarGasto(gastoTotal('2026-03-10', { id: 'g-w', total: 1500_00, nota: 'Con vuelto' }), []);
    expect(await stockDe(datos, 'p-yerba')).toBe(3);
    const { gasto, items } = await datos.gasto('g-w');
    expect(gasto.total).toBe(1500_00);
    expect(gasto.nota).toBe('Con vuelto');
    expect(items).toHaveLength(1);
  });

  test('pasar un gasto de productos a total sin tildados borra los ítems con precio y descuenta', async () => {
    const datos = crearDatosEnMemoria(semilla());
    await datos.guardarGasto(
      { ...gastoTotal('2026-03-10', { nuevo_id: 'g-p' }), modo: 'productos', categoria_id: null },
      [{ producto_id: 'p-yerba', cantidad: 2, precio_unitario: 3000_00 }],
    );
    expect(await stockDe(datos, 'p-yerba')).toBe(3);
    await datos.guardarGasto(gastoTotal('2026-03-10', { id: 'g-p', total: 7000_00 }), []);
    expect(await stockDe(datos, 'p-yerba')).toBe(1);
    expect((await datos.gasto('g-p')).items).toEqual([]);
  });

  test('editar nunca deja el stock por debajo de 0 aunque ya se haya gastado', async () => {
    const datos = crearDatosEnMemoria(semilla());
    await datos.guardarGasto(
      gastoTotal('2026-03-10', { nuevo_id: 'g-0', tildados: [{ producto_id: 'p-yerba', cantidad: 2 }] }),
      [],
    );
    await datos.ajustarStock('p-yerba', -3); // se consumió todo: queda en 0
    expect(await stockDe(datos, 'p-yerba')).toBe(0);
    await datos.guardarGasto(gastoTotal('2026-03-10', { id: 'g-0', tildados: [] }), []);
    expect(await stockDe(datos, 'p-yerba')).toBe(0);
  });

  test('en un gasto por productos se ignoran los tildados', async () => {
    const datos = crearDatosEnMemoria(semilla());
    await datos.guardarGasto(
      {
        ...gastoTotal('2026-03-10', { nuevo_id: 'g-i', tildados: [{ producto_id: 'p-harina', cantidad: 9 }] }),
        modo: 'productos',
        categoria_id: null,
      },
      [{ producto_id: 'p-yerba', cantidad: 1, precio_unitario: 2000_00 }],
    );
    expect(await stockDe(datos, 'p-harina')).toBe(2.5);
    expect((await datos.gasto('g-i')).items).toHaveLength(1);
  });

  test('borrar el gasto resta el stock que habían sumado los tildados', async () => {
    const datos = crearDatosEnMemoria(semilla());
    await datos.guardarGasto(
      gastoTotal('2026-03-10', { nuevo_id: 'g-b', tildados: [{ producto_id: 'p-yerba', cantidad: 2 }] }),
      [],
    );
    await datos.borrarGasto('g-b');
    expect(await stockDe(datos, 'p-yerba')).toBe(1);
  });

  test('un tildado con producto inexistente o cantidad 0 rechaza y no deja nada a medias', async () => {
    const datos = crearDatosEnMemoria(semilla());
    await expect(
      datos.guardarGasto(
        gastoTotal('2026-03-10', {
          nuevo_id: 'g-x',
          tildados: [
            { producto_id: 'p-yerba', cantidad: 2 },
            { producto_id: 'no-existe', cantidad: 1 },
          ],
        }),
        [],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      datos.guardarGasto(gastoTotal('2026-03-10', { nuevo_id: 'g-y', tildados: [{ producto_id: 'p-yerba', cantidad: 0 }] }), []),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await stockDe(datos, 'p-yerba')).toBe(1);
    expect(await datos.gastosEntre(null, null)).toEqual([]);
  });

  test('un ítem por productos sin precio rechaza con SIN_PRECIO y no toca el stock', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const sinPrecio = [{ producto_id: 'p-yerba', cantidad: 1, precio_unitario: null }] as unknown as Parameters<
      Datos['guardarGasto']
    >[1];
    await expect(
      datos.guardarGasto({ ...gastoTotal('2026-03-10', { nuevo_id: 'g-s' }), modo: 'productos', categoria_id: null }, sinPrecio),
    ).rejects.toMatchObject({ message: 'SIN_PRECIO', code: '23502' });
    expect(await stockDe(datos, 'p-yerba')).toBe(1);
  });

  test('editar un gasto de un mes cerrado rechaza y deja el stock como estaba', async () => {
    const datos = crearDatosEnMemoria(semilla());
    await datos.guardarGasto(
      gastoTotal('2026-03-10', { nuevo_id: 'g-c', tildados: [{ producto_id: 'p-yerba', cantidad: 2 }] }),
      [],
    );
    const gastos = await datos.gastosEntre('2026-03-01', '2026-04-01');
    const integrantes = await datos.integrantes();
    const r = repartoDelMes(integrantes, '2026-03', gastos);
    if (!r.ok) throw new Error('el reparto de prueba tendría que dar');
    await datos.cerrarMes('2026-03', r, gastos, integrantes);

    await expect(datos.guardarGasto(gastoTotal('2026-03-10', { id: 'g-c', tildados: [] }), [])).rejects.toMatchObject({
      message: expect.stringContaining('MES_CERRADO'),
    });
    expect(await stockDe(datos, 'p-yerba')).toBe(3);
    expect((await datos.gasto('g-c')).items).toHaveLength(1);
  });
});

describe('anotaciones', () => {
  test('crearAnotacion guarda el texto sin espacios sobrantes y anotaciones() las da de la más vieja a la más nueva', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const pan = await datos.crearAnotacion('  Comprar pan ');
    const pilas = await datos.crearAnotacion('Pilas AA');
    expect(pan).toMatchObject({ texto: 'Comprar pan', creado_por: null });
    expect(Date.parse(pan.creado)).not.toBeNaN();
    expect((await datos.anotaciones()).map((a) => a.id)).toEqual([pan.id, pilas.id]);
  });

  test('rechaza el texto vacío y el de más de 120 caracteres, como la base', async () => {
    const datos = crearDatosEnMemoria(semilla());
    await expect(datos.crearAnotacion('   ')).rejects.toMatchObject({ code: '23514' });
    await expect(datos.crearAnotacion('a'.repeat(121))).rejects.toMatchObject({ code: '23514' });
    await expect(datos.crearAnotacion('a'.repeat(120))).resolves.toMatchObject({ texto: 'a'.repeat(120) });
    expect(await datos.anotaciones()).toHaveLength(1);
  });

  test('borrarAnotacion la saca y, si ya no estaba, no falla', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const a = await datos.crearAnotacion('Comprar pan');
    await datos.crearAnotacion('Pilas AA');
    await datos.borrarAnotacion(a.id);
    await datos.borrarAnotacion(a.id);
    expect((await datos.anotaciones()).map((x) => x.texto)).toEqual(['Pilas AA']);
  });

  test('crear y borrar avisan a quien escucha cambios', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const alCambiar = jest.fn();
    datos.escucharCambios(alCambiar);
    const a = await datos.crearAnotacion('Comprar pan');
    await datos.borrarAnotacion(a.id);
    expect(alCambiar).toHaveBeenCalledTimes(2);
  });

  test('guardar un gasto con anotaciones borra las tildadas y deja las demás', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const pan = await datos.crearAnotacion('Comprar pan');
    const pilas = await datos.crearAnotacion('Pilas AA');
    const sal = await datos.crearAnotacion('Sal gruesa');
    await datos.guardarGasto(gastoTotal('2026-03-10', { nuevo_id: 'g-a', anotaciones: [pan.id, sal.id] }), []);
    expect((await datos.anotaciones()).map((a) => a.id)).toEqual([pilas.id]);
  });

  test('también las borra al editar, y un id que ya no existe se ignora', async () => {
    const datos = crearDatosEnMemoria(semilla());
    await datos.guardarGasto(gastoTotal('2026-03-10', { nuevo_id: 'g-a2' }), []);
    const pan = await datos.crearAnotacion('Comprar pan');
    await datos.guardarGasto(gastoTotal('2026-03-10', { id: 'g-a2', tildados: [], anotaciones: [pan.id, 'ya-no-esta'] }), []);
    expect(await datos.anotaciones()).toEqual([]);
  });

  test('si el guardado se rechaza, las anotaciones quedan', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const pan = await datos.crearAnotacion('Comprar pan');
    await expect(
      datos.guardarGasto(
        gastoTotal('2026-03-10', { nuevo_id: 'g-z', anotaciones: [pan.id], tildados: [{ producto_id: 'no-existe', cantidad: 1 }] }),
        [],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    expect((await datos.anotaciones()).map((a) => a.id)).toEqual([pan.id]);
  });

  test('el reintento de un gasto ya guardado no falla ni toca anotaciones nuevas', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const pan = await datos.crearAnotacion('Comprar pan');
    const g = gastoTotal('2026-03-10', { nuevo_id: 'g-q', anotaciones: [pan.id] });
    await datos.guardarGasto(g, []);
    const otra = await datos.crearAnotacion('Pilas AA');
    await datos.guardarGasto(g, []);
    expect((await datos.anotaciones()).map((a) => a.id)).toEqual([otra.id]);
  });
});

describe('último movimiento del stock y «Sigue habiendo»', () => {
  test('confirmarHay renueva la fecha sin tocar el stock, y el producto sale de «¿Todavía hay?»', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const antes = Date.now();
    expect(paraRevisar(await datos.productos(), await datos.categorias(), new Date()).map((p) => p.id)).toContain('p-yerba');
    await datos.confirmarHay('p-yerba');
    const p = (await datos.producto('p-yerba')) as Producto;
    expect(Date.parse(p.ultimo_movimiento)).toBeGreaterThanOrEqual(antes);
    expect(p.stock).toBe(1);
    expect(paraRevisar(await datos.productos(), await datos.categorias(), new Date()).map((x) => x.id)).not.toContain('p-yerba');
  });

  test('confirmarHay de un producto que no existe rechaza con PRODUCTO_INEXISTENTE y no avisa', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const alCambiar = jest.fn();
    datos.escucharCambios(alCambiar);
    await expect(datos.confirmarHay('no-existe')).rejects.toMatchObject({ message: 'PRODUCTO_INEXISTENTE' });
    expect(alCambiar).not.toHaveBeenCalled();
    await datos.confirmarHay('p-harina');
    expect(alCambiar).toHaveBeenCalledTimes(1);
  });

  test('ajustarStock mueve la fecha si el stock cambia y no la mueve si queda igual', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const antes = Date.now();
    await datos.ajustarStock('p-yerba', 1);
    expect(Date.parse((await movimientoDe(datos, 'p-yerba')) as string)).toBeGreaterThanOrEqual(antes);

    await datos.ajustarStock('p-harina', -10); // 2,5 → 0
    expect(await stockDe(datos, 'p-harina')).toBe(0);
    const enCero = await movimientoDe(datos, 'p-harina');
    expect(Date.parse(enCero as string)).toBeGreaterThanOrEqual(antes);

    await new Promise((r) => setTimeout(r, 5));
    await datos.ajustarStock('p-harina', -1); // sigue en 0: nada se movió
    expect(await movimientoDe(datos, 'p-harina')).toBe(enCero);
  });

  test('guardar un gasto con productos mueve la fecha de esos productos y de nadie más', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const antes = Date.now();
    await datos.guardarGasto(
      gastoTotal('2026-03-10', { nuevo_id: 'g-m', tildados: [{ producto_id: 'p-yerba', cantidad: 1 }] }),
      [],
    );
    expect(Date.parse((await movimientoDe(datos, 'p-yerba')) as string)).toBeGreaterThanOrEqual(antes);
    expect(await movimientoDe(datos, 'p-harina')).toBe(VIEJO);
  });

  test('sumar kilos con decimales no arrastra errores de coma flotante', async () => {
    const datos = crearDatosEnMemoria(semilla());
    await datos.ajustarStock('p-harina', 0.1);
    await datos.ajustarStock('p-harina', 0.2);
    expect(await stockDe(datos, 'p-harina')).toBe(2.8);
  });
});

describe('productos: unidad y edición', () => {
  test('crearProducto guarda la unidad que se le pasa y, sin unidad, queda en «unidad»', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const antes = Date.now();
    const aceite = await datos.crearProducto({ nombre: 'Aceite', categoria_id: 'c-almacen', unidad: 'litro', stock: 1.5 });
    const sal = await datos.crearProducto({ nombre: 'Sal', categoria_id: 'c-almacen' });
    expect(aceite).toMatchObject({ unidad: 'litro', stock: 1.5, oculto: false });
    expect(Date.parse(aceite.ultimo_movimiento)).toBeGreaterThanOrEqual(antes);
    expect(sal.unidad).toBe('unidad');
    expect((await datos.producto(aceite.id))?.unidad).toBe('litro');
  });

  test('crearProducto rechaza una unidad desconocida, un nombre vacío y una categoría que no existe', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const base = { nombre: 'Aceite', categoria_id: 'c-almacen' };
    await expect(datos.crearProducto({ ...base, unidad: 'docena' as never })).rejects.toMatchObject({ code: '23514' });
    await expect(datos.crearProducto({ ...base, nombre: '  ' })).rejects.toMatchObject({ code: '23514' });
    await expect(datos.crearProducto({ ...base, categoria_id: 'no-existe' })).rejects.toMatchObject({ code: '23503' });
    expect(await datos.productos()).toHaveLength(2);
  });

  test('editarProducto cambia nombre, marca, categoría y unidad, y no toca stock ni fecha', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const alCambiar = jest.fn();
    datos.escucharCambios(alCambiar);
    const editado = await datos.editarProducto({
      id: 'p-harina',
      nombre: 'Harina 000',
      marca: null,
      categoria_id: 'c-limpieza',
      unidad: 'paquete',
      // Una copia vieja del producto no pisa el stock actual.
      ...({ stock: 99, oculto: true, ultimo_movimiento: '2030-01-01T00:00:00Z' } as object),
    });
    expect(editado).toMatchObject({
      nombre: 'Harina 000',
      marca: null,
      categoria_id: 'c-limpieza',
      unidad: 'paquete',
      stock: 2.5,
      oculto: false,
    });
    expect(editado.ultimo_movimiento).toBe(VIEJO);
    expect(await datos.producto('p-harina')).toEqual(editado);
    expect(alCambiar).toHaveBeenCalledTimes(1);
  });

  test('editarProducto rechaza lo que la base rechaza y un producto que no existe', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const ok = { id: 'p-harina', nombre: 'Harina', marca: null, categoria_id: 'c-almacen', unidad: 'kg' as const };
    await expect(datos.editarProducto({ ...ok, unidad: 'docena' as never })).rejects.toMatchObject({ code: '23514' });
    await expect(datos.editarProducto({ ...ok, nombre: '' })).rejects.toMatchObject({ code: '23514' });
    await expect(datos.editarProducto({ ...ok, categoria_id: 'no-existe' })).rejects.toMatchObject({ code: '23503' });
    await expect(datos.editarProducto({ ...ok, id: 'no-existe' })).rejects.toMatchObject({ code: 'PGRST116' });
    expect((await datos.producto('p-harina'))?.unidad).toBe('kg');
  });
});

describe('categorías: días sin movimiento', () => {
  test('una categoría nueva trae 20 días y guardarCategoria acepta otro valor', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const nueva = await datos.guardarCategoria({ nombre: 'Bebidas', tipo: 'producto' });
    expect(nueva.dias_sin_movimiento).toBe(20);
    const cambiada = await datos.guardarCategoria({ id: nueva.id, dias_sin_movimiento: 45 });
    expect(cambiada.dias_sin_movimiento).toBe(45);
    expect((await datos.categorias()).find((c) => c.id === nueva.id)?.dias_sin_movimiento).toBe(45);
  });

  test('cambiar los días de la categoría cambia lo que pide revisar', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const ahora = new Date('2026-01-26T00:00:00Z'); // 25 días después de VIEJO
    const revisar = async () => paraRevisar(await datos.productos(), await datos.categorias(), ahora).map((p) => p.id);
    expect(await revisar()).toEqual(['p-harina', 'p-yerba']);
    await datos.guardarCategoria({ id: 'c-almacen', dias_sin_movimiento: 30 });
    expect(await revisar()).toEqual([]);
  });

  test('rechaza días fuera de 1 a 365 o con decimales, como la base', async () => {
    const datos = crearDatosEnMemoria(semilla());
    for (const dias of [0, 366, 1.5]) {
      await expect(datos.guardarCategoria({ id: 'c-almacen', dias_sin_movimiento: dias })).rejects.toMatchObject({ code: '23514' });
    }
    await expect(datos.guardarCategoria({ nombre: 'Nueva', tipo: 'producto', dias_sin_movimiento: 400 })).rejects.toMatchObject({
      code: '23514',
    });
    expect((await datos.categorias()).find((c) => c.id === 'c-almacen')?.dias_sin_movimiento).toBe(20);
    expect(await datos.categorias()).toHaveLength(2);
  });
});

describe('semillaDeEjemplo', () => {
  test('trae unidades variadas y dos anotaciones', async () => {
    const datos = crearDatosEnMemoria(semillaDeEjemplo);
    const unidades = new Set((await datos.productos()).map((p) => p.unidad));
    expect(unidades).toEqual(new Set(['unidad', 'paquete', 'kg', 'litro']));
    const notas = await datos.anotaciones();
    expect(notas).toHaveLength(2);
    expect(notas.every((a) => a.texto.length > 0 && Date.parse(a.creado) <= Date.now())).toBe(true);
  });

  test('«¿Todavía hay?» muestra algo, solo productos con stock, y no todo el stock', async () => {
    const datos = crearDatosEnMemoria(semillaDeEjemplo);
    const productos = await datos.productos();
    const revisar = paraRevisar(productos, await datos.categorias(), new Date());
    expect(revisar.length).toBeGreaterThanOrEqual(2);
    expect(revisar.every((p) => p.stock > 0)).toBe(true);
    expect(revisar.length).toBeLessThan(productos.filter((p) => p.stock > 0).length);
  });

  test('sigue siendo una casa de ejemplo: ids marcados y sin pisarse entre instancias', async () => {
    expect(semillaDeEjemplo.productos.every((p) => p.id.startsWith('ejemplo-'))).toBe(true);
    const a = crearDatosEnMemoria(semillaDeEjemplo);
    await a.crearAnotacion('Solo en A');
    expect(await crearDatosEnMemoria(semillaDeEjemplo).anotaciones()).toHaveLength(2);
  });
});
