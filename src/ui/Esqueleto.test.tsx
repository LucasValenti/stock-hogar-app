import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated } from 'react-native';

import tokens from '@/tema/tokens.json';

import { Esqueleto } from './Esqueleto';

afterEach(() => jest.restoreAllMocks());

test('late en opacidad si no se pidió reducir el movimiento', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const loop = jest.spyOn(Animated, 'loop');
  await render(<Esqueleto alto={10} testID="esq" />);
  expect(loop).toHaveBeenCalled();
});

test('con movimiento reducido queda quieto en opacidad.esqueletoMax', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const loop = jest.spyOn(Animated, 'loop');
  const fijar = jest.spyOn(Animated.Value.prototype, 'setValue');
  await render(<Esqueleto alto={10} testID="esq" />);
  await act(async () => undefined);
  // El primer cuadro puede arrancar el latido antes de saber la preferencia; después queda quieto.
  loop.mockClear();
  await act(async () => undefined);
  expect(loop).not.toHaveBeenCalled();
  expect(fijar).toHaveBeenLastCalledWith(tokens.opacidad.esqueletoMax);
  expect(screen.getByTestId('esq', { includeHiddenElements: true })).toBeTruthy();
});
