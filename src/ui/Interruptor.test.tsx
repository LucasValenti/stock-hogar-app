import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Interruptor } from './Interruptor';

test('es un switch con nombre y estado; tocarlo pide el valor contrario', async () => {
  const alCambiar = vi.fn();
  render(<Interruptor texto="Altas y bajas" activo={false} alCambiar={alCambiar} />);
  const llave = screen.getByRole('switch', { name: 'Altas y bajas' });
  expect(llave).toHaveAttribute('aria-checked', 'false');
  await userEvent.click(llave);
  expect(alCambiar).toHaveBeenCalledWith(true);
});

test('con el teclado: Tab llega y Espacio lo cambia', async () => {
  const alCambiar = vi.fn();
  render(<Interruptor texto="Ver y cambiar sueldos" activo alCambiar={alCambiar} />);
  await userEvent.tab();
  expect(screen.getByRole('switch', { name: 'Ver y cambiar sueldos' })).toHaveFocus();
  await userEvent.keyboard(' ');
  expect(alCambiar).toHaveBeenCalledWith(false);
});

test('ocupado no se puede tocar', async () => {
  const alCambiar = vi.fn();
  render(<Interruptor texto="Altas y bajas" activo ocupado alCambiar={alCambiar} />);
  const llave = screen.getByRole('switch', { name: 'Altas y bajas' });
  expect(llave).toBeDisabled();
  await userEvent.click(llave);
  expect(alCambiar).not.toHaveBeenCalled();
});
