// Encabezado de una pantalla que se abre encima de las pestañas (Cargar, la ficha de un producto):
// «Volver» de `medida.tactil` con su anillo de foco y el título Fredoka, que baja de renglón si es largo.

import { Pressable, View } from 'react-native';

import { useTema } from '@/tema/tema';

import { anilloDeFoco, useFoco } from './estilos';
import { Icono } from './Icono';
import { Texto } from './Texto';

export function Encabezado({ titulo, alVolver }: { titulo: string; alVolver(): void }) {
  const tema = useTema();
  const { conFoco, alFoco } = useFoco();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tema.espacio.s, minHeight: tema.medida.tactil }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver"
        onPress={alVolver}
        {...alFoco}
        style={[
          {
            width: tema.medida.tactil,
            height: tema.medida.tactil,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: tema.radio.boton,
          },
          conFoco && anilloDeFoco(tema),
        ]}
      >
        <Icono nombre="atras" tamano={tema.medida.icono} color={tema.color.texto} />
      </Pressable>
      <Texto variante="tituloTarjeta" aria-level={1} style={{ flexShrink: 1 }}>
        {titulo}
      </Texto>
    </View>
  );
}
