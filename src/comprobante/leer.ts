// Elige cómo leer un archivo subido: los PDF con el lector de PDF, las imágenes con el OCR.

import { leerTexto } from './ocr';
import { leerTextoPdf } from './pdf';

export async function leerArchivo(a: { uri: string; tipo?: string; bytes?: number }): Promise<string> {
  const tipo = (a.tipo ?? '').toLowerCase();
  if (tipo === 'application/pdf' || a.uri.toLowerCase().endsWith('.pdf')) {
    return leerTextoPdf(a.uri);
  }
  return leerTexto(a.uri);
}
