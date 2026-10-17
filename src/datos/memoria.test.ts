import { repartoDelMes } from '@/logica/reparto';
import type { Integrante } from '@/logica/tipos';

import { crearDatosEnMemoria, semillaDeEjemplo, type Semilla } from './memoria';
import type { GastoAGuardar } from './tipos';

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

function semilla(): Semilla {
  return {
    integrantes: [ana, bruno],
    categorias: [{ id: 'c-almacen', nombre: 'Almacén', tipo: 'producto' }],
    productos: [
      {
        id: 'p-yerba',
        codigo_barras: null,
        nombre: 'Yerba',
        marca: null,
        categoria_id: 'c-almacen',
        stock: 1,
        oculto: false,
        creado: '2026-01-01T00:00:00Z',
      },
    ],
    gastos: [],
    cierres: [],
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
