import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Estado, Fila } from './Fila';

describe('Fila', () => {
  test('con tilde: la fila entera es una casilla con su estado', async () => {
    const alTildar = vi.fn();
    render(<Fila nombre="Yerba" descripcion="Hay 1" tildado={false} alTildar={alTildar} detalle={<Estado tipo="hay" texto="Hay 1" />} />);
    const casilla = screen.getByRole('checkbox', { name: 'Yerba, Hay 1' });
    expect(casilla).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(casilla);
    expect(alTildar).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Hay 1')).toBeInTheDocument();
  });

  test('tildada: la casilla queda marcada y el tilde en acento', () => {
    render(<Fila nombre="Leche" tildado alTildar={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Leche' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('tilde').querySelector('svg')).not.toBeNull();
  });

  test('sin tilde no hay casilla; lo de la derecha se dibuja', () => {
    render(<Fila nombre="Yerba" derecha={<span>$ 5.200</span>} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('Yerba')).toBeInTheDocument();
    expect(screen.getByText('$ 5.200')).toBeInTheDocument();
  });

  test('con alTocar: la zona del nombre es un botón (abre la ficha) y lo de la derecha queda aparte', async () => {
    const alTocar = vi.fn();
    render(<Fila nombre="Yerba" descripcion="Falta" alTocar={alTocar} derecha={<span>paso</span>} />);
    const boton = screen.getByRole('button', { name: 'Yerba, Falta' });
    await userEvent.click(boton);
    expect(alTocar).toHaveBeenCalledTimes(1);
    expect(screen.getByText('paso')).toBeInTheDocument();
  });

  test('Estado lleva palabra además del color', () => {
    render(<Estado tipo="falta" texto="Falta" />);
    expect(screen.getByText('Falta')).toBeInTheDocument();
  });
});
