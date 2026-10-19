// Detalle de Análisis: buscar (nota o producto), quién pagó, categoría y fechas Desde / Hasta (del mes
// elegido al abrir; vacías = sin límite). Las fechas piden a la base; el resto filtra lo traído con
// filtrarGastos. La lista va de a PAGINA con «Ver N más», y al pie el total de lo filtrado (con
// categoría, solo esa parte, como en Categorías). Cada gasto abre Cargar. Se actualiza en vivo.
// Los filtros los guarda Análisis por mes: se conservan al ir a otra pestaña y volver (como la web vieja).
// El conteo se anuncia cuando se deja de tipear (ESPERA_CONTEO_MS) en una región que no se desmonta.
import { useEffect, useState } from 'react';

import { datos } from '@/datos';
import { filtrarGastos, totalDe } from '@/logica/analisis';
import { mensajeError } from '@/logica/errores';
import { diaSiguiente, fechaDesdeTexto, fechaLarga, mesDe, ultimoDia } from '@/logica/meses';
import type { Categoria, Integrante } from '@/logica/tipos';

import estilos from './Detalle.module.css';
import { FilaTotal } from './Barras';
import { FilaGasto, mapaDeNombres } from './FilaGasto';
import { Aviso } from '../Aviso';
import { Boton } from '../Boton';
import { Campo } from '../Campo';
import { Chip } from '../Chip';
import { Esqueleto } from '../Esqueleto';
import { EstadoVacio } from '../EstadoVacio';
import { Hoja } from '../Hoja';
import { Tarjeta } from '../Tarjeta';
import { useDemorado } from '../useDemorado';
import { useEnVivo } from '../useEnVivo';

export const PAGINA = 20;
export const ESPERA_CONTEO_MS = 600;
const MAL_ESCRITA = 'Escribí la fecha como dd/mm/aaaa.';
const SIN_GASTOS = 'No hay gastos con esos filtros.';

/** Lo que se eligió en Detalle para un mes; las fechas como se escribieron (dd/mm/aaaa). */
export type FiltrosDetalle = { mes: string; texto: string; persona: string; categoria: string; desde: string; hasta: string };

/** Al abrir un mes: sin filtros y del primero al último día. */
export const filtrosDelMes = (mes: string): FiltrosDetalle => ({
  mes,
  texto: '',
  persona: '',
  categoria: '',
  desde: fechaLarga(`${mes}-01`),
  hasta: fechaLarga(ultimoDia(mes)),
});

type Props = {
  filtros: FiltrosDetalle;
  alCambiarFiltros(cambio: Partial<Omit<FiltrosDetalle, 'mes'>>): void;
  integrantes: Integrante[];
  categorias: Categoria[];
  cerrados: Set<string>;
};

/** Texto de fecha → 'AAAA-MM-DD', null si quedó vacía (sin límite) o 'mal' si no se entiende. */
function leerFecha(texto: string): string | null | 'mal' {
  if (!texto.trim()) return null;
  return fechaDesdeTexto(texto) ?? 'mal';
}

export function Detalle({ filtros: f, alCambiarFiltros: cambiar, integrantes, categorias, cerrados }: Props) {
  const { texto, persona, categoria, desde: desdeTexto, hasta: hastaTexto } = f;
  const [eligiendo, setEligiendo] = useState(false);

  // Un filtro que apunta a alguien que ya no figura o a una categoría borrada dejaría la lista vacía sin motivo.
  const personaVigente = integrantes.some((i) => i.id === persona) ? persona : '';
  const categoriaVigente = categorias.some((c) => c.id === categoria) ? categoria : '';
  const nombreCategoria = categorias.find((c) => c.id === categoriaVigente)?.nombre;

  const desde = leerFecha(desdeTexto);
  const hasta = leerFecha(hastaTexto);
  const errorRango = desde && hasta && desde !== 'mal' && hasta !== 'mal' && desde > hasta ? 'La fecha Desde es posterior a Hasta.' : null;
  const rangoListo = desde !== 'mal' && hasta !== 'mal' && !errorRango;

  return (
    <>
      <div role="search" className={estilos.filtros}>
        <Campo etiqueta="Buscar" value={texto} onChange={(e) => cambiar({ texto: e.target.value })} placeholder="Nota o producto" />

        <div className={estilos.grupo}>
          <p className={estilos.rotulo}>Pagó</p>
          <div role="radiogroup" aria-label="Pagó" className={estilos.chips}>
            <Chip texto="Todos" activo={personaVigente === ''} onClick={() => cambiar({ persona: '' })} />
            {integrantes.map((i) => (
              <Chip key={i.id} texto={i.nombre} activo={personaVigente === i.id} onClick={() => cambiar({ persona: i.id })} />
            ))}
          </div>
        </div>

        <div className={[estilos.grupo, estilos.grupoInicio].join(' ')}>
          <p className={estilos.rotulo}>Categoría</p>
          <Chip
            texto={nombreCategoria ?? 'Todas'}
            aria-label={`Categoría: ${nombreCategoria ?? 'Todas'}`}
            flecha
            onClick={() => setEligiendo(true)}
          />
        </div>

        <div className={estilos.fechas}>
          <Campo
            className={estilos.campoFecha}
            etiqueta="Desde"
            value={desdeTexto}
            onChange={(e) => cambiar({ desde: e.target.value })}
            placeholder="dd/mm/aaaa"
            ayuda="Vacía: sin límite."
            error={desde === 'mal' ? MAL_ESCRITA : errorRango}
          />
          <Campo
            className={estilos.campoFecha}
            etiqueta="Hasta"
            value={hastaTexto}
            onChange={(e) => cambiar({ hasta: e.target.value })}
            placeholder="dd/mm/aaaa"
            ayuda="Vacía: sin límite."
            error={hasta === 'mal' ? MAL_ESCRITA : null}
          />
        </div>
      </div>

      {rangoListo ? (
        <Lista
          desde={desde}
          hasta={hasta}
          filtros={{ texto, persona: personaVigente, categoria: categoriaVigente }}
          nombreCategoria={nombreCategoria}
          integrantes={integrantes}
          categorias={categorias}
          cerrados={cerrados}
        />
      ) : null}

      <Hoja visible={eligiendo} titulo="Categoría" alCerrar={() => setEligiendo(false)}>
        <div role="radiogroup" aria-label="Categoría" className={estilos.chips}>
          {[{ id: '', nombre: 'Todas' }, ...categorias].map((c) => (
            <Chip
              key={c.id || 'todas'}
              texto={c.nombre}
              activo={categoriaVigente === c.id}
              onClick={() => {
                cambiar({ categoria: c.id });
                setEligiendo(false);
              }}
            />
          ))}
        </div>
      </Hoja>
    </>
  );
}

