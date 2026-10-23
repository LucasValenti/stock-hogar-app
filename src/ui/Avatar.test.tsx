import { render, screen } from '@testing-library/react';

import { Avatar } from './Avatar';

test('muestra las iniciales sobre el color del perfil, por token', () => {
  render(<Avatar nombre="Ana María" color="verde" />);
  const avatar = screen.getByText('AM');
  expect(avatar).toHaveAttribute('aria-hidden', 'true');
  expect(avatar.style.backgroundColor).toBe('var(--color-perfil-verde)');
});

test('sin color queda neutro (sin color de fondo propio)', () => {
  render(<Avatar nombre="Bruno" color={null} />);
  expect(screen.getByText('B').style.backgroundColor).toBe('');
});

test('el tamaño pedido cambia el ancho y el alto', () => {
  render(<Avatar nombre="Caro" color="azul" tamano={64} />);
  const avatar = screen.getByText('C');
  expect(avatar.style.width).toBe('64px');
  expect(avatar.style.height).toBe('64px');
});
