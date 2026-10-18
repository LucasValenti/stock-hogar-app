// Lee el texto de una imagen en el dispositivo con ML Kit (Android/iOS). Nada sale del teléfono.
import { NativeModules } from 'react-native';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { MAX_BYTES, OcrNoDisponible } from './ocr.comun';

export { MAX_BYTES, OcrNoDisponible };

export async function leerTexto(uri: string): Promise<string> {
  // Expo Go no trae el módulo nativo: avisamos al usarlo en vez de romper al importar.
  if (!NativeModules.TextRecognition) {
    throw new OcrNoDisponible('El reconocimiento de texto necesita la app instalada, no anda en Expo Go.');
  }
  const { text } = await TextRecognition.recognize(uri);
  return text;
}
