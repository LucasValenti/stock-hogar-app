// Corre las pruebas de la base (supabase/tests/db.sql) en un Postgres en memoria (PGlite).
// Nunca toca Supabase: arma la base de cero con stubs.sql, el esquema y las migraciones que se pasen.
//
// Uso:
//   node herramientas/pg/correr.mjs                                  -> schema.sql actual (instalación limpia)
//   node herramientas/pg/correr.mjs --esquema-git <ref> <migración>…  -> schema.sql de ese commit + migraciones (camino de producción)
//   node herramientas/pg/correr.mjs --esquema <archivo> <migración>…
//   --antes <archivo>    SQL que corre justo después del esquema, antes de las migraciones (datos previos).
//   --despues <archivo>  SQL que corre justo después de las migraciones, antes de db.sql (comprobaciones de la migración).
// Sale con código 1 si un archivo no carga o si una prueba falla.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const leer = (ruta) => readFileSync(resolve(raiz, ruta), 'utf8');

const args = process.argv.slice(2);
let esquema = { nombre: 'supabase/schema.sql', sql: () => leer('supabase/schema.sql') };
const migraciones = [];
let antes = null;
let despues = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--esquema-git') {
    const ref = args[++i];
    esquema = {
      nombre: `supabase/schema.sql @ ${ref}`,
      sql: () => execFileSync('git', ['show', `${ref}:supabase/schema.sql`], { cwd: raiz, encoding: 'utf8' }),
    };
  } else if (args[i] === '--esquema') {
    const ruta = args[++i];
    esquema = { nombre: ruta, sql: () => leer(ruta) };
  } else if (args[i] === '--antes') {
    const ruta = args[++i];
    antes = { nombre: ruta, sql: () => leer(ruta) };
  } else if (args[i] === '--despues') {
    const ruta = args[++i];
    despues = { nombre: ruta, sql: () => leer(ruta) };
  } else {
    const ruta = args[i];
    migraciones.push({ nombre: ruta, sql: () => leer(ruta) });
  }
}

const pasos = [
  { nombre: 'herramientas/pg/stubs.sql', sql: () => leer('herramientas/pg/stubs.sql') },
  esquema,
  ...(antes ? [antes] : []),
  ...migraciones,
  ...(despues ? [despues] : []),
  { nombre: 'supabase/tests/db.sql', sql: () => leer('supabase/tests/db.sql') },
];

const db = new PGlite();
let resultados = [];
try {
  for (const paso of pasos) {
    try {
      resultados = await db.exec(paso.sql());
      console.log(`cargado: ${paso.nombre}`);
    } catch (error) {
      console.error(`\nFALLA en ${paso.nombre}:\n  ${error.message}`);
      if (error.where) console.error(`  ${error.where}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!process.exitCode) {
    const ultima = resultados.at(-1)?.rows?.[0]?.resultado;
    if (typeof ultima === 'string' && ultima.startsWith('OK')) console.log(`\n${ultima}`);
    else {
      console.error('\nFALLA: las pruebas no terminaron con la fila OK.');
      process.exitCode = 1;
    }
  }
} finally {
  await db.close();
}
