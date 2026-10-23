// ESLint: las reglas recomendadas de JS, TypeScript y hooks de React. Corre con `npm run lint`
// y es parte de `npm run verificar` (lo mismo que corre la CI).
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dist-demo', 'referencia-expo', 'node_modules', 'public', '.encargos'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'vite.config.ts'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Reglas pensadas para el React Compiler (no se usa). Marcan patrones que hoy funcionan, como copiar
      // al formulario lo que llega de la base al abrir una hoja. Deuda: revisarlas si se adopta el compilador.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      // Un `_` adelante marca a propósito un parámetro o variable que no se usa.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Edge Functions de Supabase (Deno).
    files: ['supabase/functions/**/*.ts'],
    languageOptions: { globals: { Deno: 'readonly' } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['herramientas/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
