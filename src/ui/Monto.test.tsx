import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { formatear } from '@/logica/dinero';

import { Monto } from './Monto';

const plano = (s: unknown) => StyleSheet.flatten(s as never) ?? {};

describe('Monto', () => {
  test('el total muestra el monto formateado, con cifras tabulares y en un renglón que se achica para entrar', async () => {
    await render(<Monto centavos={123450} />);
    const texto = screen.getByText(formatear(123450));
    expect(plano(texto.props.style).fontVariant).toEqual(['tabular-nums']);
    expect(texto.props.adjustsFontSizeToFit).toBe(true);
    expect(texto.props.numberOfLines).toBe(1);
    expect(texto.props.allowFontScaling).not.toBe(false);
  });

  test('en una fila también va tabular', async () => {
    await render(<Monto centavos={9850_00} tamano="fila" />);
    expect(plano(screen.getByText(formatear(9850_00)).props.style).fontVariant).toEqual(['tabular-nums']);
  });

  test('con signo, el saldo lleva «+» o «−» pegado al monto', async () => {
    await render(
      <>
        <Monto centavos={7684_00} tamano="fila" signo />
        <Monto centavos={-10649_00} tamano="fila" signo />
      </>,
    );
    expect(screen.getByText(`+ ${formatear(7684_00)}`)).toBeTruthy();
    expect(screen.getByText(`− ${formatear(10649_00)}`)).toBeTruthy();
  });
});
