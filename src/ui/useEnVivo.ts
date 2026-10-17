// Datos que se piden al entrar y otra vez cuando alguien cambia algo en la casa: una sola vez por tanda
// de avisos, y sin que una respuesta vieja pise a una nueva (ver datos/recarga.ts). Lo usan Inicio y Análisis.

import { useCallback, useEffect, useRef, useState } from 'react';

import { datos } from '@/datos';
import { crearRecarga, type Recarga } from '@/datos/recarga';

export type CargaEnVivo<T> = { estado: 'cargando' } | { estado: 'error'; error: unknown } | { estado: 'listo'; valor: T };

/**
 * `clave` dice cuándo son otros datos (otro mes, otras fechas): ahí vuelve a «cargando» y pide de nuevo.
 * `pedir` puede cambiar en cada render; se usa siempre el último.
 */
export function useEnVivo<T>(pedir: () => Promise<T>, clave: string) {
  const [carga, setCarga] = useState<CargaEnVivo<T>>({ estado: 'cargando' });
  const recarga = useRef<Recarga | null>(null);
  const ultimoPedir = useRef(pedir);
  ultimoPedir.current = pedir;

  useEffect(() => {
    setCarga({ estado: 'cargando' });
    const r = crearRecarga({
      pedir: () => ultimoPedir.current(),
      alTener: (valor: T) => setCarga({ estado: 'listo', valor }),
      // Si ya había datos en pantalla, una actualización fallida no los borra.
      alFallar: (error) => setCarga((previa) => (previa.estado === 'listo' ? previa : { estado: 'error', error })),
    });
    recarga.current = r;
    r.ahora();
    let dejar: (() => void) | undefined;
    try {
      dejar = datos.escucharCambios(() => r.pronto());
    } catch {
      // Sin configuración: el error ya llega por el pedido.
    }
    return () => {
      r.cancelar();
      dejar?.();
    };
  }, [clave]);

  /** Después de un error: vuelve a «cargando» y pide. */
  const reintentar = useCallback(() => {
    setCarga({ estado: 'cargando' });
    recarga.current?.ahora();
  }, []);

  /** Pide ya, dejando a la vista lo que hay (después de cerrar un mes, por ejemplo). */
  const recargar = useCallback(() => recarga.current?.ahora(), []);

  return { carga, reintentar, recargar };
}
