// Resumen de Análisis. Mes en curso: el total con imán, cómo viene el reparto (lo que le toca a cada uno,
// lo que puso y si recibe o pone), las transferencias y «Cerrar mes». Mes cerrado: el registro con lo que
// quedó guardado y «Reabrir mes». Debajo, los gastos del mes. Cerrar y Reabrir se confirman en una hoja.
// Si mientras tanto alguien cargó o cambió algo (CIERRE_DESACTUALIZADO), se avisa y se muestra el reparto
// con los datos de ahora. Permisos (sueldos) son F7: hoy cualquiera de la casa cierra y reabre.
import { useState } from 'react';

import { datos } from '@/datos';
import type { GastoConItems } from '@/datos/tipos';
import { formatear } from '@/logica/dinero';
import { mensajeError } from '@/logica/errores';
import { mesActual, nombreMes } from '@/logica/meses';
import { repartoDelMes } from '@/logica/reparto';
import { enMayuscula } from '@/logica/texto';
import type { Categoria, Cierre, Integrante } from '@/logica/tipos';

import estilos from './Resumen.module.css';
import { Confirmar } from './Confirmar';
import { FilaGasto, mapaDeNombres } from './FilaGasto';
import { Registro } from './Registro';
import { motivoSinReparto, Reparto, Transferencias } from './Reparto';
import { Boton } from '../Boton';
import { EstadoVacio } from '../EstadoVacio';
import { Estado } from '../Fila';
import { MensajeError } from '../MensajeError';
import { Monto } from '../Monto';
import { Tarjeta } from '../Tarjeta';

const esDesactualizado = (e: unknown) => String((e as { message?: unknown } | null)?.message ?? '').includes('CIERRE_DESACTUALIZADO');

type Props = {
  mes: string;
  integrantes: Integrante[];
  categorias: Categoria[];
  gastos: GastoConItems[];
  cierre: Cierre | null;
  /** Vuelve a pedir los datos dejando a la vista los de ahora. */
  recargar(): void;
};

type Aviso = { bueno: boolean; texto: string } | null;

export function Resumen({ mes, integrantes, categorias, gastos, cierre, recargar }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [errorHoja, setErrorHoja] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);

  const nombre = nombreMes(mes);
  const soloMes = nombre.split(' ')[0];
  const reparto = repartoDelMes(integrantes, mes, gastos);
  const nombres = { integrantes: mapaDeNombres(integrantes), categorias: mapaDeNombres(categorias) };
  const cuantos = gastos.length === 1 ? '1 gasto' : `${gastos.length} gastos`;
  // Un mes que todavía no llegó no se cierra.
  const sePuedeCerrar = reparto.ok && mes <= mesActual();

  function abrir() {
    setErrorHoja(null);
    setAviso(null);
    setConfirmando(true);
  }

  async function aceptar() {
    setOcupado(true);
    setErrorHoja(null);
    try {
      if (cierre) {
        await datos.reabrirMes(mes);
        setAviso({ bueno: true, texto: `${enMayuscula(nombre)} está abierto otra vez.` });
      } else {
        if (!reparto.ok) {
          // Cambió algo con la hoja abierta (un sueldo, un pagador): no se cierra y se dice por qué.
          setConfirmando(false);
          setAviso({ bueno: false, texto: `No se pudo cerrar ${nombre}. ${motivoSinReparto(reparto, integrantes.length > 0)}` });
          return;
        }
        const { total, filas, transferencias } = reparto;
        await datos.cerrarMes(mes, { total, filas, transferencias }, gastos, integrantes);
        setAviso({ bueno: true, texto: `${enMayuscula(nombre)} quedó cerrado.` });
      }
      setConfirmando(false);
      recargar();
    } catch (e) {
      if (esDesactualizado(e)) {
        // Otro integrante cargó o cambió algo: se cierra la hoja y se muestra el reparto de ahora.
        setConfirmando(false);
        setAviso({ bueno: false, texto: mensajeError(e) });
        recargar();
      } else {
        setErrorHoja(mensajeError(e));
      }
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      {aviso ? (
        aviso.bueno ? (
          <div aria-live="polite">
            <Estado tipo="hay" texto={aviso.texto} />
          </div>
        ) : (
          <MensajeError texto={aviso.texto} />
        )
      ) : null}

      {cierre ? (
        <>
          <Registro cierre={cierre} integrantes={integrantes} />
          <Boton texto="Reabrir mes" icono="candado" variante="borde" onClick={abrir} />
        </>
      ) : (
        <>
          <Tarjeta iman className={estilos.tarjeta} aria-label={`Gastos de ${soloMes}: ${formatear(reparto.total)}. ${cuantos}.`}>
            <p className={estilos.rotulo}>{`Gastos de ${soloMes}`}</p>
            <Monto centavos={reparto.total} />
            <p className={estilos.rotulo}>{cuantos}</p>
          </Tarjeta>
          <Reparto reparto={reparto} integrantes={integrantes} detallado />
          {reparto.ok && reparto.filas.length ? <Transferencias transferencias={reparto.transferencias} filas={reparto.filas} /> : null}
          {sePuedeCerrar ? (
            <div className={estilos.cerrar}>
              <Boton texto="Cerrar mes" icono="candado" onClick={abrir} />
              <p className={estilos.centrado}>{`Guarda el reparto y bloquea los gastos de ${soloMes}.`}</p>
            </div>
          ) : null}
        </>
      )}

      <h2 className={estilos.seccion}>{`Gastos de ${soloMes}`}</h2>
      <Tarjeta className={estilos.lista}>
        {gastos.length ? (
          gastos.map((g, i) => <FilaGasto key={g.id} gasto={g} nombres={nombres} separador={i > 0} cerrado={cierre !== null} />)
        ) : (
          <EstadoVacio icono="nota" titulo="Todavía no hay gastos en este mes." />
        )}
      </Tarjeta>

      <Confirmar
        visible={confirmando}
        titulo={cierre ? `¿Reabrir ${nombre}?` : `¿Cerrar ${nombre}?`}
        texto={
          cierre
            ? 'Se borra el cierre guardado y el reparto se vuelve a calcular con los datos de ahora.'
            : 'Se guarda el reparto y los gastos de ese mes quedan bloqueados.'
        }
        accion={cierre ? 'Reabrir mes' : 'Cerrar mes'}
        ocupado={ocupado}
        error={errorHoja}
        alAceptar={() => void aceptar()}
        alCerrar={() => setConfirmando(false)}
      />
    </>
  );
}
