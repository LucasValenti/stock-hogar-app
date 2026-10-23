import { aSuscripcion, claveAplicacion, conPlazo, esEndpointDePush, estadoAvisos, textoEstado, type Entorno } from './avisos';
import { mensajeError } from './errores';

const entorno = (extra: Partial<Entorno> = {}): Entorno => ({
  demo: false,
  soportado: true,
  permiso: 'default',
  esIOS: false,
  instalada: false,
  configurada: true,
  ...extra,
});

describe('estadoAvisos', () => {
  test('en un navegador con soporte y sin bloquear, se pueden activar', () => {
    expect(estadoAvisos(entorno())).toBe('disponible');
    expect(estadoAvisos(entorno({ permiso: 'granted' }))).toBe('disponible');
  });

  test('en la demo no hay avisos, aunque el navegador los soporte', () => {
    expect(estadoAvisos(entorno({ demo: true }))).toBe('demo');
  });

  test('en iPhone, sin instalar la app no hay avisos: primero se instala', () => {
    expect(estadoAvisos(entorno({ esIOS: true, soportado: false }))).toBe('instalar-ios');
    expect(estadoAvisos(entorno({ esIOS: true, instalada: true }))).toBe('disponible');
  });

  test('sin Push API o sin clave pública, no se puede; bloqueados por el usuario, tampoco', () => {
    expect(estadoAvisos(entorno({ soportado: false }))).toBe('sin-soporte');
    expect(estadoAvisos(entorno({ configurada: false }))).toBe('sin-soporte');
    expect(estadoAvisos(entorno({ permiso: 'denied' }))).toBe('bloqueados');
  });
});

describe('textoEstado', () => {
  test('cada estado que no deja activar explica por qué; disponible no dice nada', () => {
    expect(textoEstado('disponible')).toBeNull();
    expect(textoEstado('demo')).toBe('En la demo no hay avisos.');
    expect(textoEstado('sin-soporte')).toBe('Este navegador no permite avisos.');
    expect(textoEstado('bloqueados')).toBe('Bloqueaste los avisos para esta app. Se habilitan desde los ajustes del navegador.');
    expect(textoEstado('instalar-ios')).toBe('En iPhone, primero agregá la app a la pantalla de inicio (Compartir → Agregar a inicio).');
  });
});

describe('claveAplicacion', () => {
  test('pasa la clave pública VAPID (base64url) a los bytes que pide pushManager.subscribe', () => {
    const bytes = new Uint8Array(65).map((_, i) => (i * 7) % 256);
    const base64url = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect([...claveAplicacion(base64url)]).toEqual([...bytes]);
  });
});

describe('aSuscripcion', () => {
  test('toma endpoint y claves de PushSubscription.toJSON()', () => {
    expect(aSuscripcion({ endpoint: 'https://push.example.com/x', keys: { p256dh: 'p', auth: 'a' } })).toEqual({
      endpoint: 'https://push.example.com/x',
      p256dh: 'p',
      auth: 'a',
    });
  });

  test('sin endpoint o sin claves no hay suscripción que guardar', () => {
    expect(aSuscripcion({ keys: { p256dh: 'p', auth: 'a' } })).toBeNull();
    expect(aSuscripcion({ endpoint: 'https://push.example.com/x', keys: { p256dh: 'p' } })).toBeNull();
    expect(aSuscripcion({ endpoint: 'https://push.example.com/x' })).toBeNull();
  });
});

describe('conPlazo', () => {
  test('devuelve lo que resuelve la promesa a tiempo', async () => {
    await expect(conPlazo(Promise.resolve(3), 1000, 'tarde')).resolves.toBe(3);
  });

  test('si no resuelve en el plazo, rechaza con el mensaje (no queda esperando para siempre)', async () => {
    vi.useFakeTimers();
    const nunca = new Promise<number>(() => undefined);
    const r = conPlazo(nunca, 5000, 'No se pudo preparar la app para los avisos.');
    vi.advanceTimersByTime(5000);
    const error = await r.catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'PLAZO', message: 'No se pudo preparar la app para los avisos.' });
    // Con conexión, la pantalla muestra el texto tal cual (no «Algo salió mal»).
    expect(mensajeError(error, true)).toBe('No se pudo preparar la app para los avisos.');
    vi.useRealTimers();
  });
});

describe('esEndpointDePush', () => {
  test.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QGx',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('acepta %s', (e) => expect(esEndpointDePush(e)).toBe(true));

  test.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://push.example.com/abc',
    'https://fcm.googleapis.com.example.com/abc',
    'https://fcmXgoogleapis.com/abc',
    'https://example.com/?u=https://fcm.googleapis.com/',
    `https://fcm.googleapis.com/${'x'.repeat(1000)}`,
  ])('rechaza %s', (e) => expect(esEndpointDePush(e)).toBe(false));
});
