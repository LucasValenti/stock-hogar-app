import { act, renderHook } from '@testing-library/react';

import { useDemorado } from './useDemorado';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('el primer valor está ya; los cambios llegan cuando pasan los ms sin otro cambio', () => {
  const { result, rerender } = renderHook(({ v }: { v: string }) => useDemorado(v, 600), { initialProps: { v: '3 gastos' } });
  expect(result.current).toBe('3 gastos');
  rerender({ v: '2 gastos' });
  act(() => {
    vi.advanceTimersByTime(400);
  });
  rerender({ v: '1 gasto' });
  act(() => {
    vi.advanceTimersByTime(400);
  });
  expect(result.current).toBe('3 gastos');
  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(result.current).toBe('1 gasto');
});

test('si todavía no había valor (null), el primero que llega va sin esperar', () => {
  const { result, rerender } = renderHook(({ v }: { v: string | null }) => useDemorado(v, 600), {
    initialProps: { v: null as string | null },
  });
  expect(result.current).toBeNull();
  rerender({ v: '3 gastos' });
  expect(result.current).toBe('3 gastos');
  rerender({ v: '1 gasto' });
  expect(result.current).toBe('3 gastos');
});

test('si el valor vuelve a null, se va ya; el que llega después va sin esperar', () => {
  const { result, rerender } = renderHook(({ v }: { v: string | null }) => useDemorado(v, 600), {
    initialProps: { v: '3 gastos' as string | null },
  });
  rerender({ v: null });
  expect(result.current).toBeNull();
  rerender({ v: '7 gastos' });
  expect(result.current).toBe('7 gastos');
  act(() => {
    vi.advanceTimersByTime(600);
  });
  expect(result.current).toBe('7 gastos');
});
