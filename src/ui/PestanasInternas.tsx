// Pestañas internas (DESIGN.md, Pestañas internas): contenedor píldora con borde, ítems de alto
// ≥ `medida.tactil` en `tamano.s` y `peso.fuerte`; la activa, `acento` lleno con `sobreAcento`
// (el relleno es la pista de forma). Si no entran, pasan a otro renglón.

import { Pressable, View } from 'react-native';

import { useTema } from '@/tema/tema';

import { anilloDeFoco, useFoco } from './estilos';
import { Texto } from './Texto';

type Opcion<C extends string> = { clave: C; texto: string };

type Props<C extends string> = {
  /** Nombre del grupo para el lector («Vista del stock»). */
  etiqueta: string;
  opciones: Opcion<C>[];
  activa: C;
  alCambiar(clave: C): void;
};

export function PestanasInternas<C extends string>({ etiqueta, opciones, activa, alCambiar }: Props<C>) {
  const tema = useTema();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={etiqueta}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: tema.espacio.xs,
        gap: tema.espacio.xs,
        borderWidth: tema.medida.borde,
        borderColor: tema.color.borde,
        borderRadius: tema.radio.tarjeta,
        backgroundColor: tema.color.superficie,
      }}
    >
      {opciones.map((o) => (
        <Pestana key={o.clave} texto={o.texto} activa={o.clave === activa} onPress={() => alCambiar(o.clave)} />
      ))}
    </View>
  );
}

function Pestana({ texto, activa, onPress }: { texto: string; activa: boolean; onPress(): void }) {
  const tema = useTema();
  const { conFoco, alFoco } = useFoco();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={texto}
      accessibilityState={{ selected: activa }}
      onPress={onPress}
      {...alFoco}
      style={[
        {
          flexGrow: 1,
          minHeight: tema.medida.tactil,
          paddingHorizontal: tema.espacio.m,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: tema.radio.chip,
          backgroundColor: activa ? tema.color.acento : 'transparent',
        },
        conFoco && anilloDeFoco(tema),
      ]}
    >
      <Texto variante="seccion" centrado color={activa ? 'sobreAcento' : 'textoSuave'}>
        {texto}
      </Texto>
    </Pressable>
  );
}
