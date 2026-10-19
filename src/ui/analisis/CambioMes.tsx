// Cambio de mes de Análisis (maqueta «Elegida»): flecha atrás, el mes con su chip de período y flecha
// adelante. Las flechas son botones de `medida.tactil` con nombre («Mes anterior», «Mes siguiente»).
// El chip: «Cerrado» con candado en `cerrado`; «En curso» (el mes de hoy) o «Sin cerrar» en `texto`,
// con borde del mismo color y sin ícono (DESIGN.md, Estados).
import { nombreMes } from '@/logica/meses';
import { enMayuscula } from '@/logica/texto';

import estilos from './CambioMes.module.css';
import { Icono, type NombreIcono } from '../Icono';

export type Periodo = 'curso' | 'cerrado' | 'abierto';

type Props = { mes: string; periodo: Periodo | null; alAnterior(): void; alSiguiente(): void };

export function CambioMes({ mes, periodo, alAnterior, alSiguiente }: Props) {
  return (
    <div className={estilos.cambio}>
      <Flecha icono="atras" etiqueta="Mes anterior" onClick={alAnterior} />
      <div className={estilos.centro}>
        <h2 className={estilos.mes} aria-live="polite">
          {enMayuscula(nombreMes(mes))}
        </h2>
        {periodo ? <ChipPeriodo periodo={periodo} /> : null}
      </div>
      <Flecha icono="adelante" etiqueta="Mes siguiente" onClick={alSiguiente} />
    </div>
  );
}

function ChipPeriodo({ periodo }: { periodo: Periodo }) {
  const cerrado = periodo === 'cerrado';
  return (
    <span className={[estilos.chip, cerrado ? estilos.cerrado : estilos.abierto].filter(Boolean).join(' ')}>
      {cerrado ? <Icono nombre="candado" tamano={13} /> : null}
      <span className={estilos.chipTexto}>{cerrado ? 'Cerrado' : periodo === 'curso' ? 'En curso' : 'Sin cerrar'}</span>
    </span>
  );
}

function Flecha({ icono, etiqueta, onClick }: { icono: NombreIcono; etiqueta: string; onClick(): void }) {
  return (
    <button type="button" className={estilos.flecha} aria-label={etiqueta} onClick={onClick}>
      <Icono nombre={icono} tamano={20} />
    </button>
  );
}
