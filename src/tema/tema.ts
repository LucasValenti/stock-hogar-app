import { useEffect, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';

import tokens from './tokens.json';

type NombreTema = 'claro' | 'oscuro';

export type NombreColor = keyof typeof tokens.color.claro;

// Todo valor visual de la app sale de acá, y acá sale de tokens.json.
export type Tema = {
  color: Record<NombreColor, string>;
  fuente: typeof tokens.fuente;
  tamano: typeof tokens.tamano;
  espacio: typeof tokens.espacio;
  medida: typeof tokens.medida;
  radio: typeof tokens.radio;
  sombra: typeof tokens.sombra;
  velo: string;
  movimiento: typeof tokens.movimiento;
  peso: typeof tokens.peso;
  letra: typeof tokens.letra;
  opacidad: typeof tokens.opacidad;
};

function crearTema(nombre: NombreTema): Tema {
  return {
    color: tokens.color[nombre],
    fuente: tokens.fuente,
    tamano: tokens.tamano,
    espacio: tokens.espacio,
    medida: tokens.medida,
    radio: tokens.radio,
    sombra: tokens.sombra,
    velo: tokens.velo[nombre],
    movimiento: tokens.movimiento,
    peso: tokens.peso,
    letra: tokens.letra,
    opacidad: tokens.opacidad,
  };
}

const CLARO = crearTema('claro');
const OSCURO = crearTema('oscuro');

/** Tema para un esquema del sistema. Es pura: sin esquema (`null`) devuelve el claro. */
export function temaPara(esquema: 'light' | 'dark' | null): Tema {
  return esquema === 'dark' ? OSCURO : CLARO;
}

/**
 * Tema que sigue el esquema claro/oscuro del sistema.
 * En la web el servidor arma el HTML sin saber el esquema del navegador: hasta hidratar se usa el claro,
 * igual que el servidor, para que el HTML coincida; en el teléfono no hay servidor y sigue al sistema desde el primer cuadro.
 */
export function useTema(): Tema {
  const [hidratado, setHidratado] = useState(Platform.OS !== 'web');
  useEffect(() => setHidratado(true), []);
  const sistema = useColorScheme();
  const esquema = hidratado ? sistema : null;
  return temaPara(esquema === 'dark' || esquema === 'light' ? esquema : null);
}
