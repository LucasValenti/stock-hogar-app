// Texto de la app con los roles de DESIGN.md (Tipografía): familia, tamaño e interlineado de los tokens.
// Siempre crece con la letra del sistema (allowFontScaling) y nunca lleva alto fijo.

import { Text, type TextProps } from 'react-native';

import { FAMILIAS } from '@/tema/fuentes';
import { useTema, type NombreColor, type Tema } from '@/tema/tema';

export type VarianteTexto = 'titulo' | 'tituloTarjeta' | 'texto' | 'fuerte' | 'sub' | 'subMedio' | 'seccion' | 'rotulo';

function estiloDe(tema: Tema, variante: VarianteTexto) {
  const { tamano, letra } = tema;
  const de = (familia: string, t: number, interlineado: number) => ({
    fontFamily: familia,
    fontSize: t,
    lineHeight: t * interlineado,
  });
  switch (variante) {
    case 'titulo':
      return de(FAMILIAS.titulo, tamano.xxl, letra.interlineadoTitulo);
    case 'tituloTarjeta':
      return de(FAMILIAS.titulo, tamano.xl, letra.interlineadoTitulo);
    case 'texto':
      return de(FAMILIAS.texto, tamano.m, letra.interlineadoTexto);
    case 'fuerte':
      return de(FAMILIAS.fuerte, tamano.m, letra.interlineadoTexto);
    case 'sub':
      return de(FAMILIAS.texto, tamano.s, letra.interlineadoTexto);
    case 'subMedio':
      return de(FAMILIAS.medio, tamano.s, letra.interlineadoTexto);
    case 'seccion':
      return de(FAMILIAS.fuerte, tamano.s, letra.interlineadoTexto);
    case 'rotulo':
      return de(FAMILIAS.fuerte, tamano.xs, letra.interlineadoTexto);
  }
}

const COLOR_POR_DEFECTO: Record<VarianteTexto, NombreColor> = {
  titulo: 'texto',
  tituloTarjeta: 'texto',
  texto: 'texto',
  fuerte: 'texto',
  sub: 'textoSuave',
  subMedio: 'textoSuave',
  seccion: 'textoSuave',
  rotulo: 'textoSuave',
};

type Props = TextProps & {
  variante?: VarianteTexto;
  color?: NombreColor;
  centrado?: boolean;
};

export function Texto({ variante = 'texto', color, centrado = false, style, accessibilityRole, ...resto }: Props) {
  const tema = useTema();
  const esTitulo = variante === 'titulo' || variante === 'tituloTarjeta';
  return (
    <Text
      allowFontScaling
      accessibilityRole={accessibilityRole ?? (esTitulo ? 'header' : undefined)}
      style={[
        estiloDe(tema, variante),
        { color: tema.color[color ?? COLOR_POR_DEFECTO[variante]] },
        centrado && { textAlign: 'center' },
        style,
      ]}
      {...resto}
    />
  );
}
