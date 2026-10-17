import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
import { Rubik_400Regular } from '@expo-google-fonts/rubik/400Regular';
import { Rubik_500Medium } from '@expo-google-fonts/rubik/500Medium';
import { Rubik_600SemiBold } from '@expo-google-fonts/rubik/600SemiBold';
import { useFonts } from 'expo-font';

// Una familia por peso, igual que `peso` en tokens.json (en Android no alcanza con `fontWeight`).
// Se importa cada peso por separado para no empaquetar los que la app no usa.
export const FAMILIAS = {
  titulo: 'Fredoka_600SemiBold',
  texto: 'Rubik_400Regular',
  medio: 'Rubik_500Medium',
  fuerte: 'Rubik_600SemiBold',
  numeros: 'Rubik_600SemiBold',
} as const;

type Familia = (typeof FAMILIAS)[keyof typeof FAMILIAS];

const ARCHIVOS = {
  Fredoka_600SemiBold,
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
} satisfies Record<Familia, number>;

/** Carga las fuentes de la app. Devuelve `true` cuando ya se pueden usar, o cuando fallaron: la app sigue con la fuente del sistema. */
export function useFuentesCargadas(): boolean {
  const [cargadas, error] = useFonts(ARCHIVOS);
  return cargadas || error !== null;
}
