// npm audit de las dependencias (falla con vulnerabilidades altas o críticas). Es parte de `npm run verificar`.
// Dentro de `npm run`, el npm de adentro hereda `npm_config_allow_scripts` del ~/.npmrc del usuario como si
// fuera una opción de línea de comandos, y npm 11 lo rechaza en un proyecto (EALLOWSCRIPTS). Se corre sin esa
// variable; la configuración del proyecto (.npmrc) sigue valiendo.
import { spawnSync } from 'node:child_process';

const env = Object.fromEntries(Object.entries(process.env).filter(([clave]) => clave.toLowerCase() !== 'npm_config_allow_scripts'));
const r = spawnSync('npm', ['audit', '--audit-level=high'], { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
