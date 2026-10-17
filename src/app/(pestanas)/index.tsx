// Inicio: el total del mes y cómo viene el reparto, con los estados de la maqueta «Elegida»
// (cargando, sin conexión y mes sin gastos). Se actualiza solo cuando cambia algo en la casa.

import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { datos } from '@/datos';
import { esErrorDeRed } from '@/datos/cola';
import type { GastoConItems } from '@/datos/tipos';
import { formatear, formatearPorcentaje } from '@/logica/dinero';
import { mensajeError } from '@/logica/errores';
import { mesActual, nombreMes, rangoMes } from '@/logica/meses';
import { repartoDelMes, type ResultadoReparto } from '@/logica/reparto';
import type { FilaReparto, Integrante } from '@/logica/tipos';
import { useSesion } from '@/sesion/sesion';
import { useTema } from '@/tema/tema';
import { Aviso } from '@/ui/Aviso';
import { Esqueleto } from '@/ui/Esqueleto';
import { Monto } from '@/ui/Monto';
import { Pantalla } from '@/ui/Pantalla';
import { Tarjeta } from '@/ui/Tarjeta';
import { Texto } from '@/ui/Texto';

type Carga =
  | { estado: 'cargando' }
  | { estado: 'error'; error: unknown }
  | { estado: 'listo'; integrantes: Integrante[]; gastos: GastoConItems[] };

/** Los gastos e integrantes del mes, y otra vez cada vez que alguien cambia algo. */
function useDatosDelMes(mes: string) {
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' });

  const traer = useCallback(async () => {
    const { desde, hastaExcl } = rangoMes(mes);
    try {
      const [integrantes, gastos] = await Promise.all([datos.integrantes(), datos.gastosEntre(desde, hastaExcl)]);
      setCarga({ estado: 'listo', integrantes, gastos });
    } catch (error) {
      // Si ya había datos en pantalla, una actualización fallida no los borra.
      setCarga((previa) => (previa.estado === 'listo' ? previa : { estado: 'error', error }));
    }
  }, [mes]);

  useEffect(() => {
    traer();
    try {
      return datos.escucharCambios(() => void traer());
    } catch {
      return undefined; // Sin configuración: el error ya llega por `traer`.
    }
  }, [traer]);

  const reintentar = useCallback(() => {
    setCarga({ estado: 'cargando' });
    traer();
  }, [traer]);

  return { carga, reintentar };
}

const enMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** «octubre de 2026» → «octubre». */
const soloMes = (mes: string) => nombreMes(mes).split(' ')[0];

const esCorte = (e: unknown) =>
  esErrorDeRed(e) || e instanceof TypeError || (e as { code?: string } | null)?.code === 'SIN_CONEXION';

export default function Inicio() {
  const { yo } = useSesion();
  const mes = mesActual();
  const { carga, reintentar } = useDatosDelMes(mes);
  const nombre = soloMes(mes);

  return (
    <Pantalla saludo={yo ? `Hola, ${yo.nombre}` : undefined} titulo={enMayuscula(nombre)} ocupado={carga.estado === 'cargando'}>
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
        <DelMes mes={mes} nombre={nombre} integrantes={carga.integrantes} gastos={carga.gastos} />
      )}
    </Pantalla>
  );
}

function DelMes({ mes, nombre, integrantes, gastos }: { mes: string; nombre: string; integrantes: Integrante[]; gastos: GastoConItems[] }) {
  const reparto = repartoDelMes(integrantes, mes, gastos);
  const cuantos = gastos.length;
  const detalle = cuantos === 0 ? 'Todavía no cargó nadie' : cuantos === 1 ? '1 gasto' : `${cuantos} gastos`;

  return (
    <>
      <Tarjeta iman accessible accessibilityLabel={`Gastos del mes: ${formatear(reparto.total)}. ${detalle}.`}>
        <Texto variante="sub">Gastos del mes</Texto>
        <Monto centavos={reparto.total} />
        <Texto variante="sub">{detalle}</Texto>
      </Tarjeta>
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
    </>
  );
}

function Reparto({ reparto, integrantes }: { reparto: ResultadoReparto; integrantes: Integrante[] }) {
  const tema = useTema();
  let contenido;
  if (reparto.ok) {
    contenido = reparto.filas.map((f, i) => <FilaDeReparto key={f.id} fila={f} primera={i === 0} />);
  } else {
    const motivo =
      reparto.error === 'sueldo'
        ? `Para repartir falta el sueldo de ${reparto.sinSueldo.join(', ')}. Se carga en Ajustes → Integrantes.`
        : reparto.error === 'pagador'
          ? 'Hay un gasto de alguien que ya no está en la casa: revisalo para poder repartir.'
          : integrantes.length
            ? 'Este mes no hay integrantes para repartir.'
            : 'Todavía no hay integrantes en la casa.';
    contenido = (
      <View style={{ paddingVertical: tema.espacio.m }}>
        <Texto>{motivo}</Texto>
      </View>
    );
  }
  return (
    <>
      <Texto variante="seccion" accessibilityRole="header" aria-level={2}>
        Cómo viene el reparto
      </Texto>
      <Tarjeta style={{ paddingVertical: 0, gap: 0 }}>{contenido}</Tarjeta>
    </>
  );
}

function FilaDeReparto({ fila, primera }: { fila: FilaReparto; primera: boolean }) {
  const tema = useTema();
  const palabra = fila.saldo > 0 ? 'recibe' : fila.saldo < 0 ? 'pone' : 'está al día';
  const parte = fila.participa ? `parte ${formatearPorcentaje(fila.peso)}` : 'no participa';
  const color = fila.saldo > 0 ? 'hay' : fila.saldo < 0 ? 'falta' : 'texto';
  return (
    <View
      accessible
      accessibilityLabel={`${fila.nombre}, ${parte}, puso ${formatear(fila.pago)}. ${
        fila.saldo === 0 ? palabra : `${enMayuscula(palabra)} ${formatear(Math.abs(fila.saldo))}`
      }.`}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: tema.espacio.m,
        minHeight: tema.medida.fila,
        paddingVertical: tema.espacio.s,
        borderTopWidth: primera ? 0 : tema.medida.borde,
        borderTopColor: tema.color.borde,
      }}
    >
      <Inicial nombre={fila.nombre} />
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: tema.medida.fila * 2 }}>
        <Texto variante="fuerte" numberOfLines={2}>
          {fila.nombre}
        </Texto>
        <Texto variante="sub">
          {`${parte} · puso `}
          <Texto variante="subMedio" style={{ fontVariant: ['tabular-nums'] }}>
            {formatear(fila.pago)}
          </Texto>
        </Texto>
      </View>
      <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
        <Monto centavos={fila.saldo} tamano="fila" signo color={color} />
        <Texto variante="sub">{palabra}</Texto>
      </View>
    </View>
  );
}

/** El círculo «quien»: la inicial con borde. El color por persona llega en F7. */
function Inicial({ nombre }: { nombre: string }) {
  const tema = useTema();
  return (
    <View
      style={{
        minWidth: tema.medida.indicadorAlto,
        aspectRatio: 1,
        padding: tema.espacio.s,
        borderRadius: tema.radio.chip,
        borderWidth: tema.medida.borde,
        borderColor: tema.color.borde,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Texto variante="seccion" color="texto">
        {nombre.charAt(0).toUpperCase()}
      </Texto>
    </View>
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
