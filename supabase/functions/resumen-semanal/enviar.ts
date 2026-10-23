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
