// Puente al módulo nativo propio (Android). Con `requireOptionalNativeModule`, en web, en Jest y en
// Expo Go devuelve null en vez de romper al importar: cada lugar avisa si no está.
import { requireOptionalNativeModule } from 'expo-modules-core';

/** Un comprobante compartido desde otra app, ya copiado a la caché de esta. */
export type ArchivoCompartido = { uri: string; tipo: string; bytes: number };

type Suscripcion = { remove(): void };

export type ComprobanteNativoModulo = {
  /** Texto de un PDF, leído en el dispositivo. */
  textoDePdf(uri: string): Promise<string>;
  /** El comprobante compartido, una sola vez; después null. */
  tomarCompartido(): ArchivoCompartido | null;
  /** Avisa cuando llega un comprobante nuevo con la app abierta. */
  addListener(evento: 'onCompartido', escuchar: () => void): Suscripcion;
};

export const ComprobanteNativo = requireOptionalNativeModule<ComprobanteNativoModulo>('ComprobanteNativo');
