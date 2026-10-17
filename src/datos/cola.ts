// Cola de escritura: si no hay red, guardar un gasto queda pendiente en el dispositivo
// y se manda cuando vuelve la conexión, en el mismo orden.
// Solo entra lo que la base puede recibir dos veces sin duplicar: guardar_gasto lo es por
// nuevo_id (on conflict do nothing): con los `tildados` y las `anotaciones` que lleva el gasto, un
// reintento tras un corte no suma el stock ni borra notas dos veces. ajustar_stock_producto no (ver
// ajustarStock en conCola).
// Cada op guarda quién la creó: sale solo con la sesión de ese integrante, nunca con otra
// cuenta que entre después en el mismo teléfono. Las de otra cuenta esperan, no se descartan.

import { nuevoId } from './id';
import type { Datos, GastoAGuardar, ItemAGuardar } from './tipos';

export type TipoOp = 'guardarGasto';
/** Op tal como queda en la cola: `duenio` es el id del integrante que la creó. */
export type Op = { id: string; tipo: TipoOp; datos: unknown; duenio: string };
/** Op a encolar: la cola le pone el dueño (el integrante con sesión en ese momento). */
export type OpNueva = Omit<Op, 'duenio'>;

/** La forma de AsyncStorage: se le puede pasar directo. */
export type Almacen = {
  getItem(clave: string): Promise<string | null>;
  setItem(clave: string, valor: string): Promise<void>;
};

export type OpcionesCola = {
  almacen: Almacen;
  ejecutar(op: Op): Promise<unknown>;
  esErrorDeRed(e: unknown): boolean;
  /** Una op pendiente que la base rechazó de forma definitiva: ya pasó a `rechazadas`. */
  alDescartar?(op: Op, error: unknown): void;
  /** Id del integrante con sesión lista, o `null` si no hay (cargando, sin sesión, cuenta ajena). */
  integranteActual(): string | null;
  clave?: string;
  /** Reloj inyectable (pruebas): marca cuándo se rechazó una op y nombra la copia de un valor corrupto. */
  ahora?(): Date;
};

export type ResultadoEncolar = { estado: 'hecho'; resultado: unknown } | { estado: 'en-cola' };

/** Op que la base rechazó de forma definitiva: salió de la cola pero queda guardada para mostrarla. */
export type Rechazada = { op: Op; code: string; message: string; cuando: string };

export type Cola = {
  /** Rechaza con SIN_SESION si no hay integrante con sesión lista. */
  encolar(op: OpNueva): Promise<ResultadoEncolar>;
  vaciar(): Promise<void>;
  pendientes(): Promise<Op[]>;
  /** Las ops rechazadas por la base, en el orden en que se rechazaron (de todos los dueños: ver `op.duenio`). */
  rechazadas(): Promise<Rechazada[]>;
  /** Saca una rechazada de la lista (la persona ya la vio). */
  olvidarRechazada(opId: string): Promise<void>;
};

// fetch sin red: 'Network request failed' en React Native, 'Failed to fetch' en Chrome,
// 'NetworkError…' en Firefox, 'Load failed' en Safari. postgrest-js no lanza el TypeError:
// lo devuelve como { message: 'TypeError: Failed to fetch' }. Auth lo marca por nombre.
const MENSAJE_DE_RED = /Network request failed|Failed to fetch|NetworkError|Load failed/i;
const NOMBRES_DE_RED = new Set(['AuthRetryableFetchError', 'FunctionsFetchError']);

export function esErrorDeRed(e: unknown): boolean {
  if (e == null || typeof e !== 'object') return false;
  const { message, name } = e as { message?: unknown; name?: unknown };
  if (typeof name === 'string' && NOMBRES_DE_RED.has(name)) return true;
  return typeof message === 'string' && MENSAJE_DE_RED.test(message);
}

/**
 * Un rechazo que no cambia al reintentar: las excepciones de negocio de la RPC (P0001: MES_CERRADO,
 * SIN_ITEMS, GASTO_INEXISTENTE…), integridad (23xxx) y datos inválidos (22xxx). Todo lo demás
 * (red, 5xx, timeout 57014, JWT vencido PGRST301, 42501 tras un token sin renovar, desconocido)
 * puede andar más tarde: la op se queda en la cola.
 */
