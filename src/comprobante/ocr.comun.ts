// Constantes y error que comparten las implementaciones de OCR (web y nativo).
export const MAX_BYTES = 15 * 1024 * 1024;

// El OCR no está disponible en este dispositivo (por ejemplo, Expo Go no trae el módulo nativo).
export class OcrNoDisponible extends Error {
  constructor(mensaje = 'El reconocimiento de texto no está disponible en este dispositivo.') {
    super(mensaje);
    this.name = 'OcrNoDisponible';
  }
}
