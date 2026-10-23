// Contraste de los colores de perfil (DESIGN.md, «El color de una persona vive solo en su inicial»): en claro
// y en oscuro, la inicial (`sobrePerfil`) tiene ≥ 4,5 : 1 sobre cada color, y el círculo ≥ 3 : 1 contra `superficie`.

import { COLORES_PERFIL } from '@/logica/perfil';

import tokens from './tokens.json';

type Tema = Record<string, string>;

const lineal = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
function luminancia(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * lineal(n >> 16) + 0.7152 * lineal((n >> 8) & 255) + 0.0722 * lineal(n & 255);
}
function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const clave = (color: string) => `perfil${color[0].toUpperCase()}${color.slice(1)}`;

describe.each(['claro', 'oscuro'] as const)('colores de perfil en %s', (tema) => {
  const t = tokens.color[tema] as Tema;

  test.each([...COLORES_PERFIL])('%s: la inicial ≥ 4,5 : 1 y el círculo ≥ 3 : 1 contra la superficie', (color) => {
    const fondo = t[clave(color)];
    expect(fondo).toMatch(/^#[0-9a-f]{6}$/);
    expect(contraste(t.sobrePerfil, fondo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(fondo, t.superficie)).toBeGreaterThanOrEqual(3);
  });
});
