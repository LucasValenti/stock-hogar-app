// Barras horizontales a escala (Categorías y Evolución): el valor va escrito y la barra es apoyo
// (DESIGN.md: «los gráficos son apoyo»). Cada barra mide su parte del máximo; el lector lee la fila
// entera («Almacén: $ 700, 70 %») y la barra queda oculta. Al pie, el total si se pasa.
// Color de la barra: `textoSuave` sobre `fondo`, que da ≥ 3:1 (objeto gráfico); el acento queda
// para la acción de la pantalla.

import { View } from 'react-native';

import { formatear } from '@/logica/dinero';
import { useTema } from '@/tema/tema';

import { decorativo } from '../estilos';
import { Monto } from '../Monto';
import { Tarjeta } from '../Tarjeta';
import { Texto } from '../Texto';

export type FilaBarra = { clave: string; rotulo: string; centavos: number; detalle?: string };

type Props = { titulo: string; filas: FilaBarra[]; total?: { rotulo: string; centavos: number } };

export function Barras({ titulo, filas, total }: Props) {
  const tema = useTema();
  const maximo = Math.max(0, ...filas.map((f) => f.centavos));
  return (
    <Tarjeta>
      <Texto variante="tituloTarjeta" aria-level={2}>
        {titulo}
      </Texto>
      {filas.map((f) => {
        const parte = maximo > 0 ? Math.max(0, Math.min(1, f.centavos / maximo)) : 0;
        return (
          <View
            key={f.clave}
            accessible
            accessibilityLabel={`${f.rotulo}: ${formatear(f.centavos)}${f.detalle ? `, ${f.detalle}` : ''}`}
            style={{ gap: tema.espacio.xs, paddingVertical: tema.espacio.xs }}
          >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: tema.espacio.m }}>
              <View style={{ flexGrow: 1, flexShrink: 1 }}>
                <Texto variante="fuerte" numberOfLines={2}>
                  {f.rotulo}
                </Texto>
                {f.detalle ? <Texto variante="sub">{f.detalle}</Texto> : null}
              </View>
              <Monto centavos={f.centavos} tamano="fila" style={{ marginLeft: 'auto' }} />
            </View>
            <View
              {...decorativo}
              style={{ height: tema.espacio.s, borderRadius: tema.radio.chip, backgroundColor: tema.color.fondo, overflow: 'hidden' }}
            >
              <View style={{ width: `${parte * 100}%`, height: '100%', borderRadius: tema.radio.chip, backgroundColor: tema.color.textoSuave }} />
            </View>
          </View>
        );
      })}
      {total ? <FilaTotal rotulo={total.rotulo} centavos={total.centavos} /> : null}
    </Tarjeta>
  );
}

/** El renglón que cierra una lista: «Total» y el monto, en `peso.fuerte`, con una línea arriba. */
export function FilaTotal({ rotulo, centavos }: { rotulo: string; centavos: number }) {
  const tema = useTema();
  return (
    <View
      accessible
      accessibilityLabel={`${rotulo}: ${formatear(centavos)}`}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: tema.espacio.m,
        minHeight: tema.medida.tactil,
        borderTopWidth: tema.medida.borde,
        borderTopColor: tema.color.borde,
      }}
    >
      <Texto variante="fuerte" style={{ flexShrink: 1 }}>
        {rotulo}
      </Texto>
      <Monto centavos={centavos} tamano="fila" style={{ marginLeft: 'auto' }} />
    </View>
  );
}
