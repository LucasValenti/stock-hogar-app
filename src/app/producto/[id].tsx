// Ficha de un producto: cuánto hay en casa, sus datos para editar (validarProducto) y la acción que
// corresponde (accionProducto): borrar lo que nunca se compró, ocultar lo que tiene compras y volver a
// mostrar lo oculto. Sin «Precios pagados» (spec 2.0). Cambiar la unidad no convierte el stock: si pasa
// a unidades o paquetes con decimales, se avisa y se ofrece redondear.

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { datos } from '@/datos';
import { mensajeError } from '@/logica/errores';
import { accionProducto, cantidadConUnidad, formatearCantidad, redondeoPorUnidad } from '@/logica/stock';
import type { Categoria, Producto } from '@/logica/tipos';
import { validarProducto, type ErroresProducto } from '@/logica/validar';
import { useTema } from '@/tema/tema';
import { Aviso } from '@/ui/Aviso';
import { Boton } from '@/ui/Boton';
import { Encabezado } from '@/ui/Encabezado';
import { Esqueleto } from '@/ui/Esqueleto';
import { FormularioProducto, MensajeError, NOMBRE_UNIDAD, type ValoresProducto } from '@/ui/FormularioProducto';
import { Hoja } from '@/ui/Hoja';
import { Pantalla } from '@/ui/Pantalla';
import { Tarjeta } from '@/ui/Tarjeta';
import { Texto } from '@/ui/Texto';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/stock'));

type Base = { producto: Producto; categorias: Categoria[]; tieneCompras: boolean };
type Carga = { estado: 'cargando' } | { estado: 'error'; error: unknown } | { estado: 'no-existe' } | { estado: 'listo'; base: Base };

export default function FichaProducto() {
  const tema = useTema();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const idProducto = typeof id === 'string' ? id : '';
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCarga({ estado: 'cargando' });
    Promise.all([datos.producto(idProducto), datos.categorias(), datos.tieneCompras(idProducto)])
      .then(([producto, categorias, tieneCompras]) => {
        if (!vigente) return;
        setCarga(producto ? { estado: 'listo', base: { producto, categorias, tieneCompras } } : { estado: 'no-existe' });
      })
      .catch((error: unknown) => {
        if (vigente) setCarga({ estado: 'error', error });
      });
    return () => {
      vigente = false;
    };
  }, [idProducto, intento]);

  if (carga.estado === 'cargando') {
    return (
      <Pantalla ocupado>
        <Encabezado titulo="Producto" alVolver={volver} />
        <Esqueleto alto={tema.medida.fila} />
        <Esqueleto alto={tema.medida.tactil} />
        <Esqueleto alto={tema.medida.tactil} />
      </Pantalla>
    );
  }
  if (carga.estado === 'error') {
    return (
      <Pantalla>
        <Encabezado titulo="Producto" alVolver={volver} />
        <Aviso
          alerta
          icono="nube"
          titulo="No pudimos traer el producto"
          texto={mensajeError(carga.error)}
          accion={{ texto: 'Reintentar', onPress: () => setIntento((n) => n + 1) }}
        />
      </Pantalla>
    );
  }
  if (carga.estado === 'no-existe') {
    return (
      <Pantalla>
        <Encabezado titulo="Producto" alVolver={volver} />
        <Aviso
          icono="caja"
          titulo="No lo encontramos"
          texto="Ese producto ya no existe. Puede que alguien lo haya borrado."
          accion={{ texto: 'Volver a Stock', onPress: volver }}
        />
      </Pantalla>
    );
  }
  return <Ficha base={carga.base} />;
}

