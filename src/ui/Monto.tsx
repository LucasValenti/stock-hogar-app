// Monto en pesos: Rubik con cifras tabulares, siempre escrito entero.
// El total va en un renglón y se achica hasta entrar: en el teléfono con adjustsFontSizeToFit; en la web,
// que no lo tiene, se calcula el tamaño con el ancho disponible.

import { useState } from 'react';
import { Platform, Text, View, type TextProps } from 'react-native';

import { formatear } from '@/logica/dinero';
import { FAMILIAS } from '@/tema/fuentes';
import { useTema, type NombreColor } from '@/tema/tema';

type TamanoMonto = 'total' | 'fila' | 'sub';

type Props = Omit<TextProps, 'children'> & {
  centavos: number;
  tamano?: TamanoMonto;
  /** Saldo: «+» o «−» (U+2212) delante del monto. */
  signo?: boolean;
  color?: NombreColor;
};

// Ancho de una cifra tabular de Rubik en `em`, con margen: solo para estimar el total en la web.
const ANCHO_CIFRA_EM = 0.62;

export function textoMonto(centavos: number, signo = false): string {
  if (!signo || centavos === 0) return formatear(centavos);
  return `${centavos > 0 ? '+' : '−'} ${formatear(Math.abs(centavos))}`;
}

export function Monto({ centavos, tamano = 'total', signo = false, color = 'texto', style, ...resto }: Props) {
  const tema = useTema();
  const [ancho, setAncho] = useState<number | null>(null);
  const texto = textoMonto(centavos, signo);
  const total = tamano === 'total';
  const base = total ? tema.tamano.xxxl : tamano === 'fila' ? tema.tamano.m : tema.tamano.s;
  const familia = tamano === 'sub' ? FAMILIAS.medio : FAMILIAS.numeros;
  const interlineado = total ? tema.letra.interlineadoTotal : tema.letra.interlineadoTexto;
  const enWeb = Platform.OS === 'web';
  const fontSize = total && enWeb && ancho ? Math.min(base, ancho / (texto.length * ANCHO_CIFRA_EM)) : base;

  const elemento = (
    <Text
      allowFontScaling
      numberOfLines={total ? 1 : undefined}
      adjustsFontSizeToFit={total || undefined}
      style={[
        {
          fontFamily: familia,
          fontSize,
          lineHeight: fontSize * interlineado,
          fontVariant: ['tabular-nums'],
          color: tema.color[color],
        },
        style,
      ]}
      {...resto}
    >
      {texto}
    </Text>
  );
  if (!total || !enWeb) return elemento;
  return <View onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>{elemento}</View>;
}
