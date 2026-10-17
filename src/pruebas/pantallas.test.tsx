// PantallaError: si hay una sesión abierta, también se puede cerrar desde ahí (no solo reintentar).

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { PantallaError } from '@/sesion/pantallas';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockSesion = { email: null as string | null, salir: jest.fn() };
jest.mock('@/sesion/sesion', () => ({ useSesion: () => mockSesion }));

beforeEach(() => {
  jest.clearAllMocks();
  mockSesion.email = null;
  mockSesion.salir.mockResolvedValue(undefined);
});

const sinRed = new TypeError('Failed to fetch');

test('sin sesión solo ofrece probar de nuevo', async () => {
  await render(<PantallaError error={sinRed} onReintentar={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Probar de nuevo' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
});

test('con sesión ofrece también «Cerrar sesión» y la cierra', async () => {
  mockSesion.email = 'ana@example.com';
  await render(<PantallaError error={sinRed} onReintentar={jest.fn()} />);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' })));
  expect(mockSesion.salir).toHaveBeenCalledTimes(1);
});

test('si no puede cerrar la sesión, lo dice', async () => {
  mockSesion.email = 'ana@example.com';
  // SIN_CONEXION llega redactado para la persona: mensajeError lo muestra tal cual.
  mockSesion.salir.mockRejectedValue(Object.assign(new Error('No se pudo cerrar la sesión.'), { code: 'SIN_CONEXION' }));
  await render(<PantallaError error={sinRed} onReintentar={jest.fn()} />);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' })));
  expect(await screen.findByText('No se pudo cerrar la sesión.')).toBeTruthy();
});
