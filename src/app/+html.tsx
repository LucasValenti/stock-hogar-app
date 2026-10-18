import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Raíz HTML de la web (solo se arma al renderizar en el servidor): declara el manifest de la PWA
// para que Android ofrezca «Instalar app» y la muestre en «Compartir».
export default function Raiz({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#dce8e3" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
