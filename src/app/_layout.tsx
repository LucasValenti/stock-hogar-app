import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { PantallaAjena, PantallaCarga, PantallaError } from '@/sesion/pantallas';
import { SesionProvider, useSesion } from '@/sesion/sesion';
import { useFuentesCargadas } from '@/tema/fuentes';
import { useTema } from '@/tema/tema';

SplashScreen.preventAutoHideAsync();

export default function LayoutRaiz() {
  return (
    <SesionProvider>
      <Raiz />
    </SesionProvider>
  );
}

// Siempre se ve algo: la carga, el error, la cuenta ajena o la app. El ingreso y las pestañas
// se reparten por estado con `Stack.Protected`: si la sesión cambia, la navegación se corrige sola.
function Raiz() {
  const tema = useTema();
  const fuentesListas = useFuentesCargadas();
  const { estado, error, reintentar } = useSesion();

  useEffect(() => {
    if (fuentesListas) SplashScreen.hideAsync();
  }, [fuentesListas]);

  let contenido;
  if (error !== null) contenido = <PantallaError error={error} onReintentar={reintentar} />;
  else if (!fuentesListas || estado === 'cargando') contenido = <PantallaCarga />;
  else if (estado === 'ajena') contenido = <PantallaAjena />;
  else {
    contenido = (
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tema.color.fondo } }}>
        <Stack.Protected guard={estado === 'sin-sesion'}>
          <Stack.Screen name="ingresar" />
        </Stack.Protected>
        <Stack.Protected guard={estado === 'lista'}>
          <Stack.Screen name="index" />
        </Stack.Protected>
      </Stack>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      {contenido}
    </>
  );
}
