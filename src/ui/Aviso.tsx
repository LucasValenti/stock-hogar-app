// Aviso de vacío o de error (DESIGN.md, Vacío, cargando y sin conexión): tarjeta con imán, centrada,
// marca circular con su ícono, título, texto y, si hay, una acción llena a todo el ancho.
import estilos from './Aviso.module.css';
import { Boton } from './Boton';
import { Icono, type NombreIcono } from './Icono';
import { Tarjeta } from './Tarjeta';

type Props = {
  icono: NombreIcono;
  titulo: string;
  texto: string;
  accion?: { texto: string; onClick(): void; icono?: NombreIcono };
  /** Vacío que es buena noticia («No falta nada»): la marca va en `hay`. */
  bueno?: boolean;
  /** Error: el lector de pantalla lo anuncia al aparecer. */
  alerta?: boolean;
};

export function Aviso({ icono, titulo, texto, accion, bueno = false, alerta = false }: Props) {
  return (
    <Tarjeta iman className={estilos.tarjeta} role={alerta ? 'alert' : undefined}>
      <span className={[estilos.marca, bueno && estilos.bueno].filter(Boolean).join(' ')} aria-hidden="true">
        <Icono nombre={icono} tamano={20} />
      </span>
      <h2 className={estilos.titulo}>{titulo}</h2>
      <p className={estilos.texto}>{texto}</p>
      {accion ? (
        <div className={estilos.accion}>
          <Boton texto={accion.texto} onClick={accion.onClick} icono={accion.icono} />
        </div>
      ) : null}
    </Tarjeta>
  );
}
