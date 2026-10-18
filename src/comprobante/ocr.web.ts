// Lee el texto de una imagen en el navegador con Tesseract, servido desde /ocr/. Nada sale del dispositivo.
// Tesseract se baja recién la primera vez que se usa (import dinámico, no pesa al abrir la app).
import { MAX_BYTES, OcrNoDisponible } from './ocr.comun';
import { cargarTesseract } from './ocr.tesseract';

export { MAX_BYTES, OcrNoDisponible };

const ANCHO_MIN = 1200;

function cargarImagen(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = () => rechazar(new Error('No pudimos abrir la imagen.'));
    img.src = uri;
  });
}

// Agrandar las capturas chicas (las que pasaron por WhatsApp) y pasarlas a grises mejora la lectura.
async function prepararImagen(uri: string): Promise<HTMLCanvasElement> {
  const img = await cargarImagen(uri);
  const escala = Math.max(1, ANCHO_MIN / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * escala);
  canvas.height = Math.round(img.naturalHeight * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No pudimos preparar la imagen.');
  ctx.filter = 'grayscale(1)';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function leerTexto(uri: string): Promise<string> {
  const imagen = await prepararImagen(uri);
  const { createWorker } = await cargarTesseract();
  const worker = await createWorker('spa', 1, {
    workerPath: '/ocr/worker.min.js', corePath: '/ocr/', langPath: '/ocr/', gzip: true,
  });
  try {
    const { data } = await worker.recognize(imagen);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
