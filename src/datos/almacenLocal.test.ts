// El almacén de la cola sobre localStorage devuelve promesas, como AsyncStorage en el teléfono.

import { almacenLocal } from './almacenLocal';

test('getItem y setItem escriben y leen sobre localStorage, con promesas', async () => {
  const almacen = almacenLocal();

  expect(await almacen.getItem('cola-escritura')).toBeNull();
  await almacen.setItem('cola-escritura', '[]');
  expect(await almacen.getItem('cola-escritura')).toBe('[]');
  expect(localStorage.getItem('cola-escritura')).toBe('[]');
});
