// Todas las consultas a Supabase, como stock-hogar/js/datos.js. Cada función lanza el error de Supabase si falla.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Categoria, Cierre, Gasto, GastoItem, Integrante, Producto } from '@/logica/tipos';

import type { Datos, GastoConItems, GastoDeOperacion } from './tipos';

type Respuesta<T> = { data: T | null; error: unknown };

function ok<T>({ data, error }: Respuesta<T>): T {
  if (error) throw error;
  return data as T;
}

// Supabase corta cada respuesta en 1000 filas sin avisar: gastosEntre pide de a páginas.
const PAGINA = 1000;

export function crearDatosSupabase(supabase: SupabaseClient): Datos {
  async function guardar<T>(tabla: string, fila: { id?: string | null }): Promise<T> {
    const { id, ...campos } = fila;
    const consulta = id ? supabase.from(tabla).update(campos).eq('id', id) : supabase.from(tabla).insert(campos);
    return ok<T>(await consulta.select().single());
  }

  return {
    async miIntegrante(email) {
      return ok<Integrante | null>(
        await supabase.from('integrantes').select('*').eq('email', email.toLowerCase()).maybeSingle(),
      );
    },
    async integrantes() {
      return ok<Integrante[]>(await supabase.from('integrantes').select('*').order('nombre'));
    },
    guardarIntegrante: (i) => guardar<Integrante>('integrantes', i),
    async categorias() {
      return ok<Categoria[]>(await supabase.from('categorias').select('*').order('nombre'));
    },
    guardarCategoria: (c) => guardar<Categoria>('categorias', c),
    async borrarCategoria(id) {
      ok(await supabase.from('categorias').delete().eq('id', id));
    },
    async productos() {
      return ok<Producto[]>(await supabase.from('productos').select('*').order('nombre'));
    },
    async crearProducto(p) {
      return ok<Producto>(await supabase.from('productos').insert(p).select().single());
    },
    async borrarProducto(id) {
      ok(await supabase.from('productos').delete().eq('id', id));
    },
    async ocultarProducto(id, oculto) {
      ok(await supabase.from('productos').update({ oculto }).eq('id', id));
    },
    async producto(id) {
      return ok<Producto | null>(await supabase.from('productos').select('*').eq('id', id).maybeSingle());
    },
    async ajustarStock(productoId, delta) {
      return Number(ok(await supabase.rpc('ajustar_stock_producto', { p_producto: productoId, p_delta: delta })));
    },

    async gastosEntre(desde, hastaExcl) {
      const todos: GastoConItems[] = [];
      for (let inicio = 0; ; inicio += PAGINA) {
        let q = supabase
          .from('gastos')
          .select('*, gasto_items(cantidad, precio_unitario, productos(nombre, categoria_id))');
        if (desde) q = q.gte('fecha', desde);
        if (hastaExcl) q = q.lt('fecha', hastaExcl);
        const filas = ok<GastoConItems[]>(
          await q
            .order('fecha', { ascending: false })
            .order('creado', { ascending: false })
            .order('id')
            .range(inicio, inicio + PAGINA - 1),
        );
        todos.push(...filas);
        if (filas.length < PAGINA) return todos;
      }
    },

    async gasto(id) {
      const { gasto_items: items, ...resto } = ok<Gasto & { gasto_items: GastoItem[] }>(
        await supabase.from('gastos').select('*, gasto_items(*)').eq('id', id).single(),
      );
      return { gasto: resto, items };
    },
    async guardarGasto(gasto, items) {
      return ok<string>(await supabase.rpc('guardar_gasto', { p_gasto: gasto, p_items: items }));
    },
    async borrarGasto(id) {
      ok(await supabase.from('gastos').delete().eq('id', id));
    },
    async gastoPorOperacion(operacion) {
      return ok<GastoDeOperacion | null>(
        await supabase.from('gastos').select('id, fecha, pagado_por').eq('mp_operacion', operacion).maybeSingle(),
      );
    },
    async categoriaDeDestino(nombre) {
      const fila = ok<{ categoria_id: string | null } | null>(
        await supabase.from('destinos').select('categoria_id').eq('nombre', nombre).maybeSingle(),
      );
      return fila?.categoria_id ?? null;
    },

    async mesesCerrados() {
      const filas = ok<Array<{ mes: string }>>(await supabase.from('cierres').select('mes'));
      return new Set(filas.map((f) => f.mes));
    },
    async cierre(mes) {
      return ok<Cierre | null>(await supabase.from('cierres').select('*').eq('mes', mes).maybeSingle());
    },
    // La base compara los gastos y los integrantes con los que se calculó el reparto:
    // si alguien cargó o cambió algo mientras tanto, no cierra (CIERRE_DESACTUALIZADO).
    async cerrarMes(mes, resultado, gastos, integrantes) {
      ok(
        await supabase.rpc('cerrar_mes', {
          p_mes: mes,
          p_total: resultado.total,
          p_detalle: { filas: resultado.filas, transferencias: resultado.transferencias },
          p_gastos: gastos.map(({ id, total, pagado_por }) => ({ id, total, pagado_por })),
          p_integrantes: integrantes.map(({ id, sueldo, tipo, activo, baja_desde }) => ({
            id,
            sueldo,
            tipo,
            activo,
            baja_desde,
          })),
        }),
      );
    },
    async reabrirMes(mes) {
      ok(await supabase.rpc('reabrir_mes', { p_mes: mes }));
    },

    escucharCambios: (alCambiar) => escucharCambios(supabase, alCambiar),
  };
}

// ——— Tiempo real: un solo canal por cliente, compartido por todas las pantallas que escuchan ———
// realtime-js devuelve el canal que ya existe con ese nombre, y sumarle un .on() después de
// subscribe() lanza; además, removeChannel lo cierra para todos. Por eso el canal se abre con el
// primer oyente, reparte cada cambio a todos y se cierra recién cuando se va el último.

type CanalCompartido = { oyentes: Set<() => void>; cerrar(): void };
const canales = new WeakMap<SupabaseClient, CanalCompartido>();
// Cada canal abierto lleva un nombre nuevo: si uno se está cerrando, el siguiente no lo reutiliza.
let abiertos = 0;

function abrirCanal(supabase: SupabaseClient): CanalCompartido {
  const oyentes = new Set<() => void>();
  const avisar = () => [...oyentes].forEach((f) => f());
  // Si el canal se cae y vuelve, se avisa igual: lo que cambió durante el corte no llegó.
  let caido = false;
  const canal = supabase
    .channel(`casa-${++abiertos}`)
    .on('postgres_changes', { event: '*', schema: 'public' }, avisar)
    .subscribe((estado) => {
      if (estado === 'SUBSCRIBED' && caido) avisar();
      caido = estado !== 'SUBSCRIBED';
    });
  return {
    oyentes,
    cerrar: () => void supabase.removeChannel(canal),
  };
}

function escucharCambios(supabase: SupabaseClient, alCambiar: () => void): () => void {
  let compartido = canales.get(supabase);
  if (!compartido) {
    compartido = abrirCanal(supabase);
    canales.set(supabase, compartido);
  }
  const c = compartido;
  // Un envoltorio propio: el mismo `alCambiar` registrado dos veces cuenta como dos oyentes.
  const oyente = () => alCambiar();
  c.oyentes.add(oyente);
  return () => {
    if (!c.oyentes.delete(oyente) || c.oyentes.size > 0) return;
    if (canales.get(supabase) === c) canales.delete(supabase);
    c.cerrar();
  };
}
