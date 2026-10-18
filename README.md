# Stock del hogar (app)

App para llevar los gastos compartidos y el stock de una casa: quién pagó qué, cuánto le toca a cada integrante según su sueldo, qué hay en la heladera y la alacena, y el cierre de cada mes. Si no hay red, lo que se carga queda pendiente en el dispositivo y se manda cuando vuelve la conexión.

Es una pieza de portfolio de **KUSAK** ([kusak.dev](https://kusak.dev)). No tiene datos reales: el modo memoria corre con una casa de ejemplo inventada.

## Stack

- Expo SDK 58, React Native 0.88, React 19 y TypeScript
- Expo Router para la navegación (rutas en `src/app/`)
- Supabase (Postgres, ingreso por código por email y tiempo real) detrás de una capa de datos intercambiable
- Jest con `jest-expo` y Testing Library

## Cómo correrla

```bash
npm install
cp .env.example .env    # obligatorio: sin .env la app va a Supabase y muestra que falta la configuración
npx expo start
```

Después abrila con Expo Go en el celular, en un emulador o en el navegador (tecla `w`).

`EXPO_PUBLIC_DATOS` en `.env` elige de dónde salen los datos:

| Valor | Qué hace |
|---|---|
| `memoria` (el que trae `.env.example`) | Casa de ejemplo, sin cuenta ni red. Ver «Modo memoria». |
| `supabase`, o la variable ausente | Base real en Supabase: necesita `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Sin ellas, la app muestra «Falta configurar la conexión» (SIN_CONFIG). Ver «Modo Supabase». |

Si cambiás `.env`, reiniciá `npx expo start`: las variables se leen al compilar.

## Modo memoria

Con `EXPO_PUBLIC_DATOS=memoria` en `.env` la app no necesita cuenta ni red: arranca como Ana, de una casa de ejemplo con tres integrantes ficticios (Ana, Bruno y Caro), y no guarda nada. Los datos de ejemplo están en `src/datos/memoria.ts`.

## Modo Supabase

1. Creá un proyecto en Supabase y corré `supabase/schema.sql` una sola vez en el SQL Editor.
2. Cargá en la tabla `integrantes` una fila por persona de la casa, con su `nombre` (obligatorio) y su `email` en minúsculas (la base rechaza mayúsculas): solo entra quien está ahí. Por ejemplo: `insert into integrantes (nombre, email) values ('Ana', 'ana@ejemplo.com');`
3. En `.env` poné `EXPO_PUBLIC_DATOS=supabase` y completá `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` con la URL y la clave pública (anon) del proyecto.
4. Para que llegue el código de ingreso, configurá el envío de emails en Supabase (Authentication).

Las variables `EXPO_PUBLIC_*` quedan dentro de la app: nunca pongas claves secretas. `.env` no se sube a git.

`supabase/` trae además:

- `migraciones/`: los cambios en orden (002 a 007) para una base creada con una versión anterior. Una base nueva solo necesita `schema.sql`.
- `schema-pre-007.sql`: el esquema tal como está en producción antes de la 007, congelado para probar la migración.
- `tests/db.sql`: pruebas de las reglas de la base (permisos, stock, cierre de mes, tildados, anotaciones). Se corren en el SQL Editor y se deshacen solas al final, o en local con `npm run db:probar`.

## Tests

```bash
npm test               # Jest
npm run typecheck      # tsc --noEmit
npm run db:probar             # pruebas de la base (supabase/tests/db.sql) sobre schema.sql, en un Postgres en memoria
npm run db:probar:migracion   # las mismas, sobre schema-pre-007.sql + la migración 007 (el camino de producción)
```

Las pruebas de la base corren en un Postgres en memoria (PGlite) y nunca se conectan a Supabase.

## Publicar la web

La web es una app estática (SPA) que se sube a Cloudflare Pages:

```bash
npm run publicar:web
```

El comando hace `npx expo export -p web`, escribe todo en `dist/` y agrega ahí mismo los archivos de Cloudflare Pages: `_headers` con la CSP y las cabeceras de seguridad, y `_redirects` para que cualquier ruta sirva `index.html`. Lee `EXPO_PUBLIC_SUPABASE_URL` de `.env` para el `connect-src` (https y wss); sin esa variable falla salvo que corras con `EXPO_PUBLIC_DATOS=memoria`, que deja el `connect-src` solo en `'self'`.

Para la demo pública de kusak.dev, `npm run publicar:demo` exporta con `EXPO_PUBLIC_DATOS=memoria` a `dist-demo/` (ignorado por git) y escribe el mismo `_headers`, con el `connect-src` sin Supabase.

Se sube únicamente `dist/`. Para probarlo como lo hace Cloudflare, antes de publicar:

```bash
npx wrangler pages dev dist
```


## Estructura

| Carpeta | Qué hay |
|---|---|
| `src/app/` | Pantallas y navegación (Expo Router) |
| `src/logica/` | Reparto, stock, fechas y dinero en centavos: funciones puras con tests |
| `src/datos/` | Capa de datos: Supabase, memoria y cola de escritura sin conexión |
| `src/sesion/` | Ingreso por código y sesión guardada |
| `src/tema/` | Tokens de diseño (`tokens.json`), tema claro y oscuro, fuentes |
| `src/ui/` | Componentes de interfaz |
| `src/pruebas/` | Pruebas de pantallas (fuera de `src/app/` para que Expo Router no las tome como rutas) |
| `supabase/` | Esquema, migraciones y pruebas de la base |

Los valores visuales (colores, tamaños, espacios, movimiento) salen solo de `src/tema/tokens.json`.

## Estado del proyecto

Fase 5: tema, lógica del reparto y del stock, capa de datos con cola sin conexión, ingreso por código, pestañas, Inicio, Stock, Análisis, Ajustes, Cargar gasto (con «Subir comprobante» leído en el dispositivo) y ficha de producto.

El fondo del ícono y de la pantalla de arranque (`app.json`) ya usa el color `fondo` de los tokens; las imágenes de `assets/` todavía son las de la plantilla de Expo.

## Licencia

Sin licencia de uso: el código se publica para que se pueda ver como parte del portfolio de KUSAK, pero todos los derechos están reservados.
