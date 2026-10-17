// Las llamadas de supabase.ts con un cliente falso que registra cada cadena (from/rpc + pasos) y
// responde lo que la prueba le pida. Fija los nombres y parámetros de la migración 007.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Anotacion, Producto } from '@/logica/tipos';

import { crearDatosSupabase } from './supabase';
import type { GastoAGuardar, ProductoAEditar } from './tipos';

type Paso = [string, ...unknown[]];
type Llamada = { via: 'from' | 'rpc'; nombre: string; params?: unknown; pasos: Paso[] };
type Respuesta = { data: unknown; error?: unknown };

function clienteGrabador(responder: (l: Llamada) => Respuesta = () => ({ data: null })) {
  const llamadas: Llamada[] = [];
  function cadena(l: Llamada): object {
    llamadas.push(l);
    const b: object = new Proxy(
      {},
      {
        get(_, metodo) {
          if (metodo === 'then') {
            return (resolver: (r: Respuesta) => unknown, rechazar: (e: unknown) => unknown) =>
              Promise.resolve({ error: null, ...responder(l) }).then(resolver, rechazar);
          }
          return (...args: unknown[]) => {
            l.pasos.push([String(metodo), ...args]);
            return b;
          };
        },
      },
    );
    return b;
  }
  const cliente = {
    from: (nombre: string) => cadena({ via: 'from', nombre, pasos: [] }),
    rpc: (nombre: string, params: unknown) => cadena({ via: 'rpc', nombre, params, pasos: [] }),
  };
  return { datos: crearDatosSupabase(cliente as unknown as SupabaseClient), llamadas };
}

// Como los devuelve PostgREST: ISO con microsegundos y +00:00.
const filaProducto = (extra: Partial<Producto> = {}): Producto => ({
  id: 'p1',
  codigo_barras: null,
  nombre: 'Yerba',
  marca: null,
  categoria_id: 'c1',
  stock: 1,
  unidad: 'paquete',
  ultimo_movimiento: '2026-10-18T12:34:56.123456+00:00',
  oculto: false,
  creado: '2026-09-01 08:00:00.5+00',
  ...extra,
});

describe('anotaciones', () => {
  test('anotaciones() lee la tabla de la más vieja a la más nueva y normaliza creado', async () => {
    const { datos, llamadas } = clienteGrabador(() => ({
      data: [
        { id: 'a1', texto: 'Comprar pan', creado_por: 'i1', creado: '2026-10-17T09:00:00.000001+00:00' },
        { id: 'a2', texto: 'Pilas', creado_por: null, creado: '2026-10-18 10:00:00.25+00' },
      ],
    }));
    const r = await datos.anotaciones();
    expect(llamadas).toEqual([{ via: 'from', nombre: 'anotaciones', pasos: [['select', '*'], ['order', 'creado']] }]);
    expect(r.map((a: Anotacion) => a.creado)).toEqual(['2026-10-17T09:00:00.000Z', '2026-10-18T10:00:00.250Z']);
    expect(r[0]).toMatchObject({ id: 'a1', texto: 'Comprar pan', creado_por: 'i1' });
  });

  test('crearAnotacion inserta solo el texto (sin espacios sobrantes): creado_por lo pone la base', async () => {
    const { datos, llamadas } = clienteGrabador(() => ({
      data: { id: 'a1', texto: 'Comprar pan', creado_por: 'i1', creado: '2026-10-18T12:00:00.123456+00:00' },
    }));
    const r = await datos.crearAnotacion('  Comprar pan ');
    expect(llamadas).toEqual([
      { via: 'from', nombre: 'anotaciones', pasos: [['insert', { texto: 'Comprar pan' }], ['select'], ['single']] },
    ]);
    expect(r.creado).toBe('2026-10-18T12:00:00.123Z');
  });

  test('borrarAnotacion borra por id', async () => {
    const { datos, llamadas } = clienteGrabador();
    await datos.borrarAnotacion('a1');
    expect(llamadas).toEqual([{ via: 'from', nombre: 'anotaciones', pasos: [['delete'], ['eq', 'id', 'a1']] }]);
  });

  test('el error de la base se lanza tal cual', async () => {
    const falla = { code: '23514', message: 'new row violates check constraint "anotaciones_texto_check"' };
    const { datos } = clienteGrabador(() => ({ data: null, error: falla }));
    await expect(datos.crearAnotacion('x')).rejects.toBe(falla);
  });
});

