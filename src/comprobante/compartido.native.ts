// Recibir comprobantes compartidos en Android con el módulo nativo: el que había al abrir la app
// (tomarCompartido) y el que llega con la app abierta (evento onCompartido).
import { ComprobanteNativo } from '../../modules/comprobante-nativo';
import type { ArchivoCompartido } from '../../modules/comprobante-nativo';

export type { ArchivoCompartido };

export async function tomarCompartido(): Promise<ArchivoCompartido | null> {
  return ComprobanteNativo ? ComprobanteNativo.tomarCompartido() : null;
}

export function alCompartir(escuchar: (a: ArchivoCompartido) => void): () => void {
  const modulo = ComprobanteNativo;
  if (!modulo) return () => undefined;
  const suscripcion = modulo.addListener('onCompartido', () => {
    const a = modulo.tomarCompartido();
    if (a) escuchar(a);
  });
  return () => suscripcion.remove();
}
