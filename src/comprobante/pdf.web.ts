// Lee el texto de un PDF en el navegador con pdf.js, servido desde /pdf/. Nada sale del dispositivo.
// pdf.js se carga recién la primera vez que se usa (ver pdf.cargador.ts, fuera de Metro).
import { armarLineas } from './lineas';
import { cargarPdf } from './pdf.cargador';

export { OcrNoDisponible } from './ocr.comun';

export async function leerTextoPdf(uri: string): Promise<string> {
  const pdfjs = await cargarPdf();
  const bytes = await (await fetch(uri)).arrayBuffer();
  const documento = await pdfjs.getDocument({ data: bytes }).promise;
  const paginas: string[] = [];
  for (let numero = 1; numero <= documento.numPages; numero++) {
    const pagina = await documento.getPage(numero);
    const { items } = await pagina.getTextContent();
    paginas.push(armarLineas(items));
  }
  return paginas.join('\n');
}
