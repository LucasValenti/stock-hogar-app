// Compartir en la web instalada: el service worker deja el comprobante en el caché y acá se toma
// una sola vez. El archivo guardado llega como blob y se le da una URL local.

type BlobFalso = { blob(): Promise<Blob> };

let guardados: Map<string, Blob>;
let borrar: jest.Mock;
let abrir: jest.Mock;

function cacheFalso() {
  return {
    match: async (clave: string): Promise<BlobFalso | undefined> => {
      const blob = guardados.get(clave);
      return blob ? { blob: async () => blob } : undefined;
    },
    delete: borrar,
  };
}

beforeEach(() => {
  jest.resetModules();
  guardados = new Map();
  borrar = jest.fn(async (clave: string) => guardados.delete(clave));
  abrir = jest.fn(async () => cacheFalso());
  (globalThis as { caches?: unknown }).caches = { open: abrir };
  URL.createObjectURL = jest.fn(() => 'blob:comprobante');
});

afterEach(() => {
  delete (globalThis as { caches?: unknown }).caches;
});

test('toma el comprobante guardado, lo borra del caché y devuelve uri, tipo y bytes', async () => {
  guardados.set('/comprobante-compartido', new Blob([new Uint8Array(1234)], { type: 'application/pdf' }));
  const { tomarCompartido } = require('./compartido.web');

  const a = await tomarCompartido();

  expect(a).toEqual({ uri: 'blob:comprobante', tipo: 'application/pdf', bytes: 1234 });
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  expect(borrar).toHaveBeenCalledWith('/comprobante-compartido');
});

test('una segunda llamada no devuelve nada: ya se borró', async () => {
  guardados.set('/comprobante-compartido', new Blob([new Uint8Array(10)], { type: 'image/png' }));
  const { tomarCompartido } = require('./compartido.web');

  expect(await tomarCompartido()).not.toBeNull();
  expect(await tomarCompartido()).toBeNull();
});

test('sin `caches` (contexto inseguro) no hay nada que tomar', async () => {
  delete (globalThis as { caches?: unknown }).caches;
  const { tomarCompartido } = require('./compartido.web');

  expect(await tomarCompartido()).toBeNull();
});
