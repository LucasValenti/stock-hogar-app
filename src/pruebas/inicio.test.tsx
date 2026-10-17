// Inicio con la capa de datos simulada: los estados de la maqueta «Elegida» y la actualización en vivo.
// (La prueba vive fuera de src/app para que Expo Router no la tome como pantalla.)

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import Inicio from '@/app/(pestanas)/index';
import { formatear } from '@/logica/dinero';
import type { Integrante } from '@/logica/tipos';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/sesion/sesion', () => ({ useSesion: () => ({ yo: { id: 'a', nombre: 'Ana' } }) }));

const mockDatos = {
  integrantes: jest.fn(),
  gastosEntre: jest.fn(),
  escucharCambios: jest.fn(),
};
const mockCola = { pendientes: jest.fn(), rechazadas: jest.fn(), olvidarRechazada: jest.fn() };
jest.mock('@/datos', () => ({
  get datos() {
    return mockDatos;
  },
  obtenerCola: () => mockCola,
  escucharDescartes: () => () => undefined,
}));

const persona = (id: string, nombre: string, sueldo: number): Integrante => ({
  id,
  nombre,
  sueldo,
  email: `${id}@example.com`,
  activo: true,
  baja_desde: null,
  tipo: 'integrante',
  creado: '2026-01-01T12:00:00.000Z',
});
const casa = [persona('a', 'Ana', 600), persona('b', 'Bruno', 400)];
const gasto = (pagado_por: string, total: number) => ({ pagado_por, total, fecha: '2026-10-05', id: `${pagado_por}${total}` });

let avisarCambio: () => void = () => undefined;
beforeEach(() => {
  jest.clearAllMocks();
  mockDatos.integrantes.mockResolvedValue(casa);
  mockCola.pendientes.mockResolvedValue([]);
  mockCola.rechazadas.mockResolvedValue([]);
  mockDatos.escucharCambios.mockImplementation((f: () => void) => {
    avisarCambio = f;
    return () => undefined;
  });
});

test('mientras carga muestra el esqueleto y «Trayendo los gastos de la casa…»', async () => {
  mockDatos.gastosEntre.mockReturnValue(new Promise(() => undefined));
  await render(<Inicio />);
  expect(screen.getByText('Hola, Ana')).toBeTruthy();
  expect(screen.getByText('Trayendo los gastos de la casa…')).toBeTruthy();
});

test('con gastos muestra el total del mes y cómo viene el reparto, con signo y palabra', async () => {
  mockDatos.gastosEntre.mockResolvedValue([gasto('a', 1000_00)]);
  await render(<Inicio />);
  expect(await screen.findByLabelText(`Gastos del mes: ${formatear(1000_00)}. 1 gasto.`)).toBeTruthy();
  expect(screen.getByText('Cómo viene el reparto')).toBeTruthy();
  // Ana puso todo y le toca 60 %: recibe 400; Bruno pone 400.
  expect(screen.getByText(`+ ${formatear(400_00)}`)).toBeTruthy();
  expect(screen.getByText('recibe')).toBeTruthy();
  expect(screen.getByText(`− ${formatear(400_00)}`)).toBeTruthy();
  expect(screen.getByText('pone')).toBeTruthy();
});

test('sin conexión avisa «No pudimos traer los datos» y Reintentar vuelve a pedir', async () => {
  mockDatos.gastosEntre.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await render(<Inicio />);
  expect(await screen.findByText('No pudimos traer los datos')).toBeTruthy();
  mockDatos.gastosEntre.mockResolvedValue([]);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Reintentar' })));
  expect(await screen.findByText(/^Arrancó /)).toBeTruthy();
});

test('un mes sin gastos muestra $ 0 y el aviso con «Cargar gasto»', async () => {
  mockDatos.gastosEntre.mockResolvedValue([]);
  await render(<Inicio />);
  expect(await screen.findByText('Todavía no cargó nadie')).toBeTruthy();
  expect(screen.getByText(formatear(0))).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cargar gasto' })).toBeTruthy();
});

test('varios avisos seguidos (un gasto con sus ítems) piden los datos una sola vez', async () => {
  mockDatos.gastosEntre.mockResolvedValue([]);
  await render(<Inicio />);
  await screen.findByText('Todavía no cargó nadie');
  expect(mockDatos.gastosEntre).toHaveBeenCalledTimes(1);
  mockDatos.gastosEntre.mockResolvedValue([gasto('b', 500_00)]);
  await act(async () => {
    avisarCambio();
    avisarCambio();
    avisarCambio();
  });
  expect(await screen.findByLabelText(`Gastos del mes: ${formatear(500_00)}. 1 gasto.`)).toBeTruthy();
  expect(mockDatos.gastosEntre).toHaveBeenCalledTimes(2);
});

test('se actualiza solo cuando alguien cambia algo', async () => {
  mockDatos.gastosEntre.mockResolvedValue([]);
  await render(<Inicio />);
  await screen.findByText('Todavía no cargó nadie');
  mockDatos.gastosEntre.mockResolvedValue([gasto('b', 500_00)]);
  await act(async () => avisarCambio());
  expect(await screen.findByLabelText(`Gastos del mes: ${formatear(500_00)}. 1 gasto.`)).toBeTruthy();
});

test('avisa los gastos de quien tiene la sesión que esperan conexión', async () => {
  mockDatos.gastosEntre.mockResolvedValue([]);
  mockCola.pendientes.mockResolvedValue([
    { id: 'o1', tipo: 'guardarGasto', duenio: 'a', datos: {} },
    { id: 'o2', tipo: 'guardarGasto', duenio: 'b', datos: {} },
  ]);
  await render(<Inicio />);
  expect(await screen.findByText('1 gasto guardado en el celu: se manda cuando vuelva la conexión.')).toBeTruthy();
});
