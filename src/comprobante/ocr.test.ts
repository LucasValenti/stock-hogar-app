// El OCR corre en el dispositivo: en la web con Tesseract autoalojado.
/// <reference types="node" />
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_BYTES } from './ocr';

const TEXTO_WEB = 'Mercado Pago\n$ 1.234,56';

const mockReconocerWeb = vi.fn();
const mockTerminar = vi.fn();
const mockCrearWorker = vi.fn();

vi.mock('tesseract.js', () => ({ createWorker: (...args: unknown[]) => mockCrearWorker(...args) }));
// El import dinámico real no corre en Vitest: el cargador devuelve el tesseract.js mockeado.
vi.mock('./ocr.tesseract', () => ({ cargarTesseract: () => import('tesseract.js') }));

import { leerTexto as leerWeb } from './ocr';

// El canvas y la imagen del DOM no existen en jsdom: alcanza con que dibujen y avisen.
const contextoFalso = { filter: '', drawImage: vi.fn() };
const canvasFalso = { width: 0, height: 0, getContext: () => contextoFalso };
class ImagenFalsa {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 2000;
  naturalHeight = 800;
  set src(_uri: string) {
    queueMicrotask(() => this.onload?.());
  }
}

beforeAll(() => {
  vi.stubGlobal('Image', ImagenFalsa);
  vi.spyOn(document, 'createElement').mockImplementation(() => canvasFalso as unknown as HTMLElement);
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  mockCrearWorker.mockReset().mockResolvedValue({ recognize: mockReconocerWeb, terminate: mockTerminar });
  mockReconocerWeb.mockReset().mockResolvedValue({ data: { text: TEXTO_WEB } });
  mockTerminar.mockReset().mockResolvedValue({});
});

test('en web prepara la imagen y usa el worker autoalojado', async () => {
  await expect(leerWeb('blob:comprobante')).resolves.toBe(TEXTO_WEB);
  expect(mockCrearWorker).toHaveBeenCalledWith('spa', 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/',
    langPath: '/ocr/',
    gzip: true,
    workerBlobURL: false,
  });
  expect(mockTerminar).toHaveBeenCalledTimes(1);
});

test('el límite de tamaño es 15 MB', () => {
  expect(MAX_BYTES).toBe(15 * 1024 * 1024);
});

test('public/ocr tiene los archivos del OCR', () => {
  const carpeta = join(__dirname, '..', '..', 'public', 'ocr');
  for (const archivo of ['worker.min.js', 'tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'spa.traineddata.gz', 'LICENSE.txt']) {
    expect(existsSync(join(carpeta, archivo))).toBe(true);
  }
});
