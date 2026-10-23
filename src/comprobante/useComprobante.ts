// «Subir comprobante» en Cargar: elige una imagen o un PDF, lo lee en el dispositivo y pasa lo leído
// al formulario. El archivo lo elige la pantalla con un input tipo file y acá se le da una URL local.
// Si la pantalla se va mientras lee, no toca nada.

import { useCallback, useEffect, useRef, useState } from 'react';

import { datos } from '@/datos';
import { extraerComprobante } from '@/logica/comprobante';
import type { DatosComprobante } from '@/logica/comprobante';
import { lecturaAFormulario, sinRepetido } from '@/logica/lectura';
import type { CambiosLectura } from '@/logica/lectura';
import { fechaCorta } from '@/logica/meses';

import { leerArchivo } from './leer';
import { MAX_BYTES, OcrNoDisponible } from './ocr';

const AVISO_GRANDE = 'La imagen pesa más de 15 MB. Probá con una captura más chica.';
const AVISO_TIPO = 'Ese archivo no es una imagen ni un PDF. Probá con el comprobante de Mercado Pago.';
const AVISO_NO_LEIDO = 'No pudimos abrir esa imagen. Probá con una captura del comprobante.';
const AVISO_EXPO_GO = 'Para leer comprobantes instalá la app (APK); en Expo Go no se puede.';

type Opciones = {
  integrantes: { id: string; nombre: string }[];
  notaActual: () => string;
  aplicar: (c: CambiosLectura, categoriaSugerida: string | null) => void;
};

export function useComprobante({ integrantes, notaActual, aplicar }: Opciones) {
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Cada lectura lleva un número: la última gana; una vieja (o una pantalla que se fue) no toca nada.
  const intento = useRef(0);
  const vigente = useRef(true);
  // La URL local del archivo elegido: se libera al terminar de leer o al salir de la pantalla.
  const url = useRef<string | null>(null);
  const liberar = useCallback((actual: string) => {
    if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(actual);
  }, []);
  useEffect(
    () => () => {
      vigente.current = false;
      if (url.current) {
        liberar(url.current);
        url.current = null;
      }
    },
    [liberar],
  );

  const usar = useCallback(
    async (uri: string, bytes?: number, tipo?: string) => {
      if ((bytes ?? 0) > MAX_BYTES) {
        setAviso(AVISO_GRANDE);
        return;
      }
      if (tipo && !tipo.startsWith('image/') && tipo !== 'application/pdf') {
        setAviso(AVISO_TIPO);
        return;
      }
      const n = ++intento.current;
      setAviso(null);
      setLeyendo(true);
      let r: DatosComprobante | null = null;
      try {
        r = extraerComprobante(await leerArchivo({ uri, tipo, bytes }));
      } catch (e) {
        if (e instanceof OcrNoDisponible) {
          if (vigente.current && n === intento.current) {
            setLeyendo(false);
            setAviso(AVISO_EXPO_GO);
          }
          return;
        }
      }
      if (!vigente.current || n !== intento.current) return;
      setLeyendo(false);
      if (r === null) {
        setAviso(AVISO_NO_LEIDO);
        return;
      }
      const cambios = lecturaAFormulario(r, integrantes, notaActual());
      if (cambios.aviso.tipo === 'nada') {
        setAviso(cambios.aviso.texto);
        return;
      }
      const operacion = cambios.comprobante?.operacion ?? null;
      const destino = cambios.comprobante?.destino ?? null;
      // Si la consulta falla, se sigue sin sugerencia: la base igual frena el duplicado al guardar.
      const [repetido, categoria] = await Promise.all([
        operacion ? datos.gastoPorOperacion(operacion).catch(() => null) : Promise.resolve(null),
        destino ? datos.categoriaDeDestino(destino).catch(() => null) : Promise.resolve(null),
      ]);
      if (!vigente.current || n !== intento.current) return;
      if (repetido) {
        const quien = integrantes.find((i) => i.id === repetido.pagado_por)?.nombre ?? '—';
        aplicar(sinRepetido(cambios), categoria);
        setAviso(`Este comprobante ya se cargó el ${fechaCorta(repetido.fecha)} (pagó ${quien}).`);
        return;
      }
      aplicar(cambios, categoria);
      setAviso(cambios.aviso.texto);
    },
    [integrantes, notaActual, aplicar],
  );

  const elegir = useCallback(
    async (archivo: File) => {
      if (url.current) liberar(url.current);
      const actual = URL.createObjectURL(archivo);
      url.current = actual;
      try {
        await usar(actual, archivo.size, archivo.type);
      } finally {
        if (url.current === actual) {
          liberar(actual);
          url.current = null;
        }
      }
    },
    [usar, liberar],
  );

  return { elegir, usar, leyendo, aviso };
}
