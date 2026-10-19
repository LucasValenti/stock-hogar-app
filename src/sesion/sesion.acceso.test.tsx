// El acceso de quien usa la app (admin y permisos) en la sesión: `null` mientras no se sabe,
// y se vuelve a pedir cuando cambia algo en la casa (un permiso dado o quitado).

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Acceso, Integrante } from '@/logica/tipos';

const ana: Integrante = {
  id: 'ejemplo-ana',
  nombre: 'Ana',
  sueldo: null,
  email: 'ana@example.com',
  activo: true,
  baja_desde: null,
  tipo: 'integrante',
  creado: '2026-01-01T12:00:00.000Z',
  admin: false,
  color: null,
};

const m = vi.hoisted(() => ({
  datos: { miIntegrante: vi.fn(), miAcceso: vi.fn(), escucharCambios: vi.fn() },
  oyentes: new Set<() => void>(),
  suscripcion: { unsubscribe: vi.fn() },
}));

vi.mock('@/datos', () => ({
  get datos() {
    return m.datos;
  },
  esModoMemoria: () => false,
  entrarDemo: () => undefined,
  salirDemo: () => undefined,
  fijarIntegrante: () => undefined,
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
      <span data-testid="acceso">{JSON.stringify(s.acceso)}</span>
      <button type="button" onClick={() => s.entrarDemo()}>
        Entrar a la demo
      </button>
    </>
  );
}

const acceso = () => JSON.parse(screen.getByTestId('acceso').textContent ?? 'null') as Acceso | null;

beforeEach(() => {
  vi.clearAllMocks();
  m.oyentes.clear();
  m.datos.miIntegrante.mockResolvedValue(ana);
  m.datos.escucharCambios.mockImplementation((f: () => void) => {
    m.oyentes.add(f);
    return () => {
      m.oyentes.delete(f);
    };
  });
});

async function entrar() {
  render(
    <SesionProvider>
      <Sonda />
    </SesionProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Entrar a la demo' }));
  await waitFor(() => expect(screen.getByTestId('estado').textContent).toBe('lista'));
}

test('el acceso es null hasta que miAcceso responde; después trae admin y permisos', async () => {
  let responder: (a: Acceso) => void = () => undefined;
  m.datos.miAcceso.mockReturnValue(new Promise<Acceso>((r) => (responder = r)));
  await entrar();
  expect(acceso()).toBeNull();
  await act(async () => responder({ admin: false, permisos: ['sueldos'] }));
  expect(acceso()).toEqual({ admin: false, permisos: ['sueldos'] });
});

test('se vuelve a pedir cuando escucharCambios avisa', async () => {
  m.datos.miAcceso.mockResolvedValueOnce({ admin: false, permisos: ['sueldos'] });
  await entrar();
  await waitFor(() => expect(acceso()).toEqual({ admin: false, permisos: ['sueldos'] }));
  m.datos.miAcceso.mockResolvedValueOnce({ admin: false, permisos: [] });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    act(() => m.oyentes.forEach((f) => f()));
    await act(async () => vi.runOnlyPendingTimersAsync());
  } finally {
    vi.useRealTimers();
  }
  await waitFor(() => expect(acceso()).toEqual({ admin: false, permisos: [] }));
  expect(m.datos.miAcceso).toHaveBeenCalledTimes(2);
});

test('sin sesión lista no se pide el acceso', async () => {
  render(
    <SesionProvider>
      <Sonda />
    </SesionProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('estado').textContent).not.toBe('lista'));
  expect(m.datos.miAcceso).not.toHaveBeenCalled();
  expect(acceso()).toBeNull();
});
