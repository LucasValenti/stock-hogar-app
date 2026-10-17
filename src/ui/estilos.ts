// Piezas de estilo que comparten los componentes: todas salen de los tokens del tema.

import { useState } from 'react';

import type { Tema } from '@/tema/tema';

/** Si el control tiene el foco, y los avisos para saberlo (se pasan tal cual al Pressable). */
export function useFoco() {
  const [conFoco, setConFoco] = useState(false);
  return { conFoco, alFoco: { onFocus: () => setConFoco(true), onBlur: () => setConFoco(false) } };
}

/** Anillo de foco del teclado (en la web; en el teléfono no se dibuja). */
export function anilloDeFoco(tema: Tema) {
  return {
    outlineStyle: 'solid',
    outlineColor: tema.color.foco,
    outlineWidth: tema.medida.focoGrosor,
    outlineOffset: tema.medida.focoSeparacion,
  } as const;
}

type Sombra = Tema['sombra'][keyof Tema['sombra']];

/**
 * Sombra dura (sin desenfoque) como `boxShadow`: la entienden iOS, Android (nueva arquitectura) y la web.
 * En Android `elevation` no hace sombras duras; así sale igual en las tres.
 */
export function sombra({ offsetY, opacidad, desenfoque, color }: Sombra) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return { boxShadow: `0px ${offsetY}px ${desenfoque}px rgba(${r}, ${g}, ${b}, ${opacidad})` };
}

/** Oculto al lector de pantalla (imán, marcas decorativas, íconos dentro de un control con nombre). */
export const decorativo = {
  'aria-hidden': true,
  accessible: false,
  importantForAccessibility: 'no-hide-descendants',
  accessibilityElementsHidden: true,
} as const;
