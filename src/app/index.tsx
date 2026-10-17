import { Text, View } from 'react-native';

import { FAMILIAS } from '@/tema/fuentes';
import { useTema } from '@/tema/tema';

// Marcador de posición: las tareas siguientes reemplazan esta pantalla por Inicio.
export default function Inicio() {
  const tema = useTema();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tema.color.fondo }}>
      <Text style={{ color: tema.color.texto, fontFamily: FAMILIAS.titulo, fontSize: tema.tamano.xxl }}>Stock del hogar</Text>
    </View>
  );
}
