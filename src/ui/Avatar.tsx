// Círculo «quien» (DESIGN.md: el color de una persona vive solo en su inicial): las iniciales sobre el color
// que eligió en su perfil (`--color-perfil-*`, con `--color-sobre-perfil` encima). Sin color, neutro: borde
// `borde` y la inicial en `texto`. Es decorativo: el nombre siempre va escrito al lado.
import type { CSSProperties } from 'react';

import { iniciales } from '@/logica/perfil';
import type { ColorPerfil } from '@/logica/tipos';

import estilos from './Avatar.module.css';

type Props = {
  nombre: string;
  color: ColorPerfil | null;
  /** Lado en px; sin él, `--medida-avatar`. */
  tamano?: number;
};

export function Avatar({ nombre, color, tamano }: Props) {
  const estilo: CSSProperties = {
    ...(color ? { backgroundColor: `var(--color-perfil-${color})` } : {}),
    ...(tamano ? { width: `${tamano}px`, height: `${tamano}px` } : {}),
  };
  return (
    <span className={[estilos.avatar, color ? estilos.conColor : estilos.neutro].join(' ')} style={estilo} aria-hidden="true">
      {iniciales(nombre)}
    </span>
  );
}
