import { integrantesConPeso, repartoDelMes } from '@/logica/reparto';
import { paraRevisar } from '@/logica/revisar';
import type { Integrante, Producto } from '@/logica/tipos';

import { crearDatosEnMemoria, semillaDeEjemplo, type Semilla } from './memoria';
import type { Datos, GastoAGuardar } from './tipos';

// La casa de ejemplo depende del día: estos tests la arman con uno fijo.
const HOY_EJEMPLO = new Date('2026-10-15T12:00:00');

const ana: Integrante = {
  id: 'i-ana',
  nombre: 'Ana',
  email: 'ana@example.com',
  activo: true,
  baja_desde: null,
  tipo: 'integrante',
  creado: '2026-01-01T00:00:00Z',
  admin: true,
  color: null,
};
const bruno: Integrante = {
  ...ana,
  id: 'i-bruno',
  nombre: 'Bruno',
  email: 'bruno@example.com',
  admin: false,
};

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
    sueldos: { 'i-ana': 100_000_00, 'i-bruno': 50_000_00 },
  };
}

/** Los integrantes con el sueldo con que se calculó el reparto, como los manda la app al cerrar. */
const delCalculo = (integrantes: Integrante[], sueldos: Record<string, number | null>) =>
  integrantes.map((i) => ({ ...i, sueldo: sueldos[i.id] ?? null }));

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
    const sueldos = await datos.sueldos();
    const integrantes = delCalculo(await datos.integrantes(), sueldos);
    const r = repartoDelMes(integrantesConPeso(integrantes, sueldos), '2026-03', gastos);
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
    const sueldos = await datos.sueldos();
    const integrantes = delCalculo(await datos.integrantes(), sueldos);
    const r = repartoDelMes(integrantesConPeso(integrantes, sueldos), '2026-03', gastos);
    if (!r.ok) throw new Error('el reparto de prueba tendría que dar');

    await datos.cerrarMes('2026-03', r, gastos, integrantes);
    expect(await datos.mesesCerrados()).toEqual(new Set(['2026-03']));
    await expect(datos.guardarGasto(gastoTotal('2026-03-20', { nuevo_id: 'g-c' }), [])).rejects.toMatchObject({
      message: expect.stringContaining('MES_CERRADO'),
    });
  });

  test('el reintento de un alta ya guardada devuelve su id aunque el mes se haya cerrado después', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const alta = gastoTotal('2026-03-10', { nuevo_id: 'g-a' });
    await datos.guardarGasto(alta, []);
    const gastos = await datos.gastosEntre('2026-03-01', '2026-04-01');
    const sueldos = await datos.sueldos();
    const integrantes = delCalculo(await datos.integrantes(), sueldos);
    const r = repartoDelMes(integrantesConPeso(integrantes, sueldos), '2026-03', gastos);
    if (!r.ok) throw new Error('el reparto de prueba tendría que dar');
    await datos.cerrarMes('2026-03', r, gastos, integrantes);

    await expect(datos.guardarGasto(alta, [])).resolves.toBe('g-a');
    expect(await datos.gastosEntre('2026-03-01', '2026-04-01')).toHaveLength(1);
  });

  test('escucharCambios avisa al escribir y deja de avisar al cortar', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const alCambiar = vi.fn();
    const dejar = datos.escucharCambios(alCambiar);
    await datos.ajustarStock('p-yerba', 1);
    dejar();
    await datos.ajustarStock('p-yerba', 1);
    expect(alCambiar).toHaveBeenCalledTimes(1);
  });

  test('semillaDeEjemplo trae la casa ficticia de Ana, Bruno y Caro', async () => {
    const datos = crearDatosEnMemoria(semillaDeEjemplo(HOY_EJEMPLO));
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

  test('editar solo la nota con los mismos tildados no devuelve el stock ya consumido ni mueve la fecha', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const tildados = [
      { producto_id: 'p-yerba', cantidad: 2 },
      { producto_id: 'p-harina', cantidad: 1 },
    ];
    await datos.guardarGasto(gastoTotal('2026-03-10', { nuevo_id: 'g-n', tildados }), []);
    await datos.ajustarStock('p-yerba', -3); // se consumió todo: 3 → 0
    const [itemAntes] = (await datos.gasto('g-n')).items;
    const yerbaAntes = await movimientoDe(datos, 'p-yerba');
    const harinaAntes = await movimientoDe(datos, 'p-harina');
    await new Promise((r) => setTimeout(r, 5));

    await datos.guardarGasto(gastoTotal('2026-03-10', { id: 'g-n', nota: 'Otra nota', tildados }), []);
    expect(await stockDe(datos, 'p-yerba')).toBe(0);
    expect(await stockDe(datos, 'p-harina')).toBe(3.5);
    expect(await movimientoDe(datos, 'p-yerba')).toBe(yerbaAntes);
    expect(await movimientoDe(datos, 'p-harina')).toBe(harinaAntes);
    const { gasto, items } = await datos.gasto('g-n');
    expect(gasto.nota).toBe('Otra nota');
    expect(items[0].id).toBe(itemAntes.id);
  });

  test('editar la cantidad de un tildado mueve solo la diferencia; sacarlo resta sin bajar de 0', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const yerba = (cantidad: number) => ({ producto_id: 'p-yerba', cantidad });
    const harina = { producto_id: 'p-harina', cantidad: 1 };
    await datos.guardarGasto(gastoTotal('2026-03-10', { nuevo_id: 'g-c', tildados: [yerba(2), harina] }), []);
    expect(await stockDe(datos, 'p-yerba')).toBe(3);
    await datos.ajustarStock('p-yerba', -3); // consumido: 0
    const harinaAntes = await movimientoDe(datos, 'p-harina');

    await datos.guardarGasto(gastoTotal('2026-03-10', { id: 'g-c', tildados: [yerba(3), harina] }), []);
    expect(await stockDe(datos, 'p-yerba')).toBe(1); // 2 → 3 suma 1
    expect(await stockDe(datos, 'p-harina')).toBe(3.5);
    expect(await movimientoDe(datos, 'p-harina')).toBe(harinaAntes);
    expect((await datos.gasto('g-c')).items.find((i) => i.producto_id === 'p-yerba')?.cantidad).toBe(3);

    await datos.guardarGasto(gastoTotal('2026-03-10', { id: 'g-c', tildados: [harina] }), []);
    expect(await stockDe(datos, 'p-yerba')).toBe(0); // 1 − 3, sin bajar de 0
    expect(await stockDe(datos, 'p-harina')).toBe(3.5);
    expect((await datos.gasto('g-c')).items.map((i) => i.producto_id)).toEqual(['p-harina']);
  });

  test('un producto repetido en los tildados queda en un solo ítem con la suma', async () => {
    const datos = crearDatosEnMemoria(semilla());
    await datos.guardarGasto(
      gastoTotal('2026-03-10', {
        nuevo_id: 'g-d',
        tildados: [
          { producto_id: 'p-yerba', cantidad: 1 },
          { producto_id: 'p-yerba', cantidad: 2 },
        ],
      }),
      [],
    );
    expect(await stockDe(datos, 'p-yerba')).toBe(4);
    expect((await datos.gasto('g-d')).items.map((i) => [i.producto_id, i.cantidad])).toEqual([['p-yerba', 3]]);
  });

  test('un alta repetida con otros datos rechaza con GASTO_YA_GUARDADO; igual, devuelve el id', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const g = gastoTotal('2026-03-10', { nuevo_id: 'g-y', nota: 'Hola', tildados: [{ producto_id: 'p-yerba', cantidad: 1 }] });
    await datos.guardarGasto(g, []);
    await expect(datos.guardarGasto(g, [])).resolves.toBe('g-y');
    for (const cambio of [
      { total: 2000_00 },
      { fecha: '2026-03-11' },
      { pagado_por: 'i-bruno' },
      { categoria_id: 'c-limpieza' },
      { nota: 'Chau' },
      { nota: null },
    ]) {
      await expect(datos.guardarGasto({ ...g, ...cambio }, [])).rejects.toMatchObject({
        message: 'GASTO_YA_GUARDADO',
        code: 'P0001',
      });
    }
    const { gasto } = await datos.gasto('g-y');
    expect([gasto.total, gasto.nota]).toEqual([1000_00, 'Hola']);
    expect(await stockDe(datos, 'p-yerba')).toBe(2);
  });

  test('un alta por productos repetida compara el total que sale de los ítems', async () => {
    const datos = crearDatosEnMemoria(semilla());
    const g: GastoAGuardar = { nuevo_id: 'g-p', fecha: '2026-03-10', pagado_por: 'i-ana', total: 1, modo: 'productos', categoria_id: null };
    const items = [{ producto_id: 'p-yerba', cantidad: 2, precio_unitario: 850 }];
    await datos.guardarGasto(g, items);
    await expect(datos.guardarGasto(g, items)).resolves.toBe('g-p');
    await expect(datos.guardarGasto(g, [{ ...items[0], precio_unitario: 900 }])).rejects.toMatchObject({
      message: 'GASTO_YA_GUARDADO',
    });
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
    const sueldos = await datos.sueldos();
    const integrantes = delCalculo(await datos.integrantes(), sueldos);
    const r = repartoDelMes(integrantesConPeso(integrantes, sueldos), '2026-03', gastos);
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
    const alCambiar = vi.fn();
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
    const alCambiar = vi.fn();
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
    const alCambiar = vi.fn();
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

describe('tieneCompras (la ficha decide entre borrar y ocultar)', () => {
  test('false si el producto nunca estuvo en un gasto; true si estuvo, aunque sea tildado sin precio', async () => {
    const datos = crearDatosEnMemoria(semilla());
    expect(await datos.tieneCompras('p-yerba')).toBe(false);
    await datos.guardarGasto(gastoTotal('2026-10-05', { tildados: [{ producto_id: 'p-yerba', cantidad: 1 }] }), []);
    expect(await datos.tieneCompras('p-yerba')).toBe(true);
    expect(await datos.tieneCompras('p-harina')).toBe(false);
  });

  test('un producto que no existe no tiene compras', async () => {
    expect(await crearDatosEnMemoria(semilla()).tieneCompras('no-existe')).toBe(false);
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
    const datos = crearDatosEnMemoria(semillaDeEjemplo(HOY_EJEMPLO));
    const unidades = new Set((await datos.productos()).map((p) => p.unidad));
    expect(unidades).toEqual(new Set(['unidad', 'paquete', 'kg', 'litro']));
    const notas = await datos.anotaciones();
    expect(notas).toHaveLength(2);
    expect(notas.every((a) => a.texto.length > 0 && Date.parse(a.creado) <= Date.now())).toBe(true);
  });

  test('«¿Todavía hay?» muestra algo, solo productos con stock, y no todo el stock', async () => {
    const datos = crearDatosEnMemoria(semillaDeEjemplo(HOY_EJEMPLO));
    const productos = await datos.productos();
    const revisar = paraRevisar(productos, await datos.categorias(), new Date());
    expect(revisar.length).toBeGreaterThanOrEqual(2);
    expect(revisar.every((p) => p.stock > 0)).toBe(true);
    expect(revisar.length).toBeLessThan(productos.filter((p) => p.stock > 0).length);
  });

  test('sigue siendo una casa de ejemplo: ids marcados y sin pisarse entre instancias', async () => {
    expect(semillaDeEjemplo(HOY_EJEMPLO).productos.every((p) => p.id.startsWith('ejemplo-'))).toBe(true);
    const a = crearDatosEnMemoria(semillaDeEjemplo(HOY_EJEMPLO));
    await a.crearAnotacion('Solo en A');
    expect(await crearDatosEnMemoria(semillaDeEjemplo(HOY_EJEMPLO)).anotaciones()).toHaveLength(2);
  });
});

describe('semillaDeEjemplo con fechas relativas a hoy', () => {
  const HOY = new Date('2027-03-15T12:00:00');

  test('trae gastos del mes en curso y del anterior, y solo el anterior queda cerrado', async () => {
    const datos = crearDatosEnMemoria(semillaDeEjemplo(HOY));
    const marzo = await datos.gastosEntre('2027-03-01', '2027-04-01');
    const febrero = await datos.gastosEntre('2027-02-01', '2027-03-01');
    expect(marzo.length).toBeGreaterThanOrEqual(4);
    expect(febrero.length).toBeGreaterThanOrEqual(4);
    expect(marzo.every((g) => g.fecha <= '2027-03-15')).toBe(true);
    expect(await datos.mesesCerrados()).toEqual(new Set(['2027-02']));
  });

  test('con hoy el día 1 del mes, ningún gasto del mes en curso queda en el futuro', async () => {
    const datos = crearDatosEnMemoria(semillaDeEjemplo(new Date('2027-03-01T12:00:00')));
    const marzo = await datos.gastosEntre('2027-03-01', '2027-04-01');
    expect(marzo.length).toBeGreaterThanOrEqual(4);
    expect(marzo.every((g) => g.fecha <= '2027-03-01')).toBe(true);
  });

  test('dos llamadas devuelven objetos distintos y no comparten estado', () => {
    const a = semillaDeEjemplo(HOY);
    const b = semillaDeEjemplo(HOY);
    expect(a).not.toBe(b);
    expect(a.gastos).not.toBe(b.gastos);
    expect(a.integrantes).not.toBe(b.integrantes);
    a.gastos[0].nota = 'Cambiada';
    expect(b.gastos[0].nota).not.toBe('Cambiada');
  });
});

// ——— Usuarios, permisos y sueldos aparte (F7): las mismas reglas que supabase/schema.sql ———

const ANA = 'ejemplo-ana';
const BRUNO = 'ejemplo-bruno';
const CARO = 'ejemplo-caro';

const otro = (id: string, nombre: string, extra: Partial<Integrante> = {}): Integrante => ({
  id,
  nombre,
  email: `${nombre.toLowerCase()}@example.com`,
  activo: true,
  baja_desde: null,
  tipo: 'integrante',
  creado: VIEJO,
  admin: false,
  color: null,
  ...extra,
});
const externo = otro('ejemplo-externo', 'Externo', { tipo: 'pagador_externo' });

/** La casa de ejemplo, vista por `yo` (Ana, la admin, si no se dice), con permisos y gente de más a gusto. */
function casa({
  yo = ANA,
  permisos,
  sueldos,
  mas = [],
}: {
  yo?: string;
  permisos?: Semilla['permisos'];
  sueldos?: Semilla['sueldos'];
  mas?: Integrante[];
} = {}): Datos {
  const base = semillaDeEjemplo(HOY_EJEMPLO);
  return crearDatosEnMemoria(
    { ...base, integrantes: [...base.integrantes, ...mas], ...(permisos && { permisos }), ...(sueldos && { sueldos }) },
    { yo },
  );
}

const rechaza = (code: string, mensaje: string) => ({ code, message: expect.stringContaining(mensaje) });
const SIN_PERMISO = rechaza('42501', 'SIN_PERMISO');

const soloAdmin = async (datos: Datos) => (await datos.integrantes()).filter((i) => i.admin).map((i) => i.id);

describe('miAcceso', () => {
  test('Ana es admin y no registra permisos; Bruno, nada', async () => {
    expect(await casa().miAcceso()).toEqual({ admin: true, permisos: [] });
    expect(await casa({ yo: BRUNO }).miAcceso()).toEqual({ admin: false, permisos: [] });
  });

  test('trae solo los permisos propios, ordenados', async () => {
    const permisos: Semilla['permisos'] = [
      { integrante_id: BRUNO, permiso: 'sueldos' },
      { integrante_id: BRUNO, permiso: 'altas_bajas' },
      { integrante_id: CARO, permiso: 'sueldos' },
    ];
    expect(await casa({ yo: BRUNO, permisos }).miAcceso()).toEqual({ admin: false, permisos: ['altas_bajas', 'sueldos'] });
    expect(await casa({ yo: CARO, permisos }).miAcceso()).toEqual({ admin: false, permisos: ['sueldos'] });
  });

  test('permisosDeLaCasa los agrupa por integrante; quien no tiene ninguno no aparece', async () => {
    const permisos: Semilla['permisos'] = [
      { integrante_id: BRUNO, permiso: 'sueldos' },
      { integrante_id: BRUNO, permiso: 'altas_bajas' },
    ];
    expect(await casa({ yo: CARO, permisos }).permisosDeLaCasa()).toEqual({ [BRUNO]: ['altas_bajas', 'sueldos'] });
    expect(await casa().permisosDeLaCasa()).toEqual({});
  });
});

describe('sueldos aparte', () => {
  test('quien no tiene el permiso recibe {} (cero filas, no un error); Ana recibe los tres', async () => {
    expect(await casa({ yo: BRUNO }).sueldos()).toEqual({});
    expect(await casa().sueldos()).toEqual({ [ANA]: 900_000_00, [BRUNO]: 600_000_00, [CARO]: 500_000_00 });
  });

  test('con el permiso «sueldos» los lee y los escribe sin ser admin; con «altas y bajas», no', async () => {
    const conSueldos = casa({ yo: BRUNO, permisos: [{ integrante_id: BRUNO, permiso: 'sueldos' }] });
    expect(Object.keys(await conSueldos.sueldos())).toHaveLength(3);
    await conSueldos.fijarSueldo(CARO, 510_000_00);
    expect((await conSueldos.sueldos())[CARO]).toBe(510_000_00);

    const conAltas = casa({ yo: BRUNO, permisos: [{ integrante_id: BRUNO, permiso: 'altas_bajas' }] });
    expect(await conAltas.sueldos()).toEqual({});
    await expect(conAltas.fijarSueldo(CARO, 1)).rejects.toMatchObject(SIN_PERMISO);
  });

  test('fijarSueldo de Bruno rechaza con 42501 y no cambia nada; el de Ana guarda', async () => {
    const bruno = casa({ yo: BRUNO });
    await expect(bruno.fijarSueldo(CARO, 1_00)).rejects.toMatchObject(SIN_PERMISO);
    await expect(bruno.fijarSueldo(CARO, null)).rejects.toMatchObject(SIN_PERMISO);

    const ana = casa();
    await ana.fijarSueldo(CARO, 550_000_00);
    expect((await ana.sueldos())[CARO]).toBe(550_000_00);
    // Un sueldo en cero es un sueldo cargado (distinto de no tener).
    await ana.fijarSueldo(CARO, 0);
    expect((await ana.sueldos())[CARO]).toBe(0);
  });

  test('fijarSueldo(null) borra: quien no tiene sueldo no aparece', async () => {
    const ana = casa();
    await ana.fijarSueldo(BRUNO, null);
    expect(await ana.sueldos()).toEqual({ [ANA]: 900_000_00, [CARO]: 500_000_00 });
  });

  test('un sueldo negativo o de alguien que no existe rechaza como la base', async () => {
    const ana = casa();
    await expect(ana.fijarSueldo(CARO, -1)).rejects.toMatchObject({ code: '23514' });
    await expect(ana.fijarSueldo('nadie', 1_00)).rejects.toMatchObject({ code: '23503' });
    expect((await ana.sueldos())[CARO]).toBe(500_000_00);
  });

  test('integrantes() no trae sueldos, ni a quien tiene el permiso', async () => {
    for (const datos of [casa(), casa({ yo: BRUNO })]) {
      expect((await datos.integrantes()).some((i) => 'sueldo' in i)).toBe(false);
    }
    expect('sueldo' in ((await casa().miIntegrante('ana@example.com')) ?? {})).toBe(false);
  });

  test('los sueldos salen del mapa aparte de la semilla; sin él, nadie tiene', async () => {
    expect(await crearDatosEnMemoria(semilla()).sueldos()).toEqual({ 'i-ana': 100_000_00, 'i-bruno': 50_000_00 });
    expect(await casa({ sueldos: {} }).sueldos()).toEqual({});
    expect(await casa({ sueldos: { [ANA]: 1_00, [BRUNO]: null } }).sueldos()).toEqual({ [ANA]: 1_00 });
  });
});

describe('darPermiso y quitarPermiso', () => {
  test('solo Ana: Bruno rechaza con 42501 en los dos', async () => {
    const bruno = casa({ yo: BRUNO, permisos: [{ integrante_id: CARO, permiso: 'sueldos' }] });
    await expect(bruno.darPermiso(BRUNO, 'sueldos')).rejects.toMatchObject(SIN_PERMISO);
    await expect(bruno.quitarPermiso(CARO, 'sueldos')).rejects.toMatchObject(SIN_PERMISO);
    expect(await bruno.permisosDeLaCasa()).toEqual({ [CARO]: ['sueldos'] });

    // Tampoco con «altas y bajas»: los permisos los maneja solo el admin.
    const conAltas = casa({ yo: BRUNO, permisos: [{ integrante_id: BRUNO, permiso: 'altas_bajas' }] });
    await expect(conAltas.darPermiso(BRUNO, 'sueldos')).rejects.toMatchObject(SIN_PERMISO);
  });

  test('Ana da y quita; dar dos veces no duplica; quitar lo que no está no falla', async () => {
    const ana = casa();
    await ana.darPermiso(BRUNO, 'sueldos');
    await ana.darPermiso(BRUNO, 'sueldos');
    await ana.darPermiso(BRUNO, 'altas_bajas');
    expect(await ana.permisosDeLaCasa()).toEqual({ [BRUNO]: ['altas_bajas', 'sueldos'] });

    await ana.quitarPermiso(BRUNO, 'sueldos');
    await ana.quitarPermiso(CARO, 'sueldos');
    expect(await ana.permisosDeLaCasa()).toEqual({ [BRUNO]: ['altas_bajas'] });
    await ana.quitarPermiso(BRUNO, 'altas_bajas');
    expect(await ana.permisosDeLaCasa()).toEqual({});
  });

  test('un pagador externo no recibe permisos: violación de check, como el disparador de la base', async () => {
    const ana = casa({ mas: [externo] });
    await expect(ana.darPermiso(externo.id, 'sueldos')).rejects.toMatchObject(rechaza('23514', 'SOLO_INTEGRANTES'));
    await expect(ana.darPermiso('nadie', 'sueldos')).rejects.toMatchObject(rechaza('23514', 'SOLO_INTEGRANTES'));
    expect(await ana.permisosDeLaCasa()).toEqual({});
  });

  test('lo que se da se usa: Bruno con «sueldos» ve los sueldos', async () => {
    const permisos: Semilla['permisos'] = [{ integrante_id: BRUNO, permiso: 'sueldos' }];
    expect(Object.keys(await casa({ yo: BRUNO, permisos }).sueldos())).toHaveLength(3);
  });
});

describe('cederAdmin', () => {
  test('solo el admin: Bruno, aunque tenga los dos permisos, rechaza con 42501', async () => {
    const permisos: Semilla['permisos'] = [
      { integrante_id: BRUNO, permiso: 'sueldos' },
      { integrante_id: BRUNO, permiso: 'altas_bajas' },
    ];
    const bruno = casa({ yo: BRUNO, permisos });
    await expect(bruno.cederAdmin(CARO)).rejects.toMatchObject(SIN_PERMISO);
    await expect(bruno.cederAdmin(BRUNO)).rejects.toMatchObject(SIN_PERMISO);
    expect(await soloAdmin(bruno)).toEqual([ANA]);
  });

  test('no a un pagador externo, ni a alguien dado de baja, ni a sí mismo, ni a quien no existe', async () => {
    const dani = otro('ejemplo-dani', 'Dani', { activo: false, baja_desde: '2026-03' });
    const ana = casa({ mas: [externo, dani] });
    for (const destino of [externo.id, dani.id, ANA, 'nadie']) {
      await expect(ana.cederAdmin(destino)).rejects.toMatchObject(rechaza('22023', 'DESTINO_INVALIDO'));
    }
    expect(await soloAdmin(ana)).toEqual([ANA]);
  });

  test('después hay un solo admin y quien cedió conserva los dos permisos; el nuevo pierde los suyos', async () => {
    const ana = casa({ permisos: [{ integrante_id: BRUNO, permiso: 'sueldos' }, { integrante_id: CARO, permiso: 'altas_bajas' }] });
    await ana.cederAdmin(BRUNO);
    expect(await soloAdmin(ana)).toEqual([BRUNO]);
    // Ana sigue siendo quien usa la app: ya no es admin, pero tiene los dos permisos.
    expect(await ana.miAcceso()).toEqual({ admin: false, permisos: ['altas_bajas', 'sueldos'] });
    expect(await ana.permisosDeLaCasa()).toEqual({ [ANA]: ['altas_bajas', 'sueldos'], [CARO]: ['altas_bajas'] });
    // Puede seguir con los sueldos, pero ya no maneja los permisos ni cede el rol.
    expect(Object.keys(await ana.sueldos())).toHaveLength(3);
    await expect(ana.darPermiso(CARO, 'sueldos')).rejects.toMatchObject(SIN_PERMISO);
    await expect(ana.cederAdmin(CARO)).rejects.toMatchObject(SIN_PERMISO);
  });

  test('la columna admin no se cambia a mano', async () => {
    const ana = casa();
    await expect(ana.guardarIntegrante({ id: BRUNO, admin: true })).rejects.toMatchObject(SIN_PERMISO);
    await expect(ana.guardarIntegrante({ id: ANA, admin: false })).rejects.toMatchObject(SIN_PERMISO);
    expect(await soloAdmin(ana)).toEqual([ANA]);
  });
});

describe('guardarIntegrante con permisos', () => {
  const ALTAS: NonNullable<Semilla['permisos']> = [{ integrante_id: BRUNO, permiso: 'altas_bajas' }];
  const nuevo = { nombre: 'Dani', email: 'dani@example.com' };

  test('sin «altas y bajas» no hay altas ni cambios: rechaza con 42501 y no toca nada', async () => {
    const bruno = casa({ yo: BRUNO });
    await expect(bruno.guardarIntegrante(nuevo)).rejects.toMatchObject(SIN_PERMISO);
    await expect(bruno.guardarIntegrante({ id: CARO, email: 'caro2@example.com' })).rejects.toMatchObject(SIN_PERMISO);
    expect((await bruno.integrantes()).map((i) => i.nombre)).toEqual(['Ana', 'Bruno', 'Caro']);
    expect((await bruno.miIntegrante('caro@example.com'))?.id).toBe(CARO);
  });

  test('con «altas y bajas» da altas, y el alta nace sin admin aunque lo pida', async () => {
    const bruno = casa({ yo: BRUNO, permisos: ALTAS });
    const dani = await bruno.guardarIntegrante({ ...nuevo, admin: true });
    expect(dani).toMatchObject({ nombre: 'Dani', admin: false, color: null, tipo: 'integrante', activo: true });
    expect(await soloAdmin(bruno)).toEqual([ANA]);
    const cambiado = await bruno.guardarIntegrante({ id: dani.id, email: 'dani2@example.com' });
    expect(cambiado.email).toBe('dani2@example.com');
  });

  test('el admin también da altas, y la casa sigue con un solo admin', async () => {
    const ana = casa();
    await ana.guardarIntegrante({ ...nuevo, admin: true });
    expect(await soloAdmin(ana)).toEqual([ANA]);
  });

  test('con «altas y bajas» no cambia email, tipo ni baja del admin ni de quien tiene permisos', async () => {
    const bruno = casa({ yo: BRUNO, permisos: [...ALTAS, { integrante_id: CARO, permiso: 'sueldos' }] });
    for (const id of [ANA, CARO]) {
      await expect(bruno.guardarIntegrante({ id, email: 'robado@example.com' })).rejects.toMatchObject(SIN_PERMISO);
      await expect(bruno.guardarIntegrante({ id, tipo: 'pagador_externo' })).rejects.toMatchObject(SIN_PERMISO);
      await expect(bruno.guardarIntegrante({ id, activo: false, baja_desde: '2026-03' })).rejects.toMatchObject(SIN_PERMISO);
    }
    const intactos = await bruno.integrantes();
    expect(intactos.find((i) => i.id === ANA)).toMatchObject({ email: 'ana@example.com', tipo: 'integrante', activo: true });
    expect(intactos.find((i) => i.id === CARO)).toMatchObject({ email: 'caro@example.com', tipo: 'integrante', activo: true });
    expect(await bruno.permisosDeLaCasa()).toEqual({ [BRUNO]: ['altas_bajas'], [CARO]: ['sueldos'] });
  });

  test('con «altas y bajas» sí cambia a un común, y de quien tiene permisos cambia lo demás (el nombre)', async () => {
    const bruno = casa({ yo: BRUNO, permisos: [...ALTAS, { integrante_id: CARO, permiso: 'sueldos' }] });
    await bruno.guardarIntegrante({ id: CARO, nombre: 'Carolina' });
    expect((await bruno.integrantes()).find((i) => i.id === CARO)?.nombre).toBe('Carolina');
    const dani = await bruno.guardarIntegrante(nuevo);
    await bruno.guardarIntegrante({ id: dani.id, tipo: 'pagador_externo', activo: false, baja_desde: '2026-03' });
    expect((await bruno.integrantes()).find((i) => i.id === dani.id)).toMatchObject({ tipo: 'pagador_externo', activo: false });
  });

  test('al admin no se lo da de baja ni se lo pasa a externo, ni siquiera él mismo: primero cede el rol', async () => {
    const ana = casa();
    await expect(ana.guardarIntegrante({ id: ANA, activo: false })).rejects.toMatchObject(rechaza('42501', 'ES_ADMIN'));
    await expect(ana.guardarIntegrante({ id: ANA, baja_desde: '2026-12' })).rejects.toMatchObject(rechaza('42501', 'ES_ADMIN'));
    await expect(ana.guardarIntegrante({ id: ANA, tipo: 'pagador_externo' })).rejects.toMatchObject(rechaza('42501', 'ES_ADMIN'));
    // Cambiarse el email sí.
    await ana.guardarIntegrante({ id: ANA, email: 'ana2@example.com' });
    expect((await ana.integrantes()).find((i) => i.id === ANA)).toMatchObject({ email: 'ana2@example.com', admin: true, activo: true });
  });

  test('el admin cambia a quien tiene permisos; si lo pasa a pagador externo, los permisos se van', async () => {
    const ana = casa({ permisos: [{ integrante_id: CARO, permiso: 'sueldos' }, { integrante_id: CARO, permiso: 'altas_bajas' }] });
    await ana.guardarIntegrante({ id: CARO, email: 'caro2@example.com' });
    expect((await ana.permisosDeLaCasa())[CARO]).toHaveLength(2);
    await ana.guardarIntegrante({ id: CARO, tipo: 'pagador_externo' });
    expect(await ana.permisosDeLaCasa()).toEqual({});
  });

  test('el color tiene que ser de la paleta', async () => {
    const ana = casa();
    await expect(ana.guardarIntegrante({ id: CARO, color: 'fucsia' as never })).rejects.toMatchObject({ code: '23514' });
    expect((await ana.guardarIntegrante({ id: CARO, color: 'verde' })).color).toBe('verde');
  });

  test('guardarIntegrante no toca sueldos: quien da el alta con «altas y bajas» la deja sin sueldo', async () => {
    const conAltas = casa({ yo: BRUNO, permisos: ALTAS });
    const alta = await conAltas.guardarIntegrante(nuevo);
    expect('sueldo' in alta).toBe(false);
    await expect(conAltas.guardarIntegrante({ id: CARO, nombre: 'Carolina' })).resolves.toMatchObject({ nombre: 'Carolina' });
    // Con los dos permisos se ve: el alta queda sin sueldo y Caro conserva el suyo.
    const conLosDos = casa({ yo: BRUNO, permisos: [...ALTAS, { integrante_id: BRUNO, permiso: 'sueldos' }] });
    const otra = await conLosDos.guardarIntegrante(nuevo);
    await conLosDos.guardarIntegrante({ id: CARO, nombre: 'Carolina' });
    const sueldos = await conLosDos.sueldos();
    expect(sueldos[otra.id]).toBeUndefined();
    expect(sueldos[CARO]).toBe(500_000_00);
  });
});

describe('editarPerfil', () => {
  test('cambia solo el nombre y el color de quien usa la app, y devuelve su fila', async () => {
    const bruno = casa({ yo: BRUNO });
    const antes = await bruno.integrantes();
    const fila = await bruno.editarPerfil('Bruno B', 'verde');
    expect(fila).toMatchObject({ id: BRUNO, nombre: 'Bruno B', color: 'verde', email: 'bruno@example.com', tipo: 'integrante', activo: true, admin: false });
    const despues = await bruno.integrantes();
    expect(despues.find((i) => i.id === BRUNO)).toMatchObject({ nombre: 'Bruno B', color: 'verde' });
    for (const i of antes.filter((x) => x.id !== BRUNO)) expect(despues.find((x) => x.id === i.id)).toEqual(i);
    expect((await bruno.editarPerfil('Bruno', null)).color).toBeNull();
  });

  test('no pide ningún permiso, ni siquiera cuando quien lo usa tiene permisos que lo protegen', async () => {
    const caro = casa({ yo: CARO, permisos: [{ integrante_id: CARO, permiso: 'sueldos' }] });
    expect((await caro.editarPerfil('Carolina', 'rosa')).nombre).toBe('Carolina');
    expect((await casa().editarPerfil('Ana M', 'azul')).admin).toBe(true);
  });

  test('un color inventado o un nombre vacío rechaza como check y no cambia nada', async () => {
    const bruno = casa({ yo: BRUNO });
    await expect(bruno.editarPerfil('Bruno B', 'fucsia' as never)).rejects.toMatchObject({ code: '23514' });
    await expect(bruno.editarPerfil('   ', 'azul')).rejects.toMatchObject({ code: '23514' });
    expect((await bruno.integrantes()).find((i) => i.id === BRUNO)).toMatchObject({ nombre: 'Bruno', color: null });
  });

  test('quien no está en la casa no tiene perfil: 42501', async () => {
    await expect(casa({ yo: 'nadie' }).editarPerfil('X', null)).rejects.toMatchObject(SIN_PERMISO);
  });
});

describe('partesDelMes', () => {
  const MES = '2026-10';

  test('con la casa de ejemplo: 900 000, 600 000 y 500 000 pesos pesan 45 %, 30 % y 25 % (partes por 10^12)', async () => {
    const esperado = { [ANA]: 450_000_000_000, [BRUNO]: 300_000_000_000, [CARO]: 250_000_000_000 };
    expect(await casa().partesDelMes(MES)).toEqual(esperado);
    // Cualquiera de la casa la pide, sin permiso: sale lo mismo y no trae sueldos.
    expect(await casa({ yo: BRUNO }).partesDelMes(MES)).toEqual(esperado);
  });

  test('el peso es sueldo × 10^12 / suma, redondeado: 1 y 2 dan …333 y …667', async () => {
    const datos = casa({ sueldos: { [ANA]: 1, [BRUNO]: 2, [CARO]: null } });
    expect(await datos.partesDelMes(MES)).toEqual({ [ANA]: 333_333_333_333, [BRUNO]: 666_666_666_667, [CARO]: 0 });
  });

  test('sin el sueldo de uno, pesa 0 y los demás se reparten entre sí', async () => {
    const ana = casa();
    await ana.fijarSueldo(CARO, null);
    expect(await ana.partesDelMes(MES)).toEqual({ [ANA]: 600_000_000_000, [BRUNO]: 400_000_000_000, [CARO]: 0 });
  });

  test('sin ningún sueldo (o con todos en 0) pesan todos 0, no hay división por cero', async () => {
    expect(await casa({ sueldos: {} }).partesDelMes(MES)).toEqual({ [ANA]: 0, [BRUNO]: 0, [CARO]: 0 });
    expect(await casa({ sueldos: { [ANA]: 0, [BRUNO]: 0 } }).partesDelMes(MES)).toEqual({ [ANA]: 0, [BRUNO]: 0, [CARO]: 0 });
  });

  test('participan los integrantes activos o dados de baja desde un mes posterior; el pagador externo, no', async () => {
    const dani = otro('ejemplo-dani', 'Dani', { activo: false, baja_desde: '2026-10' });
    const datos = casa({ mas: [externo, dani], sueldos: { [ANA]: 100, [BRUNO]: 100, [dani.id]: 200, [externo.id]: 999 } });
    // Dani se fue en octubre: sigue figurando en septiembre, no en octubre. El externo, nunca.
    expect(await datos.partesDelMes('2026-09')).toEqual({ [ANA]: 250_000_000_000, [BRUNO]: 250_000_000_000, [CARO]: 0, [dani.id]: 500_000_000_000 });
    expect(await datos.partesDelMes('2026-10')).toEqual({ [ANA]: 500_000_000_000, [BRUNO]: 500_000_000_000, [CARO]: 0 });
  });

  test('el mes tiene que ser AAAA-MM: MES_INVALIDO con 22023', async () => {
    const datos = casa();
    for (const mes of ['', '2026', '2026-1', '2026-10-01', 'octubre']) {
      await expect(datos.partesDelMes(mes)).rejects.toMatchObject(rechaza('22023', 'MES_INVALIDO'));
    }
  });

  test('sigue el mapa de sueldos: cambia cuando Ana fija un sueldo', async () => {
    const ana = casa();
    await ana.fijarSueldo(ANA, 100_000_00);
    expect((await ana.partesDelMes(MES))[ANA]).toBe(83_333_333_333);
  });
});

describe('cerrar y reabrir el mes piden el permiso «sueldos»', () => {
  const MES = '2026-10';
  const MES_CERRADO = '2026-09';

  async function calculoDe(datos: Datos) {
    const gastos = await datos.gastosEntre(`${MES}-01`, '2026-11-01');
    const sueldos = await datos.sueldos();
    const integrantes = delCalculo(await datos.integrantes(), sueldos);
    const r = repartoDelMes(integrantesConPeso(integrantes, sueldos), MES, gastos);
    if (!r.ok) throw new Error('el reparto de la casa de ejemplo tendría que dar');
    return { r, gastos, integrantes };
  }

  test('cerrarMes y reabrirMes de Bruno rechazan con 42501 y no cambian nada', async () => {
    const { r, gastos, integrantes } = await calculoDe(casa());
    const bruno = casa({ yo: BRUNO });
    await expect(bruno.cerrarMes(MES, r, gastos, integrantes)).rejects.toMatchObject(SIN_PERMISO);
    await expect(bruno.reabrirMes(MES_CERRADO)).rejects.toMatchObject(SIN_PERMISO);
    expect(await bruno.mesesCerrados()).toEqual(new Set([MES_CERRADO]));

    // «Altas y bajas» tampoco alcanza.
    const conAltas = casa({ yo: BRUNO, permisos: [{ integrante_id: BRUNO, permiso: 'altas_bajas' }] });
    await expect(conAltas.cerrarMes(MES, r, gastos, integrantes)).rejects.toMatchObject(SIN_PERMISO);
    await expect(conAltas.reabrirMes(MES_CERRADO)).rejects.toMatchObject(SIN_PERMISO);
    expect(await conAltas.mesesCerrados()).toEqual(new Set([MES_CERRADO]));
  });

  test('Ana cierra y reabre', async () => {
    const ana = casa();
    const { r, gastos, integrantes } = await calculoDe(ana);
    await ana.cerrarMes(MES, r, gastos, integrantes);
    expect(await ana.mesesCerrados()).toEqual(new Set([MES_CERRADO, MES]));
    await ana.reabrirMes(MES);
    await ana.reabrirMes(MES_CERRADO);
    expect(await ana.mesesCerrados()).toEqual(new Set());
  });

  test('Bruno con el permiso «sueldos» (sin ser admin) también cierra y reabre', async () => {
    const bruno = casa({ yo: BRUNO, permisos: [{ integrante_id: BRUNO, permiso: 'sueldos' }] });
    const { r, gastos, integrantes } = await calculoDe(bruno);
    await bruno.cerrarMes(MES, r, gastos, integrantes);
    expect((await bruno.mesesCerrados()).has(MES)).toBe(true);
    await bruno.reabrirMes(MES);
    expect((await bruno.mesesCerrados()).has(MES)).toBe(false);
  });

  test('el cierre compara con los sueldos de la tabla aparte: si cambió uno desde el cálculo, CIERRE_DESACTUALIZADO', async () => {
    const { r, gastos, integrantes } = await calculoDe(casa());
    const ana = casa();
    await ana.fijarSueldo(CARO, 510_000_00);
    await expect(ana.cerrarMes(MES, r, gastos, integrantes)).rejects.toMatchObject({
      message: expect.stringContaining('CIERRE_DESACTUALIZADO'),
    });
    // Uno que se cargó después de que la app calculó (sin sueldo entonces), también.
    const otra = casa();
    const sinCaro = integrantes.map((i) => (i.id === CARO ? { ...i, sueldo: null } : i));
    await expect(otra.cerrarMes(MES, r, gastos, sinCaro)).rejects.toMatchObject({
      message: expect.stringContaining('CIERRE_DESACTUALIZADO'),
    });
    expect((await otra.mesesCerrados()).has(MES)).toBe(false);
  });
});

describe('escucharCambios con permisos y perfil', () => {
  test('avisa al dar y al quitar un permiso, y deja de avisar al cortar', async () => {
    const ana = casa();
    const alCambiar = vi.fn();
    const dejar = ana.escucharCambios(alCambiar);
    await ana.darPermiso(BRUNO, 'sueldos');
    expect(alCambiar).toHaveBeenCalledTimes(1);
    await ana.quitarPermiso(BRUNO, 'sueldos');
    expect(alCambiar).toHaveBeenCalledTimes(2);
    dejar();
    await ana.darPermiso(BRUNO, 'sueldos');
    expect(alCambiar).toHaveBeenCalledTimes(2);
  });

  test('también al fijar un sueldo, cambiar el perfil, guardar un integrante y ceder el rol; no cuando rechaza', async () => {
    const ana = casa();
    const alCambiar = vi.fn();
    ana.escucharCambios(alCambiar);
    await ana.fijarSueldo(CARO, 1_00);
    await ana.editarPerfil('Ana M', 'azul');
    await ana.guardarIntegrante({ id: CARO, nombre: 'Carolina' });
    await ana.cederAdmin(BRUNO);
    expect(alCambiar).toHaveBeenCalledTimes(4);

    // Ana ya no es admin: rechaza y no avisa. Conserva «sueldos», así que fijar un sueldo sí.
    await expect(ana.cederAdmin(CARO)).rejects.toBeDefined();
    await expect(ana.darPermiso(CARO, 'sueldos')).rejects.toBeDefined();
    expect(alCambiar).toHaveBeenCalledTimes(4);
    await ana.fijarSueldo(CARO, 2_00);
    expect(alCambiar).toHaveBeenCalledTimes(5);
  });
});

describe('la casa de ejemplo con acceso', () => {
  test('Ana es admin; Bruno y Caro, comunes, sin permisos; los sueldos de hoy van en el mapa aparte', () => {
    const s = semillaDeEjemplo(HOY_EJEMPLO);
    expect(s.integrantes.map((i) => [i.nombre, i.admin, i.color])).toEqual([
      ['Ana', true, null],
      ['Bruno', false, null],
      ['Caro', false, null],
    ]);
    expect(s.permisos ?? []).toEqual([]);
    expect(s.sueldos).toEqual({ [ANA]: 900_000_00, [BRUNO]: 600_000_00, [CARO]: 500_000_00 });
    expect(s.integrantes.some((i) => 'sueldo' in i)).toBe(false);
  });

  test('el mes cerrado de la semilla se repartió con esos sueldos', async () => {
    const cierre = await casa().cierre('2026-09');
    const pesos = Object.fromEntries((cierre?.detalle.filas ?? []).map((f) => [f.id, Number(f.peso.toFixed(2))]));
    expect(pesos).toEqual({ [ANA]: 0.45, [BRUNO]: 0.3, [CARO]: 0.25 });
  });

  test('sin decir quién usa la app, es el admin de la semilla', async () => {
    const datos = crearDatosEnMemoria(semillaDeEjemplo(HOY_EJEMPLO));
    expect((await datos.miAcceso()).admin).toBe(true);
    expect(Object.keys(await datos.sueldos())).toHaveLength(3);
  });

  test('dos casas no comparten permisos ni sueldos', async () => {
    const a = casa();
    const b = casa();
    await a.darPermiso(BRUNO, 'sueldos');
    await a.fijarSueldo(ANA, 1_00);
    expect(await b.permisosDeLaCasa()).toEqual({});
    expect((await b.sueldos())[ANA]).toBe(900_000_00);
  });
});

describe('suscripciones de avisos', () => {
  const clave = (n: string) => ({ p256dh: n.repeat(87), auth: n.repeat(22) });
  const de = (integrante_id: string, endpoint: string) => ({ integrante_id, endpoint, ...clave('x') });

  test('guardar activa los avisos de ese navegador para quien usa la app; dos veces no duplica', async () => {
    const bruno = casa({ yo: BRUNO });
    expect(await bruno.misSuscripciones()).toEqual([]);
    await bruno.guardarSuscripcion({ endpoint: 'https://fcm.googleapis.com/fcm/send/b', ...clave('p') });
    await bruno.guardarSuscripcion({ endpoint: 'https://fcm.googleapis.com/fcm/send/b', ...clave('q') });
    expect(await bruno.misSuscripciones()).toEqual(['https://fcm.googleapis.com/fcm/send/b']);
  });

  test('misSuscripciones trae solo las propias, y un navegador que estaba a nombre de otro pasa a quien lo activa', async () => {
    const base = semillaDeEjemplo(HOY_EJEMPLO);
    const semilla: Semilla = { ...base, suscripciones: [de(ANA, 'https://fcm.googleapis.com/fcm/send/ana'), de(ANA, 'https://fcm.googleapis.com/fcm/send/compartido')] };
    const bruno = crearDatosEnMemoria(semilla, { yo: BRUNO });
    expect(await bruno.misSuscripciones()).toEqual([]);
    await bruno.guardarSuscripcion({ endpoint: 'https://fcm.googleapis.com/fcm/send/compartido', ...clave('p') });
    expect(await bruno.misSuscripciones()).toEqual(['https://fcm.googleapis.com/fcm/send/compartido']);
  });

  test('borrar apaga solo la propia; una ajena o inexistente no cambia nada', async () => {
    const base = semillaDeEjemplo(HOY_EJEMPLO);
    const bruno = crearDatosEnMemoria({ ...base, suscripciones: [de(ANA, 'https://fcm.googleapis.com/fcm/send/ana')] }, { yo: BRUNO });
    await bruno.guardarSuscripcion({ endpoint: 'https://fcm.googleapis.com/fcm/send/b', ...clave('p') });
    await bruno.borrarSuscripcion('https://fcm.googleapis.com/fcm/send/ana');
    await bruno.borrarSuscripcion('https://fcm.googleapis.com/fcm/send/no-existe');
    expect(await bruno.misSuscripciones()).toEqual(['https://fcm.googleapis.com/fcm/send/b']);
    await bruno.borrarSuscripcion('https://fcm.googleapis.com/fcm/send/b');
    expect(await bruno.misSuscripciones()).toEqual([]);
    const ana = crearDatosEnMemoria({ ...base, suscripciones: [de(ANA, 'https://fcm.googleapis.com/fcm/send/ana')] }, { yo: ANA });
    expect(await ana.misSuscripciones()).toEqual(['https://fcm.googleapis.com/fcm/send/ana']);
  });

  test('sin https, o con claves de largo raro, rechaza como check', async () => {
    const bruno = casa({ yo: BRUNO });
    await expect(bruno.guardarSuscripcion({ endpoint: 'http://fcm.googleapis.com/fcm/send/b', ...clave('p') })).rejects.toMatchObject({ code: '23514' });
    await expect(bruno.guardarSuscripcion({ endpoint: 'https://fcm.googleapis.com/fcm/send/b', p256dh: 'corta', auth: 'a'.repeat(22) })).rejects.toMatchObject({
      code: '23514',
    });
    expect(await bruno.misSuscripciones()).toEqual([]);
  });

  test('solo endpoints de servicios de push: otro sitio rechaza como check', async () => {
    await expect(casa({ yo: BRUNO }).guardarSuscripcion({ endpoint: 'https://push.example.com/b', ...clave('p') })).rejects.toMatchObject({
      code: '23514',
    });
  });

  test('a lo sumo 10 por cuenta: con la 11.ª se va la más vieja; renovar una la vuelve la más nueva', async () => {
    const bruno = casa({ yo: BRUNO });
    for (let i = 1; i <= 10; i++) await bruno.guardarSuscripcion({ endpoint: `https://fcm.googleapis.com/fcm/send/${i}`, ...clave('p') });
    await bruno.guardarSuscripcion({ endpoint: 'https://fcm.googleapis.com/fcm/send/1', ...clave('q') });
    await bruno.guardarSuscripcion({ endpoint: 'https://fcm.googleapis.com/fcm/send/11', ...clave('p') });
    const mias = await bruno.misSuscripciones();
    expect(mias).toHaveLength(10);
    expect(mias).not.toContain('https://fcm.googleapis.com/fcm/send/2');
    expect(mias).toContain('https://fcm.googleapis.com/fcm/send/1');
  });

  test('quien no está en la casa no guarda avisos: 42501', async () => {
    await expect(casa({ yo: 'nadie' }).guardarSuscripcion({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', ...clave('p') })).rejects.toMatchObject(SIN_PERMISO);
  });
});
