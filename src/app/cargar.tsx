// Cargar un gasto (se abre como hoja sobre las pestañas). Por ahora solo avisa que llega después.

import { router } from 'expo-router';

import { Boton } from '@/ui/Boton';
import { ProximaVersion } from '@/ui/ProximaVersion';

export default function Cargar() {
  const volver = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <ProximaVersion titulo="Cargar gasto">
      <Boton texto="Volver" variante="borde" onPress={volver} />
    </ProximaVersion>
  );
}
