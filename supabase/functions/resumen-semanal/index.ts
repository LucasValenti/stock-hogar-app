// Edge Function resumen-semanal (Deno, en Supabase): la llama pg_cron los domingos a las 20 de Argentina
// (migración 009) y manda el resumen a cada suscripción. La lógica está en enviar.ts (probada con Vitest).
//
// Se despliega SIN verificación de JWT (supabase functions deploy resumen-semanal --no-verify-jwt): el único
// que la llama es el cron, que se identifica con la cabecera x-cron-secret.
// Secretos de la función: CRON_SECRET, VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY (los carga Lucas en el panel).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { sendNotification, WebPushError } from 'npm:web-push-neo@0.1.2';

import { enviarResumen, type DatosSemana } from './enviar.ts';

const REMITENTE = 'https://kusak.dev';
const ESPERA_MS = 10_000;

function variable(nombre: string): string {
  const valor = Deno.env.get(nombre);
  if (!valor) throw new Error(`Falta la variable ${nombre}`);
  return valor;
}

/** Compara sin cortar en la primera diferencia (no da pistas del secreto por el tiempo de respuesta). */
function iguales(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let distinto = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) distinto |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return distinto === 0;
}

Deno.serve(async (pedido) => {
  if (pedido.method !== 'POST') return new Response('Método no permitido', { status: 405 });
  if (!iguales(pedido.headers.get('x-cron-secret') ?? '', variable('CRON_SECRET'))) {
    return new Response('No autorizado', { status: 401 });
  }

  const supabase = createClient(variable('SUPABASE_URL'), variable('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const vapidDetails = { subject: REMITENTE, publicKey: variable('VAPID_PUBLIC_KEY'), privateKey: variable('VAPID_PRIVATE_KEY') };

  try {
    const resultado = await enviarResumen({
      ahora: new Date(),
      async pedirDatos(desde, hasta) {
        const { data, error } = await supabase.rpc('datos_resumen_semanal', { p_desde: desde, p_hasta: hasta });
        if (error) throw error;
        return data as DatosSemana;
      },
      async mandar(s, cuerpo) {
        try {
          const r = await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, {
            TTL: 24 * 60 * 60,
            urgency: 'normal',
            topic: 'resumen-semanal',
            vapidDetails,
            signal: AbortSignal.timeout(ESPERA_MS),
          });
          return r.statusCode;
        } catch (e) {
          if (e instanceof WebPushError) return e.statusCode;
          throw e;
        }
      },
      async borrar(endpoint) {
        const { error } = await supabase.from('suscripciones_push').delete().eq('endpoint', endpoint);
        if (error) throw error;
      },
    });
    // Solo cantidades: ni endpoints ni el texto del aviso.
    console.log('resumen-semanal', JSON.stringify(resultado));
    return Response.json(resultado);
  } catch (e) {
    console.error('resumen-semanal falló', e instanceof Error ? e.message : String(e));
    return new Response('No se pudo mandar el resumen', { status: 500 });
  }
});
