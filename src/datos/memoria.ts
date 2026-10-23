// Base en memoria con las mismas reglas que supabase/schema.sql y las migraciones 002 a 008:
// para las pruebas y para ver la app sin cuenta (VITE_DATOS=memoria). No guarda nada.

import { esEndpointDePush, MAX_SUSCRIPCIONES } from '@/logica/avisos';
import { mesActual, mesAnterior, mesDe } from '@/logica/meses';
import { COLORES_PERFIL } from '@/logica/perfil';
import { integrantesConPeso, participantesDelMes, repartoDelMes } from '@/logica/reparto';
import { aplicarDelta } from '@/logica/stock';
import type {
  Anotacion,
  Categoria,
  Cierre,
  Gasto,
  GastoItem,
  Integrante,
  Permiso,
  Producto,
  Unidad,
} from '@/logica/tipos';

import { nuevoId } from './id';
import type { Datos, GastoConItems, IntegranteDelCalculo, SuscripcionPush } from './tipos';

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
  /** Permisos de cada integrante (el admin los tiene todos sin que se registren). Sin la clave, nadie tiene ninguno. */
  permisos?: Array<{ integrante_id: string; permiso: Permiso }>;
  /** Sueldos en centavos, aparte de los integrantes (como la tabla sueldos); sin entrada o con `null`, sin sueldo. */
  sueldos?: Record<string, number | null>;
  /** Suscripciones de avisos de cada integrante (como la tabla suscripciones_push). */
  suscripciones?: Array<SuscripcionPush & { integrante_id: string }>;
};

export type OpcionesMemoria = {
  /** Id del integrante que usa la app; por defecto, el admin de la semilla. */
  yo?: string;
};

// Los errores imitan a los de Supabase: `message` con la excepción de la base y `code` de Postgres.
function errorDeBase(message: string, code = 'P0001'): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

const copia = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Un producto tildado dos veces queda una vez, con la suma (en el orden en que apareció primero). */
function sumarRepetidos(tildados: Array<{ producto_id: string; cantidad: number }>) {
  const suma = new Map<string, number>();
  for (const t of tildados) suma.set(t.producto_id, (suma.get(t.producto_id) ?? 0) + Number(t.cantidad));
  return [...suma].map(([producto_id, cantidad]) => ({ producto_id, cantidad }));
}
const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es');
const ahora = () => new Date().toISOString();

const UNIDADES: readonly string[] = ['unidad', 'paquete', 'kg', 'litro'];
const PERMISOS: readonly Permiso[] = ['sueldos', 'altas_bajas'];
const ESCALA_DE_PESOS = 1_000_000_000_000n;
// Lo que lanzan las funciones, las políticas y los disparadores de la base cuando falta el permiso.
const sinPermiso = () => errorDeBase('SIN_PERMISO', '42501');
const violaCheck = (tabla: string, regla: string) =>
  errorDeBase(`new row for relation "${tabla}" violates check constraint "${tabla}_${regla}_check"`, '23514');
const violaClave = (tabla: string) =>
  errorDeBase(`insert or update on table "${tabla}" violates foreign key constraint`, '23503');

/** Id de quien usa la casa de ejemplo. Un id que no está en la semilla se ignora y queda el admin. */
export function yoDeLaSemilla(semilla: Semilla, pedido?: string | null): string {
  const id = pedido?.trim() ?? '';
  if (id && semilla.integrantes.some((i) => i.id === id)) return id;
  return semilla.integrantes.find((i) => i.admin)?.id ?? semilla.integrantes[0]?.id ?? 'ejemplo-ana';
}

