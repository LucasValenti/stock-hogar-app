// El OCR corre en el dispositivo: en web con Tesseract autoalojado, en Android/iOS con ML Kit.
/// <reference types="node" />
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NativeModules } from 'react-native';
import { MAX_BYTES, OcrNoDisponible } from './ocr';

const TEXTO_WEB = 'Mercado Pago\n$ 1.234,56';
const TEXTO_NATIVO = 'Mercado Pago\n$ 9.999,00';

const mockReconocerWeb = jest.fn();
const mockTerminar = jest.fn();
const mockCrearWorker = jest.fn();
const mockReconocerNativo = jest.fn();

jest.mock('tesseract.js', () => ({ createWorker: (...args: unknown[]) => mockCrearWorker(...args) }));
// El import dinámico real no corre en Jest: el cargador devuelve el tesseract.js mockeado.
jest.mock('./ocr.tesseract', () => ({ cargarTesseract: () => Promise.resolve(require('tesseract.js')) }));
jest.mock('@react-native-ml-kit/text-recognition', () => ({
  __esModule: true,
  default: { recognize: (...args: unknown[]) => mockReconocerNativo(...args) },
}));

import { leerTexto as leerWeb } from './ocr.web';
import { leerTexto as leerNativo } from './ocr.native';

// El canvas y la imagen del DOM no existen en Jest: alcanza con que dibujen y avisen.
const contextoFalso = { filter: '', drawImage: jest.fn() };
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
  (globalThis as { Image?: unknown }).Image = ImagenFalsa;
  (globalThis as { document?: unknown }).document = { createElement: () => canvasFalso };
});
afterAll(() => {
  delete (globalThis as { Image?: unknown }).Image;
  delete (globalThis as { document?: unknown }).document;
});

beforeEach(() => {
  mockCrearWorker.mockReset().mockResolvedValue({ recognize: mockReconocerWeb, terminate: mockTerminar });
  mockReconocerWeb.mockReset().mockResolvedValue({ data: { text: TEXTO_WEB } });
  mockTerminar.mockReset().mockResolvedValue({});
  mockReconocerNativo.mockReset().mockResolvedValue({ text: TEXTO_NATIVO });
  delete NativeModules.TextRecognition;
});

test('en web prepara la imagen y usa el worker autoalojado', async () => {
  await expect(leerWeb('blob:comprobante')).resolves.toBe(TEXTO_WEB);
  expect(mockCrearWorker).toHaveBeenCalledWith('spa', 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/',
    langPath: '/ocr/',
    gzip: true,
  });
  expect(mockTerminar).toHaveBeenCalledTimes(1);
});

test('en el dispositivo devuelve el texto de ML Kit', async () => {
  NativeModules.TextRecognition = { recognize: jest.fn() };
  await expect(leerNativo('file://foto.jpg')).resolves.toBe(TEXTO_NATIVO);
  expect(mockReconocerNativo).toHaveBeenCalledWith('file://foto.jpg');
});

test('sin el módulo nativo rechaza con OcrNoDisponible', async () => {
  await expect(leerNativo('file://foto.jpg')).rejects.toBeInstanceOf(OcrNoDisponible);
  expect(mockReconocerNativo).not.toHaveBeenCalled();
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
