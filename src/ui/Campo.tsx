// Campo de texto (DESIGN.md, Campo): píldora con borde sobre `superficie`, alto ≥ `medida.tactil`,
// etiqueta arriba y ayuda (o el error, que se anuncia una vez como alerta) abajo. `grande` es el monto de Cargar.

import { useId } from 'react';
import { TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { FAMILIAS } from '@/tema/fuentes';
import { useTema } from '@/tema/tema';

import { anilloDeFoco, useFoco } from './estilos';
import { Texto } from './Texto';

type Props = {
  etiqueta: string;
  valor: string;
  alCambiar(texto: string): void;
  ayuda?: string;
  error?: string | null;
  /** No se puede editar (mes cerrado, gasto de solo lectura). */
  bloqueado?: boolean;
  teclado?: KeyboardTypeOptions;
  placeholder?: string;
  /** El monto de Cargar: cifras tabulares grandes, centradas. */
  grande?: boolean;
  /** Emails y códigos: sin mayúscula automática ni corrector. */
  sinCorrector?: boolean;
};

export function Campo({ etiqueta, valor, alCambiar, ayuda, error, bloqueado = false, teclado, placeholder, grande = false, sinCorrector = false }: Props) {
  const tema = useTema();
  const { conFoco, alFoco } = useFoco();
  const id = useId();
  return (
    <View style={{ gap: tema.espacio.xs }}>
      <Texto variante="rotulo" nativeID={`${id}-etiqueta`}>
        {etiqueta}
      </Texto>
      <TextInput
        allowFontScaling
        accessibilityLabel={etiqueta}
        aria-labelledby={`${id}-etiqueta`}
        // La ayuda va como pista; el error no, que ya lo anuncia la alerta de abajo.
        accessibilityHint={error ? undefined : ayuda}
        accessibilityState={{ disabled: bloqueado }}
        editable={!bloqueado}
        value={valor}
        onChangeText={alCambiar}
        keyboardType={teclado}
        autoCapitalize={sinCorrector ? 'none' : undefined}
        autoCorrect={sinCorrector ? false : undefined}
        placeholder={placeholder}
        placeholderTextColor={tema.color.textoSuave}
        {...alFoco}
        style={[
          {
            minHeight: tema.medida.tactil,
            paddingHorizontal: tema.espacio.l,
            paddingVertical: tema.espacio.s,
            borderRadius: tema.radio.boton,
            borderWidth: error ? tema.medida.bordeFuerte : tema.medida.borde,
            borderColor: error ? tema.color.falta : tema.color.borde,
            backgroundColor: tema.color.superficie,
            color: bloqueado ? tema.color.textoSuave : tema.color.texto,
            fontFamily: grande ? FAMILIAS.numeros : FAMILIAS.texto,
            fontSize: grande ? tema.tamano.xxxl : tema.tamano.m,
          },
          grande && { textAlign: 'center', fontVariant: ['tabular-nums'] },
          conFoco && anilloDeFoco(tema),
        ]}
      />
      {error ? (
        <Texto variante="sub" color="falta" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Texto>
      ) : ayuda ? (
        <Texto variante="sub">{ayuda}</Texto>
      ) : null}
    </View>
  );
}
