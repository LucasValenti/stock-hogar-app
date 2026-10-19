import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Paso } from './Paso';

const css = readFileSync(resolve(process.cwd(), 'src/ui/Paso.module.css'), 'utf8');

async function dibujar(valor: string, decimales = false) {
  const alCambiar = vi.fn();
  render(<Paso nombre="Yerba" valor={valor} decimales={decimales} alCambiar={alCambiar} />);
  return alCambiar;
}

describe('Paso', () => {
  test('+ suma 1, − resta 1, y los botones miden medida.tactil', async () => {
    const alCambiar = await dibujar('2');
    const mas = screen.getByRole('button', { name: 'Sumar 1 a Yerba' });
    expect(css).toMatch(/min-width:\s*var\(--medida-tactil\)/);
    expect(css).toMatch(/min-height:\s*var\(--medida-tactil\)/);
    await userEvent.click(mas);
    expect(alCambiar).toHaveBeenLastCalledWith('3');
    await userEvent.click(screen.getByRole('button', { name: 'Restar 1 a Yerba' }));
    expect(alCambiar).toHaveBeenLastCalledWith('1');
  });

  test('con decimales suma sin ruido de coma flotante y escribe con coma', async () => {
    const alCambiar = await dibujar('1,1', true);
    await userEvent.click(screen.getByRole('button', { name: 'Sumar 1 a Yerba' }));
    expect(alCambiar).toHaveBeenLastCalledWith('2,1');
    expect(screen.getByLabelText('Cantidad de Yerba')).toHaveAttribute('inputmode', 'decimal');
  });

  test('− no baja de lo mínimo: en 1 queda deshabilitado', async () => {
    const alCambiar = await dibujar('1');
    const menos = screen.getByRole('button', { name: 'Restar 1 a Yerba' });
    expect(menos).toBeDisabled();
    await userEvent.click(menos);
    expect(alCambiar).not.toHaveBeenCalled();
  });

  test('la cantidad se puede tipear; sin decimales usa el teclado numérico', async () => {
    const alCambiar = vi.fn();
    function Controlado() {
      const [valor, setValor] = useState('1');
      return (
        <Paso
          nombre="Yerba"
          valor={valor}
          decimales={false}
          alCambiar={(texto) => {
            setValor(texto);
            alCambiar(texto);
          }}
        />
      );
    }
    render(<Controlado />);
    const cantidad = screen.getByLabelText('Cantidad de Yerba');
    expect(cantidad).toHaveAttribute('inputmode', 'numeric');
    await userEvent.clear(cantidad);
    await userEvent.type(cantidad, '4');
    expect(alCambiar).toHaveBeenLastCalledWith('4');
    expect(cantidad).toHaveValue('4');
  });
});
