import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import tokens from '@/tema/tokens.json';

import { PestanasInternas } from './PestanasInternas';

const plano = (s: unknown) => StyleSheet.flatten(s as never) ?? {};

test('pestañas con selected, la activa llena de acento y todas ≥ medida.tactil', async () => {
  const alCambiar = jest.fn();
  await render(
    <PestanasInternas
      etiqueta="Vista del stock"
      opciones={[
        { clave: 'todo', texto: 'Todo' },
        { clave: 'pendientes', texto: 'Pendientes 3' },
        { clave: 'ocultos', texto: 'Ocultos' },
      ]}
      activa="todo"
      alCambiar={alCambiar}
    />,
  );
  // El grupo no es `accessible` (agruparía las pestañas en un solo elemento en iOS): se busca por su nombre.
  expect(screen.getByLabelText('Vista del stock').props.accessibilityRole).toBe('tablist');
  const todo = screen.getByRole('tab', { name: 'Todo' });
  expect(todo.props.accessibilityState).toMatchObject({ selected: true });
  expect(plano(todo.props.style)).toMatchObject({ backgroundColor: tokens.color.claro.acento });
  const pendientes = screen.getByRole('tab', { name: 'Pendientes 3' });
  expect(pendientes.props.accessibilityState).toMatchObject({ selected: false });
  expect(plano(pendientes.props.style).minHeight).toBeGreaterThanOrEqual(tokens.medida.tactil);
  await fireEvent.press(pendientes);
  expect(alCambiar).toHaveBeenCalledWith('pendientes');
});
