// Los campos de un producto, iguales en el alta y en la ficha: nombre, marca (opcional), categoría
// (chip con flecha → hoja, solo categorías de productos) y cómo se cuenta (unidad). Los errores son los
// de validarProducto; `avisoUnidad` explica lo que pasa con el stock al cambiar la unidad.

import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { Categoria, Unidad } from '@/logica/tipos';
import { validarProducto, type ErroresProducto, type ResultadoProducto } from '@/logica/validar';
import { useTema } from '@/tema/tema';

import { Campo } from './Campo';
import { Chip } from './Chip';
import { EstadoVacio } from './EstadoVacio';
import { Hoja } from './Hoja';
import { Texto } from './Texto';

export type ValoresProducto = { nombre: string; marca: string; categoriaId: string | null; unidad: Unidad };

/** Cómo se lee cada unidad en las opciones. */
export const NOMBRE_UNIDAD: Record<Unidad, string> = { unidad: 'Unidades', paquete: 'Paquetes', kg: 'Kilos', litro: 'Litros' };
const UNIDADES: Unidad[] = ['unidad', 'paquete', 'kg', 'litro'];

/** Al terminar en el alta o la ficha: atrás si se puede; si se entró directo, a Stock. */
export const volverAStock = () => (router.canGoBack() ? router.back() : router.replace('/stock'));

/**
 * El estado del formulario: los valores, `cambiar` (que borra el error del campo que se toca) y
 * `validar` (validarProducto: muestra los errores y devuelve el resultado con el valor listo para guardar).
 */
export function useValoresProducto(inicial: ValoresProducto) {
  const [valores, setValores] = useState<ValoresProducto>(inicial);
  const [errores, setErrores] = useState<ErroresProducto>({});

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

  function validar(): ResultadoProducto {
    const r = validarProducto({ nombre: valores.nombre, marca: valores.marca, categoria_id: valores.categoriaId, unidad: valores.unidad });
    setErrores(r.errores);
    return r;
  }

  return { valores, errores, cambiar, validar };
}

type Props = {
  valores: ValoresProducto;
  alCambiar(cambio: Partial<ValoresProducto>): void;
  errores: ErroresProducto;
  categorias: Categoria[];
  avisoUnidad?: string | null;
  bloqueado?: boolean;
};

export function FormularioProducto({ valores, alCambiar, errores, categorias, avisoUnidad, bloqueado = false }: Props) {
  const tema = useTema();
  const [eligiendo, setEligiendo] = useState(false);
  // Los servicios (luz, internet) no tienen stock; la categoría actual se conserva aunque lo sea.
  const opciones = categorias.filter((c) => c.tipo === 'producto' || c.id === valores.categoriaId);
  const categoria = categorias.find((c) => c.id === valores.categoriaId);
  const nombreCategoria = categoria?.nombre ?? 'Elegí una';

  return (
    <>
      <Campo etiqueta="Nombre" valor={valores.nombre} alCambiar={(nombre) => alCambiar({ nombre })} error={errores.nombre} bloqueado={bloqueado} />
      <Campo
        etiqueta="Marca (opcional)"
        valor={valores.marca}
        alCambiar={(marca) => alCambiar({ marca })}
        bloqueado={bloqueado}
      />

      <View style={{ gap: tema.espacio.xs }}>
        <Texto variante="rotulo">Categoría</Texto>
        <View style={{ flexDirection: 'row' }}>
          <Chip
            texto={nombreCategoria}
            accessibilityLabel={`Categoría: ${nombreCategoria}`}
            flecha
            bloqueado={bloqueado}
            onPress={() => setEligiendo(true)}
          />
        </View>
        <MensajeError texto={errores.categoria_id} />
      </View>

      <View style={{ gap: tema.espacio.xs }}>
        <Texto variante="rotulo">Cómo se cuenta</Texto>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Cómo se cuenta"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tema.espacio.s }}
        >
          {UNIDADES.map((u) => (
            <Chip key={u} texto={NOMBRE_UNIDAD[u]} activo={valores.unidad === u} bloqueado={bloqueado} onPress={() => alCambiar({ unidad: u })} />
          ))}
        </View>
        <MensajeError texto={errores.unidad} />
        {avisoUnidad ? (
          <Texto variante="sub" accessibilityLiveRegion="polite">
            {avisoUnidad}
          </Texto>
        ) : (
          <Texto variante="sub">Kilos y litros admiten decimales (1,5); unidades y paquetes, solo enteros.</Texto>
        )}
      </View>

      <Hoja visible={eligiendo} titulo="Categoría" alCerrar={() => setEligiendo(false)}>
        {opciones.length ? (
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tema.espacio.s }}>
            {opciones.map((c) => (
              <Chip
                key={c.id}
                texto={c.nombre}
                activo={c.id === valores.categoriaId}
                onPress={() => {
                  alCambiar({ categoriaId: c.id });
                  setEligiendo(false);
                }}
              />
            ))}
          </View>
        ) : (
          <EstadoVacio icono="nota" titulo="No hay categorías de productos" texto="Creá una en Ajustes y aparece acá." />
        )}
      </Hoja>
    </>
  );
}

/** Mensaje de error de un campo o de una acción: se anuncia al aparecer. */
export function MensajeError({ texto }: { texto?: string | null }) {
  if (!texto) return null;
  return (
    <Texto variante="sub" color="falta" accessibilityRole="alert" accessibilityLiveRegion="polite">
      {texto}
    </Texto>
  );
}
