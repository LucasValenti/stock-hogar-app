// Traduce errores técnicos a mensajes para la persona.

// Lo que se mira de un error: el de fetch, el de Supabase (PostgREST/Auth) o el de Postgres.
type ErrorConocido = { message?: unknown; status?: number; code?: string; details?: string };

// `navigator.onLine` existe en el navegador; en React Native no, y ahí se da por conectado.
// Se lee por globalThis para no depender de los tipos del DOM.
function estaEnLinea(): boolean {
  const navegador = (globalThis as { navigator?: { onLine?: boolean } }).navigator;
  return navegador?.onLine ?? true;
}

export function mensajeError(e: unknown, enLinea: boolean = estaEnLinea()): string {
  const err = e as ErrorConocido | null | undefined;
  const texto = String(err?.message ?? '');
  // Los errores de la capa de datos (SIN_CONFIG, SIN_CONEXION, SIN_SESION) y los de conPlazo (PLAZO) ya vienen
  // redactados para la persona.
  if (err?.code === 'SIN_CONFIG' || err?.code === 'SIN_CONEXION' || err?.code === 'SIN_SESION' || err?.code === 'PLAZO') return texto;
  if (!enLinea || e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(texto)) {
    return 'Sin conexión. Revisá internet y probá de nuevo: lo que cargaste sigue acá.';
  }
  if (texto.includes('MES_CERRADO')) return 'Ese mes está cerrado. Reabrilo desde Análisis para cambiarlo.';
  if (texto.includes('CIERRE_DESACTUALIZADO')) {
    return 'Mientras mirabas, alguien cargó o cambió algo del mes. Revisá el reparto nuevo y cerrá otra vez.';
  }
  if (texto.includes('SIN_ITEMS')) return 'Agregá al menos un producto.';
  if (texto.includes('GASTO_INEXISTENTE')) return 'Ese gasto ya no existe. Puede que alguien lo haya borrado.';
  if (texto.includes('PRODUCTO_INEXISTENTE')) return 'Ese producto ya no existe. Puede que alguien lo haya borrado.';
  if (err?.status === 429 || /rate limit/i.test(texto)) return 'Se pidieron muchos códigos seguidos. Esperá unos minutos y probá de nuevo.';
  if (err?.code === 'otp_disabled' || /signups not allowed/i.test(texto)) {
    return 'Ese email no está habilitado. Pedile a quien administra la casa que te invite.';
  }
  if (err?.code === '23505' && /mp_operacion/.test(`${texto} ${err?.details ?? ''}`)) return 'Este comprobante ya se cargó.';
  if (err?.code === '23505') return 'Ya existe uno con ese dato (nombre, email o código repetido).';
  if (err?.code === '23503' && /"productos"/.test(texto)) return 'Ese producto ya tiene compras: ocultalo en vez de borrarlo.';
  if (err?.code === '23503') return 'No se puede borrar porque está en uso.';
  if (err?.code === '23514') return 'Hay un dato inválido. Revisá los campos.';
  if (err?.code === '42501') return 'Esta cuenta no tiene permiso para hacer eso.';
  return 'Algo salió mal. Probá de nuevo.';
}
