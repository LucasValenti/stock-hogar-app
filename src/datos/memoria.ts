// Base en memoria con las mismas reglas que supabase/schema.sql y las migraciones 002 a 007:
// para las pruebas y para ver la app sin cuenta (EXPO_PUBLIC_DATOS=memoria). No guarda nada.

import { mesDe } from '@/logica/meses';
import { aplicarDelta } from '@/logica/stock';
import type { Anotacion, Categoria, Cierre, Gasto, GastoItem, Integrante, Producto, Unidad } from '@/logica/tipos';

import { nuevoId } from './id';
import type { Datos, GastoConItems } from './tipos';

export type Semilla = {
  integrantes: Integrante[];
  categorias: Categoria[];
  productos: Producto[];
  anotaciones?: Anotacion[];
  /** Con sus ítems en gasto_items. */
  gastos: Gasto[];
  cierres: Cierre[];
  /** Destinatario normalizado → categoría aprendida. */
  destinos?: Record<string, string>;
};

// Los errores imitan a los de Supabase: `message` con la excepción de la base y `code` de Postgres.
function errorDeBase(message: string, code = 'P0001'): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

const copia = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es');
const ahora = () => new Date().toISOString();

const UNIDADES: readonly string[] = ['unidad', 'paquete', 'kg', 'litro'];
const violaCheck = (tabla: string, regla: string) =>
  errorDeBase(`new row for relation "${tabla}" violates check constraint "${tabla}_${regla}_check"`, '23514');
const violaClave = (tabla: string) =>
  errorDeBase(`insert or update on table "${tabla}" violates foreign key constraint`, '23503');

