import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PestanasInternas } from './PestanasInternas';

const css = readFileSync(resolve(process.cwd(), 'src/ui/PestanasInternas.module.css'), 'utf8');

const opciones = [
  { clave: 'todo', texto: 'Todo' },
  { clave: 'pendientes', texto: 'Pendientes 3' },
  { clave: 'ocultos', texto: 'Ocultos' },
] as const;

test('pestañas con selected, la activa llena de acento y todas ≥ medida.tactil', async () => {
  const alCambiar = vi.fn();
  render(<PestanasInternas etiqueta="Vista del stock" opciones={[...opciones]} activa="todo" alCambiar={alCambiar} />);
  expect(screen.getByRole('tablist', { name: 'Vista del stock' })).toBeInTheDocument();
  const todo = screen.getByRole('tab', { name: 'Todo' });
  expect(todo).toHaveAttribute('aria-selected', 'true');
  expect(css).toMatch(/\.pestana\[aria-selected='true'\][^{]*\{[^}]*background:\s*var\(--color-acento\)/s);
  const pendientes = screen.getByRole('tab', { name: 'Pendientes 3' });
  expect(pendientes).toHaveAttribute('aria-selected', 'false');
  expect(css).toMatch(/\.pestana[^{]*\{[^}]*min-height:\s*var\(--medida-tactil\)/s);
  await userEvent.click(pendientes);
  expect(alCambiar).toHaveBeenCalledWith('pendientes');
});

test('las flechas izquierda y derecha mueven el foco y la pestaña activa', async () => {
  const alCambiar = vi.fn();
  render(<PestanasInternas etiqueta="Vista del stock" opciones={[...opciones]} activa="todo" alCambiar={alCambiar} />);
  const todo = screen.getByRole('tab', { name: 'Todo' });
  todo.focus();
  await userEvent.keyboard('{ArrowRight}');
  expect(alCambiar).toHaveBeenLastCalledWith('pendientes');
  expect(screen.getByRole('tab', { name: 'Pendientes 3' })).toHaveFocus();
  await userEvent.keyboard('{ArrowLeft}');
  expect(alCambiar).toHaveBeenLastCalledWith('todo');
  expect(todo).toHaveFocus();
  await userEvent.keyboard('{ArrowLeft}');
  expect(alCambiar).toHaveBeenLastCalledWith('ocultos');
  expect(screen.getByRole('tab', { name: 'Ocultos' })).toHaveFocus();
});
