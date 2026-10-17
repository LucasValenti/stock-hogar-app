// Cola de escritura: si no hay red, guardar un gasto o ajustar el stock queda pendiente
// en el dispositivo y se manda cuando vuelve la conexión, en el mismo orden.

import { nuevoId } from './id';
import type { Datos, GastoAGuardar, ItemAGuardar } from './tipos';

export type TipoOp = 'guardarGasto' | 'ajustarStock';
export type Op = { id: string; tipo: TipoOp; datos: unknown };

/** La forma de AsyncStorage: se le puede pasar directo. */
export type Almacen = {
  getItem(clave: string): Promise<string | null>;
  setItem(clave: string, valor: string): Promise<void>;
};

export type OpcionesCola = {
  almacen: Almacen;
  ejecutar(op: Op): Promise<unknown>;
  esErrorDeRed(e: unknown): boolean;
  /** Una op pendiente que la base rechazó (no por red): ya salió de la cola. */
  alDescartar?(op: Op, error: unknown): void;
  clave?: string;
};

export type ResultadoEncolar = { estado: 'hecho'; resultado: unknown } | { estado: 'en-cola' };

export type Cola = {
  encolar(op: Op): Promise<ResultadoEncolar>;
  vaciar(): Promise<void>;
  pendientes(): Promise<Op[]>;
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

export function crearCola({ almacen, ejecutar, esErrorDeRed, alDescartar, clave = 'cola-escritura' }: OpcionesCola): Cola {
  // Todo pasa de a uno: dos vaciar() a la vez no mandan la misma op dos veces.
  let turno: Promise<unknown> = Promise.resolve();
  function enTurno<T>(fn: () => Promise<T>): Promise<T> {
    const p = turno.then(fn);
    turno = p.catch(() => undefined);
    return p;
  }

  async function leer(): Promise<Op[]> {
    const texto = await almacen.getItem(clave);
    return texto ? (JSON.parse(texto) as Op[]) : [];
  }
  const escribir = (ops: Op[]) => almacen.setItem(clave, JSON.stringify(ops));

  // Manda las pendientes en orden. Ante un corte se detiene y deja el resto; un rechazo
  // de la base saca esa op (reintentarla daría lo mismo) y sigue con la próxima.
  async function vaciarAhora(): Promise<Op[]> {
    let ops = await leer();
    while (ops.length) {
      const [primera, ...resto] = ops;
      try {
        await ejecutar(primera);
      } catch (e) {
        if (esErrorDeRed(e)) return ops;
        alDescartar?.(primera, e);
      }
      ops = resto;
      await escribir(ops);
    }
    return ops;
  }

  return {
    encolar: (op) =>
      enTurno(async () => {
        // Si hay pendientes, esta va detrás de ellas.
        const quedan = await vaciarAhora();
        if (quedan.length) {
          await escribir([...quedan, op]);
          return { estado: 'en-cola' };
        }
        try {
          return { estado: 'hecho', resultado: await ejecutar(op) };
        } catch (e) {
          if (!esErrorDeRed(e)) throw e;
          await escribir([op]);
          return { estado: 'en-cola' };
        }
      }),
    vaciar: () => enTurno(async () => void (await vaciarAhora())),
    pendientes: () => enTurno(leer),
  };
}

// ——— Datos con cola: guardarGasto y ajustarStock pasan por la cola ———

export type GuardadoDeGasto = { estado: 'hecho' | 'en-cola'; id: string };
export type AjusteDeStock = { estado: 'hecho'; stock: number } | { estado: 'en-cola' };

export type DatosConCola = Omit<Datos, 'guardarGasto' | 'ajustarStock'> & {
  guardarGasto(gasto: GastoAGuardar, items: ItemAGuardar[]): Promise<GuardadoDeGasto>;
  ajustarStock(productoId: string, delta: number): Promise<AjusteDeStock>;
};

type DatosGuardarGasto = { gasto: GastoAGuardar; items: ItemAGuardar[] };
type DatosAjustarStock = { productoId: string; delta: number };

/** Cómo se manda cada op a la base. */
export function ejecutorDe(datos: Datos): (op: Op) => Promise<unknown> {
  return async (op) => {
    switch (op.tipo) {
      case 'guardarGasto': {
        const { gasto, items } = op.datos as DatosGuardarGasto;
        return datos.guardarGasto(gasto, items);
      }
      case 'ajustarStock': {
        const { productoId, delta } = op.datos as DatosAjustarStock;
        return datos.ajustarStock(productoId, delta);
      }
      default:
        throw new Error(`Op desconocida: ${String((op as Op).tipo)}`);
    }
  };
}

export function conCola(datos: Datos, cola: Cola): DatosConCola {
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
    async ajustarStock(productoId, delta) {
      const datosOp: DatosAjustarStock = { productoId, delta };
      const r = await cola.encolar({ id: nuevoId(), tipo: 'ajustarStock', datos: datosOp });
      return r.estado === 'hecho' ? { estado: 'hecho', stock: Number(r.resultado) } : { estado: 'en-cola' };
    },
  };
}
