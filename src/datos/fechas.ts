// Los timestamptz llegan de PostgREST con microsegundos y huso ('2026-10-18T12:34:56.123456+00:00')
// y, en texto de Postgres, con espacio y huso corto ('2026-10-18 12:34:56.123456+00'). Date.parse de
// Hermes no promete leer seis decimales, así que la capa de datos los entrega siempre como
// 'AAAA-MM-DDTHH:MM:SS.mmmZ', que todo motor lee igual.

const MARCA =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** Pasa un timestamptz a ISO en UTC con milisegundos (los decimales de más se truncan). Lo que no entiende lo devuelve igual. */
export function normalizarTimestamp(valor: string): string {
  if (typeof valor !== 'string') return valor;
  const m = MARCA.exec(valor.trim());
  if (!m) return valor;
  const [, anio, mes, dia, hora, minuto, segundo, fraccion = '', huso = 'Z'] = m;
  const ms = Number(fraccion.padEnd(3, '0').slice(0, 3));
  let minutosDeHuso = 0;
  if (huso.toUpperCase() !== 'Z') {
    const signo = huso[0] === '-' ? -1 : 1;
    const digitos = huso.slice(1).replace(':', '');
    minutosDeHuso = signo * (Number(digitos.slice(0, 2)) * 60 + Number(digitos.slice(2) || 0));
  }
  const t = Date.UTC(Number(anio), Number(mes) - 1, Number(dia), Number(hora), Number(minuto), Number(segundo), ms);
  // Date.UTC reacomoda lo imposible (31 de febrero → marzo): eso no es una fecha, se deja como vino.
  const d = new Date(t);
  if (Number.isNaN(t) || d.getUTCMonth() !== Number(mes) - 1 || d.getUTCDate() !== Number(dia)) return valor;
  return new Date(t - minutosDeHuso * 60_000).toISOString();
}
