import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import tokens from '@/tema/tokens.json';

import { Chip } from './Chip';

const plano = (s: unknown) => StyleSheet.flatten(s as never) ?? {};

describe('Chip', () => {
  test('como opción: radio con su estado, activo lleno de acento, alto ≥ medida.tactil', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <Chip texto="Ana" activo onPress={onPress} />
        <Chip texto="Bruno" activo={false} onPress={onPress} />
      </>,
    );
    const ana = screen.getByRole('radio', { name: 'Ana' });
    expect(ana.props.accessibilityState).toMatchObject({ checked: true });
    expect(plano(ana.props.style)).toMatchObject({ backgroundColor: tokens.color.claro.acento });
    expect(plano(ana.props.style).minHeight).toBeGreaterThanOrEqual(tokens.medida.tactil);
    const bruno = screen.getByRole('radio', { name: 'Bruno' });
    expect(bruno.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(bruno);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('con flecha es un botón que abre una hoja; bloqueado no responde', async () => {
    const onPress = jest.fn();
    await render(<Chip texto="Súper" flecha accessibilityLabel="Categoría: Súper" bloqueado onPress={onPress} />);
    const chip = screen.getByRole('button', { name: 'Categoría: Súper' });
    expect(chip.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(chip);
    expect(onPress).not.toHaveBeenCalled();
  });
});
