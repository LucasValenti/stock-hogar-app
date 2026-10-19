import { render, screen } from '@testing-library/react';

import { EstadoVacio } from './EstadoVacio';

test('vacío dentro de una lista u hoja: título como encabezado y texto', () => {
  render(<EstadoVacio icono="caja" titulo="No hay productos" texto="Sumalos desde Stock." />);
  expect(screen.getByRole('heading', { name: 'No hay productos' })).toBeInTheDocument();
  expect(screen.getByText('Sumalos desde Stock.')).toBeInTheDocument();
});