export function crearDatosEnMemoria(semilla: Semilla = semillaDeEjemplo): Datos {
  const s = copia(semilla);
  const integrantes = s.integrantes;
  const categorias = s.categorias;
  const productos = s.productos;
  const anotaciones: Anotacion[] = s.anotaciones ?? [];
  const cierres = s.cierres;
  const destinos = new Map(Object.entries(s.destinos ?? {}));
  const items: GastoItem[] = s.gastos.flatMap((g) => g.gasto_items ?? []);
  const gastos: Gasto[] = s.gastos.map(({ gasto_items: _, ...g }) => g);
  const oyentes = new Set<() => void>();

  const avisar = () => oyentes.forEach((f) => f());
  const mesCerrado = (fecha: string) => cierres.some((c) => c.mes === mesDe(fecha));
  const buscarProducto = (id: string) => productos.find((p) => p.id === id);

  // Trigger ajustar_stock: un ítem nuevo suma; uno que se va resta sin bajar de 0.
  // Trigger marcar_movimiento: si el stock cambió, se renueva ultimo_movimiento.
  function moverStock(p: Producto, delta: number) {
    const nuevo = aplicarDelta(p.stock, delta);
    if (nuevo === Number(p.stock)) return;
    p.stock = nuevo;
    p.ultimo_movimiento = ahora();
  }
  function sumarStock(productoId: string, cantidad: number) {
    const p = buscarProducto(productoId);
    if (p) moverStock(p, cantidad);
  }
  // Borra los ítems del gasto que cumplan `quitar` (todos, por defecto) y descuenta su stock.
  function quitarItems(gastoId: string, quitar: (it: GastoItem) => boolean = () => true) {
    for (let i = 0; i < items.length; ) {
      const it = items[i];
      if (it.gasto_id !== gastoId || !quitar(it)) {
        i++;
        continue;
      }
      sumarStock(it.producto_id, -Number(it.cantidad));
      items.splice(i, 1);
    }
  }
  // Restricciones de productos: nombre con texto, unidad conocida y categoría que existe.
  function validarProducto(f: { nombre: string; categoria_id: string; unidad: string }) {
    if (!f.nombre.trim()) throw violaCheck('productos', 'nombre');
    if (!UNIDADES.includes(f.unidad)) throw violaCheck('productos', 'unidad');
    if (!categorias.some((c) => c.id === f.categoria_id)) throw violaClave('productos');
  }

  return {
    async miIntegrante(email) {
      return copia(integrantes.find((i) => i.email === email.toLowerCase()) ?? null);
    },
    async integrantes() {
      return copia([...integrantes].sort(porNombre));
    },
    async categorias() {
      return copia([...categorias].sort(porNombre));
    },
    async productos() {
      return copia([...productos].sort(porNombre));
    },
    async producto(id) {
      return copia(buscarProducto(id) ?? null);
    },

    async gastosEntre(desde, hastaExcl) {
      const filas: GastoConItems[] = gastos
        .filter((g) => (!desde || g.fecha >= desde) && (!hastaExcl || g.fecha < hastaExcl))
        .map((g) => ({
          ...g,
          gasto_items: items
            .filter((i) => i.gasto_id === g.id)
            .map((i) => {
              const p = buscarProducto(i.producto_id);
              return {
                cantidad: i.cantidad,
                precio_unitario: i.precio_unitario,
                productos: p ? { nombre: p.nombre, categoria_id: p.categoria_id } : null,
              };
            }),
        }));
      filas.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado.localeCompare(a.creado) || a.id.localeCompare(b.id));
      return copia(filas);
    },

    async gasto(id) {
      const g = gastos.find((x) => x.id === id);
      if (!g) throw errorDeBase('JSON object requested, multiple (or no) rows returned', 'PGRST116');
      return copia({ gasto: g, items: items.filter((i) => i.gasto_id === id) });
    },

    async mesesCerrados() {
      return new Set(cierres.map((c) => c.mes));
    },
    async cierre(mes) {
      return copia(cierres.find((c) => c.mes === mes) ?? null);
    },

    async crearProducto(p) {
      if (p.codigo_barras && productos.some((x) => x.codigo_barras === p.codigo_barras)) {
        throw errorDeBase('duplicate key value violates unique constraint "productos_codigo_barras_key"', '23505');
      }
      validarProducto({ nombre: p.nombre, categoria_id: p.categoria_id, unidad: p.unidad ?? 'unidad' });
      if (p.stock != null && !(Number(p.stock) >= 0)) throw violaCheck('productos', 'stock');
      const nuevo: Producto = {
        id: nuevoId(),
        codigo_barras: p.codigo_barras ?? null,
        nombre: p.nombre,
        marca: p.marca ?? null,
        categoria_id: p.categoria_id,
        stock: p.stock ?? 0,
        unidad: p.unidad ?? 'unidad',
        ultimo_movimiento: ahora(),
        oculto: p.oculto ?? false,
        creado: ahora(),
      };
      productos.push(nuevo);
      avisar();
      return copia(nuevo);
    },

    // Solo estas cuatro columnas: el stock, el código y lo oculto no se pisan con una copia vieja.
    async editarProducto({ id, nombre, marca, categoria_id, unidad }) {
      const p = buscarProducto(id);
      if (!p) throw errorDeBase('JSON object requested, multiple (or no) rows returned', 'PGRST116');
      validarProducto({ nombre, categoria_id, unidad });
      Object.assign(p, { nombre, marca, categoria_id, unidad });
      avisar();
      return copia(p);
    },

    async borrarProducto(id) {
      if (items.some((i) => i.producto_id === id)) {
        throw errorDeBase('update or delete on table "productos" violates foreign key constraint', '23503');
      }
      const i = productos.findIndex((p) => p.id === id);
      if (i >= 0) productos.splice(i, 1);
      avisar();
    },

    async ocultarProducto(id, oculto) {
      const p = buscarProducto(id);
      if (p) p.oculto = oculto;
      avisar();
    },

    async ajustarStock(productoId, delta) {
      if (!delta || Math.abs(delta) > 1000) throw errorDeBase('DELTA_INVALIDO');
      const p = buscarProducto(productoId);
      if (!p) throw errorDeBase('PRODUCTO_INEXISTENTE');
      moverStock(p, delta);
      avisar();
      return p.stock;
    },

    // RPC confirmar_hay: renueva la fecha sin tocar el stock.
    async confirmarHay(productoId) {
      const p = buscarProducto(productoId);
      if (!p) throw errorDeBase('PRODUCTO_INEXISTENTE');
      p.ultimo_movimiento = ahora();
      avisar();
    },

    async anotaciones() {
      // sort es estable: dos notas del mismo milisegundo quedan en el orden en que se crearon.
      const filas = [...anotaciones].sort((a, b) => a.creado.localeCompare(b.creado));
      return copia(filas);
    },
    async crearAnotacion(texto) {
      const limpio = texto.trim();
      if (limpio.length < 1 || limpio.length > 120) throw violaCheck('anotaciones', 'texto');
      const nueva: Anotacion = { id: nuevoId(), texto: limpio, creado_por: null, creado: ahora() };
      anotaciones.push(nueva);
      avisar();
      return copia(nueva);
    },
    async borrarAnotacion(id) {
      const i = anotaciones.findIndex((a) => a.id === id);
      if (i >= 0) anotaciones.splice(i, 1);
      avisar();
    },

    // Igual que la RPC guardar_gasto (007): todo o nada, alta idempotente por nuevo_id.
    // Por total, `tildados` suma stock sin precio; `anotaciones` se borran en la misma operación.
    async guardarGasto(gasto, nuevosItems) {
      // Alta ya guardada (la respuesta anterior se perdió): se devuelve antes de cualquier control,
      // también el de mes cerrado, igual que guardar_gasto.
      if (!gasto.id && gasto.nuevo_id && gastos.some((g) => g.id === gasto.nuevo_id)) return gasto.nuevo_id;
      const productosModo = gasto.modo === 'productos';
      // Sin la clave (web vieja) al editar se conservan los tildados que ya tenía; con `[]` se sacan.
      const tildados = Array.isArray(gasto.tildados) ? gasto.tildados : null;
      if (productosModo) {
        if (!nuevosItems.length) throw errorDeBase('SIN_ITEMS');
        if (nuevosItems.some((i) => i.precio_unitario == null)) throw errorDeBase('SIN_PRECIO', '23502');
      }
      const aInsertar: Array<{ producto_id: string; cantidad: number; precio_unitario: number | null }> = productosModo
        ? nuevosItems
        : (tildados ?? []).map((t) => ({ ...t, precio_unitario: null }));
      for (const it of aInsertar) {
        if (!buscarProducto(it.producto_id)) throw violaClave('gasto_items');
        if (!(Number(it.cantidad) > 0)) throw violaCheck('gasto_items', 'cantidad');
      }
      if (gasto.id && !gastos.some((g) => g.id === gasto.id)) throw errorDeBase('GASTO_INEXISTENTE');

      let id: string;
      if (gasto.id) {
        const g = gastos.find((x) => x.id === gasto.id) as Gasto;
        if (mesCerrado(g.fecha) || mesCerrado(gasto.fecha)) throw errorDeBase('MES_CERRADO');
        id = g.id;
        // Se borran y se vuelven a insertar: lo viejo resta y lo nuevo suma. Por total sin `tildados`
        // solo se van los ítems con precio (un gasto que antes era por productos).
        quitarItems(id, (it) => productosModo || tildados !== null || it.precio_unitario !== null);
        Object.assign(g, {
          fecha: gasto.fecha,
          pagado_por: gasto.pagado_por,
          total: gasto.total,
          modo: gasto.modo,
          categoria_id: gasto.categoria_id || null,
          nota: gasto.nota || null,
        });
      } else {
        id = gasto.nuevo_id || nuevoId();
        if (mesCerrado(gasto.fecha)) throw errorDeBase('MES_CERRADO');
        if (gasto.mp_operacion && gastos.some((g) => g.mp_operacion === gasto.mp_operacion)) {
          throw errorDeBase('duplicate key value violates unique constraint "gastos_mp_operacion_key"', '23505');
        }
        gastos.push({
          id,
          fecha: gasto.fecha,
          pagado_por: gasto.pagado_por,
          total: gasto.total,
          modo: gasto.modo,
          categoria_id: gasto.categoria_id || null,
          nota: gasto.nota || null,
          creado_por: null,
          creado: ahora(),
          mp_operacion: gasto.mp_operacion || null,
        });
      }

      const g = gastos.find((x) => x.id === id) as Gasto;
      for (const it of aInsertar) {
        items.push({ id: nuevoId(), gasto_id: id, producto_id: it.producto_id, cantidad: it.cantidad, precio_unitario: it.precio_unitario });
        sumarStock(it.producto_id, Number(it.cantidad));
      }
      if (productosModo) {
        g.total = nuevosItems.reduce((t, it) => t + Math.round(Number(it.cantidad) * it.precio_unitario), 0);
      } else if (gasto.destino) {
        destinos.set(gasto.destino, gasto.categoria_id ?? '');
      }
      if (Array.isArray(gasto.anotaciones)) {
        const tildadas = new Set(gasto.anotaciones);
        for (let i = anotaciones.length - 1; i >= 0; i--) if (tildadas.has(anotaciones[i].id)) anotaciones.splice(i, 1);
      }
      avisar();
      return id;
    },

    async borrarGasto(id) {
      const i = gastos.findIndex((g) => g.id === id);
      if (i < 0) return;
      if (mesCerrado(gastos[i].fecha)) throw errorDeBase('MES_CERRADO');
      quitarItems(id);
      gastos.splice(i, 1);
      avisar();
    },

    async gastoPorOperacion(operacion) {
      const g = gastos.find((x) => x.mp_operacion === operacion);
      return g ? { id: g.id, fecha: g.fecha, pagado_por: g.pagado_por } : null;
    },

    async categoriaDeDestino(nombre) {
      return destinos.get(nombre) || null;
    },

    async guardarIntegrante(i) {
      const email = i.email?.toLowerCase();
      if (email && integrantes.some((x) => x.email === email && x.id !== i.id)) {
        throw errorDeBase('duplicate key value violates unique constraint "integrantes_email_key"', '23505');
      }
      const campos = email ? { ...i, email } : i;
      let fila = i.id ? integrantes.find((x) => x.id === i.id) : undefined;
      if (fila) Object.assign(fila, campos);
      else {
        fila = {
          nombre: '',
          sueldo: null,
          email: '',
          activo: true,
          baja_desde: null,
          tipo: 'integrante',
          ...campos,
          id: i.id ?? nuevoId(),
          creado: ahora(),
        };
        integrantes.push(fila);
      }
      avisar();
      return copia(fila);
    },

    async guardarCategoria(c) {
      if (c.nombre && categorias.some((x) => x.nombre === c.nombre && x.id !== c.id)) {
        throw errorDeBase('duplicate key value violates unique constraint "categorias_nombre_key"', '23505');
      }
      const dias = c.dias_sin_movimiento;
      if (dias !== undefined && !(Number.isInteger(dias) && dias >= 1 && dias <= 365)) {
        throw violaCheck('categorias', 'dias_sin_movimiento');
      }
      let fila = c.id ? categorias.find((x) => x.id === c.id) : undefined;
      if (fila) Object.assign(fila, c);
      else {
        fila = { nombre: '', tipo: 'producto', dias_sin_movimiento: 20, ...c, id: c.id ?? nuevoId() };
        categorias.push(fila);
      }
      avisar();
      return copia(fila);
    },

    async borrarCategoria(id) {
      if (productos.some((p) => p.categoria_id === id) || gastos.some((g) => g.categoria_id === id)) {
        throw errorDeBase('update or delete on table "categorias" violates foreign key constraint', '23503');
      }
      const i = categorias.findIndex((c) => c.id === id);
      if (i >= 0) categorias.splice(i, 1);
      avisar();
    },

    // Como la RPC cerrar_mes: compara lo que se usó para calcular con lo que hay ahora.
    async cerrarMes(mes, resultado, gastosDelCalculo, integrantesDelCalculo) {
      if (cierres.some((c) => c.mes === mes)) throw errorDeBase('MES_CERRADO');
      const clavesGastos = (lista: Array<Pick<Gasto, 'id' | 'total' | 'pagado_por'>>) =>
        new Set(lista.map((g) => JSON.stringify([g.id, Number(g.total), g.pagado_por])));
      const clavesIntegrantes = (lista: Array<Pick<Integrante, 'id' | 'sueldo' | 'tipo' | 'activo' | 'baja_desde'>>) =>
        new Set(lista.map((i) => JSON.stringify([i.id, i.sueldo, i.tipo, i.activo, i.baja_desde])));
      const iguales = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
      const delMes = gastos.filter((g) => mesDe(g.fecha) === mes);
      if (
        !iguales(clavesGastos(delMes), clavesGastos(gastosDelCalculo)) ||
        !iguales(clavesIntegrantes(integrantes), clavesIntegrantes(integrantesDelCalculo))
      ) {
        throw errorDeBase('CIERRE_DESACTUALIZADO');
      }
      cierres.push({
        mes,
        total: resultado.total,
        detalle: copia({ filas: resultado.filas, transferencias: resultado.transferencias }),
        cerrado_por: null,
        fecha: ahora(),
      });
      avisar();
    },

    async reabrirMes(mes) {
      const i = cierres.findIndex((c) => c.mes === mes);
      if (i >= 0) cierres.splice(i, 1);
      avisar();
    },

    escucharCambios(alCambiar) {
      const f = () => alCambiar();
      oyentes.add(f);
      return () => {
        oyentes.delete(f);
      };
    },
  };
}

