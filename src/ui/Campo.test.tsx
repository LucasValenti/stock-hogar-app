import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import tokens from '@/tema/tokens.json';

import { Campo } from './Campo';

const plano = (s: unknown) => StyleSheet.flatten(s as never) ?? {};

describe('Campo', () => {
  test('se encuentra por su etiqueta, avisa lo tipeado y mide al menos medida.tactil', async () => {
    const alCambiar = jest.fn();
    await render(<Campo etiqueta="Nota" valor="" alCambiar={alCambiar} ayuda="Opcional" />);
    const entrada = screen.getByLabelText('Nota');
    await fireEvent.changeText(entrada, 'Compra del sábado');
    expect(alCambiar).toHaveBeenCalledWith('Compra del sábado');
    expect(plano(entrada.props.style).minHeight).toBeGreaterThanOrEqual(tokens.medida.tactil);
    expect(entrada.props.allowFontScaling).not.toBe(false);
    expect(screen.getByText('Opcional')).toBeTruthy();
  });

  test('el error reemplaza la ayuda, se anuncia y pinta el borde en falta', async () => {
    await render(<Campo etiqueta="Monto" valor="x" alCambiar={jest.fn()} ayuda="Opcional" error="Ingresá un monto." />);
    expect(screen.queryByText('Opcional')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresá un monto.');
    expect(plano(screen.getByLabelText('Monto').props.style).borderColor).toBe(tokens.color.claro.falta);
  });

  test('bloqueado no se edita y lo dice', async () => {
    await render(<Campo etiqueta="Monto" valor="500" alCambiar={jest.fn()} bloqueado />);
    const entrada = screen.getByLabelText('Monto');
    expect(entrada.props.editable).toBe(false);
    expect(entrada.props.accessibilityState).toMatchObject({ disabled: true });
  });
});
