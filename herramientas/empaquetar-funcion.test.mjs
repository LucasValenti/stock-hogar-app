// La Edge Function empaquetada en un archivo: sin imports locales, con los npm: externos y la lógica adentro.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { empaquetar } from './empaquetar-funcion.mjs';

test('resumen-semanal queda en un solo archivo listo para el editor del panel', async () => {
  const { codigo } = await empaquetar('resumen-semanal');
  assert.doesNotMatch(codigo, /from ['"]\.\.?\//, 'quedó un import relativo');
  assert.match(codigo, /from ['"]npm:web-push-neo@0\.1\.2['"]/);
  assert.match(codigo, /from ['"]npm:@supabase\/supabase-js@2\.118\.0['"]/);
  assert.match(codigo, /Deno\.serve\(/);
  // La lógica compartida entró al archivo.
  assert.match(codigo, /Tu semana en la casa/);
  assert.match(codigo, /function prepararClaves/);
  // Ningún secreto escrito.
  assert.doesNotMatch(codigo, /eyJ[A-Za-z0-9_-]{20}|sb_secret_/);
});
