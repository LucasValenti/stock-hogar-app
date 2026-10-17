// Análisis: cambio de mes y pestañas Resumen · Categorías · Evolución · Detalle (maqueta «Elegida»).
// Se pide de una vez lo de los últimos 6 meses (Evolución) y de ahí sale el mes elegido; Detalle pide sus
// propias fechas. Todo se actualiza en vivo. `?mes=AAAA-MM` y `?vista=detalle` abren ese mes y esa
// pestaña (el «Ver todos los gastos» de Inicio). Evolución es solo el gasto por mes: sin precio por producto.

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { datos } from '@/datos';
import { esCorte } from '@/datos/cola';
import type { GastoConItems } from '@/datos/tipos';
import { porCategoria, totalesPorMes } from '@/logica/analisis';
import { formatearPorcentaje } from '@/logica/dinero';
import { mensajeError } from '@/logica/errores';
import { mesActual, mesAnterior, mesDe, mesSiguiente, nombreMes, rangoMes } from '@/logica/meses';
import { enMayuscula } from '@/logica/texto';
import type { Categoria, Cierre, Integrante } from '@/logica/tipos';
import { useTema } from '@/tema/tema';
import { Barras } from '@/ui/analisis/Barras';
import { CambioMes, type Periodo } from '@/ui/analisis/CambioMes';
import { Detalle, filtrosDelMes, type FiltrosDetalle } from '@/ui/analisis/Detalle';
import { Resumen } from '@/ui/analisis/Resumen';
import { Aviso } from '@/ui/Aviso';
import { Esqueleto } from '@/ui/Esqueleto';
import { EstadoVacio } from '@/ui/EstadoVacio';
import { Pantalla } from '@/ui/Pantalla';
import { PestanasInternas } from '@/ui/PestanasInternas';
import { Tarjeta } from '@/ui/Tarjeta';
import { Texto } from '@/ui/Texto';
import { useEnVivo } from '@/ui/useEnVivo';

type Vista = 'resumen' | 'categorias' | 'evolucion' | 'detalle';
const VISTAS: Vista[] = ['resumen', 'categorias', 'evolucion', 'detalle'];
const vistaDe = (v: unknown): Vista => VISTAS.find((x) => x === v) ?? 'resumen';
const mesDeRuta = (m: unknown): string => (typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : mesActual());

const MESES_EVOLUCION = 6;

type DelPeriodo = {
  integrantes: Integrante[];
  categorias: Categoria[];
  gastos: GastoConItems[];
  cierre: Cierre | null;
  /** Todos los meses cerrados: Detalle puede abarcar varios. */
  cerrados: Set<string>;
};

function pedirPeriodo(mes: string): Promise<DelPeriodo> {
  const desde = rangoMes(totalesPorMes([], mes, MESES_EVOLUCION)[0].mes).desde;
  return Promise.all([
    datos.integrantes(),
    datos.categorias(),
    datos.gastosEntre(desde, rangoMes(mes).hastaExcl),
    datos.cierre(mes),
    datos.mesesCerrados(),
  ]).then(([integrantes, categorias, gastos, cierre, cerrados]) => ({ integrantes, categorias, gastos, cierre, cerrados }));
}

