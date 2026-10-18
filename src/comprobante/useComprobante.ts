// «Subir comprobante» en Cargar: elige una imagen de la galería, la lee en el dispositivo y pasa lo leído
// al formulario. El OCR no está en Expo Go: ahí solo avisa. Si la pantalla se va mientras lee, no toca nada.

import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';

import { datos } from '@/datos';
import { extraerComprobante } from '@/logica/comprobante';
import type { DatosComprobante } from '@/logica/comprobante';
import { lecturaAFormulario, sinRepetido } from '@/logica/lectura';
import type { CambiosLectura } from '@/logica/lectura';
import { fechaCorta } from '@/logica/meses';

import { MAX_BYTES, OcrNoDisponible, leerTexto } from './ocr';

const AVISO_GRANDE = 'La imagen pesa más de 15 MB. Probá con una captura más chica.';
const AVISO_TIPO = 'Ese archivo no es una imagen. Probá con una captura del comprobante.';
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
  useEffect(
    () => () => {
      vigente.current = false;
    },
    [],
  );

  const usar = useCallback(
    async (uri: string, bytes?: number, tipo?: string) => {
      if ((bytes ?? 0) > MAX_BYTES) {
        setAviso(AVISO_GRANDE);
        return;
      }
      if (tipo && !tipo.startsWith('image/')) {
        setAviso(AVISO_TIPO);
        return;
      }
      const n = ++intento.current;
      setAviso(null);
      setLeyendo(true);
      let r: DatosComprobante | null = null;
      try {
        r = extraerComprobante(await leerTexto(uri));
      } catch (e) {
        if (e instanceof OcrNoDisponible) {
          if (vigente.current && n === intento.current) {
            setLeyendo(false);
            setAviso(AVISO_EXPO_GO);
          }
          return;
        }
        r = null;
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

  const elegir = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    await usar(a.uri, a.fileSize, a.mimeType);
  }, [usar]);

  return { elegir, usar, leyendo, aviso };
}
