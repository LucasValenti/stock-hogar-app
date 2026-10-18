// Carga Tesseract recién cuando hace falta: así el paquete no pesa al abrir la app.
export function cargarTesseract() {
  return import('tesseract.js');
}
