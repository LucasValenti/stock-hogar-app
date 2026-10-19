import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './tema/fuentes';
import './tema/base.css';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Falta #raiz en index.html');

// El armazón con rutas, sesión y tema llega en la Task 4 del plan de la web React.
createRoot(raiz).render(
  <StrictMode>
    <main>
      <h1>Stock del hogar</h1>
    </main>
  </StrictMode>,
);
