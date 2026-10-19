// El lector de PDF corre en el navegador con pdf.js servido desde /pdf/. Acá se mockea el cargador.
import type { ItemTexto } from './lineas';

const mockCargarPdf = vi.fn();
const mockGetDocument = vi.fn();

vi.mock('./pdf.cargador', () => ({ cargarPdf: () => mockCargarPdf() }));

import { leerTextoPdf } from './pdf';

const renglon = (texto: string): ItemTexto[] => [{ str: texto, transform: [1, 0, 0, 1, 10, 700], hasEOL: true }];
const PAGINAS: Record<number, ItemTexto[]> = { 1: renglon('Página uno'), 2: renglon('Página dos') };

beforeEach(() => {
  vi.clearAllMocks();
  const doc = {
    numPages: 2,
    getPage: vi.fn((n: number) => Promise.resolve({ getTextContent: () => Promise.resolve({ items: PAGINAS[n] }) })),
  };
  mockCargarPdf.mockResolvedValue({ getDocument: mockGetDocument });
  mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) });
});

test('baja los bytes y une el texto de todas las páginas', async () => {
  const bytes = new ArrayBuffer(8);
  const mockFetch = vi.fn(() => Promise.resolve({ arrayBuffer: () => Promise.resolve(bytes) }));
  (globalThis as { fetch?: unknown }).fetch = mockFetch;

  await expect(leerTextoPdf('blob:comprobante')).resolves.toBe('Página uno\nPágina dos');
  expect(mockFetch).toHaveBeenCalledWith('blob:comprobante');
  expect(mockGetDocument).toHaveBeenCalledWith({ data: bytes });
});
