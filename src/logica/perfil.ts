// Ayudas del perfil: la paleta de colores y las iniciales del avatar.

import type { ColorPerfil } from './tipos';

/** Paleta cerrada del perfil, en el orden en que se ofrece; la base solo acepta estos valores. */
export const COLORES_PERFIL: readonly ColorPerfil[] = ['naranja', 'verde', 'azul', 'rosa', 'violeta', 'amarillo'];

/**
 * Hasta 2 letras mayúsculas: la primera letra de cada una de las dos primeras palabras.
 * Lo que no es letra (emojis, números, signos) se descarta, y una palabra sin letras no ocupa lugar.
 * Sin ninguna letra da «?».
 */
export function iniciales(nombre: string): string {
  const letras = nombre
    .normalize('NFC') // una tilde suelta (e + acento) se junta con su letra antes de buscarla
    .split(/\s+/)
    .map((palabra) => palabra.match(/\p{L}/u)?.[0])
    .filter((letra): letra is string => letra !== undefined)
    .slice(0, 2)
    // ß en mayúscula son dos letras: se queda con la primera para no pasar de dos.
    .map((letra) => [...letra.toLocaleUpperCase('es')][0]);
  return letras.length > 0 ? letras.join('') : '?';
}
