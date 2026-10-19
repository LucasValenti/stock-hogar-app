// useComprobante: elegir y leer un comprobante, y no tocar el formulario si la pantalla se fue o llegó tarde.

import { act, renderHook } from '@testing-library/react';

import { centavosATexto } from '@/logica/dinero';

const mockLeerTexto = vi.fn();
const mockLeerTextoPdf = vi.fn();
vi.mock('./ocr', async () => {
  const real = await vi.importActual<typeof import('./ocr.comun')>('./ocr.comun');
  return {
    leerTexto: (...args: unknown[]) => mockLeerTexto(...args),
    MAX_BYTES: real.MAX_BYTES,
    OcrNoDisponible: real.OcrNoDisponible,
  };
});
vi.mock('./pdf', () => ({ leerTextoPdf: (...args: unknown[]) => mockLeerTextoPdf(...args) }));

const mockDatos = { gastoPorOperacion: vi.fn(), categoriaDeDestino: vi.fn() };
vi.mock('@/datos', () => ({
  get datos() {
    return mockDatos;
  },
}));

import { useComprobante } from './useComprobante';
import { MAX_BYTES, OcrNoDisponible } from './ocr';

// Nombres de fantasía: el comprobante original traía los de personas reales.
const COMPROBANTE = `Comprobante de transferencia
8/octubre/2026 a las 11:29.
$ 48.600
Motivo: Varios
Origen y destino
EG Ana Gómez
Mercado Pago
CVU: 0000000000000000000000
EG Beto Salas
Mercado Pago
CVU: 0000000000000000000000
N.* de operación de Mercado Pago
123456789012`;

const CASA = [{ id: 'ana', nombre: 'Ana' }, { id: 'beto', nombre: 'Beto' }];

function montar(extra: Partial<Parameters<typeof useComprobante>[0]> = {}) {
  const aplicar = vi.fn();
  const util = renderHook(() => useComprobante({ integrantes: CASA, notaActual: () => '', aplicar, ...extra }));
  return { ...util, aplicar };
}

beforeEach(() => {
  vi.clearAllMocks();
});

test('una lectura completa aplica los cambios y la categoría del destino', async () => {
  mockLeerTexto.mockResolvedValue(COMPROBANTE);
  mockDatos.gastoPorOperacion.mockResolvedValue(null);
  mockDatos.categoriaDeDestino.mockResolvedValue('super');
  const { result, aplicar } = montar();

  await act(async () => {
    await result.current.usar('file://c.png', 1000, 'image/png');
  });

  expect(mockDatos.gastoPorOperacion).toHaveBeenCalledWith('123456789012');
  expect(mockDatos.categoriaDeDestino).toHaveBeenCalledWith('beto salas');
  expect(aplicar).toHaveBeenCalledWith(
    expect.objectContaining({
      monto: centavosATexto(4860000),
      fecha: '2026-10-08',
      pagadoPor: 'ana',
      nota: 'Beto Salas',
      comprobante: { operacion: '123456789012', destino: 'beto salas' },
    }),
    'super',
  );
  expect(result.current.aviso).toBe('Leímos el comprobante: revisá los datos y guardá.');
});

test('si el comprobante ya se cargó, vacía el borrador y avisa con la fecha del gasto', async () => {
  mockLeerTexto.mockResolvedValue(COMPROBANTE);
  mockDatos.gastoPorOperacion.mockResolvedValue({ id: 'g9', fecha: '2026-10-02', pagado_por: 'beto' });
  mockDatos.categoriaDeDestino.mockResolvedValue('super');
  const { result, aplicar } = montar();

  await act(async () => {
    await result.current.usar('file://c.png', 1000, 'image/png');
  });

  expect(aplicar).toHaveBeenCalledWith(expect.objectContaining({ monto: '', nota: '', comprobante: null }), 'super');
  expect(result.current.aviso).toBe('Este comprobante ya se cargó el 02/10 (pagó Beto).');
});

