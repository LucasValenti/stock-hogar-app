// La sesión con la demo de tiempo de ejecución: entrar deja a Ana con la casa de ejemplo sin crear
// el cliente de Supabase, y salir vuelve a la pantalla de ingreso. En el build solo-memoria ya arranca
// en demo y salir no hace nada. La capa de datos va simulada, así no se toca ni la red ni el almacén.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Integrante } from '@/logica/tipos';

const ana: Integrante = {
  id: 'ejemplo-ana',
  nombre: 'Ana',
  sueldo: null,
  email: 'ana@example.com',
  activo: true,
  baja_desde: null,
  tipo: 'integrante',
  creado: '2026-01-01T12:00:00.000Z',
  admin: true,
  color: null,
};

const m = vi.hoisted(() => ({
  datos: {
    miIntegrante: vi.fn(),
    miAcceso: vi.fn(async () => ({ admin: true, permisos: [] })),
    escucharCambios: vi.fn(() => () => undefined),
  },
  entrarDemo: vi.fn(),
  salirDemo: vi.fn(),
  fijarIntegrante: vi.fn(),
  suscripcion: { unsubscribe: vi.fn() },
}));

vi.mock('@/datos', () => ({
  get datos() {
    return m.datos;
  },
  esModoMemoria: () => import.meta.env.VITE_DATOS === 'memoria',
  entrarDemo: () => m.entrarDemo(),
  salirDemo: () => m.salirDemo(),
  fijarIntegrante: (id: string | null) => m.fijarIntegrante(id),
}));

vi.mock('@/datos/cliente', () => ({
  obtenerCliente: () => ({
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: m.suscripcion } })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  }),
}));

import { SesionProvider, useSesion } from './sesion';

function Sonda() {
  const s = useSesion();
  return (
    <>
      <span data-testid="estado">{s.estado}</span>
      <span data-testid="nombre">{s.yo?.nombre ?? ''}</span>
      <span data-testid="demo">{String(s.demo)}</span>
      <button type="button" onClick={() => s.entrarDemo()}>
        Entrar a la demo
      </button>
      <button type="button" onClick={() => void s.salir()}>
        Salir
      </button>
    </>
  );
}

const estado = () => screen.getByTestId('estado').textContent;
const enDemo = () => screen.getByTestId('demo').textContent;
const tocar = (nombre: string) => userEvent.click(screen.getByRole('button', { name: nombre }));

beforeEach(() => {
  vi.clearAllMocks();
  m.datos.miIntegrante.mockResolvedValue(ana);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const abrir = () =>
  render(
    <SesionProvider>
      <Sonda />
    </SesionProvider>,
  );

test('entrar a la demo deja la sesión lista como Ana y en demo; salir vuelve a sin-sesion', async () => {
  abrir();
  expect(estado()).not.toBe('lista');

  await tocar('Entrar a la demo');
  await waitFor(() => expect(estado()).toBe('lista'));
  expect(screen.getByTestId('nombre').textContent).toBe('Ana');
  expect(enDemo()).toBe('true');
  expect(m.entrarDemo).toHaveBeenCalledTimes(1);

  await tocar('Salir');
  expect(estado()).toBe('sin-sesion');
  expect(enDemo()).toBe('false');
  expect(m.salirDemo).toHaveBeenCalledTimes(1);
});

test('en el build solo-memoria arranca en demo como Ana y salir no hace nada', async () => {
  vi.stubEnv('VITE_DATOS', 'memoria');
  abrir();
  await waitFor(() => expect(estado()).toBe('lista'));
  expect(screen.getByTestId('nombre').textContent).toBe('Ana');
  expect(enDemo()).toBe('true');

  await tocar('Salir');
  expect(estado()).toBe('lista');
  expect(enDemo()).toBe('true');
  expect(m.salirDemo).not.toHaveBeenCalled();
});
