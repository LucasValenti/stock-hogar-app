import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import tokens from '@/tema/tokens.json';

import { Hoja } from './Hoja';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const plano = (s: unknown) => StyleSheet.flatten(s as never) ?? {};

describe('Hoja', () => {
  test('cerrada no muestra nada', async () => {
    await render(
      <Hoja visible={false} titulo="Agregar producto" alCerrar={jest.fn()}>
        <Text>Yerba</Text>
      </Hoja>,
    );
    expect(screen.queryByText('Agregar producto')).toBeNull();
  });

  test('abierta: título como encabezado, subtítulo, contenido y pie; radio.hoja arriba', async () => {
    await render(
      <Hoja visible titulo="Agregar producto" subtitulo="Tildá lo comprado." alCerrar={jest.fn()} pie={<Text>Pie</Text>}>
        <Text>Yerba</Text>
      </Hoja>,
    );
    expect(screen.getByRole('header', { name: 'Agregar producto' })).toBeTruthy();
    expect(screen.getByText('Tildá lo comprado.')).toBeTruthy();
    expect(screen.getByText('Yerba')).toBeTruthy();
    expect(screen.getByText('Pie')).toBeTruthy();
    expect(plano(screen.getByTestId('hoja').props.style)).toMatchObject({
      borderTopLeftRadius: tokens.radio.hoja,
      borderTopRightRadius: tokens.radio.hoja,
      backgroundColor: tokens.color.claro.superficie,
    });
  });

  test('tocar el velo cierra', async () => {
    const alCerrar = jest.fn();
    await render(
      <Hoja visible titulo="Categoría" alCerrar={alCerrar}>
        <Text>Luz</Text>
      </Hoja>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });
});
