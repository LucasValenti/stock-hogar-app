// Pantalla de una sección que todavía no está: su título y el aviso de que llega después.

import type { ReactNode } from 'react';

import { Pantalla } from './Pantalla';
import { Tarjeta } from './Tarjeta';
import { Texto } from './Texto';

export function ProximaVersion({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <Pantalla titulo={titulo}>
      <Tarjeta>
        <Texto>Llega en la próxima versión.</Texto>
      </Tarjeta>
      {children}
    </Pantalla>
  );
}
