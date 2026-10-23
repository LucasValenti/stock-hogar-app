// Todas las consultas a Supabase, como stock-hogar/js/datos.js. Cada función lanza el error de Supabase si falla.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Acceso, Anotacion, Categoria, Cierre, Gasto, GastoItem, Integrante, Permiso, Producto } from '@/logica/tipos';

import { normalizarTimestamp } from './fechas';
import type { Datos, GastoConItems, GastoDeOperacion } from './tipos';

type Respuesta<T> = { data: T | null; error: unknown };

function ok<T>({ data, error }: Respuesta<T>): T {
  if (error) throw error;
  return data as T;
}

// Supabase corta cada respuesta en 1000 filas sin avisar: gastosEntre pide de a páginas.
const PAGINA = 1000;

// Los timestamptz que la app lee como fecha (ultimo_movimiento, anotaciones.creado) salen en ISO con milisegundos.
const aProducto = (p: Producto): Producto => ({
  ...p,
  ultimo_movimiento: normalizarTimestamp(p.ultimo_movimiento),
  creado: normalizarTimestamp(p.creado),
});
const aAnotacion = (a: Anotacion): Anotacion => ({ ...a, creado: normalizarTimestamp(a.creado) });

// Bajo RLS, un update o delete sin permiso no falla: la política lo descarta y afecta cero filas.
// Quien lo detecta lanza el mismo error que la base en memoria y que las funciones de la base.
const sinPermiso = (): Error & { code: string } => Object.assign(new Error('SIN_PERMISO'), { code: '42501' });

