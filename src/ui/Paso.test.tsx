import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import tokens from '@/tema/tokens.json';

import { Paso } from './Paso';

const plano = (s: unknown) => StyleSheet.flatten(s as never) ?? {};

async function dibujar(valor: string, decimales = false) {
  const alCambiar = jest.fn();
  await render(<Paso nombre="Yerba" valor={valor} decimales={decimales} alCambiar={alCambiar} />);
  return alCambiar;
}

describe('Paso', () => {
  test('+ suma 1, − resta 1, y los botones miden medida.tactil', async () => {
    const alCambiar = await dibujar('2');
    const mas = screen.getByRole('button', { name: 'Sumar 1 a Yerba' });
    expect(plano(mas.props.style)).toMatchObject({ minWidth: tokens.medida.tactil, minHeight: tokens.medida.tactil });
    await fireEvent.press(mas);
    expect(alCambiar).toHaveBeenLastCalledWith('3');
    await fireEvent.press(screen.getByRole('button', { name: 'Restar 1 a Yerba' }));
    expect(alCambiar).toHaveBeenLastCalledWith('1');
  });

  test('con decimales suma sin ruido de coma flotante y escribe con coma', async () => {
    const alCambiar = await dibujar('1,1', true);
    await fireEvent.press(screen.getByRole('button', { name: 'Sumar 1 a Yerba' }));
    expect(alCambiar).toHaveBeenLastCalledWith('2,1');
    expect(screen.getByLabelText('Cantidad de Yerba').props.keyboardType).toBe('decimal-pad');
  });

  test('− no baja de lo mínimo: en 1 queda deshabilitado', async () => {
    const alCambiar = await dibujar('1');
    const menos = screen.getByRole('button', { name: 'Restar 1 a Yerba' });
    expect(menos.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(menos);
    expect(alCambiar).not.toHaveBeenCalled();
  });

  test('la cantidad se puede tipear; sin decimales usa el teclado numérico', async () => {
    const alCambiar = await dibujar('1');
    const cantidad = screen.getByLabelText('Cantidad de Yerba');
    expect(cantidad.props.keyboardType).toBe('number-pad');
    await fireEvent.changeText(cantidad, '4');
    expect(alCambiar).toHaveBeenLastCalledWith('4');
  });
});
