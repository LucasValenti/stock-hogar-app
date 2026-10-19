import test from 'node:test';
import assert from 'node:assert/strict';
import { armarHeaders, opcionesDe } from './publicar-web.mjs';

test('con proyecto Supabase, connect-src incluye el https y el wss del proyecto', () => {
  const texto = armarHeaders('https://abcdefgh.supabase.co');
  assert.match(
    texto,
    /connect-src 'self' data: blob: https:\/\/abcdefgh\.supabase\.co wss:\/\/abcdefgh\.supabase\.co/,
  );
});

test('sin proyecto (modo memoria), connect-src no tiene Supabase', () => {
  const texto = armarHeaders(null);
  assert.match(texto, /connect-src 'self' data: blob:;/);
  assert.doesNotMatch(texto, /supabase\.co/);
});

test('el modo demo usa dist-demo, activa memoria y deja connect-src sin Supabase', () => {
  const opciones = opcionesDe(['--demo']);
  assert.equal(opciones.destino, 'dist-demo');
  assert.equal(opciones.demo, true);
  assert.match(armarHeaders(null), /connect-src 'self' data: blob:;/);
  assert.doesNotMatch(armarHeaders(null), /supabase\.co/);
});

test('sin argumentos publica en dist/ y --destino cambia la carpeta', () => {
  assert.equal(opcionesDe([]).destino, 'dist');
  assert.equal(opcionesDe([]).demo, false);
  assert.equal(opcionesDe(['--destino', 'dist-demo']).destino, 'dist-demo');
});

test('siempre están wasm-unsafe-eval, worker-src blob:, unsafe-inline en estilos y frame-ancestors none', () => {
  const texto = armarHeaders(null);
  assert.match(texto, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.match(texto, /worker-src 'self' blob:/);
  assert.match(texto, /style-src 'self' 'unsafe-inline'/);
  assert.match(texto, /frame-ancestors 'none'/);
});

test('sacarNodeModules mueve assets/node_modules a assets/nm y corrige las rutas', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { sacarNodeModules } = await import('./publicar-web.mjs');
  const dist = mkdtempSync(join(tmpdir(), 'dist-'));
  mkdirSync(join(dist, 'assets/node_modules/@expo-google-fonts/rubik'), { recursive: true });
  writeFileSync(join(dist, 'assets/node_modules/@expo-google-fonts/rubik/R.ttf'), 'fuente');
  mkdirSync(join(dist, '_expo/static/js/web'), { recursive: true });
  writeFileSync(join(dist, '_expo/static/js/web/entry.js'), 'a("/assets/node_modules/@expo-google-fonts/rubik/R.ttf")');
  writeFileSync(join(dist, 'logo.png'), 'assets/node_modules/');

  sacarNodeModules(dist);

  assert.equal(existsSync(join(dist, 'assets/node_modules')), false);
  assert.equal(readFileSync(join(dist, 'assets/nm/@expo-google-fonts/rubik/R.ttf'), 'utf8'), 'fuente');
  assert.equal(
    readFileSync(join(dist, '_expo/static/js/web/entry.js'), 'utf8'),
    'a("/assets/nm/@expo-google-fonts/rubik/R.ttf")',
  );
  assert.equal(readFileSync(join(dist, 'logo.png'), 'utf8'), 'assets/node_modules/');
});
