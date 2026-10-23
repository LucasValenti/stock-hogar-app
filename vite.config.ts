/// <reference types="vitest/config" />
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// En desarrollo, Vite sirve los .gz de public/ con «Content-Encoding: gzip»: el navegador los descomprime
// y Tesseract (que espera el idioma comprimido) se queda leyendo para siempre. Cloudflare los sirve como
// application/gzip, sin encoding; acá se hace lo mismo.
const gzipSinEncoding: Plugin = {
  name: 'gzip-sin-encoding',
  configureServer(servidor) {
    servidor.middlewares.use((pedido, respuesta, seguir) => {
      const ruta = pedido.url?.split('?')[0] ?? '';
      if (!ruta.startsWith('/ocr/') || !ruta.endsWith('.gz')) return seguir();
      const archivo = fileURLToPath(new URL(`./public${ruta}`, import.meta.url));
      if (!existsSync(archivo)) return seguir();
      respuesta.setHeader('Content-Type', 'application/gzip');
      respuesta.end(readFileSync(archivo));
    });
  },
};

export default defineConfig({
  plugins: [react(), gzipSinEncoding],
  resolve: {
    // Mismo alias que tsconfig.json: "@/*" apunta a src/.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // El repo es público, pero el sitio no publica mapas de fuente (lo revisa REA antes de subir).
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
    setupFiles: ['./src/pruebas/preparar.ts'],
  },
});
