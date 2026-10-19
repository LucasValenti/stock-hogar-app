import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { formatear } from '@/logica/dinero';

import { AvisoCola } from './AvisoCola';

// Intl separa el «$» con un espacio duro; el matcher de Testing Library normaliza a espacio común.
const texto = (s: string) => s.replace(/\u00a0/g, ' ');

const m = vi.hoisted(() => ({
  mockCola: { pendientes: vi.fn(), rechazadas: vi.fn(), olvidarRechazada: vi.fn() },
  descarte: { fn: (() => undefined) as () => void },
  cambio: { fn: (() => undefined) as () => void },
}));

vi.mock('@/sesion/sesion', () => ({ useSesion: () => ({ yo: { id: 'ana', nombre: 'Ana' } }) }));
vi.mock('@/datos', () => ({
  obtenerCola: () => m.mockCola,
  escucharDescartes: (f: () => void) => {
    m.descarte.fn = f;
    return () => undefined;
  },
  get datos() {
    return {
      escucharCambios: (f: () => void) => {
        m.cambio.fn = f;
        return () => undefined;
      },
    };
  },
}));

const gastoOp = (id: string, duenio: string, fecha = '2026-10-12', total = 500_00) => ({
  id,
  tipo: 'guardarGasto',
  duenio,
  datos: { gasto: { fecha, total, modo: 'total' }, items: [] },
});

beforeEach(() => {
  vi.clearAllMocks();
  m.mockCola.pendientes.mockResolvedValue([]);
  m.mockCola.rechazadas.mockResolvedValue([]);
  m.mockCola.olvidarRechazada.mockResolvedValue(undefined);
});

test('sin nada pendiente ni rechazado no muestra nada', async () => {
  render(<AvisoCola />);
  await act(async () => undefined);
  expect(screen.queryByText(/celu/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Descartar' })).not.toBeInTheDocument();
});

test('cuenta solo las escrituras pendientes de quien tiene la sesión', async () => {
  m.mockCola.pendientes.mockResolvedValue([gastoOp('1', 'ana'), gastoOp('2', 'bruno'), gastoOp('3', 'ana')]);
  render(<AvisoCola />);
  expect(await screen.findByText('2 gastos guardados en el celu: se mandan cuando vuelva la conexión.')).toBeInTheDocument();
});

test('muestra las rechazadas propias con «Descartar», que las olvida', async () => {
  m.mockCola.rechazadas.mockResolvedValue([
    { op: gastoOp('r1', 'ana'), code: 'P0001', message: 'MES_CERRADO', cuando: '2026-10-13T10:00:00.000Z' },
    { op: gastoOp('r2', 'bruno'), code: 'P0001', message: 'MES_CERRADO', cuando: '2026-10-13T10:00:00.000Z' },
  ]);
  render(<AvisoCola />);
  expect(await screen.findByText(texto(`No se pudo guardar el gasto del 12/10 por ${formatear(500_00)}.`))).toBeInTheDocument();
  expect(screen.getByText('Ese mes está cerrado. Reabrilo desde Análisis para cambiarlo.')).toBeInTheDocument();
  const descartar = screen.getAllByRole('button', { name: 'Descartar' });
  expect(descartar).toHaveLength(1);
  m.mockCola.rechazadas.mockResolvedValue([]);
  await userEvent.click(descartar[0]);
  expect(m.mockCola.olvidarRechazada).toHaveBeenCalledWith('r1');
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Descartar' })).not.toBeInTheDocument());
});

test('se actualiza cuando la base rechaza algo o cambia algo', async () => {
  render(<AvisoCola />);
  await act(async () => undefined);
  m.mockCola.pendientes.mockResolvedValue([gastoOp('1', 'ana')]);
  await act(async () => {
    m.cambio.fn();
  });
  expect(await screen.findByText('1 gasto guardado en el celu: se manda cuando vuelva la conexión.')).toBeInTheDocument();
  m.mockCola.pendientes.mockResolvedValue([]);
  m.mockCola.rechazadas.mockResolvedValue([{ op: gastoOp('r1', 'ana'), code: '23514', message: 'x', cuando: '' }]);
  await act(async () => {
    m.descarte.fn();
  });
  expect(await screen.findByRole('button', { name: 'Descartar' })).toBeInTheDocument();
});
