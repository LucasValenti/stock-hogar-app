// Aviso de vacío o de error (DESIGN.md, Vacío, cargando y sin conexión): tarjeta con imán, centrada,
// marca circular con su ícono, título, texto y, si hay, una acción llena a todo el ancho.

import { View } from 'react-native';

import { useTema } from '@/tema/tema';

import { Boton } from './Boton';
import { decorativo } from './estilos';
import { Icono, type NombreIcono } from './Icono';
import { Tarjeta } from './Tarjeta';
import { Texto } from './Texto';

type Props = {
  icono: NombreIcono;
  titulo: string;
  texto: string;
  accion?: { texto: string; onPress(): void; icono?: NombreIcono };
  /** Vacío que es buena noticia («No falta nada»): la marca va en `hay`. */
  bueno?: boolean;
  /** Error: el lector de pantalla lo anuncia al aparecer. */
  alerta?: boolean;
};

export function Aviso({ icono, titulo, texto, accion, bueno = false, alerta = false }: Props) {
  const tema = useTema();
  const colorMarca = bueno ? tema.color.hay : tema.color.textoSuave;
  return (
    <Tarjeta iman style={{ alignItems: 'center' }} accessibilityLiveRegion={alerta ? 'polite' : undefined}>
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
        <Icono nombre={icono} tamano={tema.medida.icono} color={colorMarca} />
      </View>
      <Texto variante="tituloTarjeta" centrado>
        {titulo}
      </Texto>
      <Texto variante="sub" centrado accessibilityRole={alerta ? 'alert' : undefined}>
        {texto}
      </Texto>
      {accion ? (
        <View style={{ alignSelf: 'stretch' }}>
          <Boton texto={accion.texto} onPress={accion.onPress} icono={accion.icono} />
        </View>
      ) : null}
    </Tarjeta>
  );
}
