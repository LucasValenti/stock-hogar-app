// Recibir comprobantes compartidos desde otras apps. En esta plataforma no hay módulo nativo:
// no llega nada y el aviso de compartir no hace nada.
import type { ArchivoCompartido } from '../../modules/comprobante-nativo';

export type { ArchivoCompartido };

export async function tomarCompartido(): Promise<ArchivoCompartido | null> {
  return null;
}

export function alCompartir(_escuchar: (a: ArchivoCompartido) => void): () => void {
  return () => undefined;
}
