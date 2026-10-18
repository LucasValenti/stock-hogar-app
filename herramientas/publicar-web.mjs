// Exporta la web (Expo) a dist/ y agrega los archivos de Cloudflare Pages:
// _headers con la CSP, las cabeceras de seguridad y el caché, y _redirects para la SPA.
//
// Uso: EXPO_PUBLIC_DATOS=memoria npm run publicar:web
// La clave y la URL de Supabase entran por .env (ignorado): acá solo se leen para armar la CSP.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

/** Arma el contenido de dist/_headers: proyecto nulo (modo memoria) deja connect-src solo en 'self'. */
export function armarHeaders(proyectoSupabase) {
  const host = hostDe(proyectoSupabase);
  const connectSrc = host ? `'self' https://${host} wss://${host}` : "'self'";
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'", // el OCR corre wasm
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'", // react-native-web aplica estilos en línea
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
    '  Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()',
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
    '/_expo/static/*',
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

/** Lee .env sin pisar lo que ya venga en el entorno (igual que hace Expo). */
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
  const env = { ...leerEnv(), ...process.env };
  const enMemoria = env.EXPO_PUBLIC_DATOS === 'memoria';
  const urlSupabase = env.EXPO_PUBLIC_SUPABASE_URL || null;

  if (!enMemoria && !urlSupabase) {
    console.error(
      'Falta EXPO_PUBLIC_SUPABASE_URL en .env (o corré con EXPO_PUBLIC_DATOS=memoria).',
    );
    process.exit(1);
  }

  console.log('Exportando la web…');
  // El CLI local de expo (lo mismo que `npx expo export -p web`, pero sin shell).
  const cliExpo = join(raiz, 'node_modules', 'expo', 'bin', 'cli');
  execFileSync(process.execPath, [cliExpo, 'export', '-p', 'web'], {
    cwd: raiz,
    stdio: 'inherit',
  });

  const dist = join(raiz, 'dist');
  writeFileSync(join(dist, '_headers'), armarHeaders(enMemoria ? null : urlSupabase));
  writeFileSync(join(dist, '_redirects'), '/* /index.html 200\n');
  console.log('Listo: dist/ con _headers y _redirects.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
