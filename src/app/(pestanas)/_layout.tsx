// Las cuatro pestañas con la barra «Heladera»; + Cargar abre la hoja de carga (src/app/cargar.tsx).

import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { useTema } from '@/tema/tema';
import { BarraPestanas, type NombrePestana } from '@/ui/BarraPestanas';

export default function LayoutPestanas() {
  const tema = useTema();
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: tema.color.fondo } }}
      tabBar={({ state, navigateToTab }) => (
        <BarraPestanas
          activa={state.routes[state.index].name as NombrePestana}
          alIr={(nombre) => {
            const ruta = state.routes.find((r) => r.name === nombre);
            if (ruta) navigateToTab(ruta.key);
          }}
          alCargar={() => router.push('/cargar')}
        />
      )}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="stock" options={{ title: 'Stock' }} />
      <Tabs.Screen name="analisis" options={{ title: 'Análisis' }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes' }} />
    </Tabs>
  );
}