type PropsLista = {
  desde: string | null;
  hasta: string | null;
  filtros: { texto: string; persona: string; categoria: string };
  nombreCategoria?: string;
  integrantes: Integrante[];
  categorias: Categoria[];
  cerrados: Set<string>;
};

function Lista({ desde, hasta, filtros, nombreCategoria, integrantes, categorias, cerrados }: PropsLista) {
  const { carga, reintentar } = useEnVivo(() => datos.gastosEntre(desde, hasta ? diaSiguiente(hasta) : null), `${desde}|${hasta}`);
  const [cuantos, setCuantos] = useState(PAGINA);

  // Otros filtros u otras fechas: se vuelve a la primera página.
  const huella = `${desde}|${hasta}|${filtros.texto}|${filtros.persona}|${filtros.categoria}`;
  useEffect(() => setCuantos(PAGINA), [huella]);
  // El conteo de lo filtrado (null mientras no hay datos), demorado para no anunciar cada letra.
  const lista = carga.estado === 'listo' ? filtrarGastos(carga.valor, filtros) : null;
  const conteo = useDemorado(lista ? conteoDe(lista.length) : null, ESPERA_CONTEO_MS);

  if (carga.estado === 'cargando') {
    return (
      <div aria-busy="true" className={estilos.cargando}>
        <Esqueleto alto={60} />
        <Esqueleto alto={60} />
        <p className={estilos.centrado} aria-live="polite">
          Trayendo los gastos…
        </p>
      </div>
    );
  }
  if (carga.estado === 'error') {
    return (
      <Aviso
        alerta
        icono="nube"
        titulo="No pudimos traer los gastos"
        texto={mensajeError(carga.error)}
        accion={{ texto: 'Reintentar', onClick: reintentar }}
      />
    );
  }

  if (!lista) return null;
  const total = totalDe(lista, filtros.categoria);
  const visibles = lista.slice(0, cuantos);
  const quedan = lista.length - visibles.length;
  const nombres = { integrantes: mapaDeNombres(integrantes), categorias: mapaDeNombres(categorias) };

  return (
    <>
      {/* Siempre montada, para que el lector de pantalla anuncie cada cambio: el conteo cuando se deja de
          tipear y el vacío al aparecer. */}
      <div data-testid="conteo-detalle" aria-live="polite">
        {lista.length ? (
          // Volviendo de «no hay», el número va ya; si no, el demorado.
          <p className={estilos.sub}>{conteo && conteo !== SIN_GASTOS ? conteo : conteoDe(lista.length)}</p>
        ) : (
          <Tarjeta>
            <EstadoVacio icono="lupa" titulo={SIN_GASTOS} texto="Probá con otras fechas o sacá algún filtro." />
          </Tarjeta>
        )}
      </div>
      {lista.length ? (
        <Tarjeta className={estilos.lista}>
          {visibles.map((g, i) => (
            <FilaGasto key={g.id} gasto={g} nombres={nombres} separador={i > 0} cerrado={cerrados.has(mesDe(g.fecha))} />
          ))}
          <FilaTotal rotulo={nombreCategoria ? `Total en ${nombreCategoria}` : 'Total'} centavos={total} />
        </Tarjeta>
      ) : null}
      {quedan > 0 ? <Boton texto={`Ver ${Math.min(PAGINA, quedan)} más`} variante="borde" onClick={() => setCuantos((c) => c + PAGINA)} /> : null}
    </>
  );
}

const conteoDe = (n: number) => (n === 1 ? '1 gasto' : n ? `${n} gastos` : SIN_GASTOS);
