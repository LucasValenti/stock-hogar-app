// Campo de texto con su rótulo visible y, debajo, la ayuda o el aviso de error (asociado al campo).
// `grande` es el monto de Cargar: cifras tabulares grandes y centradas. `bloqueado` es de solo lectura.
import { useId, type InputHTMLAttributes } from 'react';

import { Alerta } from './Alerta';
import estilos from './Campo.module.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  etiqueta: string;
  error?: string | null;
  /** Texto de ayuda debajo; el error lo reemplaza. */
  ayuda?: string;
  grande?: boolean;
  bloqueado?: boolean;
};

export function Campo({ etiqueta, error, ayuda, grande = false, bloqueado = false, className, ...resto }: Props) {
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const descrito = error ? idError : ayuda ? idAyuda : undefined;
  return (
    <div className={[estilos.campo, className].filter(Boolean).join(' ')}>
      <label className={estilos.rotulo} htmlFor={id}>
        {etiqueta}
      </label>
      <input
        id={id}
        className={[estilos.entrada, grande && estilos.grande, bloqueado && estilos.bloqueado, error && estilos.conError]
          .filter(Boolean)
          .join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={descrito}
        aria-disabled={bloqueado || undefined}
        readOnly={bloqueado || undefined}
        {...resto}
      />
      {error ? (
        <Alerta id={idError}>{error}</Alerta>
      ) : ayuda ? (
        <p id={idAyuda} className={estilos.ayuda}>
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}
