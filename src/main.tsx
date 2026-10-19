import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './tema/fuentes';
import './tema/base.css';

import { App } from './pantallas/App';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Falta #raiz en index.html');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
