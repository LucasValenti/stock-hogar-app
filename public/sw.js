// Service worker de la web instalada (PWA): recibe el comprobante que se comparte desde otra app
// (Android muestra la app en «Compartir» por el `share_target` del manifest), lo deja en el caché y
// vuelve a la app, y muestra los avisos de los domingos (web push). El resto de los pedidos no los toca.

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

// Avisos de los domingos (F9): el servidor manda { titulo, cuerpo } cifrado por web push.
const AVISO_GENERICO = { titulo: 'Stock del hogar', cuerpo: 'Tenés novedades de la casa.' }; // [PENDIENTE: validar con Lucas]

self.addEventListener('push', (evento) => {
  const { titulo, cuerpo } = leerAviso(evento.data);
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: cuerpo,
      icon: '/icono-192.png',
      badge: '/icono-192.png',
      // Un aviso nuevo reemplaza al de la semana anterior en vez de apilarse.
      tag: 'resumen-semanal',
      data: { url: '/' },
    }),
  );
});

function leerAviso(datos) {
  try {
    const aviso = datos ? datos.json() : null;
    if (aviso && typeof aviso.titulo === 'string' && typeof aviso.cuerpo === 'string') return aviso;
  } catch {
    // Datos que no son JSON: se avisa igual, con el texto genérico.
  }
  return AVISO_GENERICO;
}

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const datos = evento.notification.data || {};
  evento.waitUntil(abrirApp(datos.url));
});

// Trae al frente la app si ya está abierta; si no, la abre. Solo rutas de la app: cualquier otra cosa va a Inicio.
async function abrirApp(ruta) {
  // Se mira el origen ya resuelto: «//otro» o «/\otro» parecen rutas pero llevan a otro sitio.
  let url = new URL('/', self.location.origin).href;
  try {
    const pedida = typeof ruta === 'string' && ruta.startsWith('/') ? new URL(ruta, self.location.origin) : null;
    if (pedida && pedida.origin === self.location.origin) url = pedida.href;
  } catch {
    // Ruta inválida: Inicio.
  }
  const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const abierta = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
  if (abierta) return abierta.focus();
  return self.clients.openWindow(url);
}
