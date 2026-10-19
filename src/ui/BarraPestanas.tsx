// Barra de pestañas «Heladera» (DESIGN.md, Barra de pestañas y + Cargar):
// Inicio · Stock · + Cargar · Análisis · Ajustes, cinco columnas iguales sobre `superficie`.
// La activa lleva etiqueta en `acento` y una píldora llena detrás del ícono (forma, no solo color)
// y `aria-current="page"`. + Cargar es un imán que sobresale de la barra.
import { Link, useLocation } from 'wouter';

import estilos from './BarraPestanas.module.css';
import { Icono, type NombreIcono } from './Icono';

const PESTANAS: Array<{ ruta: string; etiqueta: string; icono: NombreIcono }> = [
  { ruta: '/', etiqueta: 'Inicio', icono: 'casa' },
  { ruta: '/stock', etiqueta: 'Stock', icono: 'caja' },
  { ruta: '/analisis', etiqueta: 'Análisis', icono: 'graf' },
  { ruta: '/ajustes', etiqueta: 'Ajustes', icono: 'ajus' },
];

export function BarraPestanas() {
  const [ubicacion] = useLocation();
  const pestana = (i: number) => {
    const p = PESTANAS[i];
    const activa = ubicacion === p.ruta;
    return (
      <li key={p.ruta} className={estilos.celda}>
        <Link href={p.ruta} className={estilos.pestana} aria-current={activa ? 'page' : undefined}>
          <span className={estilos.indicador}>
            <Icono nombre={p.icono} tamano={20} />
          </span>
          <span className={estilos.etiqueta}>{p.etiqueta}</span>
        </Link>
      </li>
    );
  };

  return (
    <nav className={estilos.barra} aria-label="Secciones">
      <ul className={estilos.lista} role="list">
        {pestana(0)}
        {pestana(1)}
        <li className={estilos.celda}>
          <Link href="/cargar" className={estilos.cargar} aria-label="Cargar gasto">
            <Icono nombre="mas" tamano={26} grueso />
          </Link>
        </li>
        {pestana(2)}
        {pestana(3)}
      </ul>
    </nav>
  );
}
