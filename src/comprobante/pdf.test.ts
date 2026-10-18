// El lector de PDF corre en el navegador con pdf.js servido desde /pdf/. Acá se mockea el cargador.
import type { ItemTexto } from './lineas';

const mockCargarPdf = jest.fn();
const mockGetDocument = jest.fn();

jest.mock('./pdf.cargador', () => ({ cargarPdf: () => mockCargarPdf() }));

import { OcrNoDisponible } from './ocr.comun';
import { leerTextoPdf as leerBase } from './pdf';
import { leerTextoPdf } from './pdf.web';

const renglon = (texto: string): ItemTexto[] => [{ str: texto, transform: [1, 0, 0, 1, 10, 700], hasEOL: true }];
const PAGINAS: Record<number, ItemTexto[]> = { 1: renglon('Página uno'), 2: renglon('Página dos') };

beforeEach(() => {
  jest.clearAllMocks();
  const doc = {
    numPages: 2,
    getPage: jest.fn((n: number) => Promise.resolve({ getTextContent: () => Promise.resolve({ items: PAGINAS[n] }) })),
  };
  mockCargarPdf.mockResolvedValue({ getDocument: mockGetDocument });
  mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
});

test('baja los bytes y une el texto de todas las páginas', async () => {
  const bytes = new ArrayBuffer(8);
  const mockFetch = jest.fn(() => Promise.resolve({ arrayBuffer: () => Promise.resolve(bytes) }));
  (globalThis as { fetch?: unknown }).fetch = mockFetch;

  await expect(leerTextoPdf('blob:comprobante')).resolves.toBe('Página uno\nPágina dos');
  expect(mockFetch).toHaveBeenCalledWith('blob:comprobante');
  expect(mockGetDocument).toHaveBeenCalledWith({ data: bytes });
});

test('en una plataforma sin lector de PDF rechaza con OcrNoDisponible', async () => {
  await expect(leerBase('file://c.pdf')).rejects.toBeInstanceOf(OcrNoDisponible);
});