describe('productos', () => {
  test('productos() y producto() devuelven ultimo_movimiento y creado en ISO con milisegundos', async () => {
    const { datos } = clienteGrabador((l) => ({
      data: l.pasos.some(([m]) => m === 'maybeSingle') ? filaProducto() : [filaProducto()],
    }));
    const [uno] = await datos.productos();
    expect(uno.ultimo_movimiento).toBe('2026-10-18T12:34:56.123Z');
    expect(uno.creado).toBe('2026-09-01T08:00:00.500Z');
    expect((await datos.producto('p1'))?.ultimo_movimiento).toBe('2026-10-18T12:34:56.123Z');
  });

  test('producto() devuelve null si no existe', async () => {
    const { datos } = clienteGrabador(() => ({ data: null }));
    expect(await datos.producto('no-existe')).toBeNull();
  });

  test('crearProducto manda la unidad y devuelve las fechas normalizadas', async () => {
    const { datos, llamadas } = clienteGrabador(() => ({ data: filaProducto({ unidad: 'kg' }) }));
    const r = await datos.crearProducto({ nombre: 'Harina', categoria_id: 'c1', unidad: 'kg', stock: 1.5 });
    expect(llamadas).toEqual([
      {
        via: 'from',
        nombre: 'productos',
        pasos: [['insert', { nombre: 'Harina', categoria_id: 'c1', unidad: 'kg', stock: 1.5 }], ['select'], ['single']],
      },
    ]);
    expect(r.ultimo_movimiento).toBe('2026-10-18T12:34:56.123Z');
  });

  test('editarProducto actualiza solo nombre, marca, categoría y unidad, aunque le pasen un producto entero', async () => {
    const { datos, llamadas } = clienteGrabador(() => ({ data: filaProducto({ nombre: 'Yerba suave', unidad: 'kg' }) }));
    const entero = { ...filaProducto(), nombre: 'Yerba suave', marca: 'Taragüí', unidad: 'kg' as const };
    const r = await datos.editarProducto(entero as ProductoAEditar);
    expect(llamadas).toEqual([
      {
        via: 'from',
        nombre: 'productos',
        pasos: [
          ['update', { nombre: 'Yerba suave', marca: 'Taragüí', categoria_id: 'c1', unidad: 'kg' }],
          ['eq', 'id', 'p1'],
          ['select'],
          ['single'],
        ],
      },
    ]);
    expect(r).toMatchObject({ nombre: 'Yerba suave', unidad: 'kg', ultimo_movimiento: '2026-10-18T12:34:56.123Z' });
  });

  test('confirmarHay llama a la función confirmar_hay con p_producto', async () => {
    const { datos, llamadas } = clienteGrabador();
    await datos.confirmarHay('p1');
    expect(llamadas).toEqual([{ via: 'rpc', nombre: 'confirmar_hay', params: { p_producto: 'p1' }, pasos: [] }]);
  });

  test('confirmarHay lanza el error de la base (PRODUCTO_INEXISTENTE)', async () => {
    const falla = { code: 'P0001', message: 'PRODUCTO_INEXISTENTE' };
    const { datos } = clienteGrabador(() => ({ data: null, error: falla }));
    await expect(datos.confirmarHay('no-existe')).rejects.toBe(falla);
  });
});

describe('categorías', () => {
  test('guardarCategoria manda dias_sin_movimiento', async () => {
    const { datos, llamadas } = clienteGrabador(() => ({
      data: { id: 'c1', nombre: 'Limpieza', tipo: 'producto', dias_sin_movimiento: 45 },
    }));
    const r = await datos.guardarCategoria({ id: 'c1', dias_sin_movimiento: 45 });
    expect(llamadas).toEqual([
      {
        via: 'from',
        nombre: 'categorias',
        pasos: [['update', { dias_sin_movimiento: 45 }], ['eq', 'id', 'c1'], ['select'], ['single']],
      },
    ]);
    expect(r.dias_sin_movimiento).toBe(45);
  });
});

describe('guardarGasto', () => {
  const tildados = [
    { producto_id: 'p1', cantidad: 2 },
    { producto_id: 'p2', cantidad: 1.5 },
  ];

  test('un gasto por total manda tildados y anotaciones dentro de p_gasto, y p_items vacío', async () => {
    const { datos, llamadas } = clienteGrabador(() => ({ data: 'g1' }));
    const gasto: GastoAGuardar = {
      nuevo_id: 'g1',
      fecha: '2026-10-18',
      pagado_por: 'i1',
      total: 5000_00,
      modo: 'total',
      categoria_id: 'c1',
      tildados,
      anotaciones: ['a1', 'a2'],
    };
    expect(await datos.guardarGasto(gasto, [])).toBe('g1');
    expect(llamadas).toEqual([{ via: 'rpc', nombre: 'guardar_gasto', params: { p_gasto: gasto, p_items: [] }, pasos: [] }]);
    // Lo que viaja por la red (JSON) conserva las dos claves.
    expect(JSON.parse(JSON.stringify(llamadas[0].params))).toMatchObject({ p_gasto: { tildados, anotaciones: ['a1', 'a2'] } });
  });

  test('editar con tildados vacíos manda la clave (así la base los saca); sin la clave, no', async () => {
    const { datos, llamadas } = clienteGrabador(() => ({ data: 'g1' }));
    const base = { id: 'g1', fecha: '2026-10-18', pagado_por: 'i1', total: 100, modo: 'total' as const, categoria_id: 'c1' };
    await datos.guardarGasto({ ...base, tildados: [] }, []);
    await datos.guardarGasto(base, []);
    const [conVacios, sinClave] = llamadas.map((l) => JSON.parse(JSON.stringify(l.params)).p_gasto);
    expect(conVacios).toHaveProperty('tildados', []);
    expect(sinClave).not.toHaveProperty('tildados');
  });

  test('un gasto por productos manda los ítems con precio', async () => {
    const { datos, llamadas } = clienteGrabador(() => ({ data: 'g2' }));
    const gasto: GastoAGuardar = { nuevo_id: 'g2', fecha: '2026-10-18', pagado_por: 'i1', total: 0, modo: 'productos' };
    const items = [{ producto_id: 'p1', cantidad: 2, precio_unitario: 3000_00 }];
    await datos.guardarGasto(gasto, items);
    expect(llamadas[0].params).toEqual({ p_gasto: gasto, p_items: items });
  });

  test('el error de la RPC se lanza tal cual', async () => {
    const falla = { code: 'P0001', message: 'MES_CERRADO' };
    const { datos } = clienteGrabador(() => ({ data: null, error: falla }));
    await expect(
      datos.guardarGasto({ fecha: '2026-10-18', pagado_por: 'i1', total: 1, modo: 'total', categoria_id: 'c1' }, []),
    ).rejects.toBe(falla);
  });
});
