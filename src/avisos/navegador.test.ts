import { apagarAvisosDeEsteNavegador } from './navegador';

function conNavegador(sub: { endpoint: string; unsubscribe: ReturnType<typeof vi.fn> } | null, registrado = true) {
  const getRegistration = vi.fn(async () => (registrado ? { pushManager: { getSubscription: async () => sub } } : undefined));
  Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration }, configurable: true });
  Object.defineProperty(window, 'PushManager', { value: function PushManager() {}, configurable: true });
  return getRegistration;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(window, 'PushManager');
});

describe('apagarAvisosDeEsteNavegador (al cerrar sesión)', () => {
  test('borra la suscripción de la base y la del navegador', async () => {
    const sub = { endpoint: 'https://push.example.com/este', unsubscribe: vi.fn(async () => true) };
    conNavegador(sub);
    const borrar = vi.fn(async () => undefined);
    await apagarAvisosDeEsteNavegador(borrar);
    expect(borrar).toHaveBeenCalledWith('https://push.example.com/este');
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  test('si la base falla, igual desuscribe el navegador y no tira el error (no frena el cierre de sesión)', async () => {
    const sub = { endpoint: 'https://push.example.com/este', unsubscribe: vi.fn(async () => true) };
    conNavegador(sub);
    await expect(apagarAvisosDeEsteNavegador(vi.fn(async () => Promise.reject(new Error('sin red'))))).resolves.toBeUndefined();
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  test('sin suscripción, sin service worker registrado o sin Push API, no hace nada', async () => {
    const borrar = vi.fn(async () => undefined);
    conNavegador(null);
    await apagarAvisosDeEsteNavegador(borrar);
    conNavegador(null, false);
    await apagarAvisosDeEsteNavegador(borrar);
    Reflect.deleteProperty(navigator, 'serviceWorker');
    await apagarAvisosDeEsteNavegador(borrar);
    expect(borrar).not.toHaveBeenCalled();
  });
});
