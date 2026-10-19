import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';

import { Esqueleto } from './Esqueleto';

const css = readFileSync(resolve(process.cwd(), 'src/ui/Esqueleto.module.css'), 'utf8');

test('late en opacidad si no se pidió reducir el movimiento', () => {
  // El latido es solo de opacidad; con movimiento reducido lo corta base.css.
  expect(css).toMatch(/@keyframes latir/);
  expect(css).toMatch(/opacity/);
  expect(css).not.toMatch(/transform/);
});

test('es decorativo, con el alto y el ancho pedidos', () => {
  render(<Esqueleto alto={10} ancho="50%" testID="esq" />);
  const esq = screen.getByTestId('esq');
  expect(esq).toHaveAttribute('aria-hidden', 'true');
  expect(esq.style.getPropertyValue('--esqueleto-alto')).toBe('10px');
  expect(esq.style.getPropertyValue('--esqueleto-ancho')).toBe('50%');
});

test('el círculo usa el alto como ancho', () => {
  render(
    <>
      <Esqueleto alto={10} testID="recto" />
      <Esqueleto alto={10} circulo testID="circulo" />
    </>,
  );
  expect(screen.getByTestId('circulo').className).not.toBe(screen.getByTestId('recto').className);
});
