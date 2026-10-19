// Vacío dentro de una lista o de una hoja, donde no va una tarjeta con imán (para eso está Aviso):
// la marca circular con su ícono, el título y una línea, centrados y sin acción.
import estilos from './EstadoVacio.module.css';
import { Icono, type NombreIcono } from './Icono';

type Props = { icono: NombreIcono; titulo: string; texto?: string; bueno?: boolean };

export function EstadoVacio({ icono, titulo, texto, bueno = false }: Props) {
  return (
    <div className={estilos.estado}>
      <span className={[estilos.marca, bueno && estilos.bueno].filter(Boolean).join(' ')} aria-hidden="true">
        <Icono nombre={icono} tamano={20} />
      </span>
      <h2 className={estilos.titulo}>{titulo}</h2>
      {texto ? <p className={estilos.texto}>{texto}</p> : null}
    </div>
  );
}
