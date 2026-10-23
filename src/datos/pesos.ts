// Con qué pesos se reparte el mes. Quien puede ver sueldos reparte con los sueldos reales (los mismos con
// que después cierra); el resto, con las partes del mes (partes_del_mes), que no muestran sueldos.
// Sin el permiso nunca se piden los sueldos.

import { datos } from '@/datos';

/** Id → peso. `verSueldos` sale de `capacidades(acceso)`. */
export function pesosDelMes(mes: string, verSueldos: boolean): Promise<Record<string, number | null>> {
  return verSueldos ? datos.sueldos() : datos.partesDelMes(mes);
}
