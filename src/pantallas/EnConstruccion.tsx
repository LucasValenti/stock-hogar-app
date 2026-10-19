// [PLACEHOLDER W2] Lugar de las pantallas que se portan en la fase W2 del plan de la web React.
// Ajustes trae ya «Cerrar sesión» / «Salir de la demo» para poder probar el armazón.
import { useSesion } from '@/sesion/sesion';
import { Boton } from '@/ui/Boton';
import { Tarjeta } from '@/ui/Tarjeta';

import estilos from './App.module.css';
import { CerrarSesion } from './Sesion';

export function EnConstruccion({ titulo, conSalida = false }: { titulo: string; conSalida?: boolean }) {
  const { demo, salir } = useSesion();
  return (
    <>
      <h1 className={estilos.titulo}>{titulo}</h1>
      {demo ? (
        <Tarjeta className={estilos.aviso}>
          <p>Estás en la demo: los datos son inventados.</p>
        </Tarjeta>
      ) : null}
      <Tarjeta iman>
        <p>[Pantalla en construcción: llega en la fase W2.]</p>
      </Tarjeta>
      {conSalida ? (
        demo ? <Boton texto="Salir de la demo" variante="borde" onClick={() => void salir()} /> : <CerrarSesion variante="borde" />
      ) : null}
    </>
  );
}
