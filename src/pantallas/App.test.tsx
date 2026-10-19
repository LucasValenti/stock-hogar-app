import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from './App';

const sesion = vi.hoisted(() => ({
  estado: 'lista' as string,
  error: null as unknown,
  demo: false,
  email: 'ana@ejemplo.com' as string | null,
  reintentar: vi.fn(),
  salir: vi.fn(),
  entrarDemo: vi.fn(),
}));

vi.mock('@/sesion/sesion', () => ({ SesionProvider: ({ children }: { children: unknown }) => children, useSesion: () => sesion }));
vi.mock('@/comprobante/registrarSw', () => ({ registrarSw: vi.fn() }));
vi.mock('@/comprobante/useCompartidoPendiente', () => ({ useCompartidoPendiente: vi.fn() }));

beforeEach(() => {
  Object.assign(sesion, { estado: 'lista', error: null, demo: false, email: 'ana@ejemplo.com' });
  sesion.salir.mockReset().mockResolvedValue(undefined);
  history.replaceState(null, '', '/');
});

it('con la sesión lista muestra Inicio, la barra con la pestaña activa y el título', () => {
  render(<App />);
  const barra = screen.getByRole('navigation', { name: 'Secciones' });
  expect(within(barra).getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
  expect(within(barra).getByRole('link', { name: 'Stock' })).not.toHaveAttribute('aria-current');
  expect(within(barra).getByRole('link', { name: 'Cargar gasto' })).toHaveAttribute('href', '/cargar');
  expect(document.title).toBe('Inicio · Stock del hogar');
});

it('la barra lleva a cada pestaña', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('link', { name: 'Stock' }));
  expect(location.pathname).toBe('/stock');
  expect(screen.getByRole('heading', { name: 'Stock' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Stock' })).toHaveAttribute('aria-current', 'page');
  expect(document.title).toBe('Stock · Stock del hogar');
});

it('una ruta desconocida o /ingresar con la sesión lista vuelven a Inicio', () => {
  history.replaceState(null, '', '/ingresar');
  render(<App />);
  expect(location.pathname).toBe('/');
});

it('sin sesión muestra el ingreso, sin barra', () => {
  sesion.estado = 'sin-sesion';
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Stock del hogar' })).toBeInTheDocument();
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});

it('mientras carga no queda en blanco', () => {
  sesion.estado = 'cargando';
  render(<App />);
  expect(screen.getByText('Cargando')).toBeInTheDocument();
});

it('con error ofrece reintentar', async () => {
  sesion.error = new Error('Sin conexión');
  render(<App />);
  expect(screen.getByRole('heading', { name: 'No se pudo abrir la app' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Probar de nuevo' }));
  expect(sesion.reintentar).toHaveBeenCalled();
});

it('una cuenta ajena ve el aviso y puede cerrar sesión', async () => {
  sesion.estado = 'ajena';
  render(<App />);
  expect(screen.getByText(/agregue ana@ejemplo.com en Ajustes/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  expect(sesion.salir).toHaveBeenCalled();
});

it('en la demo, Ajustes avisa y deja salir de la demo', async () => {
  sesion.demo = true;
  history.replaceState(null, '', '/ajustes');
  render(<App />);
  expect(screen.getByText('Estás en la demo: los datos son inventados.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Salir de la demo' }));
  expect(sesion.salir).toHaveBeenCalled();
});
