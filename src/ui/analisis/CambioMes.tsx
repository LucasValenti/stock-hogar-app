// Cambio de mes de Análisis (maqueta «Elegida»): flecha atrás, el mes con su chip de período y flecha
// adelante. Las flechas son botones de `medida.tactil` con nombre («Mes anterior», «Mes siguiente»).
// El chip: «Cerrado» con candado en `cerrado`; «En curso» (el mes de hoy) o «Sin cerrar» en `texto`,
// con borde del mismo color y sin ícono (DESIGN.md, Estados).

import { Pressable, View } from 'react-native';

import { nombreMes } from '@/logica/meses';
import { enMayuscula } from '@/logica/texto';
import { useTema } from '@/tema/tema';

import { anilloDeFoco, useFoco } from '../estilos';
import { Icono, type NombreIcono } from '../Icono';
import { Texto } from '../Texto';

export type Periodo = 'curso' | 'cerrado' | 'abierto';

type Props = { mes: string; periodo: Periodo | null; alAnterior(): void; alSiguiente(): void };

export function CambioMes({ mes, periodo, alAnterior, alSiguiente }: Props) {
  const tema = useTema();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tema.espacio.s }}>
      <Flecha icono="atras" etiqueta="Mes anterior" onPress={alAnterior} />
      <View style={{ flex: 1, alignItems: 'center', gap: tema.espacio.xs }}>
        <Texto variante="tituloTarjeta" centrado aria-level={2} accessibilityLiveRegion="polite">
          {enMayuscula(nombreMes(mes))}
        </Texto>
        {periodo ? <ChipPeriodo periodo={periodo} /> : null}
      </View>
      <Flecha icono="adelante" etiqueta="Mes siguiente" onPress={alSiguiente} />
    </View>
  );
}

function ChipPeriodo({ periodo }: { periodo: Periodo }) {
  const tema = useTema();
  const cerrado = periodo === 'cerrado';
  const color = cerrado ? 'cerrado' : 'texto';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: tema.espacio.xs,
        paddingHorizontal: tema.espacio.s,
        borderRadius: tema.radio.chip,
        borderWidth: tema.medida.borde,
        borderColor: tema.color[color],
      }}
    >
      {cerrado ? <Icono nombre="candado" tamano={tema.tamano.s} color={tema.color.cerrado} /> : null}
      <Texto variante="rotulo" color={color}>
        {cerrado ? 'Cerrado' : periodo === 'curso' ? 'En curso' : 'Sin cerrar'}
      </Texto>
    </View>
  );
}

function Flecha({ icono, etiqueta, onPress }: { icono: NombreIcono; etiqueta: string; onPress(): void }) {
  const tema = useTema();
  const { conFoco, alFoco } = useFoco();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      onPress={onPress}
      {...alFoco}
      style={({ pressed }) => [
        {
          width: tema.medida.tactil,
          height: tema.medida.tactil,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: tema.radio.chip,
          borderWidth: tema.medida.borde,
          borderColor: pressed ? tema.color.texto : tema.color.borde,
          backgroundColor: tema.color.superficie,
        },
        conFoco && anilloDeFoco(tema),
      ]}
    >
      <Icono nombre={icono} tamano={tema.medida.icono} color={tema.color.texto} />
    </Pressable>
  );
}
