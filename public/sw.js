// Service worker de la web instalada (PWA): recibe el comprobante que se comparte desde otra app
// (Android muestra la app en «Compartir» por el `share_target` del manifest), lo deja en el caché y
// vuelve a la app. El resto de los pedidos no los toca: el caché de la app es otro paso.

const CACHE = 'compartido';
const CLAVE = '/comprobante-compartido';
const MAX_BYTES = 15 * 1024 * 1024;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  // Solo el POST a /compartir; cualquier otro pedido lo deja pasar sin tocarlo.
  if (pedido.method !== 'POST' || new URL(pedido.url).pathname !== '/compartir') return;
  evento.respondWith(manejar(pedido));
});

function esValido(archivo) {
  if (typeof File === 'undefined' || !(archivo instanceof File)) return false;
  const tipo = archivo.type || '';
  const aceptado = tipo.indexOf('image/') === 0 || tipo === 'application/pdf';
  return aceptado && archivo.size <= MAX_BYTES;
}

async function guardar(archivo) {
  const cache = await caches.open(CACHE);
  const respuesta = new Response(archivo, {
    headers: { 'Content-Type': archivo.type, 'X-Nombre': archivo.name || '' },
  });
  await cache.put(CLAVE, respuesta);
}

async function manejar(pedido) {
  try {
    const datos = await pedido.formData();
    const archivo = datos.get('comprobante');
    if (esValido(archivo)) await guardar(archivo);
  } catch {
    // Si el cuerpo no se puede leer, igual se vuelve a la app.
  }
  return Response.redirect(new URL('/', pedido.url).href, 303);
}