export function esRechazoDefinitivo(e: unknown): boolean {
  if (e == null || typeof e !== 'object') return false;
  const { code } = e as { code?: unknown };
  return typeof code === 'string' && (code === 'P0001' || /^2[23][0-9A-Z]{3}$/.test(code));
}

function rechazoDe(op: Op, e: unknown, cuando: Date): Rechazada {
  const { code, message } = (e ?? {}) as { code?: unknown; message?: unknown };
  return {
    op,
    code: String(code ?? ''),
    message: typeof message === 'string' ? message : String(e),
    cuando: cuando.toISOString(),
  };
}

export function crearCola({
  almacen,
  ejecutar,
  esErrorDeRed,
  alDescartar,
  integranteActual,
  clave = 'cola-escritura',
  ahora = () => new Date(),
}: OpcionesCola): Cola {
  const claveRechazadas = `${clave}-rechazadas`;
  // Todo pasa de a uno: dos vaciar() a la vez no mandan la misma op dos veces.
  let turno: Promise<unknown> = Promise.resolve();
  function enTurno<T>(fn: () => Promise<T>): Promise<T> {
    const p = turno.then(fn);
    turno = p.catch(() => undefined);
    return p;
  }

  // Un valor que no es una lista (corrupto, de otra versión) no puede trabar todos los guardados:
  // se copia aparte, sin perderlo, y se arranca con la lista vacía.
  async function leerLista<T>(k: string): Promise<T[]> {
    const texto = await almacen.getItem(k);
    if (!texto) return [];
    try {
      const valor: unknown = JSON.parse(texto);
      if (Array.isArray(valor)) return valor as T[];
    } catch {
      // Sigue abajo: se aparta igual que un valor que no es lista.
    }
    await almacen.setItem(`${k}-corrupta-${ahora().getTime()}`, texto);
    await almacen.setItem(k, '[]');
    return [];
  }
  const leer = () => leerLista<Op>(clave);
  const escribir = (ops: Op[]) => almacen.setItem(clave, JSON.stringify(ops));
  const leerRechazadas = () => leerLista<Rechazada>(claveRechazadas);
  const escribirRechazadas = (rs: Rechazada[]) => almacen.setItem(claveRechazadas, JSON.stringify(rs));

  // Manda en orden las pendientes del integrante con sesión; las de otro quedan en su lugar.
  // El dueño se mira antes de cada op: si la sesión cambia a mitad, se corta ahí.
  // Un rechazo definitivo de la base pasa la op a `rechazadas` (reintentarla daría lo mismo) y
  // sigue con la próxima. Cualquier otro error (red, servidor, sesión vencida, desconocido) corta
  // el pase y deja la op en su lugar: las de atrás no se le adelantan.
  async function vaciarAhora(): Promise<Op[]> {
    let ops = await leer();
    let i = 0;
    while (i < ops.length) {
      const yo = integranteActual();
      if (!yo) return ops;
      const op = ops[i];
      if (op.duenio !== yo) {
        i++;
        continue;
      }
      try {
        await ejecutar(op);
      } catch (e) {
        if (esErrorDeRed(e) || !esRechazoDefinitivo(e)) return ops;
        // Primero se guarda como rechazada y después sale de la cola: si algo se corta en el medio,
        // queda en los dos lados (se reemplaza por id, no se duplica), nunca perdida.
        const rs = await leerRechazadas();
        await escribirRechazadas([...rs.filter((r) => r.op.id !== op.id), rechazoDe(op, e, ahora())]);
        alDescartar?.(op, e);
      }
      ops = [...ops.slice(0, i), ...ops.slice(i + 1)];
      await escribir(ops);
    }
    return ops;
  }

  return {
    encolar: (nueva) =>
      enTurno(async () => {
        const yo = integranteActual();
        if (!yo) throw errorSinSesion();
        const op: Op = { ...nueva, duenio: yo };
        // Si quedan pendientes de este integrante, esta va detrás de ellas.
        const quedan = await vaciarAhora();
        if (quedan.some((o) => o.duenio === yo)) {
          await escribir([...quedan, op]);
          return { estado: 'en-cola' };
        }
        try {
          return { estado: 'hecho', resultado: await ejecutar(op) };
        } catch (e) {
          if (!esErrorDeRed(e)) throw e;
          await escribir([...quedan, op]);
          return { estado: 'en-cola' };
        }
      }),
    vaciar: () => enTurno(async () => void (await vaciarAhora())),
    pendientes: () => enTurno(leer),
    rechazadas: () => enTurno(leerRechazadas),
    olvidarRechazada: (opId) =>
      enTurno(async () => {
        const rs = await leerRechazadas();
        await escribirRechazadas(rs.filter((r) => r.op.id !== opId));
      }),
  };
}

