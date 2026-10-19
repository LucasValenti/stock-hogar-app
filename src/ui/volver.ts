// «Volver» dentro de la app. `history.length` cuenta también las páginas de antes de abrir la app,
// así que no sirve para saber si atrás sigue siendo la app. Cada entrada del historial lleva su
// profundidad dentro de la app (`profundidad` en history.state): 0 es donde se abrió.

type Navegar = (ruta: string, opciones?: { replace?: boolean }) => void;

let ultima = 0;

function profundidadActual(): number | undefined {
  const estado = window.history.state as { profundidad?: unknown } | null;
  return typeof estado?.profundidad === 'number' ? estado.profundidad : undefined;
}

/**
 * La llama la app en cada cambio de ruta. Una entrada nueva (sin marca) queda una más honda que la
 * anterior; al ir atrás o adelante, la entrada ya tiene su marca y solo se recuerda.
 */
export function anotarEntrada(primera: boolean): void {
  const actual = profundidadActual();
  if (actual !== undefined) {
    ultima = actual;
    return;
  }
  ultima = primera ? 0 : ultima + 1;
  window.history.replaceState({ ...(window.history.state ?? {}), profundidad: ultima }, '');
}

/** Atrás si la entrada anterior es de la app; si se entró directo a esta pantalla, a `alternativa`. */
export function volver(navegar: Navegar, alternativa = '/'): void {
  if ((profundidadActual() ?? 0) > 0) window.history.back();
  else navegar(alternativa, { replace: true });
}
