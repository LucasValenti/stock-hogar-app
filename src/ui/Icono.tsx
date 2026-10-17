// Íconos de trazo de la maqueta «Heladera» (docs/diseno-2.0/maquetas.html), dibujados como SVG.
// expo-image los muestra en Android, iOS y la web sin sumar una librería de SVG.
// Son decorativos: el nombre lo da el control o el texto que los acompaña.

import { Image } from 'expo-image';

import { decorativo } from './estilos';

const TRAZOS = {
  casa: '<path d="M3 11 12 4l9 7v9h-6v-6H9v6H3z"/>',
  caja: '<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>',
  graf: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  ajus: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  candado: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  nota: '<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4"/>',
  nube: '<path d="M8 18h9a4 4 0 0 0 1-7.9A6 6 0 0 0 7 9.2 4.5 4.5 0 0 0 8 18z"/><path d="M3 3l18 18"/>',
  ok: '<path d="m5 12 4 4 10-10"/>',
  falta: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5M12 16h0"/>',
  atras: '<path d="m14 6-6 6 6 6"/>',
  abajo: '<path d="m6 9 6 6 6-6"/>',
  lupa: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
} as const;

export type NombreIcono = keyof typeof TRAZOS;

// Grosor del trazo de la maqueta: 2, y 2,4 en el + de Cargar (es parte del dibujo, no una medida de la app).
function svg(nombre: NombreIcono, color: string, grueso: boolean): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
    `stroke-width="${grueso ? 2.4 : 2}" stroke-linecap="round" stroke-linejoin="round">${TRAZOS[nombre]}</svg>`
  );
}

type Props = { nombre: NombreIcono; color: string; tamano: number; grueso?: boolean; testID?: string };

export function Icono({ nombre, color, tamano, grueso = false, testID }: Props) {
  return (
    <Image
      {...decorativo}
      testID={testID}
      source={{ uri: `data:image/svg+xml;utf8,${encodeURIComponent(svg(nombre, color, grueso))}` }}
      style={{ width: tamano, height: tamano }}
      contentFit="contain"
      transition={0}
    />
  );
}
