import { render, screen } from '@testing-library/react-native';

import { EstadoVacio } from './EstadoVacio';

test('vacío dentro de una lista u hoja: título como encabezado y texto', async () => {
  await render(<EstadoVacio icono="caja" titulo="No hay productos" texto="Sumalos desde Stock." />);
  expect(screen.getByRole('header', { name: 'No hay productos' })).toBeTruthy();
  expect(screen.getByText('Sumalos desde Stock.')).toBeTruthy();
});
