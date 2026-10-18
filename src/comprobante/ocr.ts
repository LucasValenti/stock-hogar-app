// Leer el texto de una imagen de comprobante, en el dispositivo. Nada sale del teléfono.
// El archivo base lo usan las plataformas que no tienen versión propia: avisa que el OCR no está.
import { OcrNoDisponible } from './ocr.comun';

export { MAX_BYTES, OcrNoDisponible } from './ocr.comun';

export async function leerTexto(_uri: string): Promise<string> {
  throw new OcrNoDisponible();
}
