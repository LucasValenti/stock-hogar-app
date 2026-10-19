// Registra el service worker que recibe los comprobantes compartidos desde otra app (PWA instalada).
// El manifest, con su `share_target`, y el theme-color van fijos en index.html.
export function registrarSw(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // Si no se puede registrar (contexto inseguro, etc.) la app funciona igual: solo no recibe.
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}
