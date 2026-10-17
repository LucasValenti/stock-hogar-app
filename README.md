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
cp .env.example .env    # opcional: por defecto usa datos en memoria
npx expo start
```

Después abrila con Expo Go en el celular, en un emulador o en el navegador (tecla `w`).

## Modo memoria

Con `EXPO_PUBLIC_DATOS=memoria` en `.env` (es el valor que trae `.env.example`) la app no necesita cuenta ni red: arranca como Ana, de una casa de ejemplo con tres integrantes ficticios (Ana, Bruno y Caro), y no guarda nada. Los datos de ejemplo están en `src/datos/memoria.ts`.

## Modo Supabase

1. Creá un proyecto en Supabase y corré `supabase/schema.sql` una sola vez en el SQL Editor.
2. Cargá en la tabla `integrantes` el email de cada persona de la casa: solo entra quien está ahí.
3. En `.env` poné `EXPO_PUBLIC_DATOS=supabase` y completá `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` con la URL y la clave pública (anon) del proyecto.
4. Para que llegue el código de ingreso, configurá el envío de emails en Supabase (Authentication).

Las variables `EXPO_PUBLIC_*` quedan dentro de la app: nunca pongas claves secretas. `.env` no se sube a git.

`supabase/` trae además:

- `migraciones/`: los cambios en orden (002 a 006) para una base creada con una versión anterior. Una base nueva solo necesita `schema.sql`.
- `tests/db.sql`: pruebas de las reglas de la base (permisos, stock, cierre de mes). Se corren en el SQL Editor y se deshacen solas al final.

## Tests

```bash
npm test               # Jest
npm run typecheck      # tsc --noEmit
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
| `supabase/` | Esquema, migraciones y pruebas de la base |

Los valores visuales (colores, tamaños, espacios, movimiento) salen solo de `src/tema/tokens.json`.

## Estado del proyecto

Fase 3, la base de la app: tema, lógica del reparto y del stock, capa de datos con cola sin conexión, ingreso por código, pestañas, Inicio y Ajustes. Las pantallas de Stock, Análisis y Cargar gasto llegan en las próximas fases.

El ícono y la pantalla de arranque (`assets/` y `app.json`) todavía son los de la plantilla de Expo; la identidad visual propia viene más adelante.

## Licencia

Pendiente: la decisión de la licencia la toma el titular del proyecto. Hasta entonces, todos los derechos reservados.
