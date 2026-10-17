// Un gasto en una lista (últimos gastos de Inicio, gastos del mes y Detalle de Análisis): qué fue
// (la categoría, o los productos de una compra vieja por productos), fecha, quién pagó y la nota, y el
// monto a la derecha. Tocarlo abre Cargar con ese gasto; si el mes está cerrado, Cargar lo muestra
// bloqueado, y acá la fila lleva el candado (DESIGN.md, Mes cerrado).

import { router } from 'expo-router';
import { View } from 'react-native';

import type { GastoConItems } from '@/datos/tipos';
import { tituloCompra } from '@/logica/analisis';
import { formatear } from '@/logica/dinero';
import { fechaCorta } from '@/logica/meses';
import { useTema } from '@/tema/tema';

import { Fila } from '../Fila';
import { Icono } from '../Icono';
import { Monto } from '../Monto';
import { Texto } from '../Texto';

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
  const tema = useTema();
  const quien = nombres.integrantes.get(g.pagado_por) ?? 'alguien que ya no está';
  const linea = `${fechaCorta(g.fecha)} · pagó ${quien}${g.nota ? ` · ${g.nota}` : ''}`;
  return (
    <Fila
      nombre={tituloGasto(g, nombres.categorias)}
      descripcion={`${linea}, ${formatear(g.total)}${cerrado ? ', mes cerrado' : ''}`}
      detalle={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tema.espacio.xs }}>
          {cerrado ? <Icono nombre="candado" tamano={tema.tamano.l} color={tema.color.cerrado} /> : null}
          <Texto variante="sub" numberOfLines={2} style={{ flexShrink: 1 }}>
            {linea}
          </Texto>
        </View>
      }
      alTocar={() => router.push({ pathname: '/cargar', params: { id: g.id } })}
      separador={separador}
      derecha={<Monto centavos={g.total} tamano="fila" />}
    />
  );
}

export function mapaDeNombres(lista: Array<{ id: string; nombre: string }>): Map<string, string> {
  return new Map(lista.map((x) => [x.id, x.nombre]));
}
