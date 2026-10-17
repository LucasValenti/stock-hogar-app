import tokens from './tokens.json';

// Luminancia relativa y razón de contraste según WCAG 2.x.
function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

const TEMAS = ['claro', 'oscuro'] as const;
const OBLIGATORIOS = ['fondo', 'superficie', 'texto', 'textoSuave', 'acento', 'sobreAcento', 'borde', 'foco', 'falta', 'hay', 'cerrado'];
// Grupos cuyas entradas son todas números (dp, sp, ms o razones sin unidad).
const NUMERICOS = ['tamano', 'peso', 'letra', 'espacio', 'medida', 'radio', 'opacidad'] as const;
// Colores que no son texto: piden 3:1 (WCAG 1.4.11); el resto pide 4,5:1.
const NO_TEXTO = ['borde', 'foco'];

// El JSON infiere `pares` como lista de listas mezcladas: acá se lo declara como tupla [texto, fondo, mínimo].
const pares = tokens.pares as unknown as [string, string, number][];
const radio: Record<string, number> = tokens.radio;
const medida: Record<string, number> = tokens.medida;
const espacio: Record<string, number> = tokens.espacio;
const movimiento: Record<string, number | string> = tokens.movimiento;

describe('tokens.json', () => {
  test('contraste sigue la fórmula WCAG 2.x', () => {
    expect(contraste('#000000', '#ffffff')).toBe(21);
    expect(contraste('#ffffff', '#000000')).toBe(21);
    expect(contraste('#336699', '#336699')).toBe(1);
    // Valor de referencia publicado: gris #767676 sobre blanco ronda 4,54:1.
    expect(Math.abs(contraste('#767676', '#ffffff') - 4.54)).toBeLessThan(0.01);
  });

  test('tiene la forma que importa la app', () => {
    expect(Object.keys(tokens).sort()).toEqual([
      'color', 'espacio', 'fuente', 'letra', 'medida', 'movimiento', 'opacidad', 'pares', 'peso', 'radio', 'sombra', 'tamano', 'velo',
    ]);
    expect(Object.keys(tokens.color).sort()).toEqual(['claro', 'oscuro']);

    for (const k of ['titulo', 'texto', 'numeros'] as const) {
      expect(typeof tokens.fuente[k]).toBe('string');
      expect(tokens.fuente[k].length).toBeGreaterThan(0);
    }
    expect(tokens.fuente.numerosTabulares).toBe(true);

    for (const grupo of NUMERICOS) {
      const entradas = Object.entries(tokens[grupo]);
      expect(entradas.length).toBeGreaterThan(0);
      for (const [paso, valor] of entradas) {
        expect({ grupo, paso, valido: Number.isFinite(valor) && valor >= 0 }).toEqual({ grupo, paso, valido: true });
      }
    }
    // tamano.xxs es la etiqueta de la barra.
    expect(tokens.tamano.xxs).toBe(11);

    for (const [paso, valor] of Object.entries(tokens.peso)) {
      const valido = Number.isInteger(valor) && valor >= 100 && valor <= 900 && valor % 100 === 0;
      expect({ paso, valor, valido }).toEqual({ paso, valor, valido: true });
    }
    for (const k of ['tarjeta', 'boton', 'chip', 'cargar', 'hoja', 'registro', 'tilde']) {
      expect({ k, valido: Number.isFinite(radio[k]) }).toEqual({ k, valido: true });
    }
    for (const k of ['fila', 'tactil', 'icono', 'pestana', 'indicadorAncho', 'indicadorAlto', 'cargar', 'iconoCargar', 'cargarSube',
      'iman', 'imanSobresale', 'tilde', 'tildeBorde', 'asaAncho', 'asaAlto', 'borde', 'bordeFuerte', 'focoGrosor', 'focoSeparacion']) {
      expect({ k, valido: Number.isFinite(medida[k]) && medida[k] > 0 }).toEqual({ k, valido: true });
    }
    // `fila` y `tactil` se mudaron de espacio a medida.
    for (const k of ['fila', 'tactil']) {
      expect(espacio[k]).toBeUndefined();
    }

    expect(Object.keys(tokens.sombra).sort()).toEqual(['cargar', 'iman', 'tarjeta']);
    for (const s of Object.values(tokens.sombra)) {
      expect(Number.isFinite(s.offsetY) && s.offsetY > 0).toBe(true);
      expect(s.opacidad).toBeGreaterThan(0);
      expect(s.opacidad).toBeLessThanOrEqual(1);
      // Las sombras son duras.
      expect(s.desenfoque).toBe(0);
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/);
    }

    expect(Object.keys(tokens.velo).sort()).toEqual(['claro', 'oscuro']);
    for (const valor of Object.values(tokens.velo)) {
      expect(valor).toMatch(/^rgba\(\d{1,3},\d{1,3},\d{1,3},(0|1|0?\.\d+)\)$/);
    }

    expect(tokens.opacidad.esqueletoMin).toBeLessThan(tokens.opacidad.esqueletoMax);
    expect(tokens.opacidad.esqueletoMax).toBeLessThanOrEqual(1);

    for (const k of ['rapido', 'normal', 'reducido', 'latido']) {
      const valor = movimiento[k];
      expect({ k, valido: typeof valor === 'number' && Number.isFinite(valor) && valor > 0 }).toEqual({ k, valido: true });
    }
    // El fundido reducido es más corto que la respuesta a un toque.
    expect(tokens.movimiento.reducido).toBeLessThan(tokens.movimiento.rapido);
    expect(tokens.movimiento.rapido).toBeLessThan(tokens.movimiento.normal);
    expect(tokens.movimiento.curva).toMatch(/^cubic-bezier\(\s*[\d.-]+(\s*,\s*[\d.-]+){3}\s*\)$/);

    expect(Array.isArray(tokens.pares)).toBe(true);
    expect(pares.length).toBeGreaterThan(0);
    for (const par of pares) {
      expect(par).toHaveLength(3);
      expect(typeof par[0]).toBe('string');
      expect(typeof par[1]).toBe('string');
      expect(typeof par[2]).toBe('number');
    }
  });

  test('claro y oscuro tienen los mismos nombres de color y los obligatorios', () => {
    const claro = Object.keys(tokens.color.claro).sort();
    const oscuro = Object.keys(tokens.color.oscuro).sort();
    expect(claro).toEqual(oscuro);
    for (const nombre of OBLIGATORIOS) {
      expect(claro).toContain(nombre);
    }
    for (const tema of TEMAS) {
      for (const [nombre, valor] of Object.entries(tokens.color[tema])) {
        expect({ tema, nombre, valor }).toEqual({ tema, nombre, valor: expect.stringMatching(/^#[0-9a-f]{6}$/) });
      }
    }
  });

  test('pares incluye los cruces que exige la accesibilidad', () => {
    const claves = pares.map(([t, f, min]) => `${t}|${f}|${min}`);
    for (const esperado of [
      ['texto', 'fondo', 4.5],
      ['textoSuave', 'superficie', 4.5],
      ['sobreAcento', 'acento', 4.5],
      ['borde', 'fondo', 3],
      ['borde', 'superficie', 3],
      ['foco', 'fondo', 3],
      ['foco', 'superficie', 3],
    ]) {
      expect(claves).toContain(esperado.join('|'));
    }
  });

  test('nadie baja los mínimos: bordes y foco 3:1, el resto 4,5:1', () => {
    for (const [texto, fondo, minimo] of pares) {
      const piso = NO_TEXTO.includes(texto) ? 3 : 4.5;
      expect({ texto, fondo, minimo, cumplePiso: minimo >= piso }).toEqual({ texto, fondo, minimo, cumplePiso: true });
    }
  });

  test('cada par cumple su contraste mínimo en claro y oscuro', () => {
    const fallas: string[] = [];
    for (const tema of TEMAS) {
      const colores: Record<string, string> = tokens.color[tema];
      for (const [texto, fondo, minimo] of pares) {
        if (!colores[texto] || !colores[fondo]) {
          fallas.push(`${tema}: no existe el color ${colores[texto] ? fondo : texto}`);
          continue;
        }
        const razon = contraste(colores[texto], colores[fondo]);
        if (razon < minimo) {
          fallas.push(`${tema}: ${texto} ${colores[texto]} sobre ${fondo} ${colores[fondo]} da ${razon.toFixed(2)}:1 y pide ${minimo}:1`);
        }
      }
    }
    expect(fallas).toEqual([]);
  });

  test('el blanco táctil y la fila miden al menos 48 dp', () => {
    expect(tokens.medida.tactil).toBeGreaterThanOrEqual(48);
    expect(tokens.medida.fila).toBeGreaterThanOrEqual(48);
  });

  test('el indicador de la pestaña activa contrasta y entra en una columna de 360 dp', () => {
    // La pestaña activa se distingue por forma (píldora llena), no solo por color: la píldora es `acento` sobre la barra (`superficie`).
    for (const tema of TEMAS) {
      const c = tokens.color[tema];
      expect(contraste(c.acento, c.superficie)).toBeGreaterThanOrEqual(3);
      expect(contraste(c.sobreAcento, c.acento)).toBeGreaterThanOrEqual(4.5);
    }
    const columna = (360 - 2 * tokens.espacio.s) / 5;
    expect(tokens.medida.indicadorAncho).toBeLessThanOrEqual(columna);
  });
});
