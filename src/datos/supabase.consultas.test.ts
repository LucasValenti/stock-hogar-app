// Las llamadas de supabase.ts con un cliente falso que registra cada cadena (from/rpc + pasos) y
// responde lo que la prueba le pida. Fija los nombres y parámetros de las migraciones 007 y 008.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Anotacion, Producto } from '@/logica/tipos';

import { crearDatosSupabase } from './supabase';
import type { GastoAGuardar, ProductoAEditar } from './tipos';

type Paso = [string, ...unknown[]];
type Llamada = { via: 'from' | 'rpc'; nombre: string; params?: unknown; pasos: Paso[] };
type Respuesta = { data: unknown; error?: unknown };

function clienteGrabador(responder: (l: Llamada) => Respuesta = () => ({ data: null }), email: string | null = null) {
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
    // Solo lo que lee editarPerfil: el email de la sesión.
    auth: { getSession: async () => ({ data: { session: email ? { user: { email } } : null }, error: null }) },
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

  test('tieneCompras pide un solo ítem de gasto_items del producto', async () => {
    const { datos, llamadas } = clienteGrabador(() => ({ data: [{ id: 'it1' }] }));
    expect(await datos.tieneCompras('p1')).toBe(true);
    expect(llamadas).toEqual([
      { via: 'from', nombre: 'gasto_items', pasos: [['select', 'id'], ['eq', 'producto_id', 'p1'], ['limit', 1]] },
    ]);
  });

  test('tieneCompras da false sin ítems y lanza el error de la base', async () => {
    expect(await clienteGrabador(() => ({ data: [] })).datos.tieneCompras('p1')).toBe(false);
    const falla = { code: '42501', message: 'permission denied' };
    await expect(clienteGrabador(() => ({ data: null, error: falla })).datos.tieneCompras('p1')).rejects.toBe(falla);
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

describe('acceso, permisos, sueldos y perfil (migración 008)', () => {
  const SIN_PERMISO = { code: '42501', message: expect.stringContaining('SIN_PERMISO') };
  const COMUN = { admin: false, permisos: [] };
  // Responde según la función o la tabla que se pide; lo no listado, vacío.
  const responde = (porNombre: Record<string, Respuesta>) => (l: Llamada) => porNombre[l.nombre] ?? { data: null };

  test('miAcceso llama a mi_acceso sin parámetros y devuelve admin y permisos', async () => {
    const { datos, llamadas } = clienteGrabador(() => ({ data: { admin: false, permisos: ['altas_bajas', 'sueldos'] } }));
    expect(await datos.miAcceso()).toEqual({ admin: false, permisos: ['altas_bajas', 'sueldos'] });
    expect(llamadas).toEqual([{ via: 'rpc', nombre: 'mi_acceso', pasos: [] }]);
  });

  test('permisosDeLaCasa lee permisos y los agrupa por integrante, ordenados', async () => {
    const { datos, llamadas } = clienteGrabador(() => ({
      data: [
        { integrante_id: 'i2', permiso: 'sueldos' },
        { integrante_id: 'i3', permiso: 'altas_bajas' },
        { integrante_id: 'i2', permiso: 'altas_bajas' },
      ],
    }));
    expect(await datos.permisosDeLaCasa()).toEqual({ i2: ['altas_bajas', 'sueldos'], i3: ['altas_bajas'] });
    expect(llamadas).toEqual([{ via: 'from', nombre: 'permisos', pasos: [['select', 'integrante_id, permiso']] }]);
  });

  test('permisosDeLaCasa sin filas da {}', async () => {
    expect(await clienteGrabador(() => ({ data: [] })).datos.permisosDeLaCasa()).toEqual({});
    expect(await clienteGrabador(() => ({ data: null })).datos.permisosDeLaCasa()).toEqual({});
  });

  describe('darPermiso', () => {
    test('inserta la fila ignorando duplicados: darlo dos veces no es un error (como en memoria)', async () => {
      const { datos, llamadas } = clienteGrabador();
      await datos.darPermiso('i2', 'sueldos');
      expect(llamadas).toEqual([
        {
          via: 'from',
          nombre: 'permisos',
          pasos: [['upsert', { integrante_id: 'i2', permiso: 'sueldos' }, { onConflict: 'integrante_id,permiso', ignoreDuplicates: true }]],
        },
      ]);
    });

    test('el error de la base (sin ser admin, o un pagador externo) sube tal cual', async () => {
      const rls = { code: '42501', message: 'new row violates row-level security policy for table "permisos"' };
      await expect(clienteGrabador(() => ({ data: null, error: rls })).datos.darPermiso('i2', 'sueldos')).rejects.toBe(rls);
      const externo = { code: '23514', message: 'SOLO_INTEGRANTES' };
      await expect(clienteGrabador(() => ({ data: null, error: externo })).datos.darPermiso('e1', 'sueldos')).rejects.toBe(externo);
    });
  });

  describe('quitarPermiso', () => {
    test('borra la fila por integrante y permiso y pide las filas borradas; si borró alguna, no consulta nada más', async () => {
      const { datos, llamadas } = clienteGrabador(() => ({ data: [{ integrante_id: 'i2', permiso: 'sueldos' }] }));
      await datos.quitarPermiso('i2', 'sueldos');
      expect(llamadas).toEqual([
        {
          via: 'from',
          nombre: 'permisos',
          pasos: [['delete'], ['eq', 'integrante_id', 'i2'], ['eq', 'permiso', 'sueldos'], ['select']],
        },
      ]);
    });

    test('cero filas siendo admin es «no había nada que borrar»: sale bien, como en memoria', async () => {
      const { datos, llamadas } = clienteGrabador(responde({ permisos: { data: [] }, mi_acceso: { data: { admin: true, permisos: [] } } }));
      await expect(datos.quitarPermiso('i2', 'sueldos')).resolves.toBeUndefined();
      expect(llamadas.map((l) => l.nombre)).toEqual(['permisos', 'mi_acceso']);
    });

    test('cero filas sin ser admin es la política que lo descartó: SIN_PERMISO 42501, como en memoria', async () => {
      const { datos } = clienteGrabador(
        responde({ permisos: { data: [] }, mi_acceso: { data: { admin: false, permisos: ['sueldos', 'altas_bajas'] } } }),
      );
      await expect(datos.quitarPermiso('i2', 'sueldos')).rejects.toMatchObject(SIN_PERMISO);
    });

    test('el error de la base sube tal cual', async () => {
      const falla = { code: '42501', message: 'permission denied for table permisos' };
      await expect(clienteGrabador(() => ({ data: null, error: falla })).datos.quitarPermiso('i2', 'sueldos')).rejects.toBe(falla);
    });
  });

  describe('cederAdmin', () => {
    test('llama a ceder_admin con p_a', async () => {
      const { datos, llamadas } = clienteGrabador();
      await datos.cederAdmin('i2');
      expect(llamadas).toEqual([{ via: 'rpc', nombre: 'ceder_admin', params: { p_a: 'i2' }, pasos: [] }]);
    });

    test('SIN_PERMISO y DESTINO_INVALIDO suben tal cual', async () => {
      const sin = { code: '42501', message: 'SIN_PERMISO' };
      await expect(clienteGrabador(() => ({ data: null, error: sin })).datos.cederAdmin('i2')).rejects.toBe(sin);
      const destino = { code: '22023', message: 'DESTINO_INVALIDO' };
      await expect(clienteGrabador(() => ({ data: null, error: destino })).datos.cederAdmin('e1')).rejects.toBe(destino);
    });
  });

  describe('sueldos', () => {
    test('lee la tabla sueldos y la devuelve como Record por integrante', async () => {
      const { datos, llamadas } = clienteGrabador(() => ({
        data: [
          { integrante_id: 'i1', sueldo: 900_000_00 },
          { integrante_id: 'i2', sueldo: 0 },
        ],
      }));
      expect(await datos.sueldos()).toEqual({ i1: 900_000_00, i2: 0 });
      expect(llamadas).toEqual([{ via: 'from', nombre: 'sueldos', pasos: [['select', 'integrante_id, sueldo']] }]);
    });

    test('sin permiso la base devuelve cero filas (no un error): {}', async () => {
      expect(await clienteGrabador(() => ({ data: [] })).datos.sueldos()).toEqual({});
      expect(await clienteGrabador(() => ({ data: null })).datos.sueldos()).toEqual({});
    });

    test('un error de la base sube tal cual', async () => {
      const falla = { code: '42501', message: 'permission denied' };
      await expect(clienteGrabador(() => ({ data: null, error: falla })).datos.sueldos()).rejects.toBe(falla);
    });
  });

  describe('fijarSueldo', () => {
    test('con un monto hace upsert por integrante y pide la fila; si volvió, no consulta nada más', async () => {
      const { datos, llamadas } = clienteGrabador(() => ({ data: [{ integrante_id: 'i2', sueldo: 600_000_00 }] }));
      await datos.fijarSueldo('i2', 600_000_00);
      expect(llamadas).toEqual([
        {
          via: 'from',
          nombre: 'sueldos',
          pasos: [['upsert', { integrante_id: 'i2', sueldo: 600_000_00 }, { onConflict: 'integrante_id' }], ['select']],
        },
      ]);
    });

    test('un upsert que no devuelve fila lo descartó la política: SIN_PERMISO 42501', async () => {
      const { datos } = clienteGrabador(() => ({ data: [] }));
      await expect(datos.fijarSueldo('i2', 600_000_00)).rejects.toMatchObject(SIN_PERMISO);
    });

    test('el error de la base (RLS, check, clave foránea) sube tal cual', async () => {
      for (const falla of [
        { code: '42501', message: 'new row violates row-level security policy for table "sueldos"' },
        { code: '23514', message: 'new row for relation "sueldos" violates check constraint "sueldos_sueldo_check"' },
        { code: '23503', message: 'insert or update on table "sueldos" violates foreign key constraint' },
      ]) {
        await expect(clienteGrabador(() => ({ data: null, error: falla })).datos.fijarSueldo('i2', 1)).rejects.toBe(falla);
      }
    });

    test('con null borra la fila del integrante y pide las borradas; si borró alguna, no consulta nada más', async () => {
      const { datos, llamadas } = clienteGrabador(() => ({ data: [{ integrante_id: 'i2', sueldo: 600_000_00 }] }));
      await datos.fijarSueldo('i2', null);
      expect(llamadas).toEqual([
        { via: 'from', nombre: 'sueldos', pasos: [['delete'], ['eq', 'integrante_id', 'i2'], ['select']] },
      ]);
    });

    test.each([
      ['admin', { admin: true, permisos: [] }],
      ['con «sueldos»', { admin: false, permisos: ['sueldos'] }],
    ])('null sin nada que borrar, siendo %s: sale bien, como en memoria', async (_quien, acceso) => {
      const { datos, llamadas } = clienteGrabador(responde({ sueldos: { data: [] }, mi_acceso: { data: acceso } }));
      await expect(datos.fijarSueldo('i2', null)).resolves.toBeUndefined();
      expect(llamadas.map((l) => l.nombre)).toEqual(['sueldos', 'mi_acceso']);
    });

    test.each([
      ['común', COMUN],
      ['con solo «altas_bajas»', { admin: false, permisos: ['altas_bajas'] }],
    ])('null con cero filas siendo %s: la política lo descartó, SIN_PERMISO 42501', async (_quien, acceso) => {
      const { datos } = clienteGrabador(responde({ sueldos: { data: [] }, mi_acceso: { data: acceso } }));
      await expect(datos.fijarSueldo('i2', null)).rejects.toMatchObject(SIN_PERMISO);
    });
  });

  test('partesDelMes llama a partes_del_mes con p_mes y devuelve los pesos como número por integrante', async () => {
    const { datos, llamadas } = clienteGrabador(() => ({
      data: [
        { integrante_id: 'i1', peso: 450_000_000_000 },
        { integrante_id: 'i2', peso: '300000000000' },
        { integrante_id: 'i3', peso: 0 },
      ],
    }));
    expect(await datos.partesDelMes('2026-10')).toEqual({ i1: 450_000_000_000, i2: 300_000_000_000, i3: 0 });
    expect(llamadas).toEqual([{ via: 'rpc', nombre: 'partes_del_mes', params: { p_mes: '2026-10' }, pasos: [] }]);
  });

  test('partesDelMes sin filas da {} y un error de la base sube tal cual', async () => {
    expect(await clienteGrabador(() => ({ data: [] })).datos.partesDelMes('2026-10')).toEqual({});
    const falla = { code: '22023', message: 'MES_INVALIDO' };
    await expect(clienteGrabador(() => ({ data: null, error: falla })).datos.partesDelMes('2026-1')).rejects.toBe(falla);
  });

  describe('editarPerfil', () => {
    const fila = {
      id: 'i2',
      nombre: 'Bruno B',
      email: 'bruno@example.com',
      activo: true,
      baja_desde: null,
      tipo: 'integrante',
      admin: false,
      color: 'verde',
      creado: '2026-01-01T12:00:00+00:00',
    };

    test('llama a editar_perfil y después lee la fila propia por el email de la sesión', async () => {
      const { datos, llamadas } = clienteGrabador(responde({ integrantes: { data: fila } }), 'Bruno@Example.com');
      expect(await datos.editarPerfil('Bruno B', 'verde')).toEqual(fila);
      expect(llamadas).toEqual([
        { via: 'rpc', nombre: 'editar_perfil', params: { p_nombre: 'Bruno B', p_color: 'verde' }, pasos: [] },
        { via: 'from', nombre: 'integrantes', pasos: [['select', '*'], ['eq', 'email', 'bruno@example.com'], ['maybeSingle']] },
      ]);
    });

    test('sin color manda null', async () => {
      const { datos, llamadas } = clienteGrabador(responde({ integrantes: { data: { ...fila, color: null } } }), 'bruno@example.com');
      expect((await datos.editarPerfil('Bruno B', null)).color).toBeNull();
      expect(llamadas[0].params).toEqual({ p_nombre: 'Bruno B', p_color: null });
    });

    test('si la base rechaza (SIN_PERMISO, color inventado) sube tal cual y no lee nada más', async () => {
      for (const falla of [
        { code: '42501', message: 'SIN_PERMISO' },
        { code: '23514', message: 'new row for relation "integrantes" violates check constraint "integrantes_color_check"' },
      ]) {
        const { datos, llamadas } = clienteGrabador(() => ({ data: null, error: falla }), 'bruno@example.com');
        await expect(datos.editarPerfil('X', 'verde')).rejects.toBe(falla);
        expect(llamadas.map((l) => l.nombre)).toEqual(['editar_perfil']);
      }
    });

    test('sin sesión o sin fila propia no hay perfil: SIN_PERMISO 42501, como en memoria', async () => {
      await expect(clienteGrabador(() => ({ data: null }), null).datos.editarPerfil('X', null)).rejects.toMatchObject(SIN_PERMISO);
      await expect(clienteGrabador(() => ({ data: null }), 'nadie@example.com').datos.editarPerfil('X', null)).rejects.toMatchObject(SIN_PERMISO);
    });
  });
});

describe('suscripciones de avisos', () => {
  const sub = { endpoint: 'https://push.example.com/b', p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) };

  test('guardarSuscripcion llama a guardar_suscripcion con el endpoint y las claves', async () => {
    const { datos, llamadas } = clienteGrabador();
    await datos.guardarSuscripcion(sub);
    expect(llamadas).toEqual([
      { via: 'rpc', nombre: 'guardar_suscripcion', params: { p_endpoint: sub.endpoint, p_p256dh: sub.p256dh, p_auth: sub.auth }, pasos: [] },
    ]);
  });

  test('borrarSuscripcion borra por endpoint (el RLS deja borrar solo la propia)', async () => {
    const { datos, llamadas } = clienteGrabador();
    await datos.borrarSuscripcion(sub.endpoint);
    expect(llamadas).toEqual([{ via: 'from', nombre: 'suscripciones_push', pasos: [['delete'], ['eq', 'endpoint', sub.endpoint]] }]);
  });

  test('misSuscripciones lee los endpoints (el RLS trae solo los propios)', async () => {
    const { datos, llamadas } = clienteGrabador(() => ({ data: [{ endpoint: 'https://a' }, { endpoint: 'https://b' }] }));
    expect(await datos.misSuscripciones()).toEqual(['https://a', 'https://b']);
    expect(llamadas).toEqual([{ via: 'from', nombre: 'suscripciones_push', pasos: [['select', 'endpoint']] }]);
  });

  test('un error de la base sube tal cual', async () => {
    const falla = { code: '42501', message: 'SIN_PERMISO' };
    await expect(clienteGrabador(() => ({ data: null, error: falla })).datos.guardarSuscripcion(sub)).rejects.toBe(falla);
  });
});
