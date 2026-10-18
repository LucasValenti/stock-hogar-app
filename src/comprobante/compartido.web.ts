// En el navegador no hay compartir nativo: no llega nada.
import type { ArchivoCompartido } from '../../modules/comprobante-nativo';

export type { ArchivoCompartido };

export async function tomarCompartido(): Promise<ArchivoCompartido | null> {
  return null;
}

export function alCompartir(_avisar: () => void): () => void {
  return () => undefined;
}
