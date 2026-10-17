// Si la persona pidió reducir el movimiento: en el teléfono, la opción de accesibilidad del sistema;
// en la web, `prefers-reduced-motion` (react-native-web lo lee con matchMedia).

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useMovimientoReducido(): boolean {
  const [reducido, setReducido] = useState(false);
  useEffect(() => {
    let vigente = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (vigente) setReducido(v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducido);
    return () => {
      vigente = false;
      sub.remove();
    };
  }, []);
  return reducido;
}