export function crearDatosSupabase(supabase: SupabaseClient): Datos {
  async function guardar<T>(tabla: string, fila: { id?: string | null }): Promise<T> {
    const { id, ...campos } = fila;
    const consulta = id ? supabase.from(tabla).update(campos).eq('id', id) : supabase.from(tabla).insert(campos);
    return ok<T>(await consulta.select().single());
  }

  async function miIntegrante(email: string) {
    return ok<Integrante | null>(await supabase.from('integrantes').select('*').eq('email', email.toLowerCase()).maybeSingle());
  }
  async function miAcceso() {
    return ok<Acceso>(await supabase.rpc('mi_acceso'));
  }

  return {
    miIntegrante,
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
      return ok<Producto[]>(await supabase.from('productos').select('*').order('nombre')).map(aProducto);
    },
    async crearProducto(p) {
      return aProducto(ok<Producto>(await supabase.from('productos').insert(p).select().single()));
    },
    // Campo por campo: una copia vieja del producto no puede pisar el stock, el código ni lo oculto.
    async editarProducto({ id, nombre, marca, categoria_id, unidad }) {
      const cambios = { nombre, marca, categoria_id, unidad };
      return aProducto(ok<Producto>(await supabase.from('productos').update(cambios).eq('id', id).select().single()));
    },
    async borrarProducto(id) {
      ok(await supabase.from('productos').delete().eq('id', id));
    },
    async ocultarProducto(id, oculto) {
      ok(await supabase.from('productos').update({ oculto }).eq('id', id));
    },
    // Alcanza con saber si hay uno: la clave foránea de gasto_items es la que impide borrarlo.
    async tieneCompras(productoId) {
      return ok<unknown[]>(await supabase.from('gasto_items').select('id').eq('producto_id', productoId).limit(1)).length > 0;
    },
    async producto(id) {
      const fila = ok<Producto | null>(await supabase.from('productos').select('*').eq('id', id).maybeSingle());
      return fila && aProducto(fila);
    },
    async ajustarStock(productoId, delta) {
      return Number(ok(await supabase.rpc('ajustar_stock_producto', { p_producto: productoId, p_delta: delta })));
    },
    async confirmarHay(productoId) {
      ok(await supabase.rpc('confirmar_hay', { p_producto: productoId }));
    },

    async anotaciones() {
      return ok<Anotacion[]>(await supabase.from('anotaciones').select('*').order('creado')).map(aAnotacion);
    },
    // Solo el texto: creado_por lo completa la base con la cuenta que escribe.
    async crearAnotacion(texto) {
      return aAnotacion(ok<Anotacion>(await supabase.from('anotaciones').insert({ texto: texto.trim() }).select().single()));
    },
    async borrarAnotacion(id) {
      ok(await supabase.from('anotaciones').delete().eq('id', id));
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
    // p_gasto lleva también `tildados` y `anotaciones` cuando los hay (ver 007-app-nativa.sql).
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

    miAcceso,
    async permisosDeLaCasa() {
      const filas =
        ok<Array<{ integrante_id: string; permiso: Permiso }> | null>(
          await supabase.from('permisos').select('integrante_id, permiso'),
        ) ?? [];
      const porIntegrante: Record<string, Permiso[]> = {};
      for (const { integrante_id, permiso } of filas) (porIntegrante[integrante_id] ??= []).push(permiso);
      for (const lista of Object.values(porIntegrante)) lista.sort();
      return porIntegrante;
    },
    // Darlo dos veces no duplica ni falla (ignoreDuplicates); si no es admin, o no es un integrante, la base rechaza.
    async darPermiso(integranteId, permiso) {
      ok(
        await supabase
          .from('permisos')
          .upsert({ integrante_id: integranteId, permiso }, { onConflict: 'integrante_id,permiso', ignoreDuplicates: true }),
      );
    },
    // Cero filas borradas son «no había nada que borrar» si quien llama es admin (como en memoria);
    // si no lo es, la política de borrado las descartó.
    async quitarPermiso(integranteId, permiso) {
      const borradas = ok<unknown[] | null>(
        await supabase.from('permisos').delete().eq('integrante_id', integranteId).eq('permiso', permiso).select(),
      );
      if (!borradas?.length && !(await miAcceso()).admin) throw sinPermiso();
    },
    async cederAdmin(aIntegranteId) {
      ok(await supabase.rpc('ceder_admin', { p_a: aIntegranteId }));
    },
    // Sin el permiso «sueldos» la política devuelve cero filas, no un error: queda {}.
    async sueldos() {
      const filas =
        ok<Array<{ integrante_id: string; sueldo: number }> | null>(
          await supabase.from('sueldos').select('integrante_id, sueldo'),
        ) ?? [];
      return Object.fromEntries(filas.map((f) => [f.integrante_id, Number(f.sueldo)]));
    },
    async fijarSueldo(integranteId, sueldo) {
      if (sueldo === null) {
        // Como quitarPermiso: cero filas borradas son un «no había» solo para quien tiene el permiso.
        const borradas = ok<unknown[] | null>(await supabase.from('sueldos').delete().eq('integrante_id', integranteId).select());
        if (borradas?.length) return;
        const { admin, permisos } = await miAcceso();
        if (!admin && !permisos.includes('sueldos')) throw sinPermiso();
        return;
      }
      const guardadas = ok<unknown[] | null>(
        await supabase.from('sueldos').upsert({ integrante_id: integranteId, sueldo }, { onConflict: 'integrante_id' }).select(),
      );
      if (!guardadas?.length) throw sinPermiso();
    },
    // Los pesos son bigint (partes por 10^12): caben en un número.
    async partesDelMes(mes) {
      const filas =
        ok<Array<{ integrante_id: string; peso: number }> | null>(await supabase.rpc('partes_del_mes', { p_mes: mes })) ?? [];
      return Object.fromEntries(filas.map((f) => [f.integrante_id, Number(f.peso)]));
    },
    // La función no devuelve la fila: se lee la propia por el email de la sesión.
    async editarPerfil(nombre, color) {
      ok(await supabase.rpc('editar_perfil', { p_nombre: nombre, p_color: color }));
      const { session } = ok<{ session: { user: { email?: string } } | null }>(await supabase.auth.getSession());
      const fila = session?.user.email ? await miIntegrante(session.user.email) : null;
      if (!fila) throw sinPermiso();
      return fila;
    },

    async guardarSuscripcion({ endpoint, p256dh, auth }) {
      ok(await supabase.rpc('guardar_suscripcion', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth }));
    },

    async borrarSuscripcion(endpoint) {
      ok(await supabase.from('suscripciones_push').delete().eq('endpoint', endpoint));
    },

    async misSuscripciones() {
      return ok<Array<{ endpoint: string }>>(await supabase.from('suscripciones_push').select('endpoint')).map((s) => s.endpoint);
    },

    async clavePublicaAvisos() {
      return ok<string | null>(await supabase.rpc('clave_publica_avisos')) ?? null;
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
