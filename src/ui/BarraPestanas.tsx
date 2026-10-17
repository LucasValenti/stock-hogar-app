// Barra de pestañas «Heladera» (DESIGN.md, Barra de pestañas y + Cargar):
// Inicio · Stock · + Cargar · Análisis · Ajustes, cinco columnas iguales sobre `superficie`.
// La activa lleva etiqueta en `acento` y una píldora llena detrás del ícono (forma, no solo color).
// + Cargar es un imán que sobresale `medida.cargarSube` de la barra; todo su círculo queda dentro
// de la vista (la franja de arriba lleva el `fondo` de la pantalla), así se puede tocar entero también en Android.

import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FAMILIAS } from '@/tema/fuentes';
import { useTema } from '@/tema/tema';

import { anilloDeFoco, sombra, useFoco } from './estilos';
import { Icono, type NombreIcono } from './Icono';
import { Texto } from './Texto';

export type NombrePestana = 'index' | 'stock' | 'analisis' | 'ajustes';

const PESTANAS: Array<{ nombre: NombrePestana; etiqueta: string; icono: NombreIcono }> = [
  { nombre: 'index', etiqueta: 'Inicio', icono: 'casa' },
  { nombre: 'stock', etiqueta: 'Stock', icono: 'caja' },
  { nombre: 'analisis', etiqueta: 'Análisis', icono: 'graf' },
  { nombre: 'ajustes', etiqueta: 'Ajustes', icono: 'ajus' },
];

type Props = {
  activa: NombrePestana;
  alIr(nombre: NombrePestana): void;
  alCargar(): void;
};

export function BarraPestanas({ activa, alIr, alCargar }: Props) {
  const tema = useTema();
  const { bottom } = useSafeAreaInsets();
  const pestana = (i: number) => {
    const p = PESTANAS[i];
    return <Pestana key={p.nombre} {...p} activa={p.nombre === activa} alTocar={() => alIr(p.nombre)} />;
  };

  return (
    <View accessibilityRole="tablist" style={{ backgroundColor: tema.color.fondo }}>
      {/* La barra en sí: empieza `cargarSube` más abajo, para que + Cargar sobresalga. */}
      <View
        style={{
          position: 'absolute',
          top: tema.medida.cargarSube,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: tema.color.superficie,
          borderTopWidth: tema.medida.borde,
          borderTopColor: tema.color.borde,
        }}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          paddingHorizontal: tema.espacio.xs,
          paddingBottom: bottom,
        }}
      >
        {pestana(0)}
        {pestana(1)}
        <Cargar alTocar={alCargar} />
        {pestana(2)}
        {pestana(3)}
      </View>
    </View>
  );
}

type PropsPestana = { nombre: NombrePestana; etiqueta: string; icono: NombreIcono; activa: boolean; alTocar(): void };

function Pestana({ nombre, etiqueta, icono, activa, alTocar }: PropsPestana) {
  const tema = useTema();
  const { conFoco, alFoco } = useFoco();
  return (
    // La franja de arriba (el fondo) no se toca: el blanco táctil es la pestaña dentro de la barra.
    <View style={{ flex: 1, minWidth: 0, paddingTop: tema.medida.cargarSube }}>
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={etiqueta}
        accessibilityState={{ selected: activa }}
        aria-selected={activa}
        onPress={alTocar}
        {...alFoco}
        style={[
          {
            minHeight: tema.medida.pestana,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: tema.espacio.xs,
            borderRadius: tema.radio.registro,
          },
          conFoco && anilloDeFoco(tema),
        ]}
      >
        <View
          testID={`indicador-${nombre}`}
          style={{
            width: tema.medida.indicadorAncho,
            height: tema.medida.indicadorAlto,
            borderRadius: tema.radio.boton,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: activa ? tema.color.acento : 'transparent',
          }}
        >
          <Icono nombre={icono} tamano={tema.medida.icono} color={activa ? tema.color.sobreAcento : tema.color.textoSuave} />
        </View>
        <Texto
          numberOfLines={1}
          maxFontSizeMultiplier={tema.letra.escalaMaxBarra}
          color={activa ? 'acento' : 'textoSuave'}
          style={{
            fontFamily: FAMILIAS.fuerte,
            fontSize: tema.tamano.xxs,
            lineHeight: tema.tamano.xxs * tema.letra.interlineadoTexto,
            maxWidth: '100%',
          }}
        >
          {etiqueta}
        </Texto>
      </Pressable>
    </View>
  );
}

function Cargar({ alTocar }: { alTocar(): void }) {
  const tema = useTema();
  const { conFoco, alFoco } = useFoco();
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', paddingBottom: tema.espacio.s }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cargar gasto"
        onPress={alTocar}
        {...alFoco}
        style={[
          {
            width: tema.medida.cargar,
            height: tema.medida.cargar,
            borderRadius: tema.radio.cargar,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tema.color.acento,
            ...sombra(tema.sombra.cargar),
          },
          conFoco && anilloDeFoco(tema),
        ]}
      >
        <Icono nombre="mas" tamano={tema.medida.iconoCargar} color={tema.color.sobreAcento} grueso />
      </Pressable>
    </View>
  );
}
