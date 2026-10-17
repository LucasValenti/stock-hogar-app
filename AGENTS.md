# Stock del hogar (app)

App Expo (React Native + TypeScript + Expo Router) para gastos compartidos y stock de una casa. Ver `README.md` para correrla.

## Antes de tocar código de Expo

Expo cambia en cada SDK y la memoria sobre sus APIs puede estar vieja. Mirá la versión de `expo` en `package.json` y consultá los docs de esa versión (`https://docs.expo.dev/versions/v<major>.0.0/`; índice en `https://docs.expo.dev/llms.txt`) antes de usar una API de Expo, EAS o React Native.

## Comandos

```bash
npm test               # Jest
npm run typecheck      # tsc --noEmit
npx expo start         # servidor de desarrollo
npx expo install <paquete>   # siempre así: resuelve la versión compatible con el SDK
```

No hay linter configurado. Correr tests y typecheck antes de dar algo por terminado.

## Convenciones

- Rutas solo en `src/app/`; componentes, hooks y utilidades fuera de ahí.
- La lógica del reparto, el stock y las fechas vive en `src/logica/` como funciones puras con tests. Los montos son enteros en centavos.
- Los datos se piden por `src/datos` (Supabase o memoria según `EXPO_PUBLIC_DATOS`); las pantallas no usan el cliente de Supabase directo. Solo `src/datos` y `src/sesion` (ingreso) lo tocan.
- Valores visuales (color, tamaño, espacio, movimiento) solo desde `src/tema/tokens.json`. Animar `transform` y `opacity`, y respetar movimiento reducido.
- Textos de la interfaz en español rioplatense, con voseo.
- Sin claves ni datos reales en el repo: `.env` no se sube y la casa de ejemplo de `src/datos/memoria.ts` es ficticia.
- `ios/` y `android/` se generan solos (Continuous Native Generation): no se crean ni editan a mano; la configuración nativa va en `app.json` y plugins.
