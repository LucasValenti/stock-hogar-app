// Inicio: el total del mes, lo que falta (con el paso a Stock › Pendientes), cómo viene el reparto,
// «¿Todavía hay?» de a un producto y los últimos gastos, con los estados de la maqueta «Elegida»
// (cargando, sin conexión y mes sin gastos). Se actualiza solo cuando cambia algo en la casa.
// El reparto lo ven todos: con los sueldos quien tiene el permiso, con las partes del mes el resto.
import { useLocation } from 'wouter';

import { datos, esModoMemoria } from '@/datos';
import { esCorte } from '@/datos/cola';
import { pesosDelMes } from '@/datos/pesos';
import type { GastoConItems } from '@/datos/tipos';
import { formatear } from '@/logica/dinero';
import { mensajeError } from '@/logica/errores';
import { mesActual, nombreMes, rangoMes } from '@/logica/meses';
import { capacidades } from '@/logica/permisos';
import { integrantesConPeso, repartoDelMes } from '@/logica/reparto';
import { pendientesConAnotaciones, textoPendientes } from '@/logica/stock';
import { enMayuscula } from '@/logica/texto';
import type { Anotacion, Categoria, Integrante, Producto } from '@/logica/tipos';
import { useSesion } from '@/sesion/sesion';
import { FilaGasto, mapaDeNombres } from '@/ui/analisis/FilaGasto';
import { Reparto } from '@/ui/analisis/Reparto';
import { Aviso } from '@/ui/Aviso';
import { AvisoCola } from '@/ui/AvisoCola';
import { Boton } from '@/ui/Boton';
import { Esqueleto } from '@/ui/Esqueleto';
import { Icono } from '@/ui/Icono';
import { Monto } from '@/ui/Monto';
import { Pantalla } from '@/ui/Pantalla';
import { Tarjeta } from '@/ui/Tarjeta';
import { TodaviaHay } from '@/ui/TodaviaHay';
import { useEnVivo } from '@/ui/useEnVivo';

import estilos from './Inicio.module.css';

type Casa = {
  integrantes: Array<Integrante & { peso: number | null }>;
  gastos: GastoConItems[];
  categorias: Categoria[];
  productos: Producto[];
  anotaciones: Anotacion[];
};

const ULTIMOS = 5;

/** «octubre de 2026» → «octubre». */
const soloMes = (mes: string) => nombreMes(mes).split(' ')[0];

function pedirCasa(mes: string, verSueldos: boolean): Promise<Casa> {
  const { desde, hastaExcl } = rangoMes(mes);
  return Promise.all([
    datos.integrantes(),
    datos.gastosEntre(desde, hastaExcl),
    datos.categorias(),
    datos.productos(),
    datos.anotaciones(),
    pesosDelMes(mes, verSueldos),
  ]).then(([integrantes, gastos, categorias, productos, anotaciones, pesos]) => ({
    integrantes: integrantesConPeso(integrantes, pesos),
    gastos,
    categorias,
    productos,
    anotaciones,
  }));
}

export function Inicio() {
  const { yo, demo, acceso } = useSesion();
  const mes = mesActual();
  const { verSueldos } = capacidades(acceso);
  // Si cambia el permiso, se vuelve a pedir con los pesos que corresponden.
  const { carga, reintentar } = useEnVivo(() => pedirCasa(mes, verSueldos), `${mes}:${verSueldos}`);
  const nombre = soloMes(mes);

  return (
    <Pantalla saludo={yo ? `Hola, ${yo.nombre}` : undefined} titulo={enMayuscula(nombre)} ocupado={carga.estado === 'cargando'}>
      {demo ? <AvisoDemo /> : null}
      <AvisoCola />
      {carga.estado === 'cargando' ? (
        <Cargando />
      ) : carga.estado === 'error' ? (
        <Aviso
          alerta
          icono="nube"
          titulo="No pudimos traer los datos"
          texto={esCorte(carga.error) ? 'Revisá el wifi o los datos del celu y probá de nuevo.' : mensajeError(carga.error)}
          accion={{ texto: 'Reintentar', onClick: reintentar }}
        />
      ) : (
        <DelMes mes={mes} nombre={nombre} casa={carga.valor} verSueldos={verSueldos} />
      )}
    </Pantalla>
  );
}

