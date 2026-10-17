// Pantalla de la app: fondo enlozado, margen lateral `espacio.l`, tarjetas separadas `espacio.m`.
// Se desplaza cuando no entra (letra grande); arriba respeta la zona segura y abajo la barra de pestañas.

import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTema } from '@/tema/tema';

import { Texto } from './Texto';

type Props = {
  children: ReactNode;
  /** Título de la pantalla («Octubre», «Stock»). */
  titulo?: string;
  /** Línea chica sobre el título («Hola, Ana»). */
  saludo?: string;
  /** Mientras carga: el contenido queda marcado como ocupado para el lector de pantalla. */
  ocupado?: boolean;
};

export function Pantalla({ children, titulo, saludo, ocupado = false }: Props) {
  const tema = useTema();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: tema.color.fondo }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          padding: tema.espacio.l,
          gap: tema.espacio.m,
        }}
      >
        {titulo ? (
          <View style={{ minHeight: tema.medida.tactil, justifyContent: 'center' }}>
            {saludo ? <Texto variante="sub">{saludo}</Texto> : null}
            <Texto variante="titulo" aria-level={1}>
              {titulo}
            </Texto>
          </View>
        ) : null}
        <View aria-busy={ocupado} accessibilityState={{ busy: ocupado }} style={{ gap: tema.espacio.m }}>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
