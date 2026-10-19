import { renderHook, waitFor } from '@testing-library/react';

import { tomarPendiente, useCompartidoPendiente } from './useCompartidoPendiente';

const sesion = vi.hoisted(() => ({ estado: 'lista' as string }));
const compartido = vi.hoisted(() => ({ tomarCompartido: vi.fn(), alCompartir: vi.fn(() => () => undefined) }));

vi.mock('@/sesion/sesion', () => ({ useSesion: () => sesion }));
vi.mock('./compartido', () => compartido);

const PDF = { uri: 'blob:c', tipo: 'application/pdf', bytes: 10 };

beforeEach(() => {
  sesion.estado = 'lista';
  compartido.tomarCompartido.mockReset();
  tomarPendiente();
});

it('con la sesión lista, lleva a Cargar el comprobante compartido una sola vez', async () => {
  compartido.tomarCompartido.mockResolvedValue(PDF);
  const irACargar = vi.fn();
  renderHook(() => useCompartidoPendiente(irACargar));

  await waitFor(() => expect(irACargar).toHaveBeenCalledTimes(1));
  expect(tomarPendiente()).toEqual(PDF);
  expect(tomarPendiente()).toBeNull();
});

it('sin sesión no toma nada', async () => {
  sesion.estado = 'sin-sesion';
  const irACargar = vi.fn();
  renderHook(() => useCompartidoPendiente(irACargar));

  await new Promise((r) => setTimeout(r, 0));
  expect(compartido.tomarCompartido).not.toHaveBeenCalled();
  expect(irACargar).not.toHaveBeenCalled();
});

it('si no hay comprobante compartido, no navega', async () => {
  compartido.tomarCompartido.mockResolvedValue(null);
  const irACargar = vi.fn();
  renderHook(() => useCompartidoPendiente(irACargar));

  await waitFor(() => expect(compartido.tomarCompartido).toHaveBeenCalled());
  expect(irACargar).not.toHaveBeenCalled();
  expect(tomarPendiente()).toBeNull();
});

it('si ya hay uno esperando a Cargar, no navega de nuevo', async () => {
  compartido.tomarCompartido.mockResolvedValue(PDF);
  const irACargar = vi.fn();
  const primero = renderHook(() => useCompartidoPendiente(irACargar));
  await waitFor(() => expect(irACargar).toHaveBeenCalledTimes(1));
  primero.unmount();

  renderHook(() => useCompartidoPendiente(irACargar));
  await waitFor(() => expect(compartido.tomarCompartido).toHaveBeenCalledTimes(2));
  expect(irACargar).toHaveBeenCalledTimes(1);
});
