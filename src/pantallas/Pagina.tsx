// Pantalla entera sobre el fondo, con un papelito al medio: la usan el ingreso y los estados de la sesión.
import type { ReactNode } from 'react';

import { Tarjeta } from '@/ui/Tarjeta';

import estilos from './Pagina.module.css';

export function Pagina({ children }: { children: ReactNode }) {
  return (
    <main className={estilos.pagina}>
      <Tarjeta iman className={estilos.papel}>
        {children}
      </Tarjeta>
    </main>
  );
}
