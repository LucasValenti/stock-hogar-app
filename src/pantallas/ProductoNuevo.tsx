// Alta de un producto de Stock: nombre, marca, categoría y unidad (validarProducto). Arranca en 0, así
// que queda en pendientes hasta que se compre o se sume con +. Con `?nombre=&anotacion=` viene de una
// anotación rápida: arranca con su texto y, al crear el producto, la nota se borra.
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';

import { datos } from '@/datos';
import { mensajeError } from '@/logica/errores';
import type { Categoria } from '@/logica/tipos';
import { Aviso } from '@/ui/Aviso';
import { Boton } from '@/ui/Boton';
import { Encabezado } from '@/ui/Encabezado';
import { Esqueleto } from '@/ui/Esqueleto';
import { FormularioProducto, useValoresProducto, volverAStock } from '@/ui/FormularioProducto';
import { MensajeError } from '@/ui/MensajeError';
import { Pantalla } from '@/ui/Pantalla';
import { Tarjeta } from '@/ui/Tarjeta';

import estilos from './ProductoNuevo.module.css';

export function ProductoNuevo() {
  const [, navegar] = useLocation();
  const volver = useCallback(() => volverAStock(navegar), [navegar]);
  const parametros = useSearch();
  const { nombre, anotacion } = (() => {
    const p = new URLSearchParams(parametros);
    return { nombre: p.get('nombre') ?? '', anotacion: p.get('anotacion') || null };
  })();
  const [categorias, setCategorias] = useState<Categoria[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);
  const { valores, errores, cambiar, validar } = useValoresProducto({
    nombre,
    marca: '',
    categoriaId: null,
    unidad: 'unidad',
  });
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // El producto ya se creó pero la nota no se pudo borrar: no se ofrece crearlo de nuevo.
  const [creadoSinNota, setCreadoSinNota] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    setErrorCarga(null);
    datos
      .categorias()
      .then((c) => vigente && setCategorias(c))
      .catch((e: unknown) => vigente && setErrorCarga(e ?? new Error('sin datos')));
    return () => {
      vigente = false;
    };
  }, [intento]);

  async function crear() {
    setErrorGuardar(null);
    const r = validar();
    if (!r.ok) return;
    setGuardando(true);
    try {
      await datos.crearProducto(r.valor);
    } catch (e) {
      setErrorGuardar(mensajeError(e));
      setGuardando(false);
      return;
    }
    if (anotacion) {
      try {
        await datos.borrarAnotacion(anotacion);
      } catch {
        setGuardando(false);
        setCreadoSinNota(`${r.valor.nombre} ya está en Stock, pero la nota sigue anotada: borrala desde Stock.`);
        return;
      }
    }
    volver();
  }

  if (errorCarga !== null) {
    return (
      <Pantalla>
        <Encabezado titulo="Nuevo producto" alVolver={volver} />
        <Aviso
          alerta
          icono="nube"
          titulo="No pudimos traer las categorías"
          texto={mensajeError(errorCarga)}
          accion={{ texto: 'Reintentar', onClick: () => setIntento((n) => n + 1) }}
        />
      </Pantalla>
    );
  }
  if (!categorias) {
    return (
      <Pantalla ocupado>
        <Encabezado titulo="Nuevo producto" alVolver={volver} />
        <Esqueleto alto={48} />
        <Esqueleto alto={48} />
        <Esqueleto ancho="40%" alto={48} />
      </Pantalla>
    );
  }
  return (
    <Pantalla>
      <Encabezado titulo="Nuevo producto" alVolver={volver} />
      {anotacion ? <p className={estilos.sub}>Al crearlo, la nota se borra de pendientes.</p> : null}
      <FormularioProducto valores={valores} alCambiar={cambiar} errores={errores} categorias={categorias} bloqueado={creadoSinNota !== null} />
      {creadoSinNota ? (
        <Tarjeta className={estilos.aviso}>
          <p className={estilos.avisoTexto} role="alert" aria-live="polite">
            {creadoSinNota}
          </p>
          <Boton texto="Volver a Stock" onClick={volver} />
        </Tarjeta>
      ) : (
        <>
          <MensajeError texto={errorGuardar} />
          <Boton texto="Crear producto" ocupado={guardando} onClick={() => void crear()} />
        </>
      )}
    </Pantalla>
  );
}
