// Inicio: el total del mes, lo que falta (con el paso a Stock › Pendientes), cómo viene el reparto,
// «¿Todavía hay?» de a un producto y los últimos gastos, con los estados de la maqueta «Elegida»
// (cargando, sin conexión y mes sin gastos). Se actualiza solo cuando cambia algo en la casa.

import { router } from 'expo-router';
import { View } from 'react-native';

import { datos, esModoMemoria } from '@/datos';
import { esCorte } from '@/datos/cola';
import type { GastoConItems } from '@/datos/tipos';
import { formatear } from '@/logica/dinero';
import { mensajeError } from '@/logica/errores';
import { mesActual, nombreMes, rangoMes } from '@/logica/meses';
import { repartoDelMes } from '@/logica/reparto';
import { pendientesConAnotaciones, textoPendientes } from '@/logica/stock';
import { enMayuscula } from '@/logica/texto';
import type { Anotacion, Categoria, Integrante, Producto } from '@/logica/tipos';
import { useSesion } from '@/sesion/sesion';
import { useTema } from '@/tema/tema';
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
import { Texto } from '@/ui/Texto';
import { TodaviaHay } from '@/ui/TodaviaHay';
import { useEnVivo } from '@/ui/useEnVivo';

type Casa = {
  integrantes: Integrante[];
  gastos: GastoConItems[];
  categorias: Categoria[];
  productos: Producto[];
  anotaciones: Anotacion[];
};

const ULTIMOS = 5;

/** «octubre de 2026» → «octubre». */
const soloMes = (mes: string) => nombreMes(mes).split(' ')[0];

function pedirCasa(mes: string): Promise<Casa> {
  const { desde, hastaExcl } = rangoMes(mes);
  return Promise.all([
    datos.integrantes(),
    datos.gastosEntre(desde, hastaExcl),
    datos.categorias(),
    datos.productos(),
    datos.anotaciones(),
  ]).then(([integrantes, gastos, categorias, productos, anotaciones]) => ({ integrantes, gastos, categorias, productos, anotaciones }));
}

export default function Inicio() {
  const { yo, demo } = useSesion();
  const mes = mesActual();
  const { carga, reintentar } = useEnVivo(() => pedirCasa(mes), mes);
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
          accion={{ texto: 'Reintentar', onPress: reintentar }}
        />
      ) : (
        <DelMes mes={mes} nombre={nombre} casa={carga.valor} />
      )}
    </Pantalla>
  );
}

function DelMes({ mes, nombre, casa }: { mes: string; nombre: string; casa: Casa }) {
  const { integrantes, gastos, categorias, productos, anotaciones } = casa;
  const reparto = repartoDelMes(integrantes, mes, gastos);
  const cuantos = gastos.length;
  const detalle = cuantos === 0 ? 'Todavía no cargó nadie' : cuantos === 1 ? '1 gasto' : `${cuantos} gastos`;
  const faltan = pendientesConAnotaciones(productos, anotaciones).map((x) => (x.tipo === 'producto' ? x.producto.nombre : x.anotacion.texto));

  return (
    <>
      <Tarjeta iman accessible accessibilityLabel={`Gastos del mes: ${formatear(reparto.total)}. ${detalle}.`}>
        <Texto variante="sub">Gastos del mes</Texto>
        <Monto centavos={reparto.total} />
        <Texto variante="sub">{detalle}</Texto>
      </Tarjeta>
      {faltan.length ? <AvisoPendientes texto={textoPendientes(faltan)} /> : null}
      {cuantos === 0 ? (
        <Aviso
          icono="nota"
          titulo={`Arrancó ${nombre}`}
          texto="Cuando alguien cargue el primer gasto, acá aparece cómo viene el reparto."
          accion={{ texto: 'Cargar gasto', icono: 'mas', onPress: () => router.push('/cargar') }}
        />
      ) : (
        <Reparto reparto={reparto} integrantes={integrantes} />
      )}
      <TodaviaHay productos={productos} categorias={categorias} sinLleno={cuantos === 0} />
      {cuantos ? <UltimosGastos gastos={gastos.slice(0, ULTIMOS)} integrantes={integrantes} categorias={categorias} /> : null}
    </>
  );
}

