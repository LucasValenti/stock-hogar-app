import { aSuscripcion, claveAplicacion, estadoAvisos, textoEstado, type Entorno } from './avisos';

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
