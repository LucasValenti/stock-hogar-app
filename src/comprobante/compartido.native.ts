// Recibir comprobantes compartidos en Android con el módulo nativo: el que había al abrir la app
// (tomarCompartido) y el que llega con la app abierta (evento onCompartido).
import { ComprobanteNativo } from '../../modules/comprobante-nativo';
import type { ArchivoCompartido } from '../../modules/comprobante-nativo';

export type { ArchivoCompartido };

export async function tomarCompartido(): Promise<ArchivoCompartido | null> {
  return ComprobanteNativo ? ComprobanteNativo.tomarCompartido() : null;
}

// Solo avisa que llegó uno: lo toma quien escucha, cuando puede (sin sesión queda esperando en el módulo).
export function alCompartir(avisar: () => void): () => void {
  const modulo = ComprobanteNativo;
  if (!modulo) return () => undefined;
  const suscripcion = modulo.addListener('onCompartido', avisar);
  return () => suscripcion.remove();
}
