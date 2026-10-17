// UUID v4 elegido por la app (nuevo_id de un gasto, id de una op en cola).
// Usa crypto del entorno si está (web, Node); si no, Math.random alcanza: solo tiene que no repetirse.

type CryptoMinimo = { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array };

export function nuevoId(): string {
  const cripto = (globalThis as { crypto?: CryptoMinimo }).crypto;
  if (cripto?.randomUUID) return cripto.randomUUID();
  const b = new Uint8Array(16);
  if (cripto?.getRandomValues) cripto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