export function crearDatosEnMemoria(semilla: Semilla = semillaDeEjemplo(), opciones: OpcionesMemoria = {}): Datos {
  const s = copia(semilla);
  // Los sueldos viven aparte (como la tabla sueldos).
  const sueldos = new Map<string, number>();
  for (const [id, sueldo] of Object.entries(s.sueldos ?? {})) {
    if (sueldo != null) sueldos.set(id, sueldo);
  }
  const integrantes: Integrante[] = s.integrantes;
  const permisos = s.permisos ?? [];
  const suscripciones = s.suscripciones ?? [];
  // Quien usa la app: sin decirlo, el admin de la semilla.
  const yo = opciones.yo ?? integrantes.find((i) => i.admin)?.id ?? null;
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

  // Quién usa la app y qué puede: es_admin() y tiene_permiso() de la base. El admin pasa cualquier permiso;
  // un pagador externo, ninguno. Sin permiso, las escrituras rechazan con SIN_PERMISO (42501) aunque la base,
  // en las políticas de update y delete, las descarte sin error (cero filas).
  const filaYo = () => integrantes.find((i) => i.id === yo);
  const esAdmin = () => filaYo()?.admin === true;
  const tienePermiso = (permiso: Permiso) => {
    const f = filaYo();
    return !!f && f.tipo === 'integrante' && (f.admin || permisos.some((p) => p.integrante_id === f.id && p.permiso === permiso));
  };
  const exigirAdmin = () => {
    if (!esAdmin()) throw sinPermiso();
  };
  const exigirPermiso = (permiso: Permiso) => {
    if (!tienePermiso(permiso)) throw sinPermiso();
  };
  const quitarPermisosDe = (id: string) => {
    for (let k = permisos.length - 1; k >= 0; k--) if (permisos[k].integrante_id === id) permisos.splice(k, 1);
  };
  const copiaDe = (i: Integrante): Integrante => ({ ...i });
  const validarSueldo = (sueldo: number | null) => {
    if (sueldo !== null && !(Number.isInteger(sueldo) && sueldo >= 0)) throw violaCheck('sueldos', 'sueldo');
  };
  const guardarSueldo = (id: string, sueldo: number | null) => {
    if (sueldo === null) sueldos.delete(id);
    else sueldos.set(id, sueldo);
  };
  // Disparador integrantes_proteger, para un cambio hecho con sesión.
  function protegerCambio(antes: Integrante, despues: Integrante) {
    const cambiaAcceso =
      despues.email !== antes.email || despues.tipo !== antes.tipo || despues.activo !== antes.activo || despues.baja_desde !== antes.baja_desde;
    // Quien no es admin no cambia el email, el tipo ni la baja de quien es admin o tiene permisos.
    if (!esAdmin() && cambiaAcceso && (antes.admin || permisos.some((p) => p.integrante_id === antes.id))) throw sinPermiso();
    // Al admin no se lo pasa a externo ni se lo da de baja: primero cede el rol.
    if (
      antes.admin &&
      (despues.tipo !== 'integrante' || (antes.activo && !despues.activo) || (despues.baja_desde !== null && despues.baja_desde !== antes.baja_desde))
    ) {
      throw errorDeBase('ES_ADMIN', '42501');
    }
    // La columna admin cambia solo dentro de ceder_admin.
    if (despues.admin !== antes.admin) throw sinPermiso();
  }

  return {
    async miIntegrante(email) {
      const suya = integrantes.find((i) => i.email === email.toLowerCase());
      return suya ? copiaDe(suya) : null;
    },
    async integrantes() {
      return [...integrantes].sort(porNombre).map(copiaDe);
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

    async tieneCompras(productoId) {
      return items.some((i) => i.producto_id === productoId);
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
      const productosModo = gasto.modo === 'productos';
      const totalDeItems = () =>
        nuevosItems.reduce((t, it) => t + Math.round(Number(it.cantidad) * it.precio_unitario), 0);
      // Alta ya guardada (la respuesta anterior se perdió): se devuelve antes de cualquier control,
      // también el de mes cerrado, igual que guardar_gasto. Con otros datos avisa, en vez de esconderlos.
      const previo = !gasto.id && gasto.nuevo_id ? gastos.find((g) => g.id === gasto.nuevo_id) : undefined;
      if (previo) {
        if (
          previo.fecha !== gasto.fecha ||
          previo.pagado_por !== gasto.pagado_por ||
          previo.categoria_id !== (gasto.categoria_id || null) ||
          previo.nota !== (gasto.nota || null) ||
          previo.total !== (productosModo ? totalDeItems() : gasto.total)
        ) {
          throw errorDeBase('GASTO_YA_GUARDADO');
        }
        return previo.id;
      }
      // Sin la clave (web vieja) al editar se conservan los tildados que ya tenía; con `[]` se sacan.
      // Un producto repetido cuenta una vez, con la suma.
      const tildados = Array.isArray(gasto.tildados) ? sumarRepetidos(gasto.tildados) : null;
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
        // Por productos se borran y se vuelven a insertar: lo viejo resta y lo nuevo suma. Por total se van
        // los ítems con precio (un gasto que antes era por productos); los tildados se ajustan abajo.
        quitarItems(id, (it) => productosModo || it.precio_unitario !== null);
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
      const insertar = (it: (typeof aInsertar)[number]) => {
        items.push({ id: nuevoId(), gasto_id: id, producto_id: it.producto_id, cantidad: it.cantidad, precio_unitario: it.precio_unitario });
        sumarStock(it.producto_id, Number(it.cantidad));
      };
      if (productosModo) {
        aInsertar.forEach(insertar);
        g.total = totalDeItems();
      } else if (tildados) {
        // Solo la diferencia con lo que ya tenía (como guardar_gasto): se van los que no están (y copias
        // repetidas), cambia la cantidad de los que cambiaron (mueve la diferencia) y entran los nuevos.
        // Lo que no cambió no se toca: no vuelve el stock consumido ni se renueva ultimo_movimiento.
        const pedidos = new Map(tildados.map((t) => [t.producto_id, t.cantidad]));
        const vistos = new Set<string>();
        quitarItems(id, (it) => {
          if (it.precio_unitario !== null) return false;
          const quitar = !pedidos.has(it.producto_id) || vistos.has(it.producto_id);
          vistos.add(it.producto_id);
          return quitar;
        });
        for (const it of aInsertar) {
          const actual = items.find((x) => x.gasto_id === id && x.precio_unitario === null && x.producto_id === it.producto_id);
          if (!actual) insertar(it);
          else if (Number(actual.cantidad) !== Number(it.cantidad)) {
            sumarStock(it.producto_id, Number(it.cantidad) - Number(actual.cantidad));
            actual.cantidad = it.cantidad;
          }
        }
      }
      if (!productosModo && gasto.destino) {
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

    // Políticas y disparador de integrantes: altas y cambios piden «altas y bajas» (el admin pasa todo); el alta nace
    // sin admin; la columna admin no se toca. El sueldo no va por acá: tiene su tabla (fijarSueldo).
    async guardarIntegrante(i) {
      exigirPermiso('altas_bajas');
      const cambios: Partial<Omit<Integrante, 'creado'>> = Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined));
      if (cambios.email) cambios.email = cambios.email.toLowerCase();
      const antes = i.id ? integrantes.find((x) => x.id === i.id) : undefined;
      if (antes) protegerCambio(antes, { ...antes, ...cambios });
      if (cambios.color != null && !COLORES_PERFIL.includes(cambios.color)) throw violaCheck('integrantes', 'color');
      if (cambios.email && integrantes.some((x) => x.email === cambios.email && x.id !== i.id)) {
        throw errorDeBase('duplicate key value violates unique constraint "integrantes_email_key"', '23505');
      }

      let fila: Integrante;
      if (antes) {
        fila = antes;
        Object.assign(fila, cambios);
        // Un pagador externo no conserva permisos.
        if (fila.tipo !== 'integrante') quitarPermisosDe(fila.id);
      } else {
        fila = {
          nombre: '',
          email: '',
          activo: true,
          baja_desde: null,
          tipo: 'integrante',
          color: null,
          ...cambios,
          admin: false,
          id: i.id ?? nuevoId(),
          creado: ahora(),
        };
        integrantes.push(fila);
      }
      avisar();
      return copiaDe(fila);
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

    // Como la RPC cerrar_mes: solo con el permiso «sueldos», y compara lo que se usó para calcular con lo que hay
    // ahora (los sueldos, los de la tabla aparte).
    async cerrarMes(mes, resultado, gastosDelCalculo, integrantesDelCalculo) {
      exigirPermiso('sueldos');
      if (cierres.some((c) => c.mes === mes)) throw errorDeBase('MES_CERRADO');
      const clavesGastos = (lista: Array<Pick<Gasto, 'id' | 'total' | 'pagado_por'>>) =>
        new Set(lista.map((g) => JSON.stringify([g.id, Number(g.total), g.pagado_por])));
      const clavesIntegrantes = (lista: IntegranteDelCalculo[]) =>
        new Set(lista.map((i) => JSON.stringify([i.id, i.sueldo, i.tipo, i.activo, i.baja_desde])));
      const iguales = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
      const delMes = gastos.filter((g) => mesDe(g.fecha) === mes);
      if (
        !iguales(clavesGastos(delMes), clavesGastos(gastosDelCalculo)) ||
        !iguales(clavesIntegrantes(integrantes.map((i) => ({ ...i, sueldo: sueldos.get(i.id) ?? null }))), clavesIntegrantes(integrantesDelCalculo))
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
      exigirPermiso('sueldos');
      const i = cierres.findIndex((c) => c.mes === mes);
      if (i >= 0) cierres.splice(i, 1);
      avisar();
    },

    // mi_acceso(): solo las filas propias; el admin vuelve con la lista vacía (lo puede todo).
    async miAcceso() {
      const f = filaYo();
      return { admin: esAdmin(), permisos: f ? permisos.filter((p) => p.integrante_id === f.id).map((p) => p.permiso).sort() : [] };
    },
    async permisosDeLaCasa() {
      const porIntegrante: Record<string, Permiso[]> = {};
      for (const p of permisos) (porIntegrante[p.integrante_id] ??= []).push(p.permiso);
      for (const lista of Object.values(porIntegrante)) lista.sort();
      return porIntegrante;
    },
    // Políticas dar y quitar: solo el admin. Dar dos veces no duplica; solo un integrante recibe permisos
    // (disparador proteger_permiso: un pagador externo o alguien que no existe, no).
    async darPermiso(integranteId, permiso) {
      exigirAdmin();
      if (!integrantes.some((i) => i.id === integranteId && i.tipo === 'integrante')) {
        throw errorDeBase('SOLO_INTEGRANTES', '23514');
      }
      if (!permisos.some((p) => p.integrante_id === integranteId && p.permiso === permiso)) {
        permisos.push({ integrante_id: integranteId, permiso });
      }
      avisar();
    },
    async quitarPermiso(integranteId, permiso) {
      exigirAdmin();
      const i = permisos.findIndex((p) => p.integrante_id === integranteId && p.permiso === permiso);
      if (i >= 0) permisos.splice(i, 1);
      avisar();
    },
    // ceder_admin: a otro integrante activo. Quien cede se queda con los dos permisos como filas; el nuevo admin
    // pierde los suyos (ya lo puede todo).
    async cederAdmin(aIntegranteId) {
      exigirAdmin();
      const destino = integrantes.find((i) => i.id === aIntegranteId);
      if (!destino || destino.id === yo || destino.tipo !== 'integrante' || !destino.activo) {
        throw errorDeBase('DESTINO_INVALIDO', '22023');
      }
      (filaYo() as Integrante).admin = false;
      destino.admin = true;
      for (const permiso of PERMISOS) {
        if (!permisos.some((p) => p.integrante_id === yo && p.permiso === permiso)) permisos.push({ integrante_id: yo as string, permiso });
      }
      quitarPermisosDe(destino.id);
      avisar();
    },

    // La tabla sueldos: la lee y la escribe solo quien tiene «sueldos». Sin permiso, leer da cero filas ({}),
    // no un error.
    async sueldos() {
      return tienePermiso('sueldos') ? Object.fromEntries(sueldos) : {};
    },
    async fijarSueldo(integranteId, sueldo) {
      exigirPermiso('sueldos');
      validarSueldo(sueldo);
      if (sueldo !== null && !integrantes.some((i) => i.id === integranteId)) throw violaClave('sueldos');
      guardarSueldo(integranteId, sueldo);
      avisar();
    },

    // partes_del_mes: el sueldo de cada participante en partes por 10^12 del total, sin mostrar sueldos.
    // Redondeo exacto en BigInt (sueldo × 10^12 pasa de 2^53). Sin sueldo, 0; si la suma es 0, todos 0.
    async partesDelMes(mes) {
      if (!/^\d{4}-\d{2}$/.test(mes)) throw errorDeBase('MES_INVALIDO', '22023');
      const participantes = participantesDelMes(integrantes, mes).map((i) => ({ id: i.id, sueldo: BigInt(sueldos.get(i.id) ?? 0) }));
      const suma = participantes.reduce((t, p) => t + p.sueldo, 0n);
      return Object.fromEntries(
        participantes.map((p) => [p.id, suma > 0n ? Number((2n * p.sueldo * ESCALA_DE_PESOS + suma) / (2n * suma)) : 0]),
      );
    },

    // editar_perfil: solo el nombre y el color de quien usa la app.
    async editarPerfil(nombre, color) {
      const f = filaYo();
      if (!f) throw sinPermiso();
      if (!nombre.trim()) throw violaCheck('integrantes', 'nombre');
      if (color !== null && !COLORES_PERFIL.includes(color)) throw violaCheck('integrantes', 'color');
      f.nombre = nombre;
      f.color = color;
      avisar();
      return copiaDe(f);
    },

    // Como guardar_suscripcion y el RLS de suscripciones_push: cada uno maneja las suyas.
    async guardarSuscripcion({ endpoint, p256dh, auth }) {
      const f = filaYo();
      if (!f) throw sinPermiso();
      if (!esEndpointDePush(endpoint)) throw violaCheck('suscripciones_push', 'endpoint');
      if (p256dh.length < 80 || p256dh.length > 100) throw violaCheck('suscripciones_push', 'p256dh');
      if (auth.length < 16 || auth.length > 40) throw violaCheck('suscripciones_push', 'auth');
      // La renovada queda al final, como la más nueva; con más de MAX_SUSCRIPCIONES se van las más viejas.
      const k = suscripciones.findIndex((s) => s.endpoint === endpoint);
      if (k >= 0) suscripciones.splice(k, 1);
      suscripciones.push({ integrante_id: f.id, endpoint, p256dh, auth });
      const mias = suscripciones.filter((s) => s.integrante_id === f.id);
      for (const vieja of mias.slice(0, Math.max(0, mias.length - MAX_SUSCRIPCIONES))) suscripciones.splice(suscripciones.indexOf(vieja), 1);
    },

    async borrarSuscripcion(endpoint) {
      const k = suscripciones.findIndex((s) => s.endpoint === endpoint && s.integrante_id === yo);
      if (k >= 0) suscripciones.splice(k, 1);
    },

    async misSuscripciones() {
      return suscripciones.filter((s) => s.integrante_id === yo).map((s) => s.endpoint);
    },

    // Sin servidor de avisos: la casa de ejemplo no tiene clave.
    async clavePublicaAvisos() {
      return null;
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
const UN_DIA = 24 * 60 * 60 * 1000;
const dosDigitos = (n: number) => String(n).padStart(2, '0');
// Las fechas del stock se cuentan hacia atrás desde `hoy`: así «¿Todavía hay?» muestra lo mismo cualquier día.
const haceDias = (n: number, hoy: Date) => new Date(hoy.getTime() - n * UN_DIA).toISOString();
const persona = (id: string, nombre: string, admin = false): Integrante => ({
  id,
  nombre,
  email: `${nombre.toLowerCase()}@example.com`,
  activo: true,
  baja_desde: null,
  tipo: 'integrante',
  creado: CREADO,
  admin,
  color: null,
});
const prod = (
  id: string,
  nombre: string,
  categoria_id: string,
  stock: number,
  unidad: Unidad,
  movidoHaceDias: number,
  hoy: Date,
): Producto => ({
  id,
  codigo_barras: null,
  nombre,
  marca: null,
  categoria_id,
  stock,
  unidad,
  ultimo_movimiento: haceDias(movidoHaceDias, hoy),
  oculto: false,
  creado: CREADO,
});

/**
 * Casa de ejemplo: cada llamada arma una copia nueva (no se comparte estado). Las fechas salen de
 * `hoy`: gastos del mes en curso (ninguno con fecha futura) y del anterior, y el mes anterior ya
 * cerrado, con el reparto de los sueldos de la semilla.
 */
export function semillaDeEjemplo(hoy: Date = new Date()): Semilla {
  const esteMes = mesActual(hoy);
  const mesPasado = mesAnterior(esteMes);
  const diasDelMes = (mes: string) => new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
  // El día del mes recortado a lo que ya pasó: la demo no muestra gastos con fecha futura.
  const enCurso = (dia: number) => `${esteMes}-${dosDigitos(Math.min(dia, hoy.getDate()))}`;
  const enPasado = (dia: number) => `${mesPasado}-${dosDigitos(Math.min(dia, diasDelMes(mesPasado)))}`;
  const sellado = (fecha: string, hora: number) => `${fecha}T${dosDigitos(hora)}:00:00.000Z`;

  // Ana es la admin; Bruno y Caro, comunes y sin permisos. Los sueldos van aparte, como en la base.
  const integrantes = [persona('ejemplo-ana', 'Ana', true), persona('ejemplo-bruno', 'Bruno'), persona('ejemplo-caro', 'Caro')];
  const sueldos: Record<string, number> = { 'ejemplo-ana': 900_000_00, 'ejemplo-bruno': 600_000_00, 'ejemplo-caro': 500_000_00 };
  const categorias: Categoria[] = [
    { id: 'ejemplo-almacen', nombre: 'Almacén', tipo: 'producto', dias_sin_movimiento: 20 },
    { id: 'ejemplo-limpieza', nombre: 'Limpieza', tipo: 'producto', dias_sin_movimiento: 30 },
    { id: 'ejemplo-luz', nombre: 'Luz', tipo: 'servicio', dias_sin_movimiento: 20 },
    { id: 'ejemplo-internet', nombre: 'Internet', tipo: 'servicio', dias_sin_movimiento: 20 },
  ];
  // Arroz y Esponjas llevan semanas quietos: son los que «¿Todavía hay?» pregunta.
  const productos = [
    prod('ejemplo-yerba', 'Yerba', 'ejemplo-almacen', 1, 'paquete', 3, hoy),
    prod('ejemplo-leche', 'Leche', 'ejemplo-almacen', 0, 'litro', 9, hoy),
    prod('ejemplo-fideos', 'Fideos', 'ejemplo-almacen', 3, 'paquete', 4, hoy),
    prod('ejemplo-arroz', 'Arroz', 'ejemplo-almacen', 2, 'paquete', 41, hoy),
    prod('ejemplo-harina', 'Harina', 'ejemplo-almacen', 1.5, 'kg', 14, hoy),
    prod('ejemplo-detergente', 'Detergente', 'ejemplo-limpieza', 0, 'unidad', 6, hoy),
    prod('ejemplo-lavandina', 'Lavandina', 'ejemplo-limpieza', 2, 'unidad', 4, hoy),
    prod('ejemplo-esponjas', 'Esponjas', 'ejemplo-limpieza', 4, 'unidad', 36, hoy),
  ];
  const anotaciones: Anotacion[] = [
    { id: 'ejemplo-nota-pan', texto: 'Comprar pan', creado_por: 'ejemplo-ana', creado: haceDias(2, hoy) },
    { id: 'ejemplo-nota-pilas', texto: 'Pilas AA para el control', creado_por: 'ejemplo-bruno', creado: haceDias(1, hoy) },
  ];

  const gastos: Gasto[] = [
    // Mes anterior (abajo queda cerrado).
    {
      id: 'ejemplo-gasto-verdu-pasado',
      fecha: enPasado(4),
      pagado_por: 'ejemplo-ana',
      total: 18_500_00,
      modo: 'total',
      categoria_id: 'ejemplo-almacen',
      nota: 'Verdulería',
      creado_por: 'ejemplo-ana',
      creado: sellado(enPasado(4), 11),
      mp_operacion: null,
    },
    {
      id: 'ejemplo-gasto-super-pasado',
      fecha: enPasado(9),
      pagado_por: 'ejemplo-bruno',
      total: 7_600_00,
      modo: 'productos',
      categoria_id: null,
      nota: 'Súper',
      creado_por: 'ejemplo-bruno',
      creado: sellado(enPasado(9), 18),
      mp_operacion: null,
      gasto_items: [
        { id: 'ejemplo-item-pasado-1', gasto_id: 'ejemplo-gasto-super-pasado', producto_id: 'ejemplo-leche', cantidad: 2, precio_unitario: 1_300_00 },
        { id: 'ejemplo-item-pasado-2', gasto_id: 'ejemplo-gasto-super-pasado', producto_id: 'ejemplo-harina', cantidad: 1, precio_unitario: 1_800_00 },
        { id: 'ejemplo-item-pasado-3', gasto_id: 'ejemplo-gasto-super-pasado', producto_id: 'ejemplo-detergente', cantidad: 1, precio_unitario: 3_200_00 },
      ],
    },
    {
      id: 'ejemplo-gasto-farmacia-pasado',
      fecha: enPasado(14),
      pagado_por: 'ejemplo-caro',
      total: 12_800_00,
      modo: 'total',
      categoria_id: null,
      nota: 'Farmacia',
      creado_por: 'ejemplo-caro',
      creado: sellado(enPasado(14), 17),
      mp_operacion: null,
    },
    {
      id: 'ejemplo-gasto-luz-pasado',
      fecha: enPasado(18),
      pagado_por: 'ejemplo-bruno',
      total: 39_400_00,
      modo: 'total',
      categoria_id: 'ejemplo-luz',
      nota: 'Luz',
      creado_por: 'ejemplo-bruno',
      creado: sellado(enPasado(18), 10),
      mp_operacion: null,
    },
    {
      id: 'ejemplo-gasto-internet-pasado',
      fecha: enPasado(22),
      pagado_por: 'ejemplo-caro',
      total: 22_000_00,
      modo: 'total',
      categoria_id: 'ejemplo-internet',
      nota: 'Internet',
      creado_por: 'ejemplo-caro',
      creado: sellado(enPasado(22), 9),
      mp_operacion: null,
    },
    // Mes en curso (sin cerrar).
    {
      id: 'ejemplo-gasto-verdu',
      fecha: enCurso(2),
      pagado_por: 'ejemplo-bruno',
      total: 16_900_00,
      modo: 'total',
      categoria_id: 'ejemplo-almacen',
      nota: 'Verdulería',
      creado_por: 'ejemplo-bruno',
      creado: sellado(enCurso(2), 11),
      mp_operacion: null,
    },
    {
      id: 'ejemplo-gasto-super',
      fecha: enCurso(5),
      pagado_por: 'ejemplo-ana',
      total: 12_400_00,
      modo: 'productos',
      categoria_id: null,
      nota: 'Súper',
      creado_por: 'ejemplo-ana',
      creado: sellado(enCurso(5), 18),
      mp_operacion: null,
      gasto_items: [
        { id: 'ejemplo-item-1', gasto_id: 'ejemplo-gasto-super', producto_id: 'ejemplo-yerba', cantidad: 1, precio_unitario: 5_200_00 },
        { id: 'ejemplo-item-2', gasto_id: 'ejemplo-gasto-super', producto_id: 'ejemplo-fideos', cantidad: 3, precio_unitario: 1_400_00 },
        { id: 'ejemplo-item-3', gasto_id: 'ejemplo-gasto-super', producto_id: 'ejemplo-lavandina', cantidad: 2, precio_unitario: 1_500_00 },
      ],
    },
    {
      id: 'ejemplo-gasto-farmacia',
      fecha: enCurso(7),
      pagado_por: 'ejemplo-caro',
      total: 9_700_00,
      modo: 'total',
      categoria_id: null,
      nota: 'Farmacia',
      creado_por: 'ejemplo-caro',
      creado: sellado(enCurso(7), 17),
      mp_operacion: null,
    },
    {
      id: 'ejemplo-gasto-luz',
      fecha: enCurso(9),
      pagado_por: 'ejemplo-bruno',
      total: 41_100_00,
      modo: 'total',
      categoria_id: 'ejemplo-luz',
      nota: 'Luz',
      creado_por: 'ejemplo-bruno',
      creado: sellado(enCurso(9), 10),
      mp_operacion: null,
    },
    {
      id: 'ejemplo-gasto-internet',
      fecha: enCurso(11),
      pagado_por: 'ejemplo-caro',
      total: 22_000_00,
      modo: 'total',
      categoria_id: 'ejemplo-internet',
      nota: 'Internet',
      creado_por: 'ejemplo-caro',
      creado: sellado(enCurso(11), 9),
      mp_operacion: null,
    },
  ];

  // El mes pasado quedó cerrado: el reparto sale de sus gastos y los sueldos de la semilla.
  const delPasado = gastos.filter((g) => mesDe(g.fecha) === mesPasado);
  const reparto = repartoDelMes(integrantesConPeso(integrantes, sueldos), mesPasado, delPasado);
  const cierres: Cierre[] = reparto.ok
    ? [
        {
          mes: mesPasado,
          total: reparto.total,
          detalle: { filas: reparto.filas, transferencias: reparto.transferencias },
          cerrado_por: 'ejemplo-ana',
          fecha: sellado(enPasado(diasDelMes(mesPasado)), 20),
        },
      ]
    : [];

  return { integrantes, categorias, productos, anotaciones, gastos, cierres, permisos: [], sueldos };
}
