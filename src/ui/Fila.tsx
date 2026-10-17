// Fila de producto (DESIGN.md, Fila de producto con − / +): alto ≥ `medida.fila`, nombre en `peso.fuerte`
// hasta dos renglones, el estado debajo y lo de la derecha (el paso, un monto). Si no entra al lado del
// nombre, baja y se alinea a la derecha. Con `alTildar`, el tilde va a la izquierda y la parte del nombre
// entera es la casilla (el blanco táctil no es el tilde chico). El separador lo pone la lista (`separador`).

import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useTema } from '@/tema/tema';

import { anilloDeFoco, decorativo, useFoco } from './estilos';
import { Icono, type NombreIcono } from './Icono';
import { Texto } from './Texto';

type Props = {
  nombre: string;
  /** Lo que va debajo del nombre (el estado, una nota). */
  detalle?: ReactNode;
  /** Lo que el lector dice después del nombre («Hay 1», «Anotación rápida»). */
  descripcion?: string;
  tildado?: boolean;
  alTildar?(): void;
  bloqueado?: boolean;
  derecha?: ReactNode;
  /** Línea arriba: entre una fila y la anterior. */
  separador?: boolean;
};

export function Fila({ nombre, detalle, descripcion, tildado = false, alTildar, bloqueado = false, derecha, separador = false }: Props) {
  const tema = useTema();
  const { conFoco, alFoco } = useFoco();
  const textos = (
    <View style={{ flexShrink: 1, flexGrow: 1 }}>
      <Texto variante="fuerte" numberOfLines={2}>
        {nombre}
      </Texto>
      {detalle}
    </View>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: tema.espacio.m,
        minHeight: tema.medida.fila,
        borderTopWidth: separador ? tema.medida.borde : 0,
        borderTopColor: tema.color.borde,
      }}
    >
      {alTildar ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={descripcion ? `${nombre}, ${descripcion}` : nombre}
          accessibilityState={{ checked: tildado, disabled: bloqueado }}
          disabled={bloqueado}
          onPress={alTildar}
          {...alFoco}
          style={[
            {
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: tema.medida.fila * 2,
              minHeight: tema.medida.fila,
              flexDirection: 'row',
              alignItems: 'center',
              gap: tema.espacio.m,
            },
            conFoco && anilloDeFoco(tema),
          ]}
        >
          <View
            {...decorativo}
            testID="tilde"
            style={{
              width: tema.medida.tilde,
              height: tema.medida.tilde,
              borderRadius: tema.radio.tilde,
              borderWidth: tema.medida.tildeBorde,
              borderColor: tildado ? tema.color.acento : tema.color.borde,
              backgroundColor: tildado ? tema.color.acento : tema.color.superficie,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {tildado ? <Icono nombre="ok" tamano={tema.tamano.l} color={tema.color.sobreAcento} /> : null}
          </View>
          {textos}
        </Pressable>
      ) : (
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: tema.medida.fila * 2, paddingVertical: tema.espacio.s }}>{textos}</View>
      )}
      {derecha ? <View style={{ marginLeft: 'auto', paddingVertical: tema.espacio.xs }}>{derecha}</View> : null}
    </View>
  );
}

const ICONO_ESTADO: Record<'falta' | 'hay' | 'cerrado', NombreIcono> = { falta: 'falta', hay: 'ok', cerrado: 'candado' };

/** Estado de un dato (DESIGN.md, Estados): ícono + palabra en su color, nunca solo color. */
export function Estado({ tipo, texto }: { tipo: 'falta' | 'hay' | 'cerrado'; texto: string }) {
  const tema = useTema();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tema.espacio.xs }}>
      <Icono nombre={ICONO_ESTADO[tipo]} tamano={tema.tamano.l} color={tema.color[tipo]} />
      <Texto variante="seccion" color={tipo}>
        {texto}
      </Texto>
    </View>
  );
}

/** Notita (DESIGN.md): ícono de nota + texto suave, para las anotaciones rápidas. */
export function Notita({ texto }: { texto: string }) {
  const tema = useTema();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tema.espacio.xs }}>
      <Icono nombre="nota" tamano={tema.tamano.l} color={tema.color.textoSuave} />
      <Texto variante="sub" numberOfLines={2}>
        {texto}
      </Texto>
    </View>
  );
}
