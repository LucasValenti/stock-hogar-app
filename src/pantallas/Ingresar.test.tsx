import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Ingresar } from './Ingresar';

const sesion = vi.hoisted(() => ({ entrarDemo: vi.fn() }));
const acceso = vi.hoisted(() => ({ pedirCodigo: vi.fn(), verificarCodigo: vi.fn() }));

vi.mock('@/sesion/sesion', () => ({ useSesion: () => sesion }));
vi.mock('@/sesion/acceso', () => acceso);

beforeEach(() => {
  sesion.entrarDemo.mockReset();
  acceso.pedirCodigo.mockReset().mockResolvedValue(undefined);
  acceso.verificarCodigo.mockReset().mockResolvedValue(undefined);
});

it('con un email inválido avisa y no pide el código', async () => {
  render(<Ingresar />);
  await userEvent.type(screen.getByLabelText('Tu email'), 'no-es-mail');
  await userEvent.click(screen.getByRole('button', { name: 'Enviarme un código' }));

  expect(screen.getByRole('alert')).toHaveTextContent('Escribí un email válido.');
  expect(screen.getByLabelText('Tu email')).toHaveAttribute('aria-invalid', 'true');
  expect(acceso.pedirCodigo).not.toHaveBeenCalled();
});

it('pide el código, pasa al segundo paso y entra con el código', async () => {
  render(<Ingresar />);
  await userEvent.type(screen.getByLabelText('Tu email'), ' Ana@Ejemplo.com {Enter}');

  expect(acceso.pedirCodigo).toHaveBeenCalledWith('ana@ejemplo.com');
  expect(await screen.findByRole('heading', { name: 'Ingresá el código' })).toBeInTheDocument();
  expect(screen.getByLabelText('Código')).toHaveFocus();

  await userEvent.type(screen.getByLabelText('Código'), '123456{Enter}');
  expect(acceso.verificarCodigo).toHaveBeenCalledWith('ana@ejemplo.com', '123456');
});

it('«Usar otro email» vuelve al primer paso', async () => {
  render(<Ingresar />);
  await userEvent.type(screen.getByLabelText('Tu email'), 'ana@ejemplo.com{Enter}');
  await userEvent.click(await screen.findByRole('button', { name: 'Usar otro email' }));
  expect(screen.getByRole('heading', { name: 'Stock del hogar' })).toBeInTheDocument();
});

it('«Probar la demo» entra a la demo', async () => {
  render(<Ingresar />);
  await userEvent.click(screen.getByRole('button', { name: 'Probar la demo' }));
  expect(sesion.entrarDemo).toHaveBeenCalledTimes(1);
});
