// Compartir en la web instalada (PWA): no hay módulo nativo, el service worker deja el comprobante
// en el caché y acá se toma una sola vez.
export type ArchivoCompartido = { uri: string; tipo: string; bytes: number };

const CACHE = 'compartido';
const CLAVE = '/comprobante-compartido';

export async function tomarCompartido(): Promise<ArchivoCompartido | null> {
  // Sin `caches` (contexto inseguro, por ejemplo sin HTTPS) no hay de dónde tomarlo.
  if (typeof caches === 'undefined') return null;
  const cache = await caches.open(CACHE);
  const respuesta = await cache.match(CLAVE);
  if (!respuesta) return null;
  await cache.delete(CLAVE);
  const blob = await respuesta.blob();
  return { uri: URL.createObjectURL(blob), tipo: blob.type, bytes: blob.size };
}

export function alCompartir(_avisar: () => void): () => void {
  return () => undefined;
}
