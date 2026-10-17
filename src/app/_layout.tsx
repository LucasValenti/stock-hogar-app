import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useFuentesCargadas } from '@/tema/fuentes';
import { useTema } from '@/tema/tema';

SplashScreen.preventAutoHideAsync();

// Marcador de posición: las tareas siguientes reemplazan este layout por la navegación real.
export default function LayoutRaiz() {
  const tema = useTema();
  const fuentesListas = useFuentesCargadas();

  useEffect(() => {
    if (fuentesListas) SplashScreen.hideAsync();
  }, [fuentesListas]);

  if (!fuentesListas) return null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tema.color.fondo } }} />
    </>
  );
}
