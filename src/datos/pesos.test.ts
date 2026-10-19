// pesosDelMes con la base en memoria: quien puede ver sueldos reparte con los sueldos reales;
// el resto, con las partes del mes, y nunca se le piden los sueldos.

import { mesActual } from '@/logica/meses';

import { crearDatosEnMemoria, semillaDeEjemplo } from './memoria';
import type { Datos } from './tipos';

const m = vi.hoisted(() => ({ datos: null as unknown as Datos }));
vi.mock('@/datos', () => ({
  get datos() {
    return m.datos;
  },
}));

import { pesosDelMes } from './pesos';

const MES = mesActual();
const BRUNO = 'ejemplo-bruno';

function usar(yo?: string, permisos: Array<{ integrante_id: string; permiso: 'sueldos' | 'altas_bajas' }> = []) {
  m.datos = crearDatosEnMemoria({ ...semillaDeEjemplo(), permisos }, yo ? { yo } : {});
  return { sueldos: vi.spyOn(m.datos, 'sueldos'), partes: vi.spyOn(m.datos, 'partesDelMes') };
}

test('con verSueldos usa los sueldos reales', async () => {
  const espia = usar();
  const reales = await m.datos.sueldos();
  espia.sueldos.mockClear();
  expect(await pesosDelMes(MES, true)).toEqual(reales);
  expect(Object.keys(reales)).toHaveLength(3);
  expect(espia.sueldos).toHaveBeenCalledTimes(1);
  expect(espia.partes).not.toHaveBeenCalled();
});

test('sin verSueldos usa las partes del mes', async () => {
  const espia = usar(BRUNO);
  const partes = await m.datos.partesDelMes(MES);
  expect(await pesosDelMes(MES, false)).toEqual(partes);
  expect(Object.values(partes).reduce((s, x) => s + x, 0)).toBeCloseTo(1e12, -1);
  expect(espia.partes).toHaveBeenCalledWith(MES);
});

test('sin permiso nunca se piden los sueldos reales', async () => {
  const espia = usar(BRUNO);
  await pesosDelMes(MES, false);
  expect(espia.sueldos).not.toHaveBeenCalled();
});

test('con el permiso «sueldos» dado por el admin también reparte con los sueldos reales', async () => {
  const espia = usar(BRUNO, [{ integrante_id: BRUNO, permiso: 'sueldos' }]);
  const pesos = await pesosDelMes(MES, true);
  expect(Object.values(pesos).every((x) => x !== null && x > 0)).toBe(true);
  expect(espia.partes).not.toHaveBeenCalled();
});
