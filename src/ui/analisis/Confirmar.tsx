// Confirmación propia (sin alert ni confirm del sistema): una hoja con la pregunta, qué pasa si se
// acepta, la acción llena y «Cancelar». Mientras se envía, la acción queda ocupada; un error se ve en la hoja.

import { Boton } from '../Boton';
import { MensajeError } from '../FormularioProducto';
import { Hoja } from '../Hoja';

type Props = {
  visible: boolean;
  titulo: string;
  texto: string;
  accion: string;
  ocupado: boolean;
  error: string | null;
  alAceptar(): void;
  alCerrar(): void;
};

export function Confirmar({ visible, titulo, texto, accion, ocupado, error, alAceptar, alCerrar }: Props) {
  return (
    <Hoja
      visible={visible}
      titulo={titulo}
      subtitulo={texto}
      alCerrar={alCerrar}
      pie={
        <>
          <MensajeError texto={error} />
          <Boton texto={accion} icono="candado" ocupado={ocupado} onPress={alAceptar} />
          <Boton texto="Cancelar" variante="borde" onPress={alCerrar} />
        </>
      }
    />
  );
}
