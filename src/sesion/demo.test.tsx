// La sesión con la demo de tiempo de ejecución: entrar deja a Ana con la casa de ejemplo sin crear
// el cliente de Supabase, y salir vuelve a la pantalla de ingreso. En el build solo-memoria ya arranca
// en demo y salir no hace nada. La capa de datos va simulada, así no se toca ni la red ni el almacén.

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

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
};

const mockDatos = { miIntegrante: jest.fn() };
const mockEntrarDemo = jest.fn();
const mockSalirDemo = jest.fn();
const mockFijar = jest.fn();
let mockMemoria = false;

jest.mock('@/datos', () => ({
  get datos() {
    return mockDatos;
  },
  esModoMemoria: () => mockMemoria,
  entrarDemo: () => mockEntrarDemo(),
  salirDemo: () => mockSalirDemo(),
  fijarIntegrante: (id: string | null) => mockFijar(id),
}));

const mockSuscripcion = { unsubscribe: jest.fn() };
jest.mock('@/datos/cliente', () => ({
  obtenerCliente: () => ({
    auth: {
      onAuthStateChange: jest.fn(() => ({ data: { subscription: mockSuscripcion } })),
      getSession: jest.fn(async () => ({ data: { session: null } })),
    },
  }),
}));

import { SesionProvider, useSesion } from './sesion';

function Sonda() {
  const s = useSesion();
  return (
    <>
      <Text testID="estado">{s.estado}</Text>
      <Text testID="nombre">{s.yo?.nombre ?? ''}</Text>
      <Text testID="demo">{String(s.demo)}</Text>
      <Pressable accessibilityRole="button" onPress={() => s.entrarDemo()}>
        <Text>Entrar a la demo</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => void s.salir()}>
        <Text>Salir</Text>
      </Pressable>
    </>
  );
}

const estado = () => screen.getByTestId('estado').props.children;
const enDemo = () => screen.getByTestId('demo').props.children;
const tocar = async (nombre: string) => {
  await act(async () => fireEvent.press(screen.getByRole('button', { name: nombre })));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMemoria = false;
  mockDatos.miIntegrante.mockResolvedValue(ana);
});

const abrir = () => render(
  <SesionProvider>
    <Sonda />
  </SesionProvider>,
);

test('entrar a la demo deja la sesión lista como Ana y en demo; salir vuelve a sin-sesion', async () => {
  await abrir();
  expect(estado()).not.toBe('lista');

  await tocar('Entrar a la demo');
  await waitFor(() => expect(estado()).toBe('lista'));
  expect(screen.getByTestId('nombre').props.children).toBe('Ana');
  expect(enDemo()).toBe('true');
  expect(mockEntrarDemo).toHaveBeenCalledTimes(1);

  await tocar('Salir');
  expect(estado()).toBe('sin-sesion');
  expect(enDemo()).toBe('false');
  expect(mockSalirDemo).toHaveBeenCalledTimes(1);
});

test('en el build solo-memoria arranca en demo como Ana y salir no hace nada', async () => {
  mockMemoria = true;
  await abrir();
  await waitFor(() => expect(estado()).toBe('lista'));
  expect(screen.getByTestId('nombre').props.children).toBe('Ana');
  expect(enDemo()).toBe('true');

  await tocar('Salir');
  expect(estado()).toBe('lista');
  expect(enDemo()).toBe('true');
  expect(mockSalirDemo).not.toHaveBeenCalled();
});
