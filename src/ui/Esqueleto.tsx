// Esqueleto de carga (DESIGN.md, Cargando): píldora o círculo en `borde` que late solo en opacidad,
// entre `opacidad.esqueletoMin` y `esqueletoMax` cada `movimiento.latido`. Con movimiento reducido, quieto.

import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, type DimensionValue } from 'react-native';

import { useTema } from '@/tema/tema';

import { decorativo } from './estilos';
import { useMovimientoReducido } from './movimiento';

type Props = { ancho?: DimensionValue; alto: number; circulo?: boolean; testID?: string };

export function Esqueleto({ ancho = '100%', alto, circulo = false, testID }: Props) {
  const tema = useTema();
  const reducido = useMovimientoReducido();
  const { esqueletoMin, esqueletoMax } = tema.opacidad;
  const opacidad = useRef(new Animated.Value(esqueletoMin)).current;

  useEffect(() => {
    if (reducido) {
      opacidad.setValue(esqueletoMax);
      return;
    }
    const ida = (valor: number) =>
      Animated.timing(opacidad, {
        toValue: valor,
        duration: tema.movimiento.latido,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      });
    const latido = Animated.loop(Animated.sequence([ida(esqueletoMax), ida(esqueletoMin)]));
    latido.start();
    return () => latido.stop();
  }, [reducido, opacidad, esqueletoMin, esqueletoMax, tema.movimiento.latido]);

  return (
    <Animated.View
      {...decorativo}
      testID={testID}
      style={{
        width: circulo ? alto : ancho,
        height: alto,
        borderRadius: tema.radio.chip,
        backgroundColor: tema.color.borde,
        opacity: opacidad,
      }}
    />
  );
}
