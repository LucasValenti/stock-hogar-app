import { anotarEntrada, volver } from './volver';

beforeEach(() => {
  history.replaceState(null, '', '/');
});

it('entrando directo a una pantalla, volver va a la alternativa y reemplaza la entrada', () => {
  history.replaceState(null, '', '/cargar');
  anotarEntrada(true);
  const navegar = vi.fn();
  const atras = vi.spyOn(history, 'back');

  volver(navegar, '/stock');

  expect(navegar).toHaveBeenCalledWith('/stock', { replace: true });
  expect(atras).not.toHaveBeenCalled();
  atras.mockRestore();
});

it('después de navegar dentro de la app, volver va atrás', () => {
  anotarEntrada(true);
  history.pushState(null, '', '/stock');
  anotarEntrada(false);
  expect(history.state).toEqual({ profundidad: 1 });
  const navegar = vi.fn();
  const atras = vi.spyOn(history, 'back').mockImplementation(() => undefined);

  volver(navegar);

  expect(atras).toHaveBeenCalledTimes(1);
  expect(navegar).not.toHaveBeenCalled();
  atras.mockRestore();
});

it('una entrada ya marcada (al ir atrás o adelante) conserva su profundidad', () => {
  history.replaceState({ profundidad: 3 }, '', '/analisis');
  anotarEntrada(false);
  expect(history.state).toEqual({ profundidad: 3 });
  history.pushState(null, '', '/ajustes');
  anotarEntrada(false);
  expect(history.state).toEqual({ profundidad: 4 });
});
