// Leer el texto de un PDF de comprobante en el dispositivo, con el lector nativo propio (PdfBox).
// Sin la app instalada (Expo Go, o el módulo ausente) avisa que el lector no está disponible.
import { ComprobanteNativo } from '../../modules/comprobante-nativo';
import { OcrNoDisponible } from './ocr.comun';

export { OcrNoDisponible } from './ocr.comun';

export async function leerTextoPdf(uri: string): Promise<string> {
  if (!ComprobanteNativo) {
    throw new OcrNoDisponible('El lector de PDF necesita la app instalada, no anda en Expo Go.');
  }
  return ComprobanteNativo.textoDePdf(uri);
}