// ——— Datos con cola: guardarGasto pasa por la cola; el resto de las escrituras va directo ———

export type GuardadoDeGasto = { estado: 'hecho' | 'en-cola'; id: string };

export type DatosConCola = Omit<Datos, 'guardarGasto'> & {
  guardarGasto(gasto: GastoAGuardar, items: ItemAGuardar[]): Promise<GuardadoDeGasto>;
};

/** Error que la UI puede mostrar tal cual: `code` distingue el caso, `message` es para la persona. */
export type ErrorConCodigo = Error & { code: string };

export function errorSinConexion(que = 'el cambio de stock'): ErrorConCodigo {
  return Object.assign(new Error(`Sin conexión: no se guardó ${que}. Probá de nuevo.`), {
    code: 'SIN_CONEXION',
  });
}

/** Escribir sin un integrante con sesión lista: no se manda ni se guarda para después. */
export function errorSinSesion(): ErrorConCodigo {
  return Object.assign(new Error('Tenés que ingresar con tu cuenta de la casa para guardar.'), {
    code: 'SIN_SESION',
  });
}

/** Lo que queda guardado de la op: `gasto` con sus `tildados` y `anotaciones`, tal como van a la base. */
type DatosGuardarGasto = { gasto: GastoAGuardar; items: ItemAGuardar[] };

/** Cómo se manda cada op a la base. */
export function ejecutorDe(datos: Datos): (op: Op) => Promise<unknown> {
  return async (op) => {
    if (op.tipo !== 'guardarGasto') throw new Error(`Op desconocida: ${String(op.tipo)}`);
    const { gasto, items } = op.datos as DatosGuardarGasto;
    return datos.guardarGasto(gasto, items);
  };
}

export function conCola(datos: Datos, cola: Cola, esDeRed: (e: unknown) => boolean = esErrorDeRed): DatosConCola {
  return {
    ...datos,
    // El alta lleva nuevo_id desde ya: si se reintenta, la base no la duplica.
    async guardarGasto(gasto, items) {
      const g: GastoAGuardar = gasto.id ? gasto : { ...gasto, nuevo_id: gasto.nuevo_id ?? nuevoId() };
      const datosOp: DatosGuardarGasto = { gasto: g, items };
      const r = await cola.encolar({ id: nuevoId(), tipo: 'guardarGasto', datos: datosOp });
      const id = (g.id ?? g.nuevo_id) as string;
      return r.estado === 'hecho' ? { estado: 'hecho', id: String(r.resultado) } : { estado: 'en-cola', id };
    },
    // No se encola: ajustar_stock_producto suma un delta sin clave de idempotencia. Si la base
    // confirmó pero la respuesta se perdió, reenviarlo lo aplicaría dos veces. Sin red, se avisa
    // y la persona lo vuelve a tocar. F10: clave de idempotencia en la RPC (pide migración).
    ajustarStock: (productoId, delta) => directo(() => datos.ajustarStock(productoId, delta)),
    // Tampoco se encolan: son rápidas de repetir a mano y, sin clave de idempotencia, un reintento
    // de crearAnotacion la duplicaría. Sin red, se avisa igual que con el stock.
    crearAnotacion: (texto) => directo(() => datos.crearAnotacion(texto), 'la nota'),
    borrarAnotacion: (id) => directo(() => datos.borrarAnotacion(id), 'el cambio en la nota'),
    editarProducto: (p) => directo(() => datos.editarProducto(p), 'el cambio del producto'),
    confirmarHay: (id) => directo(() => datos.confirmarHay(id), 'el cambio de stock'),
  };

  async function directo<T>(fn: () => Promise<T>, que?: string): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (esDeRed(e)) throw errorSinConexion(que);
      throw e;
    }
  }
}
