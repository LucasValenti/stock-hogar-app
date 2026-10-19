// El almacén real de la cola en la web: localStorage con la forma de Almacen (getItem/setItem
// devuelven promesas, igual que AsyncStorage), así la cola no cambia entre la demo y la app real.

import type { Almacen } from './cola';

export function almacenLocal(almacen: Storage = window.localStorage): Almacen {
  return {
    getItem: async (clave) => almacen.getItem(clave),
    setItem: async (clave, valor) => {
      almacen.setItem(clave, valor);
    },
  };
}
