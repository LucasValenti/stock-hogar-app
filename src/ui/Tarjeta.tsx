// Tarjeta «papelito» (DESIGN.md, Tarjeta e imán): `superficie`, borde y `radio.tarjeta`.
// Con `iman`, un círculo `acento` centrado sobre el borde de arriba y la sombra dura de la tarjeta;
// sin imán va plana. El imán es decorativo y no lo lee el lector de pantalla.

import { View, type ViewProps } from 'react-native';

import { useTema } from '@/tema/tema';

import { decorativo, sombra } from './estilos';

type Props = ViewProps & { iman?: boolean };

export function Tarjeta({ iman = false, style, children, ...resto }: Props) {
  const tema = useTema();
  return (
    <View
      style={[
        {
          backgroundColor: tema.color.superficie,
          borderWidth: tema.medida.borde,
          borderColor: tema.color.borde,
          borderRadius: tema.radio.tarjeta,
          paddingVertical: tema.espacio.m,
          paddingHorizontal: tema.espacio.l,
          gap: tema.espacio.s,
        },
        iman && { marginTop: tema.medida.imanSobresale, ...sombra(tema.sombra.tarjeta) },
        style,
      ]}
      {...resto}
    >
      {iman ? (
        <View
          {...decorativo}
          style={{
            position: 'absolute',
            top: -tema.medida.imanSobresale - tema.medida.borde,
            left: '50%',
            marginLeft: -tema.medida.iman / 2,
            width: tema.medida.iman,
            height: tema.medida.iman,
            borderRadius: tema.radio.chip,
            backgroundColor: tema.color.acento,
            ...sombra(tema.sombra.iman),
          }}
        />
      ) : null}
      {children}
    </View>
  );
}
