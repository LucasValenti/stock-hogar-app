// Un gasto en una lista (últimos gastos de Inicio, gastos del mes y Detalle de Análisis): qué fue
// (la categoría, o los productos de una compra vieja por productos), fecha, quién pagó y la nota, y el
// monto a la derecha. Tocarlo abre Cargar con ese gasto; si el mes está cerrado, Cargar lo muestra
// bloqueado, y acá la fila lleva el candado (DESIGN.md, Mes cerrado).
import { useLocation } from 'wouter';

import type { GastoConItems } from '@/datos/tipos';
import { tituloCompra } from '@/logica/analisis';
import { formatear } from '@/logica/dinero';
import { fechaCorta } from '@/logica/meses';

import estilos from './FilaGasto.module.css';
import { Fila } from '../Fila';
import { Icono } from '../Icono';
import { Monto } from '../Monto';

type Props = {
  gasto: GastoConItems;
  nombres: { integrantes: Map<string, string>; categorias: Map<string, string> };
  separador: boolean;
  cerrado?: boolean;
};

export function tituloGasto(g: GastoConItems, categorias: Map<string, string>): string {
  if (g.modo === 'productos') return tituloCompra(g.gasto_items);
  return (g.categoria_id && categorias.get(g.categoria_id)) || 'Gasto';
}

export function FilaGasto({ gasto: g, nombres, separador, cerrado = false }: Props) {
  const [, navegar] = useLocation();
  const quien = nombres.integrantes.get(g.pagado_por) ?? 'alguien que ya no está';
  const linea = `${fechaCorta(g.fecha)} · pagó ${quien}${g.nota ? ` · ${g.nota}` : ''}`;
  return (
    <Fila
      nombre={tituloGasto(g, nombres.categorias)}
      descripcion={`${linea}, ${formatear(g.total)}${cerrado ? ', mes cerrado' : ''}`}
      detalle={
        <span className={estilos.detalle}>
          {cerrado ? (
            <span className={estilos.candado}>
              <Icono nombre="candado" tamano={16} />
            </span>
          ) : null}
          <span className={estilos.linea}>{linea}</span>
        </span>
      }
      alTocar={() => navegar(`/cargar?id=${g.id}`)}
      separador={separador}
      derecha={<Monto centavos={g.total} tamano="fila" />}
    />
  );
}

export function mapaDeNombres(lista: Array<{ id: string; nombre: string }>): Map<string, string> {
  return new Map(lista.map((x) => [x.id, x.nombre]));
}
