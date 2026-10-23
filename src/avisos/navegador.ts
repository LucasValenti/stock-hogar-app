// Lo que los avisos de los domingos necesitan del navegador: Push API, permiso de notificaciones y si la app
// está instalada. Aparte para que la pantalla se pruebe sin navegador (los tests lo reemplazan).
import { claveAplicacion, conPlazo, type Entorno } from '@/logica/avisos';

/** Clave pública VAPID: no es secreta (la privada vive solo en los secretos de la Edge Function). */
export const CLAVE_PUBLICA: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

export function entornoAvisos(demo: boolean): Entorno {
  const hayNavegador = typeof window !== 'undefined' && typeof navigator !== 'undefined';
  const soportado = hayNavegador && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ua = hayNavegador ? navigator.userAgent : '';
  // iPadOS se presenta como Mac: se reconoce por la pantalla táctil.
  const esIOS = /iPad|iPhone|iPod/.test(ua) || (hayNavegador && /Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const instalada =
    hayNavegador &&
    (window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  return {
    demo,
    soportado,
    permiso: soportado ? Notification.permission : 'default',
    esIOS,
    instalada,
    configurada: CLAVE_PUBLICA.length > 0,
  };
}

/** La suscripción de este navegador, si hay. */
// Si el service worker no se registró (ventana privada, etc.), `ready` no resuelve nunca: se corta a los 5 segundos.
const SIN_SW = 'No se pudo preparar la app para los avisos. Recargá la página y probá de nuevo.'; // [PENDIENTE: validar con Lucas]
const registroListo = () => conPlazo(navigator.serviceWorker.ready, 5000, SIN_SW);

export async function suscripcionDelNavegador(): Promise<PushSubscription | null> {
  const registro = await registroListo();
  return registro.pushManager.getSubscription();
}

/** Pide permiso de notificaciones. Solo desde un toque de la persona (si no, el navegador lo ignora). */
export function pedirPermiso(): Promise<NotificationPermission> {
  return Notification.requestPermission();
}

export async function suscribir(clavePublica: string): Promise<PushSubscription> {
  const registro = await registroListo();
  return registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveAplicacion(clavePublica) });
}