function DelMes({ mes, nombre, casa, verSueldos }: { mes: string; nombre: string; casa: Casa; verSueldos: boolean }) {
  const [, navegar] = useLocation();
  const { integrantes, gastos, categorias, productos, anotaciones } = casa;
  const reparto = repartoDelMes(integrantes, mes, gastos);
  const cuantos = gastos.length;
  const detalle = cuantos === 0 ? 'Todavía no cargó nadie' : cuantos === 1 ? '1 gasto' : `${cuantos} gastos`;
  const faltan = pendientesConAnotaciones(productos, anotaciones).map((x) =>
    x.tipo === 'producto' ? x.producto.nombre : x.anotacion.texto,
  );

  return (
    <>
      <Tarjeta iman aria-label={`Gastos del mes: ${formatear(reparto.total)}. ${detalle}.`}>
        <p className={estilos.rotulo}>Gastos del mes</p>
        <Monto centavos={reparto.total} />
        <p className={estilos.rotulo}>{detalle}</p>
      </Tarjeta>
      {faltan.length ? <AvisoPendientes texto={textoPendientes(faltan)} alVer={() => navegar('/stock?vista=pendientes')} /> : null}
      {cuantos === 0 ? (
        <Aviso
          icono="nota"
          titulo={`Arrancó ${nombre}`}
          texto="Cuando alguien cargue el primer gasto, acá aparece cómo viene el reparto."
          accion={{ texto: 'Cargar gasto', icono: 'mas', onClick: () => navegar('/cargar') }}
        />
      ) : (
        <Reparto reparto={reparto} integrantes={integrantes} verSueldos={verSueldos} />
      )}
      <TodaviaHay productos={productos} categorias={categorias} sinLleno={cuantos === 0} />
      {cuantos ? (
        <UltimosGastos
          gastos={gastos.slice(0, ULTIMOS)}
          integrantes={integrantes}
          categorias={categorias}
          alVerTodos={() => navegar('/analisis?vista=detalle')}
        />
      ) : null}
    </>
  );
}

/** Aviso de la demo de tiempo de ejecución. En el build solo-memoria no hay a dónde salir: va sin botón. */
function AvisoDemo() {
  const { salir } = useSesion();
  return (
    <Tarjeta className={estilos.avisoFila}>
      <span className={estilos.avisoTexto}>
        <span className={estilos.icono}>
          <Icono nombre="casa" tamano={20} />
        </span>
        <p className={estilos.fuerte}>Estás en la demo: los datos son inventados.</p>
      </span>
      {esModoMemoria() ? null : <Boton texto="Salir de la demo" variante="borde" onClick={() => void salir()} />}
    </Tarjeta>
  );
}

/** «Faltan yerba y leche.» con el paso a Stock › Pendientes. Tarjeta plana: es apoyo, no lleva imán. */
function AvisoPendientes({ texto, alVer }: { texto: string; alVer(): void }) {
  return (
    <Tarjeta className={estilos.avisoFila}>
      <span className={estilos.avisoTexto}>
        <span className={[estilos.icono, estilos.iconoFalta].join(' ')}>
          <Icono nombre="falta" tamano={20} />
        </span>
        <p className={estilos.fuerte}>{texto}</p>
      </span>
      <Boton texto="Ver pendientes" variante="borde" onClick={alVer} />
    </Tarjeta>
  );
}

type PropsUltimos = {
  gastos: GastoConItems[];
  integrantes: Integrante[];
  categorias: Categoria[];
  alVerTodos(): void;
};

function UltimosGastos({ gastos, integrantes, categorias, alVerTodos }: PropsUltimos) {
  const nombres = { integrantes: mapaDeNombres(integrantes), categorias: mapaDeNombres(categorias) };
  return (
    <>
      <h2 className={estilos.seccion}>Últimos gastos</h2>
      <Tarjeta className={estilos.lista}>
        {gastos.map((g, i) => (
          <FilaGasto key={g.id} gasto={g} nombres={nombres} separador={i > 0} />
        ))}
      </Tarjeta>
      <div className={estilos.alInicio}>
        <Boton texto="Ver todos los gastos" variante="borde" onClick={alVerTodos} />
      </div>
    </>
  );
}

function Cargando() {
  const fila = (i: number) => (
    <div key={i} className={[estilos.filaEsqueleto, i > 0 && estilos.separador].filter(Boolean).join(' ')}>
      <Esqueleto circulo alto={32} />
      <div className={estilos.textosEsqueleto}>
        <Esqueleto ancho="50%" alto={15} />
        <Esqueleto ancho="75%" alto={12} />
      </div>
    </div>
  );
  return (
    <>
      <Tarjeta iman>
        <p className={estilos.rotulo}>Gastos del mes</p>
        <Esqueleto ancho="62%" alto={40} />
        <Esqueleto ancho="45%" alto={12} />
      </Tarjeta>
      <h2 className={estilos.seccion}>Cómo viene el reparto</h2>
      <Tarjeta className={estilos.lista}>{[0, 1, 2].map(fila)}</Tarjeta>
      <p className={estilos.subCentrado} aria-live="polite">
        Trayendo los gastos de la casa…
      </p>
    </>
  );
}
