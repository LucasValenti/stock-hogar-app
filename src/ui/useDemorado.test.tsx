import { act, renderHook } from '@testing-library/react-native';

import { useDemorado } from './useDemorado';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('el primer valor está ya; los cambios llegan cuando pasan los ms sin otro cambio', async () => {
  const { result, rerender } = await renderHook(({ v }: { v: string }) => useDemorado(v, 600), { initialProps: { v: '3 gastos' } });
  expect(result.current).toBe('3 gastos');
  await rerender({ v: '2 gastos' });
  await act(async () => jest.advanceTimersByTime(400));
  await rerender({ v: '1 gasto' });
  await act(async () => jest.advanceTimersByTime(400));
  expect(result.current).toBe('3 gastos');
  await act(async () => jest.advanceTimersByTime(200));
  expect(result.current).toBe('1 gasto');
});

test('si todavía no había valor (null), el primero que llega va sin esperar', async () => {
  const { result, rerender } = await renderHook(({ v }: { v: string | null }) => useDemorado(v, 600), {
    initialProps: { v: null as string | null },
  });
  expect(result.current).toBeNull();
  await rerender({ v: '3 gastos' });
  expect(result.current).toBe('3 gastos');
  await rerender({ v: '1 gasto' });
  expect(result.current).toBe('3 gastos');
});

test('si el valor vuelve a null, se va ya; el que llega después va sin esperar', async () => {
  const { result, rerender } = await renderHook(({ v }: { v: string | null }) => useDemorado(v, 600), {
    initialProps: { v: '3 gastos' as string | null },
  });
  await rerender({ v: null });
  expect(result.current).toBeNull();
  await rerender({ v: '7 gastos' });
  expect(result.current).toBe('7 gastos');
  await act(async () => jest.advanceTimersByTime(600));
  expect(result.current).toBe('7 gastos');
});
