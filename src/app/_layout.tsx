import { Stack } from 'expo-router';

// Marcador de posición: las tareas siguientes reemplazan este layout por la navegación real.
export default function LayoutRaiz() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
