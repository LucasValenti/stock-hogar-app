// Se carga antes de cada archivo de tests (vite.config.ts → test.setupFiles).
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom no trae el <dialog> modal: lo mínimo para probar la hoja (el navegador real sí lo implementa).
if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});
