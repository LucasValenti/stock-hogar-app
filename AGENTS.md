# Stock del hogar (app)

Web app (PWA) en React + Vite + TypeScript para gastos compartidos y stock de una casa. Hasta la v1.0.1 (tag `v1.0.1`) fue una app Expo; ese código está en `main` y, para portar pantallas, en la copia local ignorada `referencia-expo/`.

## Comandos

```bash
npm run dev            # servidor de desarrollo de Vite
npm test               # Vitest (jsdom)
npm run typecheck      # tsc --noEmit
npm run build          # typecheck + vite build → dist/
npm run db:probar             # pruebas de la base (supabase/tests/db.sql) sobre schema.sql, en un Postgres en memoria
npm run db:probar:migracion   # las mismas, sobre schema-pre-007.sql + la migración 007
```

No hay linter configurado. Correr tests y typecheck antes de dar algo por terminado; si se toca `supabase/`, también `db:probar` y `db:probar:migracion` (nunca se conectan a Supabase).

Instalar paquetes SIEMPRE con `npm install --ignore-scripts --save-exact <paquete>@<versión>`.

## Convenciones

- Rutas con `wouter`; las pantallas viven en `src/pantallas/`, los componentes en `src/ui/`.
- La lógica del reparto, el stock y las fechas vive en `src/logica/` como funciones puras con tests. Los montos son enteros en centavos.
- Los datos se piden por `src/datos` (Supabase o memoria según `VITE_DATOS`); las pantallas no usan el cliente de Supabase directo. Solo `src/datos` y `src/sesion` (ingreso) lo tocan.
- Valores visuales (color, tamaño, espacio, movimiento) solo desde los tokens de `src/tema/tokens.json`, que se vuelcan a variables CSS en `:root`. Estilos con CSS Modules, sin librerías de estilos. Animar `transform` y `opacity`, y respetar `prefers-reduced-motion`.
- HTML semántico y accesible: `button` para acciones, `label` en campos, foco visible, 360 px sin scroll lateral.
- Textos de la interfaz en español rioplatense, con voseo.
- Sin claves ni datos reales en el repo: `.env` no se sube y la casa de ejemplo de `src/datos/memoria.ts` es ficticia.