test('una imagen de más de 15 MB no se lee ni se aplica', async () => {
  const { result, aplicar } = montar();

  await act(async () => {
    await result.current.usar('file://c.png', MAX_BYTES + 1, 'image/png');
  });

  expect(mockLeerTexto).not.toHaveBeenCalled();
  expect(aplicar).not.toHaveBeenCalled();
  expect(result.current.aviso).toBe('La imagen pesa más de 15 MB. Probá con una captura más chica.');
});

test('un archivo que no es imagen ni PDF no se lee ni se aplica', async () => {
  const { result, aplicar } = montar();

  await act(async () => {
    await result.current.usar('file://c.txt', 1000, 'text/plain');
  });

  expect(mockLeerTexto).not.toHaveBeenCalled();
  expect(mockLeerTextoPdf).not.toHaveBeenCalled();
  expect(aplicar).not.toHaveBeenCalled();
  expect(result.current.aviso).toBe('Ese archivo no es una imagen ni un PDF. Probá con el comprobante de Mercado Pago.');
});

test('un PDF lo lee el lector de PDF', async () => {
  mockLeerTextoPdf.mockResolvedValue(COMPROBANTE);
  mockDatos.gastoPorOperacion.mockResolvedValue(null);
  mockDatos.categoriaDeDestino.mockResolvedValue('super');
  const { result, aplicar } = montar();

  await act(async () => {
    await result.current.usar('file://c.pdf', 1000, 'application/pdf');
  });

  expect(mockLeerTextoPdf).toHaveBeenCalledWith('file://c.pdf');
  expect(mockLeerTexto).not.toHaveBeenCalled();
  expect(aplicar).toHaveBeenCalledWith(expect.objectContaining({ monto: centavosATexto(4860000) }), 'super');
});

test('sin lector de PDF (Expo Go) avisa lo mismo que para las imágenes', async () => {
  mockLeerTextoPdf.mockRejectedValue(new OcrNoDisponible());
  const { result, aplicar } = montar();

  await act(async () => {
    await result.current.usar('file://c.pdf', 1000, 'application/pdf');
  });

  expect(aplicar).not.toHaveBeenCalled();
  expect(result.current.aviso).toBe('Para leer comprobantes instalá la app (APK); en Expo Go no se puede.');
});

test('sin la app instalada (Expo Go) avisa que el OCR no está y no aplica nada', async () => {
  mockLeerTexto.mockRejectedValue(new OcrNoDisponible());
  const { result, aplicar } = montar();

  await act(async () => {
    await result.current.usar('file://c.png', 1000, 'image/png');
  });

  expect(aplicar).not.toHaveBeenCalled();
  expect(result.current.aviso).toBe('Para leer comprobantes instalá la app (APK); en Expo Go no se puede.');
});

test('si la pantalla se va mientras lee, no aplica nada', async () => {
  let resolver: (texto: string) => void = () => undefined;
  mockLeerTexto.mockReturnValue(new Promise<string>((r) => { resolver = r; }));
  const { result, aplicar, unmount } = montar();

  let pendiente: Promise<void> = Promise.resolve();
  await act(async () => {
    pendiente = result.current.usar('file://c.png', 1000, 'image/png');
    await Promise.resolve();
  });
  unmount();
  resolver(COMPROBANTE);
  await act(async () => {
    await pendiente;
  });

  expect(aplicar).not.toHaveBeenCalled();
});

test('elegir le da una URL local al archivo elegido y lee lo elegido', async () => {
  const archivo = new File([new Uint8Array(10)], 'c.png', { type: 'image/png' });
  const crearUrl = vi.fn(() => 'blob:c');
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = crearUrl;
  mockLeerTexto.mockResolvedValue(COMPROBANTE);
  mockDatos.gastoPorOperacion.mockResolvedValue(null);
  mockDatos.categoriaDeDestino.mockResolvedValue(null);
  const { result, aplicar } = montar();

  await act(async () => {
    await result.current.elegir(archivo);
  });

  expect(crearUrl).toHaveBeenCalledWith(archivo);
  expect(aplicar).toHaveBeenCalled();
});
