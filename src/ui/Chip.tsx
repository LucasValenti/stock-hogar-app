// Chip (DESIGN.md, Chip): píldora con borde, alto ≥ `medida.tactil`, `peso.fuerte`; activo = `acento` lleno.
// Con `activo` es una opción (radio: «Pagó»); sin `activo` es un botón (con `flecha`, abre una hoja).

import { Pressable } from 'react-native';

import { useTema } from '@/tema/tema';

import { anilloDeFoco, useFoco } from './estilos';
import { Icono } from './Icono';
import { Texto } from './Texto';

type Props = {
  texto: string;
  onPress(): void;
  activo?: boolean;
  flecha?: boolean;
  bloqueado?: boolean;
  /** Nombre para el lector cuando el texto solo no alcanza («Categoría: Súper»). */
  accessibilityLabel?: string;
};

export function Chip({ texto, onPress, activo, flecha = false, bloqueado = false, accessibilityLabel }: Props) {
  const tema = useTema();
  const { conFoco, alFoco } = useFoco();
  const esOpcion = activo !== undefined;
  const lleno = activo === true;
  const colorTexto = lleno ? 'sobreAcento' : bloqueado ? 'textoSuave' : 'texto';
  return (
    <Pressable
      accessibilityRole={esOpcion ? 'radio' : 'button'}
      accessibilityLabel={accessibilityLabel ?? texto}
      accessibilityState={esOpcion ? { checked: lleno, disabled: bloqueado } : { disabled: bloqueado }}
      disabled={bloqueado}
      onPress={onPress}
      {...alFoco}
      style={({ pressed }) => [
        {
          minHeight: tema.medida.tactil,
          flexDirection: 'row',
          alignItems: 'center',
          gap: tema.espacio.xs,
          paddingHorizontal: tema.espacio.l,
          paddingVertical: tema.espacio.xs,
          borderRadius: tema.radio.chip,
          borderWidth: tema.medida.borde,
          borderColor: pressed ? tema.color.texto : lleno ? tema.color.acento : tema.color.borde,
          backgroundColor: lleno ? tema.color.acento : tema.color.superficie,
        },
        conFoco && anilloDeFoco(tema),
      ]}
    >
      <Texto variante="fuerte" color={colorTexto} style={{ flexShrink: 1 }}>
        {texto}
      </Texto>
      {flecha ? <Icono nombre="abajo" tamano={tema.medida.icono} color={tema.color[colorTexto]} /> : null}
    </Pressable>
  );
}
