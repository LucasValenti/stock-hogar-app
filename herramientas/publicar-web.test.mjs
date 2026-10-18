import test from 'node:test';
import assert from 'node:assert/strict';
import { armarHeaders } from './publicar-web.mjs';

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

test('siempre están wasm-unsafe-eval, worker-src blob:, unsafe-inline en estilos y frame-ancestors none', () => {
  const texto = armarHeaders(null);
  assert.match(texto, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.match(texto, /worker-src 'self' blob:/);
  assert.match(texto, /style-src 'self' 'unsafe-inline'/);
  assert.match(texto, /frame-ancestors 'none'/);
});
