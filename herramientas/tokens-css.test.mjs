import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { armarCss } from './tokens-css.mjs';

const tokens = JSON.parse(readFileSync(new URL('../src/tema/tokens.json', import.meta.url), 'utf8'));
const css = armarCss(tokens);

test('un color claro va en :root y su oscuro, dentro del media', () => {
  assert.match(css, /:root \{[^}]*--color-fondo: #dce8e3;/s);
  assert.match(
    css,
    /@media \(prefers-color-scheme: dark\) \{\s*:root \{[^}]*--color-fondo: #0f1715;/,
  );
});

test('los tamaños se vuelcan en px', () => {
  assert.match(css, /--tamano-l: 16px;/);
});

test('la sombra de tarjeta usa el formato de la maqueta', () => {
  assert.match(css, /--sombra-tarjeta: 0 2px 0px rgb\(0 0 0 \/ 0\.08\);/);
});

test('la curva de movimiento se vuelca tal cual', () => {
  assert.match(css, /--mov-curva: cubic-bezier\(0\.34, 1\.3, 0\.64, 1\);/);
});
