// Avisos de los domingos (F9): qué se puede hacer en este navegador y cómo se pasa lo que da la Push API a
// lo que guarda la base. Funciones puras; lo que toca el navegador está en src/avisos/navegador.ts.
import type { SuscripcionPush } from '@/datos/tipos';

export type Entorno = {
  /** La demo o el build solo-memoria: no hay cuenta a la que avisar. */
  demo: boolean;
  /** Hay service worker y Push API. */
  soportado: boolean;
  permiso: NotificationPermission;
  esIOS: boolean;
  /** Abierta como app instalada (pantalla de inicio), no en una pestaña. */
  instalada: boolean;
  /** Hay clave pública VAPID (la genera la Edge Function la primera vez que corre). */
  configurada: boolean;
};

export type EstadoAvisos = 'disponible' | 'demo' | 'instalar-ios' | 'sin-soporte' | 'sin-configurar' | 'bloqueados';

export function estadoAvisos(e: Entorno): EstadoAvisos {
  if (e.demo) return 'demo';
  // En iPhone la Push API solo aparece con la app instalada: antes de eso no es que no se pueda, falta instalar.
  if (e.esIOS && !e.instalada) return 'instalar-ios';
  if (!e.soportado) return 'sin-soporte';
  if (!e.configurada) return 'sin-configurar';
  if (e.permiso === 'denied') return 'bloqueados';
  return 'disponible';
}

// [PENDIENTE: validar con Lucas]
const TEXTOS: Record<Exclude<EstadoAvisos, 'disponible'>, string> = {
  demo: 'En la demo no hay avisos.',
  'instalar-ios': 'En iPhone, primero agregá la app a la pantalla de inicio (Compartir → Agregar a inicio).',
  'sin-soporte': 'Este navegador no permite avisos.',
  'sin-configurar': 'Los avisos todavía no están listos.',
  bloqueados: 'Bloqueaste los avisos para esta app. Se habilitan desde los ajustes del navegador.',
};

export function textoEstado(estado: EstadoAvisos): string | null {
  return estado === 'disponible' ? null : TEXTOS[estado];
}

/** La clave pública VAPID (base64url) como bytes, que es lo que acepta pushManager.subscribe en todos los navegadores. */
export function claveAplicacion(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const binario = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** Lo que guarda la base, a partir de PushSubscription.toJSON(). */
export function aSuscripcion(json: { endpoint?: string; keys?: Record<string, string> }): SuscripcionPush | null {
  const { endpoint, keys } = json;
  if (!endpoint || !keys?.p256dh || !keys.auth) return null;
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

/**
 * La promesa, o un error con `mensaje` si no resuelve en `ms` (para no dejar la pantalla esperando para siempre).
 * El error lleva el código PLAZO: `mensaje` ya está redactado para la persona y mensajeError lo muestra tal cual.
 */
export function conPlazo<T>(promesa: Promise<T>, ms: number, mensaje: string): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    const reloj = setTimeout(() => rechazar(Object.assign(new Error(mensaje), { code: 'PLAZO' })), ms);
    promesa.then(
      (v) => {
        clearTimeout(reloj);
        resolver(v);
      },
      (e: unknown) => {
        clearTimeout(reloj);
        rechazar(e);
      },
    );
  });
}

/** Hasta cuántas suscripciones guarda cada cuenta (al pasarse, se van las más viejas). Igual que guardar_suscripcion. */
export const MAX_SUSCRIPCIONES = 10;

// Los servicios de push de los navegadores (Google, Mozilla, Apple, Microsoft); igual que el check de suscripciones_push.
const SERVICIO_DE_PUSH =
  /^https:\/\/(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;

/** El endpoint es de un servicio de push de navegador (la Edge Function no tiene que poder apuntarse a otro sitio). */
export function esEndpointDePush(endpoint: string): boolean {
  return endpoint.length <= 1000 && SERVICIO_DE_PUSH.test(endpoint);
}
