# Stock del hogar (app)

App nativa con Expo (React Native + TypeScript + Expo Router) para llevar los gastos y el stock de la casa. Reescritura de la versión web; el diseño sale de `DESIGN.md` y `tokens.json` del proyecto web.

## Empezar

```bash
npm install
cp .env.example .env   # opcional: por defecto usa datos en memoria
npx expo start
```

## Scripts

| Comando | Qué hace |
|---|---|
| `npm test` | Tests con Jest (jest-expo) |
| `npm run typecheck` | Chequeo de tipos (`tsc --noEmit`) |
| `npm start` | Servidor de desarrollo de Expo |

## Estructura

- `src/app/`: pantallas (Expo Router).
- `src/tema/`: tokens de diseño (`tokens.json`), tema claro/oscuro y fuentes.

Los valores visuales (colores, tamaños, espacios, movimiento) salen solo de `src/tema/tokens.json`.
