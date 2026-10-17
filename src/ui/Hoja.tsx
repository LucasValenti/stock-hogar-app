// Hoja inferior (DESIGN.md, Hoja inferior): `superficie`, `radio.hoja` arriba, borde arriba, asa y `velo` detrás.
// Título Fredoka, subtítulo, una lista que se desplaza y el pie con la acción (un solo botón lleno).
// Entra con `movimiento.normal` (sube un poco y aparece); con movimiento reducido, solo un fundido corto.
// Tocar el velo o el «atrás» del sistema la cierra.

import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTema } from '@/tema/tema';

import { decorativo } from './estilos';
import { useMovimientoReducido } from './movimiento';
import { Texto } from './Texto';

type Props = {
  visible: boolean;
  titulo: string;
  subtitulo?: string;
  alCerrar(): void;
  children?: ReactNode;
  /** La acción de la hoja, fija abajo («Sumar 3 al gasto»). */
  pie?: ReactNode;
};

export function Hoja({ visible, titulo, subtitulo, alCerrar, children, pie }: Props) {
  const tema = useTema();
  const reducido = useMovimientoReducido();
  const abajo = useSafeAreaInsets().bottom;
  const entrada = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    entrada.setValue(0);
    const anim = Animated.timing(entrada, {
      toValue: 1,
      duration: reducido ? tema.movimiento.reducido : tema.movimiento.normal,
      easing: reducido ? Easing.linear : Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    anim.start();
    return () => anim.stop();
  }, [visible, reducido, entrada, tema.movimiento.normal, tema.movimiento.reducido]);

  const subir = reducido
    ? []
    : [{ translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [tema.espacio.xxl, 0] }) }];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={alCerrar} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: tema.velo, opacity: entrada }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={alCerrar} style={{ flex: 1 }} />
        </Animated.View>
        <Animated.View
          testID="hoja"
          onAccessibilityEscape={alCerrar}
          style={{
            maxHeight: '85%',
            backgroundColor: tema.color.superficie,
            borderTopLeftRadius: tema.radio.hoja,
            borderTopRightRadius: tema.radio.hoja,
            borderTopWidth: tema.medida.borde,
            borderColor: tema.color.borde,
            paddingTop: tema.espacio.s,
            paddingHorizontal: tema.espacio.l,
            paddingBottom: tema.espacio.xl + abajo,
            gap: tema.espacio.s,
            opacity: entrada,
            transform: subir,
          }}
        >
          <View
            {...decorativo}
            style={{
              alignSelf: 'center',
              width: tema.medida.asaAncho,
              height: tema.medida.asaAlto,
              borderRadius: tema.radio.chip,
              backgroundColor: tema.color.borde,
            }}
          />
          <View>
            <Texto variante="tituloTarjeta">{titulo}</Texto>
            {subtitulo ? <Texto variante="sub">{subtitulo}</Texto> : null}
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: tema.espacio.s }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {pie ? <View style={{ gap: tema.espacio.s }}>{pie}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