function Ficha({ base }: { base: Base }) {
  const tema = useTema();
  const { producto: p, categorias, tieneCompras } = base;
  const [valores, setValores] = useState<ValoresProducto>({
    nombre: p.nombre,
    marca: p.marca ?? '',
    categoriaId: p.categoria_id,
    unidad: p.unidad,
  });
  const [errores, setErrores] = useState<ErroresProducto>({});
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [hoja, setHoja] = useState<'redondeo' | 'confirmar' | null>(null);

  const cambioUnidad = valores.unidad !== p.unidad;
  const redondeo = cambioUnidad ? redondeoPorUnidad(p.stock, valores.unidad) : null;
  const cuanto = formatearCantidad(p.stock);
  const avisoUnidad =
    redondeo !== null
      ? `Cambiar cómo se cuenta no convierte lo que hay: ${cuanto} pasa a ser ${cuanto} ${NOMBRE_UNIDAD[valores.unidad].toLowerCase()}.`
      : null;

  function cambiar(cambio: Partial<ValoresProducto>) {
    setValores((v) => ({ ...v, ...cambio }));
    setErrores((e) => {
      const sigue = { ...e };
      if ('nombre' in cambio) delete sigue.nombre;
      if ('categoriaId' in cambio) delete sigue.categoria_id;
      if ('unidad' in cambio) delete sigue.unidad;
      return sigue;
    });
  }

  function validar() {
    const r = validarProducto({ nombre: valores.nombre, marca: valores.marca, categoria_id: valores.categoriaId, unidad: valores.unidad });
    setErrores(r.errores);
    return r;
  }

  function pedirGuardar() {
    setErrorGuardar(null);
    if (!validar().ok) return;
    if (redondeo !== null) setHoja('redondeo');
    else void guardar(null);
  }

  // `destino`: el stock redondeado que se eligió, o null para dejarlo como está.
  async function guardar(destino: number | null) {
    const r = validar();
    if (!r.ok) return;
    setGuardando(true);
    setErrorGuardar(null);
    try {
      await datos.editarProducto({ id: p.id, ...r.valor });
    } catch (e) {
      setErrorGuardar(mensajeError(e));
      setGuardando(false);
      setHoja(null);
      return;
    }
    const delta = destino === null ? 0 : Math.round((destino - p.stock) * 1000) / 1000;
    if (delta !== 0) {
      try {
        await datos.ajustarStock(p.id, delta);
      } catch (e) {
        setErrorGuardar(`Se guardaron los datos, pero no el redondeo. ${mensajeError(e)}`);
        setGuardando(false);
        setHoja(null);
        return;
      }
    }
    setHoja(null);
    volver();
  }

  return (
    <Pantalla>
      <Encabezado titulo={p.nombre} alVolver={volver} />
      <Tarjeta>
        <Texto variante="fuerte">{`En casa: ${cantidadConUnidad(p.stock, p.unidad)}`}</Texto>
        {p.oculto ? <Texto variante="sub">Oculto: no aparece en Stock ni en pendientes.</Texto> : null}
      </Tarjeta>

      <FormularioProducto valores={valores} alCambiar={cambiar} errores={errores} categorias={categorias} avisoUnidad={avisoUnidad} />

      <View style={{ gap: tema.espacio.s }}>
        <MensajeError texto={errorGuardar} />
        <Boton texto="Guardar cambios" ocupado={guardando} onPress={pedirGuardar} />
        <AccionFicha producto={p} tieneCompras={tieneCompras} abierta={hoja === 'confirmar'} alAbrir={() => setHoja('confirmar')} alCerrar={() => setHoja(null)} />
      </View>

      {redondeo !== null ? (
        <Hoja
          visible={hoja === 'redondeo'}
          titulo="¿Redondeamos lo que hay?"
          subtitulo={`Hay ${cuanto} en casa y las ${NOMBRE_UNIDAD[valores.unidad].toLowerCase()} se cuentan enteras.`}
          alCerrar={() => setHoja(null)}
          pie={
            <>
              <Boton texto={`Guardar y redondear a ${formatearCantidad(redondeo)}`} ocupado={guardando} onPress={() => void guardar(redondeo)} />
              <Boton texto={`Guardar con ${cuanto}`} variante="borde" onPress={() => void guardar(null)} />
              <Boton texto="Cancelar" variante="borde" onPress={() => setHoja(null)} />
            </>
          }
        />
      ) : null}
    </Pantalla>
  );
}

type PropsAccion = { producto: Producto; tieneCompras: boolean; abierta: boolean; alAbrir(): void; alCerrar(): void };

// Borrar lo que nunca se compró; ocultar lo que tiene compras (quedan guardadas); volver a mostrar lo oculto.
function AccionFicha({ producto: p, tieneCompras, abierta, alAbrir, alCerrar }: PropsAccion) {
  const accion = accionProducto(p, tieneCompras);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function hacer() {
    setOcupado(true);
    setError(null);
    try {
      if (accion === 'borrar') await datos.borrarProducto(p.id);
      else await datos.ocultarProducto(p.id, accion === 'ocultar');
      alCerrar();
      volver();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  }

  if (accion === 'mostrar') {
    return (
      <>
        <MensajeError texto={error} />
        <Boton texto="Volver a mostrar en Stock" variante="borde" ocupado={ocupado} onPress={() => void hacer()} />
      </>
    );
  }
  const borrar = accion === 'borrar';
  return (
    <>
      <Boton texto={borrar ? 'Borrar producto' : 'Ocultar de Stock'} variante="borde" onPress={alAbrir} />
      <Hoja
        visible={abierta}
        titulo={borrar ? `¿Borrar ${p.nombre}?` : `¿Ocultar ${p.nombre} de Stock?`}
        subtitulo={
          borrar
            ? 'Nunca se compró, así que no se pierde ningún gasto.'
            : 'Sus compras quedan guardadas, y lo podés volver a mostrar desde Stock › Ocultos.'
        }
        alCerrar={alCerrar}
        pie={
          <>
            <MensajeError texto={error} />
            <Boton texto={borrar ? 'Borrar' : 'Ocultar'} ocupado={ocupado} onPress={() => void hacer()} />
            <Boton texto="Cancelar" variante="borde" onPress={alCerrar} />
          </>
        }
      />
    </>
  );
}
