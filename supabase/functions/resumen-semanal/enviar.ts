// El envío de los domingos, sin nada de afuera: los datos, el push y el borrado llegan como funciones (en
// producción, Supabase y web-push-neo desde index.ts; en los tests, simulados). Devuelve solo cantidades: nada
// de endpoints ni textos, que son datos de la casa.
import { armarResumen, faltantesEnOrden, semanaDe } from '../_compartido/resumen.ts';

export type Suscripcion = { endpoint: string; p256dh: string; auth: string };

/** Lo que devuelve datos_resumen_semanal (migración 009). */
export type DatosSemana = {
  gastos: number[];
  productos: string[];
  anotaciones: Array<{ texto: string; creado: string }>;
  suscripciones: Suscripcion[];
};

export type Dependencias = {
  ahora: Date;
  pedirDatos(desde: string, hasta: string): Promise<DatosSemana>;
  /** Manda el push y devuelve el código HTTP del servicio de push. */
  mandar(suscripcion: Suscripcion, cuerpo: string): Promise<number>;
  borrar(endpoint: string): Promise<void>;
};

export type Resultado = {
  semana: { desde: string; hasta: string };
  enviados: number;
  borrados: number;
  fallidos: number;
  semanaVacia?: true;
};

export async function enviarResumen({ ahora, pedirDatos, mandar, borrar }: Dependencias): Promise<Resultado> {
  const semana = semanaDe(ahora);
  const d = await pedirDatos(semana.desde, semana.hasta);
  const resumen = armarResumen({ gastos: d.gastos, faltantes: faltantesEnOrden(d.productos, d.anotaciones) });
  if (!resumen) return { semana, enviados: 0, borrados: 0, fallidos: 0, semanaVacia: true };

  const cuerpo = JSON.stringify(resumen);
  const resultados = await Promise.allSettled(
    d.suscripciones.map(async (s) => {
      const estado = await mandar(s, cuerpo);
      // 404 y 410: el navegador ya no tiene esa suscripción (la borró, se desinstaló la app, venció).
      if (estado === 404 || estado === 410) {
        await borrar(s.endpoint);
        return 'borrado';
      }
      return estado >= 200 && estado < 300 ? 'enviado' : 'fallido';
    }),
  );
  const cuantos = (que: string) => resultados.filter((r) => r.status === 'fulfilled' && r.value === que).length;
  return {
    semana,
    enviados: cuantos('enviado'),
    borrados: cuantos('borrado'),
    fallidos: resultados.length - cuantos('enviado') - cuantos('borrado'),
  };
}

/**
 * La cabecera x-cron-secret coincide con el secreto de la función. Sin secreto configurado no pasa nadie.
 * Compara sin cortar en la primera diferencia, para no dar pistas del secreto por el tiempo de respuesta.
 */
export function autorizado(cabecera: string | null, secreto: string | undefined): boolean {
  if (!secreto) return false;
  const x = new TextEncoder().encode(cabecera ?? '');
  const y = new TextEncoder().encode(secreto);
  let distinto = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) distinto |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return distinto === 0;
}

/** Si fallaron todos los envíos, 502: así la corrida queda marcada como fallida en net._http_response. */
export function codigoHttp(r: Resultado): number {
  return r.fallidos > 0 && r.enviados + r.borrados === 0 ? 502 : 200;
}

/** Lo que devuelve secretos_avisos() (migración 009): los secretos que haya en Vault, por nombre. */
export type SecretosAvisos = Partial<Record<'resumen_semanal_secreto' | 'avisos_vapid_publica' | 'avisos_vapid_privada', string>>;

export type Claves = { cron: string; publica: string; privada: string };

/**
 * El secreto del cron y el par VAPID, sin que nadie los escriba: el secreto lo generó la migración y el par lo
 * genera la función la primera vez. Después de guardar se vuelve a leer: si otra corrida guardó antes, gana esa.
 */
export async function prepararClaves({
  leer,
  generar,
  guardar,
}: {
  leer(): Promise<SecretosAvisos>;
  generar(): Promise<{ publicKey: string; privateKey: string }>;
  guardar(publica: string, privada: string): Promise<void>;
}): Promise<Claves> {
  let s = await leer();
  const cron = s.resumen_semanal_secreto;
  if (!cron) throw new Error('Falta resumen_semanal_secreto en Vault (lo crea la migración 009)');
  if (!s.avisos_vapid_publica || !s.avisos_vapid_privada) {
    const par = await generar();
    await guardar(par.publicKey, par.privateKey);
    s = await leer();
  }
  if (!s.avisos_vapid_publica || !s.avisos_vapid_privada) throw new Error('No quedó guardado el par VAPID en Vault');
  return { cron, publica: s.avisos_vapid_publica, privada: s.avisos_vapid_privada };
}
