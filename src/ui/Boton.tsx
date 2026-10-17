// Botón píldora (DESIGN.md, Botones). `lleno`: la acción de la pantalla, uno por pantalla u hoja.
// `borde`: la otra, sobre `superficie` con borde. Alto ≥ `medida.tactil`; el texto crece y baja de renglón.

import { ActivityIndicator, Pressable } from 'react-native';

import { useTema } from '@/tema/tema';

import { anilloDeFoco, useFoco } from './estilos';
import { Icono, type NombreIcono } from './Icono';
import { Texto } from './Texto';

type Props = {
  texto: string;
  onPress: () => void;
  variante?: 'lleno' | 'borde';
  icono?: NombreIcono;
  /** Mientras algo se envía: no se puede tocar de nuevo y se ve que está trabajando. */
  ocupado?: boolean;
};

export function Boton({ texto, onPress, variante = 'lleno', icono, ocupado = false }: Props) {
  const tema = useTema();
  const { conFoco, alFoco } = useFoco();
  const lleno = variante === 'lleno';
  const colorTexto = lleno ? tema.color.sobreAcento : tema.color.texto;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={texto}
      accessibilityState={{ disabled: ocupado, busy: ocupado }}
      disabled={ocupado}
      onPress={onPress}
      {...alFoco}
      style={({ pressed }) => [
        {
          minHeight: tema.medida.tactil,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: tema.espacio.s,
          paddingHorizontal: tema.espacio.xl,
          paddingVertical: tema.espacio.s,
          borderRadius: tema.radio.boton,
          borderWidth: tema.medida.borde,
          // Al apretarlo el borde se oscurece: se nota sin cambiar tamaños.
          borderColor: pressed ? tema.color.texto : lleno ? tema.color.acento : tema.color.borde,
          backgroundColor: lleno ? tema.color.acento : tema.color.superficie,
        },
        conFoco && anilloDeFoco(tema),
      ]}
    >
      {ocupado ? (
        <ActivityIndicator color={colorTexto} />
      ) : icono ? (
        <Icono nombre={icono} tamano={tema.medida.icono} color={colorTexto} />
      ) : null}
      <Texto variante="fuerte" centrado color={lleno ? 'sobreAcento' : 'texto'} style={{ flexShrink: 1 }}>
        {texto}
      </Texto>
    </Pressable>
  );
}
