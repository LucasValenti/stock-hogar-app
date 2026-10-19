import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Campo } from './Campo';

const css = readFileSync(resolve(process.cwd(), 'src/ui/Campo.module.css'), 'utf8');

describe('Campo', () => {
  test('se encuentra por su etiqueta, avisa lo tipeado y mide al menos medida.tactil', async () => {
    const alCambiar = vi.fn();
    function Controlado() {
      const [valor, setValor] = useState('');
      return (
        <Campo
          etiqueta="Nota"
          ayuda="Opcional"
          value={valor}
          onChange={(e) => {
            setValor(e.target.value);
            alCambiar(e.target.value);
          }}
        />
      );
    }
    render(<Controlado />);
    const entrada = screen.getByLabelText('Nota');
    await userEvent.type(entrada, 'Compra del sábado');
    expect(alCambiar).toHaveBeenLastCalledWith('Compra del sábado');
    expect(entrada).toHaveValue('Compra del sábado');
    expect(css).toMatch(/\.entrada[^{]*\{[^}]*min-height:\s*var\(--medida-tactil\)/s);
    const ayuda = document.getElementById(entrada.getAttribute('aria-describedby') ?? '');
    expect(ayuda).toHaveTextContent('Opcional');
  });

  test('el error reemplaza la ayuda, se anuncia y pinta el borde en falta', () => {
    render(<Campo etiqueta="Monto" value="x" onChange={vi.fn()} ayuda="Opcional" error="Ingresá un monto." />);
    expect(screen.queryByText('Opcional')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresá un monto.');
    expect(screen.getByLabelText('Monto')).toHaveAttribute('aria-invalid', 'true');
    expect(css).toMatch(/\.conError[^{]*\{[^}]*border-color:\s*var\(--color-falta\)/s);
  });

  test('el error se anuncia una sola vez; la ayuda va como descripción del campo', () => {
    const { unmount } = render(
      <Campo etiqueta="Monto" value="x" onChange={vi.fn()} ayuda="Opcional" error="Ingresá un monto." />,
    );
    const conError = screen.getByLabelText('Monto');
    const idsError = (conError.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    expect(idsError).toHaveLength(1);
    expect(document.getElementById(idsError[0])).toHaveTextContent('Ingresá un monto.');
    expect(screen.getAllByText('Ingresá un monto.')).toHaveLength(1);
    unmount();

    render(<Campo etiqueta="Nota" value="" onChange={vi.fn()} ayuda="Opcional" />);
    const conAyuda = screen.getByLabelText('Nota');
    const idAyuda = conAyuda.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(idAyuda)).toHaveTextContent('Opcional');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('bloqueado no se edita y lo dice', async () => {
    const alCambiar = vi.fn();
    render(<Campo etiqueta="Monto" value="500" onChange={alCambiar} bloqueado />);
    const entrada = screen.getByLabelText('Monto');
    expect(entrada).toHaveAttribute('readonly');
    expect(entrada).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(entrada, '1');
    expect(alCambiar).not.toHaveBeenCalled();
    expect(entrada).toHaveValue('500');
  });

  test('grande: cifras tabulares grandes y centradas', () => {
    render(<Campo etiqueta="Monto" value="0" onChange={vi.fn()} grande />);
    expect(screen.getByLabelText('Monto').className).not.toBe('');
    expect(css).toMatch(/\.grande[^{]*\{[^}]*font-size:\s*var\(--tamano-xxxl\)/s);
    expect(css).toMatch(/\.grande[^{]*\{[^}]*text-align:\s*center/s);
    expect(css).toMatch(/\.grande[^{]*\{[^}]*font-variant-numeric:\s*tabular-nums/s);
  });
});
