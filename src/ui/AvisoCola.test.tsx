import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { formatear } from '@/logica/dinero';

import { AvisoCola } from './AvisoCola';

jest.mock('@/sesion/sesion', () => ({ useSesion: () => ({ yo: { id: 'ana', nombre: 'Ana' } }) }));

const gastoOp = (id: string, duenio: string, fecha = '2026-10-12', total = 500_00) => ({
  id,
  tipo: 'guardarGasto',
  duenio,
  datos: { gasto: { fecha, total, modo: 'total' }, items: [] },
});
const mockCola = { pendientes: jest.fn(), rechazadas: jest.fn(), olvidarRechazada: jest.fn() };
let avisarDescarte: () => void = () => undefined;
let avisarCambio: () => void = () => undefined;
jest.mock('@/datos', () => ({
  obtenerCola: () => mockCola,
  escucharDescartes: (f: () => void) => {
    avisarDescarte = f;
    return () => undefined;
  },
  get datos() {
    return {
      escucharCambios: (f: () => void) => {
        avisarCambio = f;
        return () => undefined;
      },
    };
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCola.pendientes.mockResolvedValue([]);
  mockCola.rechazadas.mockResolvedValue([]);
  mockCola.olvidarRechazada.mockResolvedValue(undefined);
});

test('sin nada pendiente ni rechazado no muestra nada', async () => {
  await render(<AvisoCola />);
  await act(async () => undefined);
  expect(screen.queryByText(/celu/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Descartar' })).toBeNull();
});

test('cuenta solo las escrituras pendientes de quien tiene la sesión', async () => {
  mockCola.pendientes.mockResolvedValue([gastoOp('1', 'ana'), gastoOp('2', 'bruno'), gastoOp('3', 'ana')]);
  await render(<AvisoCola />);
  expect(await screen.findByText('2 gastos guardados en el celu: se mandan cuando vuelva la conexión.')).toBeTruthy();
});

test('muestra las rechazadas propias con «Descartar», que las olvida', async () => {
  mockCola.rechazadas.mockResolvedValue([
    { op: gastoOp('r1', 'ana'), code: 'P0001', message: 'MES_CERRADO', cuando: '2026-10-13T10:00:00.000Z' },
    { op: gastoOp('r2', 'bruno'), code: 'P0001', message: 'MES_CERRADO', cuando: '2026-10-13T10:00:00.000Z' },
  ]);
  await render(<AvisoCola />);
  expect(await screen.findByText(`No se pudo guardar el gasto del 12/10 por ${formatear(500_00)}.`)).toBeTruthy();
  expect(screen.getByText('Ese mes está cerrado. Reabrilo desde Análisis para cambiarlo.')).toBeTruthy();
  const descartar = screen.getAllByRole('button', { name: 'Descartar' });
  expect(descartar).toHaveLength(1);
  mockCola.rechazadas.mockResolvedValue([]);
  await act(async () => fireEvent.press(descartar[0]));
  expect(mockCola.olvidarRechazada).toHaveBeenCalledWith('r1');
  expect(screen.queryByRole('button', { name: 'Descartar' })).toBeNull();
});

test('se actualiza cuando la base rechaza algo o cambia algo', async () => {
  await render(<AvisoCola />);
  await act(async () => undefined);
  mockCola.pendientes.mockResolvedValue([gastoOp('1', 'ana')]);
  await act(async () => avisarCambio());
  expect(await screen.findByText('1 gasto guardado en el celu: se manda cuando vuelva la conexión.')).toBeTruthy();
  mockCola.pendientes.mockResolvedValue([]);
  mockCola.rechazadas.mockResolvedValue([{ op: gastoOp('r1', 'ana'), code: '23514', message: 'x', cuando: '' }]);
  await act(async () => avisarDescarte());
  expect(await screen.findByRole('button', { name: 'Descartar' })).toBeTruthy();
});
