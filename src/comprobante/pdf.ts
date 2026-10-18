// Leer el texto de un PDF de comprobante. El archivo base lo usan las plataformas que no tienen
// versión propia (el navegador tiene pdf.web.ts): avisa que el lector no está disponible.
import { OcrNoDisponible } from './ocr.comun';

export { OcrNoDisponible } from './ocr.comun';

export async function leerTextoPdf(_uri: string): Promise<string> {
  throw new OcrNoDisponible();
}
