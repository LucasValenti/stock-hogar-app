// Carga pdf.js (módulo ES) fuera de Metro y lo deja listo para pdf.web.ts.
import * as pdfjs from './pdf.min.js';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.js';
window.__pdfjs = pdfjs;
window.dispatchEvent(new Event('pdfjs-listo'));
