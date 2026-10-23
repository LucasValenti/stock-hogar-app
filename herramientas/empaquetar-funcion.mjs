// Empaqueta una Edge Function en un solo archivo, para desplegarla desde el editor del panel de Supabase (que no
// resuelve imports de otras carpetas, como ../_compartido/). Los `npm:` quedan como imports externos (los baja
// Supabase). Sin minificar: el archivo se lee y se revisa en el panel.
//
// Uso: node herramientas/empaquetar-funcion.mjs [nombre]   (por defecto resumen-semanal)
// Sale en dist-funciones/<nombre>/index.ts (ignorado por git).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

export async function empaquetar(nombre = 'resumen-semanal') {
  const raiz = fileURLToPath(new URL('..', import.meta.url));
  const salida = `${raiz}dist-funciones/${nombre}`;
  await build({
    configFile: false,
    logLevel: 'warn',
    root: raiz,
    build: {
      lib: { entry: `${raiz}supabase/functions/${nombre}/index.ts`, formats: ['es'], fileName: () => 'index.ts' },
      rollupOptions: { external: [/^npm:/, /^jsr:/] },
      outDir: salida,
      emptyOutDir: true,
      minify: false,
      target: 'esnext',
      copyPublicDir: false,
    },
  });
  return { ruta: `${salida}/index.ts`, codigo: readFileSync(`${salida}/index.ts`, 'utf8') };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { ruta, codigo } = await empaquetar(process.argv[2]);
  console.log(`Listo: ${ruta} (${codigo.length} caracteres)`);
}
