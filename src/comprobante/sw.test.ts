// El service worker de la web instalada: recibe el comprobante que se comparte desde otra app,
// lo guarda en el caché y redirige a la app. El resto de los pedidos no los toca.

type Handler = (evento: EventoFalso) => void;

type EventoFalso = {
  request: { method: string; url: string; formData(): Promise<FormData> };
  respondWith(p: unknown): void;
  waitUntil(p: unknown): void;
};

let handlers: Record<string, Handler>;
let cachePut: jest.Mock;
let cacheDelete: jest.Mock;

beforeEach(() => {
  jest.resetModules();
  handlers = {};
  cachePut = jest.fn(async () => undefined);
  cacheDelete = jest.fn(async () => true);
  (globalThis as { caches?: unknown }).caches = {
    open: jest.fn(async () => ({ put: cachePut, delete: cacheDelete })),
  };
  (globalThis as { self?: unknown }).self = {
    addEventListener: (tipo: string, h: Handler) => {
      handlers[tipo] = h;
    },
    skipWaiting: jest.fn(),
    clients: { claim: jest.fn() },
  };
  require('../../public/sw.js');
});

afterEach(() => {
  delete (globalThis as { caches?: unknown }).caches;
  delete (globalThis as { self?: unknown }).self;
});

function evento(pedido: EventoFalso['request']) {
  const respondido: unknown[] = [];
  const e: EventoFalso = {
    request: pedido,
    respondWith: (p) => respondido.push(p),
    waitUntil: () => undefined,
  };
  return {
    responder: () => {
      handlers.fetch(e);
      return Promise.resolve(respondido[0]) as Promise<Response>;
    },
    toco: () => respondido.length > 0,
  };
}

function pedidoCompartir(archivo: Blob): EventoFalso['request'] {
  const datos = new FormData();
  datos.append('comprobante', archivo);
  return { method: 'POST', url: 'https://stock.example/compartir', formData: async () => datos };
}

test('un PDF chico se guarda en el caché y redirige a la app', async () => {
  const pdf = new File([new Uint8Array(10)], 'comprobante.pdf', { type: 'application/pdf' });
  const { responder } = evento(pedidoCompartir(pdf));

  const respuesta = await responder();

  expect(respuesta.status).toBe(303);
  expect(new URL(respuesta.headers.get('location')!).pathname).toBe('/');
  expect(cachePut).toHaveBeenCalledTimes(1);
  const [clave, guardada] = cachePut.mock.calls[0];
  expect(clave).toBe('/comprobante-compartido');
  expect(guardada.headers.get('Content-Type')).toBe('application/pdf');
  expect(guardada.headers.get('X-Nombre')).toBe('comprobante.pdf');
});

test('una imagen chica también se guarda', async () => {
  const imagen = new File([new Uint8Array(50)], 'foto.png', { type: 'image/png' });
  const { responder } = evento(pedidoCompartir(imagen));

  await responder();

  expect(cachePut).toHaveBeenCalledTimes(1);
});

test('un archivo que no es imagen ni PDF no se guarda, pero igual redirige', async () => {
  const nota = new File(['hola'], 'nota.txt', { type: 'text/plain' });
  const { responder } = evento(pedidoCompartir(nota));

  const respuesta = await responder();

  expect(respuesta.status).toBe(303);
  expect(cachePut).not.toHaveBeenCalled();
});

test('un GET no lo toca: no llama respondWith', () => {
  const { responder, toco } = evento({
    method: 'GET',
    url: 'https://stock.example/',
    formData: async () => new FormData(),
  });

  responder();

  expect(toco()).toBe(false);
});
