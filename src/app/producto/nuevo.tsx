// Alta de un producto de Stock: nombre, marca, categoría y unidad (validarProducto). Arranca en 0, así
// que queda en pendientes hasta que se compre o se sume con +. Con `?nombre=&anotacion=` viene de una
// anotación rápida: arranca con su texto y, al crear el producto, la nota se borra.

import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { datos } from '@/datos';
import { mensajeError } from '@/logica/errores';
import type { Categoria } from '@/logica/tipos';
import { useTema } from '@/tema/tema';
import { Aviso } from '@/ui/Aviso';
import { Boton } from '@/ui/Boton';
import { Encabezado } from '@/ui/Encabezado';
import { Esqueleto } from '@/ui/Esqueleto';
import { FormularioProducto, MensajeError, useValoresProducto, volverAStock as volver } from '@/ui/FormularioProducto';
import { Pantalla } from '@/ui/Pantalla';
import { Tarjeta } from '@/ui/Tarjeta';
import { Texto } from '@/ui/Texto';

const unTexto = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

export default function NuevoProducto() {
  const tema = useTema();
  const params = useLocalSearchParams<{ nombre?: string; anotacion?: string }>();
  const anotacion = unTexto(params.anotacion) || null;
  const [categorias, setCategorias] = useState<Categoria[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);
  const { valores, errores, cambiar, validar } = useValoresProducto({
    nombre: unTexto(params.nombre),
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
          accion={{ texto: 'Reintentar', onPress: () => setIntento((n) => n + 1) }}
        />
      </Pantalla>
    );
  }
  if (!categorias) {
    return (
      <Pantalla ocupado>
        <Encabezado titulo="Nuevo producto" alVolver={volver} />
        <Esqueleto alto={tema.medida.tactil} />
        <Esqueleto alto={tema.medida.tactil} />
        <Esqueleto ancho="40%" alto={tema.medida.tactil} />
      </Pantalla>
    );
  }
  return (
    <Pantalla>
      <Encabezado titulo="Nuevo producto" alVolver={volver} />
      {anotacion ? <Texto variante="sub">Al crearlo, la nota se borra de pendientes.</Texto> : null}
      <FormularioProducto valores={valores} alCambiar={cambiar} errores={errores} categorias={categorias} bloqueado={creadoSinNota !== null} />
      {creadoSinNota ? (
        <Tarjeta>
          <Texto accessibilityRole="alert" accessibilityLiveRegion="polite">
            {creadoSinNota}
          </Texto>
          <Boton texto="Volver a Stock" onPress={volver} />
        </Tarjeta>
      ) : (
        <>
          <MensajeError texto={errorGuardar} />
          <Boton texto="Crear producto" ocupado={guardando} onPress={() => void crear()} />
        </>
      )}
    </Pantalla>
  );
}
