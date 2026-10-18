// Comprobantes de Mercado Pago: del texto que lee el OCR a los datos del gasto. Lógica pura.
import { aCentavos } from './dinero';

// Lo que se pudo leer; cada dato falta si el OCR no lo encontró.
export type DatosComprobante = {
  /** 'AAAA-MM-DD'. */
  fecha?: string;
  centavos?: number;
  origen?: string;
  destino?: string;
  /** N.º de operación de Mercado Pago. */
  operacion?: string;
};

export type DatoFaltante = 'centavos' | 'fecha';
export type AvisoLectura = {
  tipo: 'ok' | 'parcial' | 'nada';
  texto: string;
  faltan: DatoFaltante[];
};

const MESES: Record<string, number> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const dos = (n: number) => String(n).padStart(2, '0');

export const normalizarNombre = (texto: string | null | undefined): string => String(texto ?? '')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

// "8/octubre/2026 a las 11:29" o "18 de octubre de 2026" → 2026-10-08
function leerFecha(texto: string): string | undefined {
  const m = texto.match(/(\d{1,2})\s*\/\s*([a-záéíóú]+)\s*\/\s*(\d{4})/i)
    ?? texto.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
  if (!m) return undefined;
  const mes = MESES[normalizarNombre(m[2])];
  const dia = Number(m[1]);
  return mes && dia >= 1 && dia <= 31 ? `${m[3]}-${dos(mes)}-${dos(dia)}` : undefined;
}

// La primera línea que es solo un monto. Con signo ("$ 950") vale un número de hasta 3 cifras;
// si no, tiene que traer punto de miles o coma decimal: así el n.º de operación no cuenta, y
// unos centavos que el OCR pegó ("$ 95050" por $ 950,50) quedan sin leer en vez de dar 100 veces más.
// En los comprobantes de pago los centavos vienen en superíndice y el OCR los pega al punto de miles
// ("$ 56.90000" por $ 56.900,00): se aceptan los grupos de miles seguidos de exactamente 2 dígitos,
// pegados o con un espacio. Es seguro porque después de los grupos de 3 del punto de miles no puede
// venir otro número entero, así que "1.234.56750" es $ 1.234.567,50 y no una cifra de miles.
// El OCR a veces lee el "$" como S, § o 5 (el 5 solo si lo separa un espacio).
const CON_MILES = /^(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{1,2})$/;
const MILES_MAS_CENTAVOS = /^(\d{1,3}(?:\.\d{3})+)\s?(\d{2})$/;
function leerMonto(lineas: string[]): number | undefined {
  for (const linea of lineas) {
    const l = linea.replace(/\.$/, '');
    const conSigno = l.match(/^(?:[$S§]\s*|5\s+)(.+)$/);
    const resto = conSigno ? conSigno[1] : l;
    const superindice = resto.match(MILES_MAS_CENTAVOS);
    if (superindice) return Number(superindice[1].replace(/\./g, '')) * 100 + Number(superindice[2]);
    const valido = (conSigno && /^\d{1,3}(?:,\d{1,2})?$/.test(resto)) || CON_MILES.test(resto);
    if (valido) return aCentavos(resto) ?? undefined;
  }
  return undefined;
}

// Datos de cuenta que siguen al nombre (CVU/CBU/CUIT, a veces mal leídos: "CVvU", "CVu").
const ES_CUENTA = /^(c\W*v\W*v?\W*u|cbu|cuit|cuil|alias)/i;
const ES_ENTIDAD = /mercado\s*pago|banco|brubank|ual[aá]|naranja|cuenta dni/i;
// El ícono de MP se lee como basura antes del nombre ("EG Ana…"): se corta hasta la primera palabra con mayúscula.
const limpiarNombre = (l: string): string => l.replace(/^.*?(?=\p{Lu}\p{Ll}+(?:\s|$))/u, '').trim();

function leerNombres(lineas: string[]): string[] {
  const desde = lineas.findIndex((l) => /origen y destino/i.test(l));
  if (desde < 0) return [];
  const nombres: string[] = [];
  for (let i = desde + 1; i < lineas.length - 1 && nombres.length < 2; i++) {
    const l = lineas[i];
    if (ES_CUENTA.test(l) || ES_ENTIDAD.test(l)) continue;
    const siguiente = lineas[i + 1];
    if (ES_CUENTA.test(siguiente) || ES_ENTIDAD.test(siguiente)) nombres.push(limpiarNombre(l));
  }
  return nombres;
}

export function extraerComprobante(texto: string | null | undefined): DatosComprobante {
  const t = String(texto ?? '');
  const lineas = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const r: DatosComprobante = {};
  const fecha = leerFecha(t);
  if (fecha) r.fecha = fecha;
  const centavos = leerMonto(lineas);
  if (centavos) r.centavos = centavos;
  const [origen, destino] = leerNombres(lineas);
  if (origen) r.origen = origen;
  if (destino) r.destino = destino;
  const operacion = t.match(/operaci[oó]n\D*(\d{6,})/i)?.[1];
  if (operacion) r.operacion = operacion;
  return r;
}

// Quién pagó: el integrante cuyo primer nombre coincide con el primero del origen, si hay uno solo.
export function integrantePorNombre(origen: string | null | undefined, integrantes: Array<{ id: string; nombre: string }>): string | null {
  const primera = normalizarNombre(origen).split(' ')[0];
  if (!primera) return null;
  const candidatos = integrantes.filter((i) => normalizarNombre(i.nombre).split(' ')[0] === primera);
  return candidatos.length === 1 ? candidatos[0].id : null;
}

const FALTA: Record<DatoFaltante, string> = { centavos: 'el monto. Completalo', fecha: 'la fecha. Completala' };
export function avisoLectura(r: DatosComprobante): AvisoLectura {
  if (!r.centavos && !r.fecha) return { tipo: 'nada', texto: 'No pudimos leer este comprobante. Cargalo a mano.', faltan: [] };
  const faltan = (['centavos', 'fecha'] as const).filter((k) => !r[k]);
  if (!faltan.length) return { tipo: 'ok', texto: 'Leímos el comprobante: revisá los datos y guardá.', faltan };
  return { tipo: 'parcial', texto: `No pudimos leer ${FALTA[faltan[0]]} a mano.`, faltan };
}
