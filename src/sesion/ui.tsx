// Piezas propias de las pantallas de ingreso y de estado de la sesión: la página con su papelito,
// el campo y el aviso de error. Texto, títulos y botones son los de la app (src/ui).

import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FAMILIAS } from '@/tema/fuentes';
import { useTema } from '@/tema/tema';
import { anilloDeFoco } from '@/ui/estilos';
import { Tarjeta } from '@/ui/Tarjeta';
import { Texto } from '@/ui/Texto';

/** Pantalla entera sobre el fondo, con un papelito al medio. Sube con el teclado y se desplaza si no entra. */
export function Pagina({ children }: { children: ReactNode }) {
  const tema = useTema();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: tema.espacio.l }}
        >
          <Tarjeta style={{ padding: tema.espacio.xl, gap: tema.espacio.l }}>{children}</Tarjeta>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Un error que el lector de pantalla anuncia al aparecer. */
export function Alerta({ children }: { children: ReactNode }) {
  return (
    <Texto variante="subMedio" color="falta" accessibilityRole="alert" accessibilityLiveRegion="polite">
      {children}
    </Texto>
  );
}

type PropsCampo = Omit<TextInputProps, 'style' | 'accessibilityLabel'> & {
  etiqueta: string;
  error?: string | null;
};

/** Campo de texto con su rótulo visible y, si hay, el aviso de error debajo. */
export function Campo({ etiqueta, error, onFocus, onBlur, ...resto }: PropsCampo) {
  const tema = useTema();
  const [conFoco, setConFoco] = useState(false);
  return (
    <View style={{ gap: tema.espacio.xs }}>
      <Texto variante="rotulo">{etiqueta}</Texto>
      <TextInput
        accessibilityLabel={etiqueta}
        allowFontScaling
        placeholderTextColor={tema.color.textoSuave}
        // Al apretar «enter» el campo conserva el foco: si hay un error, se corrige ahí mismo.
        // `submitBehavior` lo lee el teléfono y `blurOnSubmit` la web.
        submitBehavior="submit"
        blurOnSubmit={false}
        onFocus={(e) => {
          setConFoco(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setConFoco(false);
          onBlur?.(e);
        }}
        style={[
          {
            minHeight: tema.medida.tactil,
            paddingHorizontal: tema.espacio.l,
            borderRadius: tema.radio.boton,
            borderWidth: error ? tema.medida.bordeFuerte : tema.medida.borde,
            borderColor: error ? tema.color.falta : tema.color.borde,
            backgroundColor: tema.color.superficie,
            color: tema.color.texto,
            fontFamily: FAMILIAS.texto,
            fontSize: tema.tamano.m,
          },
          conFoco && anilloDeFoco(tema),
        ]}
        {...resto}
      />
      {error ? <Alerta>{error}</Alerta> : null}
    </View>
  );
}
