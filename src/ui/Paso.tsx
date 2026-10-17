// El paso (DESIGN.md, Fila de producto con − / +): píldora con borde, − y + de `medida.tactil`, y en el
// medio la cantidad tabular, que también se puede tipear (1,5 kg). Suma y resta con aplicarDelta: sin
// ruido de coma flotante. − no deja bajar de lo mínimo: para no comprar nada, se destilda.

import { Pressable, TextInput, View } from 'react-native';

import { aCantidad } from '@/logica/dinero';
import { aplicarDelta } from '@/logica/stock';
import { FAMILIAS } from '@/tema/fuentes';
import { useTema } from '@/tema/tema';

import { anilloDeFoco, useFoco } from './estilos';
import { Texto } from './Texto';

type Props = {
  /** Para el lector: «Sumar 1 a Yerba». */
  nombre: string;
  /** La cantidad como se tipea («1,5»). */
  valor: string;
  alCambiar(texto: string): void;
  /** Kg y litros: teclado con coma. */
  decimales: boolean;
  bloqueado?: boolean;
};

const aTexto = (n: number) => String(n).replace('.', ',');

export function Paso({ nombre, valor, alCambiar, decimales, bloqueado = false }: Props) {
  const tema = useTema();
  const foco = useFoco();
  const n = aCantidad(valor);
  const puedeRestar = !bloqueado && n !== null && n > 1;
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: tema.medida.borde,
          borderColor: tema.color.borde,
          borderRadius: tema.radio.boton,
          backgroundColor: tema.color.superficie,
        },
        foco.conFoco && anilloDeFoco(tema),
      ]}
    >
      <BotonPaso
        signo="−"
        etiqueta={`Restar 1 a ${nombre}`}
        habilitado={puedeRestar}
        onPress={() => n !== null && alCambiar(aTexto(aplicarDelta(n, -1)))}
      />
      <TextInput
        allowFontScaling
        accessibilityLabel={`Cantidad de ${nombre}`}
        accessibilityState={{ disabled: bloqueado }}
        editable={!bloqueado}
        value={valor}
        onChangeText={alCambiar}
        keyboardType={decimales ? 'decimal-pad' : 'number-pad'}
        selectTextOnFocus
        {...foco.alFoco}
        style={{
          // En la web el campo trae un ancho propio grande: se acota a la cifra.
          width: tema.medida.tactil * 1.5,
          minHeight: tema.medida.tactil,
          textAlign: 'center',
          fontFamily: FAMILIAS.numeros,
          fontSize: tema.tamano.l,
          fontVariant: ['tabular-nums'],
          color: tema.color.texto,
          // El anillo va en toda la píldora: el campo no dibuja el suyo.
          outlineStyle: 'none',
        } as object}
      />
      <BotonPaso
        signo="+"
        etiqueta={`Sumar 1 a ${nombre}`}
        habilitado={!bloqueado}
        onPress={() => alCambiar(aTexto(aplicarDelta(n ?? 0, 1)))}
      />
    </View>
  );
}

function BotonPaso({ signo, etiqueta, habilitado, onPress }: { signo: string; etiqueta: string; habilitado: boolean; onPress(): void }) {
  const tema = useTema();
  const { conFoco, alFoco } = useFoco();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ disabled: !habilitado }}
      disabled={!habilitado}
      onPress={onPress}
      {...alFoco}
      style={[
        {
          minWidth: tema.medida.tactil,
          minHeight: tema.medida.tactil,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: tema.radio.boton,
        },
        conFoco && anilloDeFoco(tema),
      ]}
    >
      <Texto variante="tituloTarjeta" color={habilitado ? 'texto' : 'textoSuave'} accessibilityRole="none" aria-hidden>
        {signo}
      </Texto>
    </Pressable>
  );
}
