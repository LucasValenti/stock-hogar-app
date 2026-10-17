import tokens from './tokens.json';
import { temaPara } from './tema';

describe('temaPara', () => {
  test("'dark' devuelve los colores del tema oscuro", () => {
    const tema = temaPara('dark');
    expect(tema.color.fondo).toBe(tokens.color.oscuro.fondo);
    expect(tema.color).toEqual(tokens.color.oscuro);
    expect(tema.velo).toBe(tokens.velo.oscuro);
  });

  test("'light' devuelve los colores del tema claro", () => {
    const tema = temaPara('light');
    expect(tema.color.fondo).toBe(tokens.color.claro.fondo);
    expect(tema.color).toEqual(tokens.color.claro);
    expect(tema.velo).toBe(tokens.velo.claro);
  });

  test('null cae al tema claro', () => {
    const tema = temaPara(null);
    expect(tema.color.fondo).toBe(tokens.color.claro.fondo);
    expect(tema).toBe(temaPara('light'));
  });

  test('los dos temas tienen las mismas claves, a todo nivel', () => {
    const claro = temaPara('light');
    const oscuro = temaPara('dark');
    expect(Object.keys(claro).sort()).toEqual(Object.keys(oscuro).sort());
    expect(Object.keys(claro.color).sort()).toEqual(Object.keys(oscuro.color).sort());
  });

  test('lo que no cambia con el esquema es el mismo en claro y oscuro', () => {
    const claro = temaPara('light');
    const oscuro = temaPara('dark');
    expect(oscuro.fuente).toEqual(claro.fuente);
    expect(oscuro.tamano).toEqual(claro.tamano);
    expect(oscuro.espacio).toEqual(claro.espacio);
    expect(oscuro.medida).toEqual(claro.medida);
    expect(oscuro.radio).toEqual(claro.radio);
    expect(oscuro.sombra).toEqual(claro.sombra);
    expect(oscuro.movimiento).toEqual(claro.movimiento);
    expect(oscuro.peso).toEqual(claro.peso);
    expect(oscuro.letra).toEqual(claro.letra);
    expect(oscuro.opacidad).toEqual(claro.opacidad);
  });
});
