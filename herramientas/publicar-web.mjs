// Arma la web con Vite en dist/ y agrega los archivos de Cloudflare Pages:
// _headers con la CSP, las cabeceras de seguridad y el caché, y _redirects para la SPA.
//
// Uso: npm run publicar:web (o VITE_DATOS=memoria npm run publicar:web)
// La clave y la URL de Supabase entran por .env (ignorado): acá solo se leen para armar la CSP.
//
// Web solo-demo (kusak.dev): npm run publicar:demo → `--demo` fuerza VITE_DATOS=memoria
// y arma en dist-demo/. `--destino <carpeta>` cambia el destino (por defecto dist/).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Opciones de la CLI: `--demo` (memoria, dist-demo por defecto) y `--destino <carpeta>`. */
export function opcionesDe(argv) {
  const demo = argv.includes('--demo');
  const i = argv.indexOf('--destino');
  const destino = i !== -1 && argv[i + 1] ? argv[i + 1] : demo ? 'dist-demo' : 'dist';
  return { destino, demo };
}

/** Deja solo el host del proyecto de Supabase, venga como URL completa o como host pelado. */
function hostDe(valor) {
  if (!valor) return null;
  const texto = /^https?:\/\//i.test(valor) ? valor : `https://${valor}`;
  try {
    return new URL(texto).host;
  } catch {
    return null;
  }
}

/** Arma el contenido de dist/_headers: proyecto nulo (modo memoria) deja connect-src sin Supabase. */
export function armarHeaders(proyectoSupabase) {
  const host = hostDe(proyectoSupabase);
  // blob: el comprobante elegido se lee desde una URL blob (fetch en pdf.js); data: el OCR intenta
  // bajar su wasm desde una URL data antes de usar otro camino.
  const local = "'self' data: blob:";
  const connectSrc = host ? `${local} https://${host} wss://${host}` : local;
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'", // el OCR corre wasm
    "worker-src 'self' blob:",
    // Sin 'unsafe-inline': los estilos van en CSS; las pocas variables por elemento (Esqueleto, Barras)
    // React las pone por CSSOM, que la CSP no bloquea.
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

  return [
    '/*',
    `  Content-Security-Policy: ${csp}`,
    '  X-Content-Type-Options: nosniff',
    '  X-Frame-Options: DENY',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
    '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
    '  Cross-Origin-Opener-Policy: same-origin',
    '  X-Robots-Tag: noindex, nofollow',
    '',
    '/pdf/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '/ocr/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '/index.html',
    '  Cache-Control: no-cache',
    '',
    '/sw.js',
    '  Cache-Control: no-cache',
    '',
  ].join('\n');
}

/** Lee .env sin pisar lo que ya venga en el entorno (igual que hace Vite). */
function leerEnv() {
  const ruta = join(raiz, '.env');
  if (!existsSync(ruta)) return {};
  const valores = {};
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) valores[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return valores;
}

function principal() {
  const { destino, demo } = opcionesDe(process.argv.slice(2));
  if (demo) process.env.VITE_DATOS = 'memoria';
  const env = { ...leerEnv(), ...process.env };
  const enMemoria = env.VITE_DATOS === 'memoria';
  const urlSupabase = env.VITE_SUPABASE_URL || null;

  if (!enMemoria && !urlSupabase) {
    console.error(
      'Falta VITE_SUPABASE_URL en .env (o corré con VITE_DATOS=memoria).',
    );
    process.exit(1);
  }

  console.log(`Armando la web en ${destino}/…`);
  // El CLI local de Vite (lo mismo que `npx vite build`, pero sin shell). Vite lee .env solo;
  // las variables del entorno (como VITE_DATOS de --demo) mandan sobre las de .env.
  const cliVite = join(raiz, 'node_modules', 'vite', 'bin', 'vite.js');
  execFileSync(process.execPath, [cliVite, 'build', '--outDir', destino, '--emptyOutDir'], {
    cwd: raiz,
    stdio: 'inherit',
    env: { ...process.env },
  });

  const dist = join(raiz, destino);
  writeFileSync(join(dist, '_headers'), armarHeaders(enMemoria ? null : urlSupabase));
  writeFileSync(join(dist, '_redirects'), '/* /index.html 200\n');
  console.log(`Listo: ${destino}/ con _headers y _redirects.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
