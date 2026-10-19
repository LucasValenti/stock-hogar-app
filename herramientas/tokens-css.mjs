// Vuelca src/tema/tokens.json a variables CSS en src/tema/tokens.css (se commitea).
//
// Uso: npm run tokens
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** camelCase → kebab-case (textoSuave → texto-suave). */
function nombre(clave) {
  return clave.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/** Sombra con el formato de la maqueta: `0 <offsetY>px <desenfoque>px rgb(0 0 0 / <opacidad>)`. */
function sombra(valor) {
  return `0 ${valor.offsetY}px ${valor.desenfoque}px rgb(0 0 0 / ${valor.opacidad})`;
}

/** Devuelve el texto de tokens.css a partir del objeto de tokens. Función pura. */
export function armarCss(tokens) {
  const colorClaro = Object.entries(tokens.color.claro).map(([k, v]) => `--color-${nombre(k)}: ${v};`);
  const colorOscuro = Object.entries(tokens.color.oscuro).map(([k, v]) => `--color-${nombre(k)}: ${v};`);

  const tamano = Object.entries(tokens.tamano).map(([k, v]) => `--tamano-${nombre(k)}: ${v}px;`);
  const peso = Object.entries(tokens.peso).map(([k, v]) => `--peso-${nombre(k)}: ${v};`);
  const espacio = Object.entries(tokens.espacio).map(([k, v]) => `--espacio-${nombre(k)}: ${v}px;`);
  const medida = Object.entries(tokens.medida).map(([k, v]) => `--medida-${nombre(k)}: ${v}px;`);
  const radio = Object.entries(tokens.radio).map(([k, v]) => `--radio-${nombre(k)}: ${v}px;`);

  const letra = [
    `--interlineado-titulo: ${tokens.letra.interlineadoTitulo};`,
    `--interlineado-texto: ${tokens.letra.interlineadoTexto};`,
    `--interlineado-total: ${tokens.letra.interlineadoTotal};`,
    `--rastro-rotulo: ${tokens.letra.rastroRotulo}em;`,
  ];

  const movimiento = [
    `--mov-rapido: ${tokens.movimiento.rapido}ms;`,
    `--mov-normal: ${tokens.movimiento.normal}ms;`,
    `--mov-reducido: ${tokens.movimiento.reducido}ms;`,
    `--mov-latido: ${tokens.movimiento.latido}ms;`,
    `--mov-curva: ${tokens.movimiento.curva};`,
  ];

  const resto = [
    `--opacidad-esqueleto-min: ${tokens.opacidad.esqueletoMin};`,
    `--opacidad-esqueleto-max: ${tokens.opacidad.esqueletoMax};`,
    `--sombra-tarjeta: ${sombra(tokens.sombra.tarjeta)};`,
    `--sombra-iman: ${sombra(tokens.sombra.iman)};`,
    `--sombra-cargar: ${sombra(tokens.sombra.cargar)};`,
    `--fuente-titulo: '${tokens.fuente.titulo}', system-ui, sans-serif;`,
    `--fuente-texto: '${tokens.fuente.texto}', system-ui, sans-serif;`,
  ];

  // El velo cambia con el tema; el resto de los tokens no.
  const raizClara = [...colorClaro, `--velo: ${tokens.velo.claro};`, ...tamano, ...peso, ...espacio, ...medida, ...radio, ...letra, ...movimiento, ...resto];
  const raizOscura = [...colorOscuro, `--velo: ${tokens.velo.oscuro};`];

  const sangrar = (lineas, sangria) => lineas.map((linea) => `${sangria}${linea}`);

  return [
    '/* Generado por herramientas/tokens-css.mjs desde src/tema/tokens.json. No editar a mano. */',
    ':root {',
    ...sangrar(raizClara, '  '),
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root {',
    ...sangrar(raizOscura, '    '),
    '  }',
    '}',
    '',
  ].join('\n');
}

function principal() {
  const rutaTokens = join(raiz, 'src', 'tema', 'tokens.json');
  const tokens = JSON.parse(readFileSync(rutaTokens, 'utf8'));
  writeFileSync(join(raiz, 'src', 'tema', 'tokens.css'), armarCss(tokens));
  console.log('Listo: src/tema/tokens.css');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
