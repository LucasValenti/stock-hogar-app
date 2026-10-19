import { render, screen } from '@testing-library/react';

import { formatear } from '@/logica/dinero';

import { Monto } from './Monto';

// Intl separa el «$» con un espacio duro; el matcher de Testing Library normaliza a espacio común.
const texto = (s: string) => s.replace(/\u00a0/g, ' ');

describe('Monto', () => {
  test('el total muestra el monto formateado, con cifras tabulares y en un renglón', () => {
    render(<Monto centavos={123450} />);
    const monto = screen.getByText(texto(formatear(123450)));
    expect(monto).toHaveClass('tabular');
    expect(monto).toHaveTextContent(texto(formatear(123450)));
  });

  test('en una fila también va tabular', () => {
    render(<Monto centavos={9850_00} tamano="fila" />);
    expect(screen.getByText(texto(formatear(9850_00)))).toHaveClass('tabular');
  });

  test('con signo, el saldo lleva «+» o «−» pegado al monto', () => {
    render(
      <>
        <Monto centavos={7684_00} tamano="fila" signo />
        <Monto centavos={-10649_00} tamano="fila" signo />
      </>,
    );
    expect(screen.getByText(texto(`+ ${formatear(7684_00)}`))).toBeInTheDocument();
    expect(screen.getByText(texto(`− ${formatear(10649_00)}`))).toBeInTheDocument();
  });
});