/** Aviso de la demo de tiempo de ejecución. En el build solo-memoria no hay a dónde salir: va sin botón. */
function AvisoDemo() {
  const tema = useTema();
  const { salir } = useSesion();
  return (
    <Tarjeta style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tema.espacio.m }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tema.espacio.s, flexGrow: 1, flexShrink: 1 }}>
        <Icono nombre="casa" tamano={tema.medida.icono} color={tema.color.textoSuave} />
        <Texto variante="fuerte" style={{ flexShrink: 1 }}>
          Estás en la demo: los datos son inventados.
        </Texto>
      </View>
      {esModoMemoria() ? null : <Boton texto="Salir de la demo" variante="borde" onPress={() => void salir()} />}
    </Tarjeta>
  );
}

/** «Faltan yerba y leche.» con el paso a Stock › Pendientes. Tarjeta plana: es apoyo, no lleva imán. */
function AvisoPendientes({ texto }: { texto: string }) {
  const tema = useTema();
  return (
    <Tarjeta style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tema.espacio.m }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tema.espacio.s, flexGrow: 1, flexShrink: 1, flexBasis: tema.medida.fila * 2 }}>
        <Icono nombre="falta" tamano={tema.medida.icono} color={tema.color.falta} />
        <Texto variante="fuerte" style={{ flexShrink: 1 }}>
          {texto}
        </Texto>
      </View>
      <Boton texto="Ver pendientes" variante="borde" onPress={() => router.push({ pathname: '/stock', params: { vista: 'pendientes' } })} />
    </Tarjeta>
  );
}

type PropsUltimos = { gastos: GastoConItems[]; integrantes: Integrante[]; categorias: Categoria[] };

function UltimosGastos({ gastos, integrantes, categorias }: PropsUltimos) {
  const nombres = { integrantes: mapaDeNombres(integrantes), categorias: mapaDeNombres(categorias) };
  return (
    <>
      <Texto variante="seccion" accessibilityRole="header" aria-level={2}>
        Últimos gastos
      </Texto>
      <Tarjeta style={{ paddingVertical: 0, gap: 0 }}>
        {gastos.map((g, i) => (
          <FilaGasto key={g.id} gasto={g} nombres={nombres} separador={i > 0} />
        ))}
      </Tarjeta>
      <View style={{ alignSelf: 'flex-start' }}>
        <Boton texto="Ver todos los gastos" variante="borde" onPress={() => router.push({ pathname: '/analisis', params: { vista: 'detalle' } })} />
      </View>
    </>
  );
}

function Cargando() {
  const tema = useTema();
  const fila = (i: number) => (
    <View
      key={i}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: tema.espacio.m,
        minHeight: tema.medida.fila,
        borderTopWidth: i === 0 ? 0 : tema.medida.borde,
        borderTopColor: tema.color.borde,
      }}
    >
      <Esqueleto circulo alto={tema.medida.indicadorAlto} />
      <View style={{ flex: 1, gap: tema.espacio.s }}>
        <Esqueleto ancho="50%" alto={tema.tamano.m} />
        <Esqueleto ancho="75%" alto={tema.tamano.xs} />
      </View>
    </View>
  );
  return (
    <>
      <Tarjeta iman>
        <Texto variante="sub">Gastos del mes</Texto>
        <Esqueleto ancho="62%" alto={tema.tamano.xxxl} />
        <Esqueleto ancho="45%" alto={tema.tamano.xs} />
      </Tarjeta>
      <Texto variante="seccion">Cómo viene el reparto</Texto>
      <Tarjeta style={{ paddingVertical: 0, gap: 0 }}>{[0, 1, 2].map(fila)}</Tarjeta>
      <Texto variante="sub" centrado accessibilityLiveRegion="polite">
        Trayendo los gastos de la casa…
      </Texto>
    </>
  );
}
