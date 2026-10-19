// Mensaje de error de un campo o de una acción: se anuncia al aparecer.
import { Alerta } from './Alerta';

export function MensajeError({ texto }: { texto?: string | null }) {
  if (!texto) return null;
  return <Alerta aria-live="polite">{texto}</Alerta>;
}
