// Almacén con la forma de AsyncStorage, pero en memoria: la demo guarda en el dispositivo
// solo mientras dura y se reinicia al salir (spec línea 45). Nunca toca el almacén real.

import type { Almacen } from './cola';

export function almacenEnMemoria(): Almacen & { removeItem(clave: string): Promise<void> } {
  const valores = new Map<string, string>();
  return {
    getItem: async (clave) => valores.get(clave) ?? null,
    setItem: async (clave, valor) => {
      valores.set(clave, valor);
    },
    removeItem: async (clave) => {
      valores.delete(clave);
    },
  };
}
