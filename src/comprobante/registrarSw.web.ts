// Registra el service worker de la web instalada (PWA): es el que recibe los comprobantes
// compartidos desde otra app y los deja para que la app los lea al abrir.
export function registrarSw(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // Si no se puede registrar (contexto inseguro, etc.) la app funciona igual: solo no recibe.
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}
