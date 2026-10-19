import { render } from '@testing-library/react';

import { Icono } from './Icono';

it('dibuja un svg decorativo, del tamaño pedido y con trazos adentro', () => {
  const { container } = render(<Icono nombre="mas" tamano={24} />);

  const svg = container.querySelector('svg');
  expect(svg).not.toBeNull();
  expect(svg).toHaveAttribute('aria-hidden', 'true');
  expect(svg).toHaveAttribute('width', '24');
  expect(svg).toHaveAttribute('height', '24');
  expect(svg?.querySelector('path')).not.toBeNull();
});
