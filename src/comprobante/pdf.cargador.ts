// Carga pdf.js en la web recién cuando hace falta. El módulo vive en /pdf/cargar.js (fuera de Metro):
// lo deja en window.__pdfjs y avisa con el evento "pdfjs-listo". Se carga una sola vez.
import type { ItemTexto } from './lineas';

export type PaginaPdf = { getTextContent: () => Promise<{ items: ItemTexto[] }> };
export type DocumentoPdf = { numPages: number; getPage: (numero: number) => Promise<PaginaPdf> };
export type LibreriaPdf = { getDocument: (opciones: { data: ArrayBuffer }) => { promise: Promise<DocumentoPdf> } };

declare global {
  interface Window {
    __pdfjs?: LibreriaPdf;
  }
}

const ERROR_CARGA = 'No pudimos cargar el lector de PDF.';

let enCurso: Promise<LibreriaPdf> | null = null;

function esperarScript(): Promise<LibreriaPdf> {
  return new Promise((resolver, rechazar) => {
    const listo = () => {
      if (window.__pdfjs) resolver(window.__pdfjs);
      else rechazar(new Error(ERROR_CARGA));
    };
    window.addEventListener('pdfjs-listo', listo, { once: true });
    const script = document.createElement('script');
    script.type = 'module';
    script.src = '/pdf/cargar.js';
    script.onerror = () => {
      window.removeEventListener('pdfjs-listo', listo);
      rechazar(new Error(ERROR_CARGA));
    };
    document.head.appendChild(script);
  });
}

export function cargarPdf(): Promise<LibreriaPdf> {
  if (window.__pdfjs) return Promise.resolve(window.__pdfjs);
  if (!enCurso) enCurso = esperarScript();
  return enCurso;
}
