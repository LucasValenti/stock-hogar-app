// Prepara la web instalada (PWA): declara el manifest (con el `share_target` que hace aparecer la app
// en «Compartir») y registra el service worker que recibe los comprobantes compartidos.
// El manifest se agrega acá y no en un +html.tsx: con ese archivo el servidor de Expo deja de
// incluir el script de la app.
function agregarEnHead(selector: string, crear: () => HTMLElement): void {
  if (!document.head.querySelector(selector)) document.head.appendChild(crear());
}

export function registrarSw(): void {
  if (typeof document === 'undefined') return;
  agregarEnHead('link[rel="manifest"]', () => {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/manifest.webmanifest';
    return link;
  });
  agregarEnHead('meta[name="theme-color"]', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#dce8e3';
    return meta;
  });
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // Si no se puede registrar (contexto inseguro, etc.) la app funciona igual: solo no recibe.
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}
