// public/sw.js corre en el service worker, fuera de Vite: se carga el archivo tal cual con un `self` falso
// y se disparan sus eventos.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Manejador = (evento: unknown) => void;
type Ventana = { url: string; focus: ReturnType<typeof vi.fn> };

// Vitest corre desde la raíz del proyecto (en jsdom, import.meta.url no es una ruta de archivo).
const codigo = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

function cargarSw(ventanas: Ventana[] = []) {
  const manejadores: Record<string, Manejador> = {};
  const self = {
    addEventListener: (tipo: string, fn: Manejador) => (manejadores[tipo] = fn),
    skipWaiting: vi.fn(),
    location: { origin: 'https://stock-hogar.pages.dev' },
    registration: { showNotification: vi.fn(async () => undefined) },
    clients: { claim: vi.fn(), matchAll: vi.fn(async () => ventanas), openWindow: vi.fn(async () => null) },
  };
  new Function('self', codigo)(self);
  async function disparar(tipo: string, evento: object) {
    const esperas: Array<Promise<unknown>> = [];
    manejadores[tipo]({ ...evento, waitUntil: (p: Promise<unknown>) => esperas.push(p) });
    await Promise.all(esperas);
  }
  return { self, disparar };
}

const datos = (valor: unknown) => ({
  json: () => (typeof valor === 'string' ? JSON.parse(valor) : valor),
  text: () => (typeof valor === 'string' ? valor : JSON.stringify(valor)),
});

describe('push', () => {
  test('muestra el aviso con el título y el cuerpo que manda el servidor, y abre Inicio al tocarlo', async () => {
    const { self, disparar } = cargarSw();
    await disparar('push', { data: datos({ titulo: 'Stock del hogar', cuerpo: 'Tu semana en la casa: $ 1.000 en 1 gasto.' }) });
    expect(self.registration.showNotification).toHaveBeenCalledWith('Stock del hogar', {
      body: 'Tu semana en la casa: $ 1.000 en 1 gasto.',
      icon: '/icono-192.png',
      badge: '/icono-192.png',
      tag: 'resumen-semanal',
      data: { url: '/' },
    });
  });

  test('sin datos o con datos que no se entienden, igual avisa con un texto genérico', async () => {
    for (const data of [null, datos('no es json'), datos({ titulo: 3 })]) {
      const { self, disparar } = cargarSw();
      await disparar('push', { data });
      expect(self.registration.showNotification).toHaveBeenCalledWith('Stock del hogar', expect.objectContaining({ body: 'Tenés novedades de la casa.' }));
    }
  });
});

describe('notificationclick', () => {
  const aviso = (url?: string) => ({ notification: { close: vi.fn(), data: url === undefined ? {} : { url } } });

  test('si la app ya está abierta, la trae al frente', async () => {
    const abierta = { url: 'https://stock-hogar.pages.dev/stock', focus: vi.fn(async () => undefined) };
    const { self, disparar } = cargarSw([{ url: 'https://otro.example.com/', focus: vi.fn() }, abierta]);
    const evento = aviso('/');
    await disparar('notificationclick', evento);
    expect(evento.notification.close).toHaveBeenCalled();
    expect(abierta.focus).toHaveBeenCalled();
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  test('si no está abierta, la abre en Inicio', async () => {
    const { self, disparar } = cargarSw();
    await disparar('notificationclick', aviso('/'));
    expect(self.clients.openWindow).toHaveBeenCalledWith('https://stock-hogar.pages.dev/');
  });

  test('solo abre rutas de la app: una dirección de afuera o sin ruta va a Inicio', async () => {
    for (const url of ['https://malo.example.com/', '//malo.example.com', '/\\malo.example.com', '/\\/malo.example.com', undefined]) {
      const { self, disparar } = cargarSw();
      await disparar('notificationclick', aviso(url));
      expect(self.clients.openWindow).toHaveBeenCalledWith('https://stock-hogar.pages.dev/');
    }
  });
});
