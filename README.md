# Stock del hogar (app)

App para llevar los gastos compartidos y el stock de una casa: quién pagó qué, cuánto le toca a cada integrante según su sueldo, qué hay en la heladera y la alacena, y el cierre de cada mes. Si no hay red, lo que se carga queda pendiente en el dispositivo y se manda cuando vuelve la conexión.

Es una pieza de portfolio de **KUSAK** ([kusak.dev](https://kusak.dev)). No tiene datos reales: el modo memoria corre con una casa de ejemplo inventada.

## Stack

- React 19 y TypeScript, con Vite 8 (web app instalable, PWA)
- Rutas con `wouter`; estilos con CSS Modules y los tokens de `src/tema/tokens.json` como variables CSS
- Supabase (base, reglas y funciones) y una cola de escritura que guarda lo pendiente sin conexión
- Comprobantes leídos en el navegador: Tesseract para imágenes y pdf.js para PDF, servidos desde el sitio
- Vitest con Testing Library

Hasta la v1.0.1 (tag `v1.0.1`) fue una app Expo con APK para Android; quedó congelada ahí.

## Cómo correrla

```bash
npm install --ignore-scripts
cp .env.example .env
npm run dev
```

Abrí la dirección que muestra Vite. Si cambiás `.env`, reiniciá `npm run dev`: las variables se leen al arrancar.

## Modo memoria

Con `VITE_DATOS=memoria` en `.env` la app no necesita cuenta ni red: arranca en una casa de ejemplo con tres integrantes ficticios (Ana, Bruno y Caro) y no guarda nada. Los datos de ejemplo están en `src/datos/memoria.ts`.

Por defecto entra Ana, que es la admin. `VITE_YO` elige a otro de la semilla (`ejemplo-bruno` o `ejemplo-caro`); un id que no está se ignora y vuelve a Ana. Sirve para ver la misma casa con menos permisos: Bruno y Caro no ven sueldos, no dan altas y no ven la sección Permisos.

Ana administra la casa: ve sueldos, altas y bajas, y puede dar esos dos permisos o ceder el rol. Quien no es admin solo hace lo que le dieron. El reparto se ve igual; los montos de sueldo, no.

## Modo Supabase

1. Creá un proyecto en Supabase y corré `supabase/schema.sql` una sola vez en el SQL Editor.
2. Cargá en la tabla `integrantes` una fila por persona de la casa, con su `nombre` (obligatorio) y su `email` en minúsculas (la base rechaza mayúsculas): solo entra quien está ahí. Por ejemplo: `insert into integrantes (nombre, email) values ('Ana', 'ana@ejemplo.com');`
3. En `.env` poné `VITE_DATOS=supabase` y completá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con la URL y la clave pública (anon) del proyecto.
4. Para que llegue el código de ingreso, configurá el envío de emails en Supabase (Authentication).

Las variables `VITE_*` quedan dentro de la app: nunca pongas claves secretas. `.env` no se sube a git.

`supabase/` trae además:

- `migraciones/`: los cambios en orden (002 a 007) para una base creada con una versión anterior. Una base nueva solo necesita `schema.sql`.
- `schema-pre-007.sql`: el esquema tal como está en producción antes de la 007, congelado para probar la migración.
- `tests/db.sql`: pruebas de las reglas de la base (permisos, stock, cierre de mes, tildados, anotaciones). Se corren en el SQL Editor y se deshacen solas al final, o en local con `npm run db:probar`.

## Tests

```bash
npm run verificar      # lint, tipos, tests, build, pruebas de la base y npm audit; lo mismo que la CI
npm run lint           # ESLint
npm test               # Vitest
npm run typecheck      # tsc --noEmit
npm run db:probar             # pruebas de la base (supabase/tests/db.sql) sobre schema.sql, en un Postgres en memoria
npm run db:probar:migracion   # las mismas, sobre schema-pre-009.sql con una casa en uso + la migración 009 (el camino de producción)
npm run db:probar:con-datos   # las mismas, sobre una casa ya en uso (supabase/tests/casa-existente.sql)
```

La CI (`.github/workflows/verificar.yml`) corre `npm run verificar` en cada push a `main` y en cada pull request. Dependabot propone actualizaciones semanales de dependencias y acciones, con 7 días de espera desde que sale cada versión. El `.npmrc` del proyecto no deja correr scripts de instalación (`ignore-scripts=true`).

Las pruebas de la base corren en un Postgres en memoria (PGlite) y nunca se conectan a Supabase.

## Avisos de los domingos

Cada uno los prende en Ajustes → Avisos. Los domingos a las 20 (hora de Argentina) pg_cron llama a la Edge Function `resumen-semanal`, que manda por web push el total de la semana y lo que falta del stock. En iPhone solo andan con la app instalada.

- **Nadie escribe claves:** el secreto del cron lo genera la migración en Vault, y el par VAPID lo genera la función la primera vez que corre y lo guarda en Vault. La función los lee con la clave de servicio (`secretos_avisos`); la app pide la clave pública a la base (`clave_publica_avisos`).
- **Base:** migración `supabase/migraciones/009-avisos.sql` (tabla `suscripciones_push`, funciones de suscripción, de claves y de datos del resumen, y el trabajo de pg_cron). Antes de correrla, en Vault tiene que estar `resumen_semanal_url` (la URL de la función; no es secreta).
- **Función:** `supabase/functions/resumen-semanal/` (Deno), sin verificación de JWT. Con la CLI: `npx supabase functions deploy resumen-semanal` (toma `supabase/config.toml`). Desde el editor del panel: `npm run empaquetar:funcion` arma `dist-funciones/resumen-semanal/index.ts` en un solo archivo para pegar, y en la función hay que apagar «Verify JWT».
- **Pruebas:** el texto, la semana, las claves y el envío (`supabase/functions/**/*.test.ts`), la pantalla y el service worker con Vitest; las reglas de la base en `db.sql`; el empaquetado con `npm run test:herramientas`. El push real se prueba disparando la función a mano después de desplegarla.

## Publicar la web

```bash
npm run publicar:web
```

Arma la web con Vite en `dist/` (sin mapas de fuente) y agrega los archivos de Cloudflare Pages: `_headers` con la CSP (sin `'unsafe-inline'`), las cabeceras de seguridad y el caché (inmutable para `/assets/*`, `/ocr/*` y `/pdf/*`), y `_redirects` para que cualquier ruta sirva `index.html`. Lee `VITE_SUPABASE_URL` de `.env` para el `connect-src` (https y wss); sin esa variable falla salvo que corras con `VITE_DATOS=memoria`.

Para la demo pública, `npm run publicar:demo` arma con `VITE_DATOS=memoria` en `dist-demo/`, con el `connect-src` sin Supabase.

## Estructura

| Carpeta | Qué hay |
|---|---|
| `src/pantallas/` | Pantallas, rutas (`App.tsx`) y sus pruebas |
| `src/logica/` | Reparto, stock, fechas y dinero en centavos: funciones puras con tests |
| `src/datos/` | Capa de datos: Supabase, memoria y cola de escritura sin conexión |
| `src/sesion/` | Ingreso por código y sesión guardada |
| `src/tema/` | Tokens de diseño (`tokens.json` → `tokens.css` con `npm run tokens`), base y fuentes |
| `src/ui/` | Componentes de interfaz (CSS Modules) |
| `src/comprobante/` | Lectura de comprobantes (OCR, PDF) y lo compartido desde otra app |
| `src/pruebas/` | Preparación de los tests (Vitest) |
| `public/` | Service worker, manifest, íconos y los archivos de OCR y PDF |
| `supabase/` | Esquema, migraciones y pruebas de la base |

Los valores visuales (colores, tamaños, espacios, movimiento) salen solo de `src/tema/tokens.json`.

## Estado del proyecto

Web React con todas las pantallas (Inicio, Cargar, Stock y producto, Análisis, Ajustes), ingreso por código, demo con una casa de ejemplo y comprobantes por archivo o desde «Compartir» en la web instalada.

## Licencia

Sin licencia de uso: el código se publica para que se pueda ver como parte del portfolio de KUSAK, pero todos los derechos están reservados.
