// Campo de texto con su rótulo visible y, si hay, el aviso de error debajo (asociado al campo).
import { useId, type InputHTMLAttributes } from 'react';

import { Alerta } from './Alerta';
import estilos from './Campo.module.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  etiqueta: string;
  error?: string | null;
};

export function Campo({ etiqueta, error, className, ...resto }: Props) {
  const id = useId();
  const idError = `${id}-error`;
  return (
    <div className={[estilos.campo, className].filter(Boolean).join(' ')}>
      <label className={estilos.rotulo} htmlFor={id}>
        {etiqueta}
      </label>
      <input
        id={id}
        className={[estilos.entrada, error && estilos.conError].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        {...resto}
      />
      {error ? <Alerta id={idError}>{error}</Alerta> : null}
    </div>
  );
}
