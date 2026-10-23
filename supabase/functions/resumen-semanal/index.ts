// Edge Function resumen-semanal (Deno, en Supabase): la llama pg_cron los domingos a las 20 de Argentina
// (migración 009) y manda el resumen a cada suscripción. La lógica está en enviar.ts (probada con Vitest).
//
// Se despliega SIN verificación de JWT (supabase/config.toml, verify_jwt = false): el único que la llama es el
// cron, que se identifica con la cabecera x-cron-secret.
// No usa secretos de entorno propios: el secreto del cron y el par VAPID viven en Vault y los lee con la clave
// de servicio (secretos_avisos); el par lo genera la primera vez que corre. SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY los pone Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { generateVAPIDKeys, sendNotification, WebPushError } from 'npm:web-push-neo@0.1.2';

import { autorizado, codigoHttp, enviarResumen, prepararClaves, type DatosSemana, type SecretosAvisos } from './enviar.ts';

const REMITENTE = 'https://kusak.dev';
const ESPERA_MS = 10_000;

function variable(nombre: string): string {
  const valor = Deno.env.get(nombre);
  if (!valor) throw new Error(`Falta la variable ${nombre}`);
  return valor;
}

Deno.serve(async (pedido) => {
  if (pedido.method !== 'POST') return new Response('Método no permitido', { status: 405 });

  const supabase = createClient(variable('SUPABASE_URL'), variable('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const leer = async (): Promise<SecretosAvisos> => {
    const { data, error } = await supabase.rpc('secretos_avisos');
    if (error) throw error;
    return (data ?? {}) as SecretosAvisos;
  };

  try {
    const secretos = await leer();
    if (!autorizado(pedido.headers.get('x-cron-secret'), secretos.resumen_semanal_secreto)) {
      return new Response('No autorizado', { status: 401 });
    }
    const claves = await prepararClaves({
      leer,
      generar: () => generateVAPIDKeys(),
      async guardar(publica, privada) {
        const { error } = await supabase.rpc('guardar_claves_vapid', { p_publica: publica, p_privada: privada });
        if (error) throw error;
      },
    });
    const vapidDetails = { subject: REMITENTE, publicKey: claves.publica, privateKey: claves.privada };

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
          // Red, tiempo agotado o clave VAPID inválida: solo el tipo de error, sin el endpoint.
          console.error('resumen-semanal: envío fallido', e instanceof Error ? e.name : typeof e);
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
    return Response.json(resultado, { status: codigoHttp(resultado) });
  } catch (e) {
    console.error('resumen-semanal falló', e instanceof Error ? e.message : String(e));
    return new Response('No se pudo mandar el resumen', { status: 500 });
  }
});
