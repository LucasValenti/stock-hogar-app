import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import tokens from '@/tema/tokens.json';

import { Estado, Fila } from './Fila';

const plano = (s: unknown) => StyleSheet.flatten(s as never) ?? {};

describe('Fila', () => {
  test('con tilde: la fila entera es una casilla con su estado y alto ≥ medida.fila', async () => {
    const alTildar = jest.fn();
    await render(
      <Fila nombre="Yerba" descripcion="Hay 1" tildado={false} alTildar={alTildar} detalle={<Estado tipo="hay" texto="Hay 1" />} />,
    );
    const casilla = screen.getByRole('checkbox', { name: 'Yerba, Hay 1' });
    expect(casilla.props.accessibilityState).toMatchObject({ checked: false });
    expect(plano(casilla.props.style).minHeight).toBeGreaterThanOrEqual(tokens.medida.fila);
    await fireEvent.press(casilla);
    expect(alTildar).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Hay 1')).toBeTruthy();
  });

  test('tildada: la casilla queda marcada y el tilde en acento', async () => {
    await render(<Fila nombre="Leche" tildado alTildar={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Leche' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(plano(screen.getByTestId('tilde', { includeHiddenElements: true }).props.style)).toMatchObject({ backgroundColor: tokens.color.claro.acento });
  });

  test('sin tilde no hay casilla; lo de la derecha se dibuja', async () => {
    await render(<Fila nombre="Yerba" derecha={<Text>$ 5.200</Text>} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText('Yerba').props.numberOfLines).toBe(2);
    expect(screen.getByText('$ 5.200')).toBeTruthy();
  });

  test('Estado lleva palabra además del color', async () => {
    await render(<Estado tipo="falta" texto="Falta" />);
    expect(plano(screen.getByText('Falta').props.style).color).toBe(tokens.color.claro.falta);
  });
});
