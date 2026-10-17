// Piezas mínimas para las pantallas de ingreso y de estado de la sesión, hechas solo con tokens.
// Provisorias: la Tarea 5 arma los componentes de la app y estas pantallas pasan a usarlos.

import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FAMILIAS } from '@/tema/fuentes';
import { useTema, type Tema } from '@/tema/tema';

/** Anillo de foco del teclado (en la web; en el teléfono lo ignora). */
function anilloDeFoco(tema: Tema) {
  return {
    outlineStyle: 'solid',
    outlineColor: tema.color.foco,
    outlineWidth: tema.medida.focoGrosor,
    outlineOffset: tema.medida.focoSeparacion,
  } as const;
}

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
          <View
            style={{
              backgroundColor: tema.color.superficie,
              borderColor: tema.color.borde,
              borderWidth: tema.medida.borde,
              borderRadius: tema.radio.tarjeta,
              padding: tema.espacio.xl,
              gap: tema.espacio.l,
            }}
          >
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Titulo({ children }: { children: ReactNode }) {
  const tema = useTema();
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: tema.color.texto,
        fontFamily: FAMILIAS.titulo,
        fontSize: tema.tamano.xl,
        lineHeight: tema.tamano.xl * tema.letra.interlineadoTitulo,
      }}
    >
      {children}
    </Text>
  );
}

export function Texto({ children, alerta = false }: { children: ReactNode; alerta?: boolean }) {
  const tema = useTema();
  return (
    <Text
      accessibilityRole={alerta ? 'alert' : undefined}
      accessibilityLiveRegion={alerta ? 'polite' : undefined}
      style={{
        color: alerta ? tema.color.falta : tema.color.texto,
        fontFamily: alerta ? FAMILIAS.medio : FAMILIAS.texto,
        fontSize: alerta ? tema.tamano.s : tema.tamano.m,
        lineHeight: (alerta ? tema.tamano.s : tema.tamano.m) * tema.letra.interlineadoTexto,
      }}
    >
      {children}
    </Text>
  );
}

type PropsBoton = {
  texto: string;
  onPress: () => void;
  /** `lleno` es la acción de la pantalla (uno por pantalla); `secundario` es la otra. */
  variante?: 'lleno' | 'secundario';
  /** Mientras algo se envía: no se puede tocar de nuevo y se ve que está trabajando. */
  ocupado?: boolean;
};

export function Boton({ texto, onPress, variante = 'lleno', ocupado = false }: PropsBoton) {
  const tema = useTema();
  const [conFoco, setConFoco] = useState(false);
  const lleno = variante === 'lleno';
  const colorTexto = lleno ? tema.color.sobreAcento : tema.color.texto;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={texto}
      accessibilityState={{ disabled: ocupado, busy: ocupado }}
      disabled={ocupado}
      onPress={onPress}
      onFocus={() => setConFoco(true)}
      onBlur={() => setConFoco(false)}
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
          // Al apretarlo el borde se oscurece: se nota sin cambiar tamaños ni usar valores sueltos.
          borderColor: pressed ? tema.color.texto : lleno ? tema.color.acento : tema.color.borde,
          backgroundColor: lleno ? tema.color.acento : tema.color.superficie,
        },
        conFoco && anilloDeFoco(tema),
      ]}
    >
      {ocupado && <ActivityIndicator color={colorTexto} />}
      <Text
        style={{
          color: colorTexto,
          fontFamily: FAMILIAS.fuerte,
          fontSize: tema.tamano.m,
          lineHeight: tema.tamano.m * tema.letra.interlineadoTexto,
          textAlign: 'center',
        }}
      >
        {texto}
      </Text>
    </Pressable>
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
      <Text
        style={{
          color: tema.color.textoSuave,
          fontFamily: FAMILIAS.fuerte,
          fontSize: tema.tamano.xs,
          lineHeight: tema.tamano.xs * tema.letra.interlineadoTexto,
        }}
      >
        {etiqueta}
      </Text>
      <TextInput
        accessibilityLabel={etiqueta}
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
      {error ? <Texto alerta>{error}</Texto> : null}
    </View>
  );
}
