// Un valor que se actualiza cuando deja de cambiar por `ms` (el conteo de Detalle se anuncia cuando se
// deja de tipear, no con cada letra). Mientras sea null (todavía no hay datos), el primero que llega va ya.
import { useEffect, useState } from 'react';

export function useDemorado<T>(valor: T | null, ms: number): T | null {
  const [demorado, setDemorado] = useState(valor);
  // Ajuste durante el render (patrón de React): sin esperar un efecto ni dibujar el vacío primero.
  // Si el valor vuelve a null (no hay datos), se va ya: el próximo que llegue también va sin esperar.
  if ((demorado === null) !== (valor === null)) setDemorado(valor);
  useEffect(() => {
    const reloj = setTimeout(() => setDemorado(valor), ms);
    return () => clearTimeout(reloj);
  }, [valor, ms]);
  return valor === null ? null : (demorado ?? valor);
}
