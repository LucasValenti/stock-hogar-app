// Ficha de un producto: cuánto hay en casa, sus datos para editar (validarProducto) y la acción que
// corresponde (accionProducto): borrar lo que nunca se compró, ocultar lo que tiene compras y volver a
// mostrar lo oculto. Sin «Precios pagados» (spec 2.0). Cambiar la unidad no convierte el stock: si pasa
// a unidades o paquetes con decimales, se avisa y se ofrece redondear.
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useParams } from 'wouter';

import { datos } from '@/datos';
import { mensajeError } from '@/logica/errores';
import { accionProducto, cantidadConUnidad, formatearCantidad, redondeoPorUnidad } from '@/logica/stock';
import type { Categoria, Producto } from '@/logica/tipos';
import { Aviso } from '@/ui/Aviso';
import { Boton } from '@/ui/Boton';
import { Encabezado } from '@/ui/Encabezado';
import { Esqueleto } from '@/ui/Esqueleto';
import { FormularioProducto, NOMBRE_UNIDAD, useValoresProducto, volverAStock } from '@/ui/FormularioProducto';
import { Hoja } from '@/ui/Hoja';
import { MensajeError } from '@/ui/MensajeError';
import { Pantalla } from '@/ui/Pantalla';
import { Tarjeta } from '@/ui/Tarjeta';

import estilos from './Producto.module.css';

type Base = { producto: Producto; categorias: Categoria[]; tieneCompras: boolean };
type Carga = { estado: 'cargando' } | { estado: 'error'; error: unknown } | { estado: 'no-existe' } | { estado: 'listo'; base: Base };

export function Producto() {
  const [, navegar] = useLocation();
  const volver = useCallback(() => volverAStock(navegar), [navegar]);
  const { id } = useParams<{ id?: string }>();
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
        <Esqueleto alto={60} />
        <Esqueleto alto={48} />
        <Esqueleto alto={48} />
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
          accion={{ texto: 'Reintentar', onClick: () => setIntento((n) => n + 1) }}
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
          accion={{ texto: 'Volver a Stock', onClick: volver }}
        />
      </Pantalla>
    );
  }
  return <Ficha base={carga.base} volver={volver} />;
}

function Ficha({ base, volver }: { base: Base; volver(): void }) {
  const { producto: p, categorias, tieneCompras } = base;
  const { valores, errores, cambiar, validar } = useValoresProducto({
    nombre: p.nombre,
    marca: p.marca ?? '',
    categoriaId: p.categoria_id,
    unidad: p.unidad,
  });
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
      <Tarjeta className={estilos.datos}>
        <p className={estilos.fuerte}>{`En casa: ${cantidadConUnidad(p.stock, p.unidad)}`}</p>
        {p.oculto ? <p className={estilos.sub}>Oculto: no aparece en Stock ni en pendientes.</p> : null}
      </Tarjeta>

      <FormularioProducto valores={valores} alCambiar={cambiar} errores={errores} categorias={categorias} avisoUnidad={avisoUnidad} />

      <div className={estilos.acciones}>
        <MensajeError texto={errorGuardar} />
        <Boton texto="Guardar cambios" ocupado={guardando} onClick={pedirGuardar} />
        <AccionFicha
          producto={p}
          tieneCompras={tieneCompras}
          abierta={hoja === 'confirmar'}
          alAbrir={() => setHoja('confirmar')}
          alCerrar={() => setHoja(null)}
          volver={volver}
        />
      </div>

      {redondeo !== null ? (
        <Hoja
          visible={hoja === 'redondeo'}
          titulo="¿Redondeamos lo que hay?"
          subtitulo={`Hay ${cuanto} en casa: en ${NOMBRE_UNIDAD[valores.unidad].toLowerCase()} solo van números enteros.`}
          alCerrar={() => setHoja(null)}
          pie={
            <>
              <Boton texto={`Guardar y redondear a ${formatearCantidad(redondeo)}`} ocupado={guardando} onClick={() => void guardar(redondeo)} />
              <Boton texto={`Guardar con ${cuanto}`} variante="borde" onClick={() => void guardar(null)} />
              <Boton texto="Cancelar" variante="borde" onClick={() => setHoja(null)} />
            </>
          }
        />
      ) : null}
    </Pantalla>
  );
}

type PropsAccion = { producto: Producto; tieneCompras: boolean; abierta: boolean; alAbrir(): void; alCerrar(): void; volver(): void };

// Borrar lo que nunca se compró; ocultar lo que tiene compras (quedan guardadas); volver a mostrar lo oculto.
function AccionFicha({ producto: p, tieneCompras, abierta, alAbrir, alCerrar, volver }: PropsAccion) {
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
        <Boton texto="Volver a mostrar en Stock" variante="borde" ocupado={ocupado} onClick={() => void hacer()} />
      </>
    );
  }
  const borrar = accion === 'borrar';
  return (
    <>
      <Boton texto={borrar ? 'Borrar producto' : 'Ocultar de Stock'} variante="borde" onClick={alAbrir} />
      <Hoja
        visible={abierta}
        titulo={borrar ? `¿Borrar ${p.nombre}?` : `¿Ocultar ${p.nombre} de Stock?`}
        subtitulo={
          borrar ? 'Nunca se compró, así que no se pierde ningún gasto.' : 'Sus compras quedan guardadas, y lo podés volver a mostrar desde Stock › Ocultos.'
        }
        alCerrar={alCerrar}
        pie={
          <>
            <MensajeError texto={error} />
            <Boton texto={borrar ? 'Borrar' : 'Ocultar'} ocupado={ocupado} onClick={() => void hacer()} />
            <Boton texto="Cancelar" variante="borde" onClick={alCerrar} />
          </>
        }
      />
    </>
  );
}
