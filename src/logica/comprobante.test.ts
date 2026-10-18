import { extraerComprobante, normalizarNombre, integrantePorNombre, avisoLectura } from './comprobante';

// Nombres de fantasía: el comprobante original traía los de personas reales.
const MUESTRA = `mercado
pago
Comprobante de transferencia
8/octubre/2026 a las 11:29.
$ 48.600
Motivo: Varios
Origen y destino
EG Marta Elena Quiroga
Mercado Pago
CVvU: 0000000000000000000000
CUIT/CUIL: 00-00000000-0
EG Bruno Salas
Mercado Pago
CVu: 0000000000000000000000
CUIT/CUIL: 00-00000000-0
N.* de operación de Mercado Pago
123456789012
Mago, tu asistente
Do iliinczntea
Hacé pagos y :
transferencias por Eo
mensaje o audio
o Enviado!
¡Descargá la app y conocela! I 4`;

// Comprobante de PAGO (QR, tarjeta o link): otra fecha (larga) y los centavos en superíndice.
const MUESTRA_PAGO = `Comprobante de pago
Domingo, 18 de octubre de 2026, 10:03 hs.
$ 56.90000
Origen y destino
Ana Ejemplo
CUIL: 00-00000000-0
Mercado Pago
La Verduleria
CUIT: 00-00000000-0
Mercado Pago
N.º de operación de Mercado Pago
123456789012`;

test('lee los cinco datos de una transferencia real', () => {
  expect(extraerComprobante(MUESTRA)).toStrictEqual({
    fecha: '2026-10-08', centavos: 4860000, origen: 'Marta Elena Quiroga', destino: 'Bruno Salas', operacion: '123456789012',
  });
});

test('lee los cinco datos de un comprobante de pago', () => {
  expect(extraerComprobante(MUESTRA_PAGO)).toStrictEqual({
    fecha: '2026-10-18', centavos: 5690000, origen: 'Ana Ejemplo', destino: 'La Verduleria', operacion: '123456789012',
  });
});

test('centavos en superíndice pegados o separados por un espacio', () => {
  expect(extraerComprobante(MUESTRA_PAGO.replace('$ 56.90000', '$ 56.900 00')).centavos).toBe(5690000);
  expect(extraerComprobante(MUESTRA_PAGO.replace('$ 56.90000', '$ 1.234.56750')).centavos).toBe(123456750);
});

test('fecha larga sin día de la semana, con setiembre y mayúsculas', () => {
  expect(extraerComprobante(MUESTRA_PAGO.replace('Domingo, ', '')).fecha).toBe('2026-10-18');
  expect(extraerComprobante(MUESTRA_PAGO.replace('18 de octubre de 2026', '18 de Setiembre de 2026')).fecha).toBe('2026-09-18');
  expect(extraerComprobante(MUESTRA_PAGO.replace('18 de octubre de 2026', '18 DE OCTUBRE DE 2026')).fecha).toBe('2026-10-18');
});

test('el $ leído como S, 5 o §, y montos con centavos', () => {
  for (const linea of ['S 48.600', '5 48.600', '§48.600', '48.600']) {
    expect([linea, extraerComprobante(MUESTRA.replace('$ 48.600', linea)).centavos]).toStrictEqual([linea, 4860000]);
  }
  expect(extraerComprobante(MUESTRA.replace('$ 48.600', '$ 1.234,56')).centavos).toBe(123456);
  expect(extraerComprobante(MUESTRA.replace('$ 48.600', '$ 950')).centavos).toBe(95000);
});

test('el n.º de operación y la hora nunca se toman como monto', () => {
  const sinMonto = extraerComprobante(MUESTRA.replace('$ 48.600\n', ''));
  expect(sinMonto.centavos).toBe(undefined);
  expect(sinMonto.operacion).toBe('123456789012');
});

test('fecha con espacios, setiembre y mes inválido', () => {
  expect(extraerComprobante(MUESTRA.replace('8/octubre/2026', '8 / octubre / 2026')).fecha).toBe('2026-10-08');
  expect(extraerComprobante(MUESTRA.replace('8/octubre/2026', '30/setiembre/2026')).fecha).toBe('2026-09-30');
  expect(extraerComprobante(MUESTRA.replace('8/octubre/2026', '8/octobre/2026')).fecha).toBe(undefined);
});

test('ruido antes de los nombres y n.º de operación en la misma línea', () => {
  const r = extraerComprobante(MUESTRA.replace('EG Marta', '5 Marta').replace('EG Bruno', '<> Bruno')
    .replace('N.* de operación de Mercado Pago\n123456789012', 'N.º de operación 123456789012'));
  expect(r.origen).toBe('Marta Elena Quiroga');
  expect(r.destino).toBe('Bruno Salas');
  expect(r.operacion).toBe('123456789012');
});

test('texto que no es un comprobante', () => {
  expect(extraerComprobante('Hola, esto es una foto del perro\n12\nfin')).toStrictEqual({});
  expect(extraerComprobante('')).toStrictEqual({});
  expect(extraerComprobante(undefined)).toStrictEqual({});
});

test('normalizar nombres', () => {
  expect(normalizarNombre('  Ramón   PÉREZ ')).toBe('ramon perez');
});

test('quién pagó: por la primera palabra, solo si hay uno', () => {
  const casa = [{ id: 'm', nombre: 'Marta' }, { id: 'n', nombre: 'Matías' }, { id: 's', nombre: 'Elena' }];
  expect(integrantePorNombre('Marta Elena Quiroga', casa)).toBe('m');
  expect(integrantePorNombre('MATIAS ROLDAN', casa)).toBe('n');
  expect(integrantePorNombre('Bruno Salas', casa)).toBe(null);
  expect(integrantePorNombre(undefined, casa)).toBe(null);
  expect(integrantePorNombre('Marta X', [...casa, { id: 'm2', nombre: 'Marta Gómez' }])).toBe(null);
});

test('aviso según lo que se leyó', () => {
  expect(avisoLectura({ fecha: '2026-10-08', centavos: 100 })).toStrictEqual(
    { tipo: 'ok', texto: 'Leímos el comprobante: revisá los datos y guardá.', faltan: [] });
  expect(avisoLectura({ fecha: '2026-10-08' })).toStrictEqual(
    { tipo: 'parcial', texto: 'No pudimos leer el monto. Completalo a mano.', faltan: ['centavos'] });
  expect(avisoLectura({ centavos: 100, destino: 'X' })).toStrictEqual(
    { tipo: 'parcial', texto: 'No pudimos leer la fecha. Completala a mano.', faltan: ['fecha'] });
  expect(avisoLectura({ destino: 'X' }).tipo).toBe('nada');
  expect(avisoLectura({}).texto).toBe('No pudimos leer este comprobante. Cargalo a mano.');
});

test('centavos pegados por el OCR ("$ 95050" de $ 950,50) no se toman como monto', () => {
  expect(extraerComprobante(MUESTRA.replace('$ 48.600', '$ 95050')).centavos).toBe(undefined);
  expect(extraerComprobante(MUESTRA.replace('$ 48.600', '$ 48600')).centavos).toBe(undefined);
  expect(extraerComprobante(MUESTRA.replace('$ 48.600', '$ 950,50')).centavos).toBe(95050);
});
