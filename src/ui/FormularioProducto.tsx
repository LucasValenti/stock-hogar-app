// Los campos de un producto, iguales en el alta y en la ficha: nombre, marca (opcional), categoría
// (chip con flecha → hoja, solo categorías de productos) y cómo se cuenta (unidad). Los errores son los
// de validarProducto; `avisoUnidad` explica lo que pasa con el stock al cambiar la unidad.
import { useState } from 'react';

import type { Categoria, Unidad } from '@/logica/tipos';
import { validarProducto, type ErroresProducto, type ResultadoProducto } from '@/logica/validar';

import { Campo } from './Campo';
import { Chip } from './Chip';
import { EstadoVacio } from './EstadoVacio';
import { Hoja } from './Hoja';
import { MensajeError } from './MensajeError';
import { volver } from './volver';
import estilos from './FormularioProducto.module.css';

export { MensajeError };

export type ValoresProducto = { nombre: string; marca: string; categoriaId: string | null; unidad: Unidad };

/** Cómo se lee cada unidad en las opciones. */
export const NOMBRE_UNIDAD: Record<Unidad, string> = { unidad: 'Unidades', paquete: 'Paquetes', kg: 'Kilos', litro: 'Litros' };
const UNIDADES: Unidad[] = ['unidad', 'paquete', 'kg', 'litro'];

type Navegar = (ruta: string) => void;

/** Al terminar en el alta o la ficha: atrás si se vino desde la app; si se entró directo, a Stock. */
export function volverAStock(navegar: Navegar) {
  volver(navegar, '/stock');
}

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
  const [eligiendo, setEligiendo] = useState(false);
  // Los servicios (luz, internet) no tienen stock; la categoría actual se conserva aunque lo sea.
  const opciones = categorias.filter((c) => c.tipo === 'producto' || c.id === valores.categoriaId);
  const categoria = categorias.find((c) => c.id === valores.categoriaId);
  const nombreCategoria = categoria?.nombre ?? 'Elegí una';

  return (
    <div className={estilos.formulario}>
      <Campo etiqueta="Nombre" value={valores.nombre} onChange={(e) => alCambiar({ nombre: e.target.value })} error={errores.nombre} bloqueado={bloqueado} />
      <Campo
        etiqueta="Marca (opcional)"
        value={valores.marca}
        onChange={(e) => alCambiar({ marca: e.target.value })}
        bloqueado={bloqueado}
      />

      <div className={estilos.grupo}>
        <p className={estilos.rotulo}>Categoría</p>
        <div className={estilos.chips}>
          <Chip
            texto={nombreCategoria}
            aria-label={`Categoría: ${nombreCategoria}`}
            flecha
            bloqueado={bloqueado}
            onClick={() => setEligiendo(true)}
          />
        </div>
        <MensajeError texto={errores.categoria_id} />
      </div>

      <div className={estilos.grupo}>
        <p className={estilos.rotulo}>Cómo se cuenta</p>
        <div className={estilos.chips} role="group" aria-label="Cómo se cuenta">
          {UNIDADES.map((u) => (
            <Chip key={u} texto={NOMBRE_UNIDAD[u]} activo={valores.unidad === u} bloqueado={bloqueado} onClick={() => alCambiar({ unidad: u })} />
          ))}
        </div>
        <MensajeError texto={errores.unidad} />
        {avisoUnidad ? (
          <p className={estilos.ayuda} aria-live="polite">
            {avisoUnidad}
          </p>
        ) : (
          <p className={estilos.ayuda}>Kilos y litros admiten decimales (1,5); unidades y paquetes, solo enteros.</p>
        )}
      </div>

      <Hoja visible={eligiendo} titulo="Categoría" alCerrar={() => setEligiendo(false)}>
        {opciones.length ? (
          <div className={estilos.chips} role="group" aria-label="Categoría">
            {opciones.map((c) => (
              <Chip
                key={c.id}
                texto={c.nombre}
                activo={c.id === valores.categoriaId}
                onClick={() => {
                  alCambiar({ categoriaId: c.id });
                  setEligiendo(false);
                }}
              />
            ))}
          </div>
        ) : (
          <EstadoVacio icono="nota" titulo="No hay categorías de productos" texto="Creá una en Ajustes y aparece acá." />
        )}
      </Hoja>
    </div>
  );
}
