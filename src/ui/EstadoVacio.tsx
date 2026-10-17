// Vacío dentro de una lista o de una hoja, donde no va una tarjeta con imán (para eso está Aviso):
// la marca circular con su ícono, el título y una línea, centrados y sin acción.

import { View } from 'react-native';

import { useTema } from '@/tema/tema';

import { decorativo } from './estilos';
import { Icono, type NombreIcono } from './Icono';
import { Texto } from './Texto';

type Props = { icono: NombreIcono; titulo: string; texto?: string; bueno?: boolean };

export function EstadoVacio({ icono, titulo, texto, bueno = false }: Props) {
  const tema = useTema();
  return (
    <View style={{ alignItems: 'center', gap: tema.espacio.s, paddingVertical: tema.espacio.l }}>
      <View
        {...decorativo}
        style={{
          width: tema.medida.tactil,
          height: tema.medida.tactil,
          borderRadius: tema.radio.chip,
          borderWidth: tema.medida.bordeFuerte,
          borderColor: bueno ? tema.color.hay : tema.color.borde,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icono nombre={icono} tamano={tema.medida.icono} color={bueno ? tema.color.hay : tema.color.textoSuave} />
      </View>
      <Texto variante="fuerte" centrado accessibilityRole="header">
        {titulo}
      </Texto>
      {texto ? (
        <Texto variante="sub" centrado>
          {texto}
        </Texto>
      ) : null}
    </View>
  );
}