// ——— Casa de ejemplo ———
// EJEMPLO: datos ficticios (Ana, Bruno y Caro, como en las maquetas). No son personas ni montos reales.

const CREADO = '2026-01-01T12:00:00.000Z';
// Las fechas del stock se cuentan hacia atrás desde ahora: así «¿Todavía hay?» muestra lo mismo cualquier día.
const haceDias = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
const persona = (id: string, nombre: string, sueldo: number): Integrante => ({
  id,
  nombre,
  sueldo,
  email: `${nombre.toLowerCase()}@example.com`,
  activo: true,
  baja_desde: null,
  tipo: 'integrante',
  creado: CREADO,
});
const prod = (
  id: string,
  nombre: string,
  categoria_id: string,
  stock: number,
  unidad: Unidad,
  movidoHaceDias: number,
): Producto => ({
  id,
  codigo_barras: null,
  nombre,
  marca: null,
  categoria_id,
  stock,
  unidad,
  ultimo_movimiento: haceDias(movidoHaceDias),
  oculto: false,
  creado: CREADO,
});

export const semillaDeEjemplo: Semilla = {
  integrantes: [
    persona('ejemplo-ana', 'Ana', 900_000_00),
    persona('ejemplo-bruno', 'Bruno', 600_000_00),
    persona('ejemplo-caro', 'Caro', 500_000_00),
  ],
  categorias: [
    { id: 'ejemplo-almacen', nombre: 'Almacén', tipo: 'producto', dias_sin_movimiento: 20 },
    { id: 'ejemplo-limpieza', nombre: 'Limpieza', tipo: 'producto', dias_sin_movimiento: 30 },
    { id: 'ejemplo-luz', nombre: 'Luz', tipo: 'servicio', dias_sin_movimiento: 20 },
    { id: 'ejemplo-internet', nombre: 'Internet', tipo: 'servicio', dias_sin_movimiento: 20 },
  ],
  // Arroz y Esponjas llevan semanas quietos: son los que «¿Todavía hay?» pregunta.
  productos: [
    prod('ejemplo-yerba', 'Yerba', 'ejemplo-almacen', 1, 'paquete', 3),
    prod('ejemplo-leche', 'Leche', 'ejemplo-almacen', 0, 'litro', 9),
    prod('ejemplo-fideos', 'Fideos', 'ejemplo-almacen', 3, 'paquete', 4),
    prod('ejemplo-arroz', 'Arroz', 'ejemplo-almacen', 2, 'paquete', 41),
    prod('ejemplo-harina', 'Harina', 'ejemplo-almacen', 1.5, 'kg', 14),
    prod('ejemplo-detergente', 'Detergente', 'ejemplo-limpieza', 0, 'unidad', 6),
    prod('ejemplo-lavandina', 'Lavandina', 'ejemplo-limpieza', 2, 'unidad', 4),
    prod('ejemplo-esponjas', 'Esponjas', 'ejemplo-limpieza', 4, 'unidad', 36),
  ],
  anotaciones: [
    { id: 'ejemplo-nota-pan', texto: 'Comprar pan', creado_por: 'ejemplo-ana', creado: haceDias(2) },
    { id: 'ejemplo-nota-pilas', texto: 'Pilas AA para el control', creado_por: 'ejemplo-bruno', creado: haceDias(1) },
  ],
  gastos: [
    {
      id: 'ejemplo-gasto-super',
      fecha: '2026-10-05',
      pagado_por: 'ejemplo-ana',
      total: 12_400_00,
      modo: 'productos',
      categoria_id: null,
      nota: 'Ejemplo',
      creado_por: 'ejemplo-ana',
      creado: '2026-10-05T18:00:00.000Z',
      mp_operacion: null,
      gasto_items: [
        { id: 'ejemplo-item-1', gasto_id: 'ejemplo-gasto-super', producto_id: 'ejemplo-yerba', cantidad: 1, precio_unitario: 5_200_00 },
        { id: 'ejemplo-item-2', gasto_id: 'ejemplo-gasto-super', producto_id: 'ejemplo-fideos', cantidad: 3, precio_unitario: 1_400_00 },
        { id: 'ejemplo-item-3', gasto_id: 'ejemplo-gasto-super', producto_id: 'ejemplo-lavandina', cantidad: 2, precio_unitario: 1_500_00 },
      ],
    },
    {
      id: 'ejemplo-gasto-luz',
      fecha: '2026-10-08',
      pagado_por: 'ejemplo-bruno',
      total: 38_000_00,
      modo: 'total',
      categoria_id: 'ejemplo-luz',
      nota: 'Ejemplo',
      creado_por: 'ejemplo-bruno',
      creado: '2026-10-08T10:00:00.000Z',
      mp_operacion: null,
    },
    {
      id: 'ejemplo-gasto-internet',
      fecha: '2026-10-10',
      pagado_por: 'ejemplo-caro',
      total: 22_000_00,
      modo: 'total',
      categoria_id: 'ejemplo-internet',
      nota: 'Ejemplo',
      creado_por: 'ejemplo-caro',
      creado: '2026-10-10T09:30:00.000Z',
      mp_operacion: null,
    },
  ],
  cierres: [],
};