export default function Analisis() {
  const { vista: vistaPedida, mes: mesPedido } = useLocalSearchParams<{ vista?: string; mes?: string }>();
  const [vista, setVista] = useState<Vista>(vistaDe(vistaPedida));
  const [mes, setMes] = useState(mesDeRuta(mesPedido));
  // Los filtros de Detalle viven acá para que no se pierdan al cambiar de pestaña; otro mes empieza limpio.
  const [filtros, setFiltros] = useState<FiltrosDetalle>(() => filtrosDelMes(mesDeRuta(mesPedido)));
  const filtrosVigentes = filtros.mes === mes ? filtros : filtrosDelMes(mes);

  // Un enlace (Inicio) puede pedir otra pestaña u otro mes con la pantalla ya abierta.
  useEffect(() => setVista(vistaDe(vistaPedida)), [vistaPedida]);
  useEffect(() => setMes(mesDeRuta(mesPedido)), [mesPedido]);

  const { carga, reintentar, recargar } = useEnVivo(() => pedirPeriodo(mes), mes);

  function elegirVista(v: Vista) {
    setVista(v);
    router.setParams({ vista: v });
  }
  function irA(otro: string) {
    setMes(otro);
    router.setParams({ mes: otro });
  }

  const listo = carga.estado === 'listo' ? carga.valor : null;
  const periodo: Periodo | null = listo ? (listo.cierre ? 'cerrado' : mes === mesActual() ? 'curso' : 'abierto') : null;
  const delMes = listo ? listo.gastos.filter((g) => mesDe(g.fecha) === mes) : [];

  return (
    <Pantalla titulo="Análisis" ocupado={carga.estado === 'cargando'}>
      <CambioMes mes={mes} periodo={periodo} alAnterior={() => irA(mesAnterior(mes))} alSiguiente={() => irA(mesSiguiente(mes))} />
      <PestanasInternas
        etiqueta="Qué mostrar"
        opciones={[
          { clave: 'resumen', texto: 'Resumen' },
          { clave: 'categorias', texto: 'Categorías' },
          { clave: 'evolucion', texto: 'Evolución' },
          { clave: 'detalle', texto: 'Detalle' },
        ]}
        activa={vista}
        alCambiar={elegirVista}
      />
      {carga.estado === 'cargando' ? (
        <Cargando />
      ) : carga.estado === 'error' ? (
        <Aviso
          alerta
          icono="nube"
          titulo="No pudimos traer los datos"
          texto={esCorte(carga.error) ? 'Revisá el wifi o los datos del celu y probá de nuevo.' : mensajeError(carga.error)}
          accion={{ texto: 'Reintentar', onPress: reintentar }}
        />
      ) : vista === 'resumen' ? (
        <Resumen
          key={mes}
          mes={mes}
          integrantes={carga.valor.integrantes}
          categorias={carga.valor.categorias}
          gastos={delMes}
          cierre={carga.valor.cierre}
          recargar={recargar}
        />
      ) : vista === 'categorias' ? (
        <Categorias gastos={delMes} categorias={carga.valor.categorias} />
      ) : vista === 'evolucion' ? (
        <Evolucion gastos={carga.valor.gastos} mes={mes} />
      ) : (
        <Detalle
          key={mes}
          filtros={filtrosVigentes}
          alCambiarFiltros={(cambio) => setFiltros((f) => ({ ...(f.mes === mes ? f : filtrosDelMes(mes)), ...cambio }))}
          integrantes={carga.valor.integrantes}
          categorias={carga.valor.categorias}
          cerrados={carga.valor.cerrados}
        />
      )}
    </Pantalla>
  );
}

function Categorias({ gastos, categorias }: { gastos: GastoConItems[]; categorias: Categoria[] }) {
  const filas = porCategoria(gastos, categorias);
  if (!filas.length) return <SinGastos titulo="Gasto por categoría" texto="Todavía no hay gastos en este mes." />;
  return (
    <Barras
      titulo="Gasto por categoría"
      filas={filas.map((f) => ({ clave: f.id ?? 'sin', rotulo: f.nombre, centavos: f.monto, detalle: formatearPorcentaje(f.parte) }))}
      total={{ rotulo: 'Total', centavos: filas.reduce((s, f) => s + f.monto, 0) }}
    />
  );
}

function Evolucion({ gastos, mes }: { gastos: GastoConItems[]; mes: string }) {
  const serie = totalesPorMes(gastos, mes, MESES_EVOLUCION);
  if (!serie.some((x) => x.total > 0)) return <SinGastos titulo="Gasto por mes" texto={`No hay gastos en estos ${MESES_EVOLUCION} meses.`} />;
  return <Barras titulo="Gasto por mes" filas={serie.map((x) => ({ clave: x.mes, rotulo: enMayuscula(nombreMes(x.mes)), centavos: x.total }))} />;
}

function SinGastos({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Tarjeta>
      <Texto variante="tituloTarjeta" aria-level={2}>
        {titulo}
      </Texto>
      <EstadoVacio icono="graf" titulo={texto} />
    </Tarjeta>
  );
}

function Cargando() {
  const tema = useTema();
  return (
    <>
      <Esqueleto alto={tema.medida.fila * 2} />
      <Esqueleto alto={tema.medida.fila * 3} />
      <Texto variante="sub" centrado accessibilityLiveRegion="polite">
        Trayendo los gastos de la casa…
      </Texto>
    </>
  );
}
