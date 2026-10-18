// Compartir comprobantes a la app: el módulo nativo (mockeado) y el reparto entre el hook que abre
// Cargar, Cargar que toma el archivo, y el lector de PDF nativo sin la app instalada.
// Va en .ts (sin JSX): la pantalla Cargar se arma con createElement.

import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { createElement } from 'react';

import type { EstadoSesion } from '@/sesion/estado';
import type { Integrante } from '@/logica/tipos';

type Archivo = { uri: string; tipo: string; bytes: number };

// ——— Mocks ———

let mockEstado: EstadoSesion = 'lista';
jest.mock('@/sesion/sesion', () => ({
  useSesion: () => ({ estado: mockEstado, yo: { id: 'ana', nombre: 'Ana' } }),
}));

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => mockParams,
}));

const mockTomarCompartido = jest.fn();
let mockAvisoCompartido: (() => void) | null = null;
jest.mock('./compartido', () => ({
  tomarCompartido: (...args: unknown[]) => mockTomarCompartido(...args),
  alCompartir: (avisar: () => void) => {
    mockAvisoCompartido = avisar;
    return () => {
      mockAvisoCompartido = null;
    };
  },
}));

const mockUsar = jest.fn();
jest.mock('@/comprobante/useComprobante', () => ({
  useComprobante: () => ({ usar: mockUsar, elegir: jest.fn(), leyendo: false, aviso: null }),
}));

const mockDatos = {
  integrantes: jest.fn(),
  categorias: jest.fn(),
  productos: jest.fn(),
  anotaciones: jest.fn(),
  mesesCerrados: jest.fn(),
  gasto: jest.fn(),
  guardarGasto: jest.fn(),
  borrarGasto: jest.fn(),
  gastoPorOperacion: jest.fn(),
  categoriaDeDestino: jest.fn(),
};
const mockCola = { pendientes: jest.fn(), rechazadas: jest.fn(), olvidarRechazada: jest.fn() };
jest.mock('@/datos', () => ({
  get datos() {
    return mockDatos;
  },
  obtenerCola: () => mockCola,
  escucharDescartes: () => () => undefined,
}));

jest.mock('@/datos/id', () => ({ nuevoId: () => '00000000-0000-4000-8000-000000000001' }));

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

import Cargar from '@/app/cargar';
import { leerTextoPdf, OcrNoDisponible } from './pdf.native';
import { guardarPendiente, tomarPendiente, useCompartidoPendiente } from './useCompartidoPendiente';

const persona = (id: string, nombre: string): Integrante => ({
  id,
  nombre,
  sueldo: 100_00,
  email: `${id}@example.com`,
  activo: true,
  baja_desde: null,
  tipo: 'integrante',
  creado: '2026-01-01T12:00:00.000Z',
});

beforeEach(() => {
  jest.clearAllMocks();
  mockEstado = 'lista';
  mockParams = {};
  mockAvisoCompartido = null;
  mockTomarCompartido.mockResolvedValue(null);
  tomarPendiente();
  mockDatos.integrantes.mockResolvedValue([persona('ana', 'Ana')]);
  mockDatos.categorias.mockResolvedValue([]);
  mockDatos.productos.mockResolvedValue([]);
  mockDatos.anotaciones.mockResolvedValue([]);
  mockDatos.mesesCerrados.mockResolvedValue(new Set());
  mockDatos.gasto.mockResolvedValue(null);
  mockCola.pendientes.mockResolvedValue([]);
  mockCola.rechazadas.mockResolvedValue([]);
});

// ——— El hook que abre Cargar ———

test('con la sesión sin estar lista no abre Cargar', async () => {
  mockEstado = 'cargando';
  mockTomarCompartido.mockResolvedValue({ uri: 'file://c.pdf', tipo: 'application/pdf', bytes: 10 });
  await renderHook(() => useCompartidoPendiente());
  await act(async () => undefined);

  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(tomarPendiente()).toBeNull();
});

test('al quedar la sesión lista abre Cargar una sola vez, con el comprobante guardado', async () => {
  mockEstado = 'cargando';
  mockTomarCompartido.mockResolvedValue({ uri: 'file://c.pdf', tipo: 'application/pdf', bytes: 10 });
  const { rerender } = await renderHook(() => useCompartidoPendiente());
  await act(async () => undefined);
  expect(mockRouter.push).not.toHaveBeenCalled();

  mockEstado = 'lista';
  await act(async () => rerender(undefined));

  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  expect(mockRouter.push).toHaveBeenCalledWith('/cargar?compartido=1');
  expect(tomarPendiente()).toEqual({ uri: 'file://c.pdf', tipo: 'application/pdf', bytes: 10 });
});

test('un comprobante que llega con la app abierta abre Cargar, salvo si ya hay uno esperando', async () => {
  mockTomarCompartido.mockResolvedValue(null);
  await renderHook(() => useCompartidoPendiente());
  await act(async () => undefined);
  expect(mockRouter.push).not.toHaveBeenCalled();

  mockTomarCompartido.mockResolvedValueOnce({ uri: 'file://c.pdf', tipo: 'application/pdf', bytes: 10 });
  await act(async () => mockAvisoCompartido?.());
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  expect(mockRouter.push).toHaveBeenCalledWith('/cargar?compartido=1');

  mockTomarCompartido.mockResolvedValueOnce({ uri: 'file://otro.pdf', tipo: 'application/pdf', bytes: 20 });
  await act(async () => mockAvisoCompartido?.());
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
});

test('compartido en la pantalla de ingreso: no se toma hasta que la sesión está lista, y no se pierde', async () => {
  mockEstado = 'sin-sesion';
  const { rerender } = await renderHook(() => useCompartidoPendiente());
  await act(async () => undefined);
  mockTomarCompartido.mockClear();

  await act(async () => mockAvisoCompartido?.());
  expect(mockTomarCompartido).not.toHaveBeenCalled();

  mockTomarCompartido.mockResolvedValue({ uri: 'file://c.pdf', tipo: 'application/pdf', bytes: 10 });
  mockEstado = 'lista';
  await act(async () => rerender(undefined));
  expect(mockRouter.push).toHaveBeenCalledWith('/cargar?compartido=1');
  expect(tomarPendiente()).toEqual({ uri: 'file://c.pdf', tipo: 'application/pdf', bytes: 10 });
});

// ——— Cargar toma el archivo compartido ———

test('Cargar con compartido=1 toma el pendiente y lo pasa a leer', async () => {
  mockParams = { compartido: '1' };
  guardarPendiente({ uri: 'file://compartido.pdf', tipo: 'application/pdf', bytes: 1234 });
  await render(createElement(Cargar));

  await waitFor(() => expect(mockUsar).toHaveBeenCalledWith('file://compartido.pdf', 1234, 'application/pdf'));
  expect(tomarPendiente()).toBeNull();
});

test('Cargar sin el parámetro compartido no lee nada solo', async () => {
  guardarPendiente({ uri: 'file://compartido.pdf', tipo: 'application/pdf', bytes: 1234 });
  await render(createElement(Cargar));
  await act(async () => undefined);

  expect(mockUsar).not.toHaveBeenCalled();
});

// ——— El lector de PDF nativo ———

test('el lector de PDF sin el módulo nativo rechaza con OcrNoDisponible', async () => {
  await expect(leerTextoPdf('file://c.pdf')).rejects.toBeInstanceOf(OcrNoDisponible);
});
