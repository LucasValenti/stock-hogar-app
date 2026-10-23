// Se carga antes de cada archivo de tests (vite.config.ts → test.setupFiles).
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// El tiempo real de Supabase abre un WebSocket; en los tests no hay red y además el WebSocket de
// Node (undici) choca con el Event de jsdom: al abrirse la conexión dispara un error no controlado
// que hace salir la corrida con código 1 aunque todos los tests pasen. Se reemplaza por una stub
// que no conecta: en los tests el tiempo real no aporta nada.
if (typeof globalThis.WebSocket !== 'undefined') {
  class WebSocketStub {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly url: string;
    readyState = WebSocketStub.CLOSED;
    onopen: ((event: Event) => void) | null = null;
    onclose: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor(url: string) {
      this.url = url;
    }
    send(): void {}
    close(): void {}
    addEventListener(): void {}
    removeEventListener(): void {}
    dispatchEvent(): boolean {
      return true;
    }
  }
  globalThis.WebSocket = WebSocketStub as unknown as typeof WebSocket;
}

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
