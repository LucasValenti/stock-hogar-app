// Ingreso: además del código por email, debajo del formulario deja probar la demo sin cuenta.

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import Ingresar from '@/app/ingresar';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockSesion = { entrarDemo: jest.fn() };
jest.mock('@/sesion/sesion', () => ({ useSesion: () => mockSesion }));
jest.mock('@/sesion/acceso', () => ({ pedirCodigo: jest.fn(), verificarCodigo: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
});

test('el ingreso ofrece probar la demo, con su aviso, y la inicia al tocarlo', async () => {
  await render(<Ingresar />);
  expect(screen.getByText('Con datos inventados de una casa de ejemplo. No se guarda nada.')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Probar la demo' })));
  expect(mockSesion.entrarDemo).toHaveBeenCalledTimes(1);
});
