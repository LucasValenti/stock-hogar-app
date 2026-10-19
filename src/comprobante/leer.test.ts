// leerArchivo decide el lector: los PDF van al lector de PDF, el resto al OCR.
const mockLeerTexto = vi.fn();
const mockLeerTextoPdf = vi.fn();
vi.mock('./ocr', () => ({ leerTexto: (...args: unknown[]) => mockLeerTexto(...args) }));
vi.mock('./pdf', () => ({ leerTextoPdf: (...args: unknown[]) => mockLeerTextoPdf(...args) }));

import { leerArchivo } from './leer';

beforeEach(() => {
  vi.clearAllMocks();
});

test('un PDF por tipo lo lee el lector de PDF', async () => {
  mockLeerTextoPdf.mockResolvedValue('texto pdf');

  await expect(leerArchivo({ uri: 'file://c', tipo: 'application/pdf' })).resolves.toBe('texto pdf');
  expect(mockLeerTextoPdf).toHaveBeenCalledWith('file://c');
  expect(mockLeerTexto).not.toHaveBeenCalled();
});

test('un PDF por extensión (sin importar mayúsculas) va al lector de PDF', async () => {
  mockLeerTextoPdf.mockResolvedValue('texto');

  await leerArchivo({ uri: 'file://Comprobante.PDF' });
  expect(mockLeerTextoPdf).toHaveBeenCalledWith('file://Comprobante.PDF');
  expect(mockLeerTexto).not.toHaveBeenCalled();
});

test('una imagen va al OCR', async () => {
  mockLeerTexto.mockResolvedValue('texto ocr');

  await expect(leerArchivo({ uri: 'file://c.png', tipo: 'image/png' })).resolves.toBe('texto ocr');
  expect(mockLeerTexto).toHaveBeenCalledWith('file://c.png');
  expect(mockLeerTextoPdf).not.toHaveBeenCalled();
});
