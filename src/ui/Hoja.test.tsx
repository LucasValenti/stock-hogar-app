import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Hoja } from './Hoja';

describe('Hoja', () => {
  test('cerrada no muestra nada', () => {
    render(
      <Hoja visible={false} titulo="Agregar producto" alCerrar={vi.fn()}>
        <span>Yerba</span>
      </Hoja>,
    );
    expect(screen.queryByText('Agregar producto')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('abierta: título como encabezado, subtítulo, contenido y pie; queda como diálogo modal', () => {
    render(
      <Hoja visible titulo="Agregar producto" subtitulo="Tildá lo comprado." alCerrar={vi.fn()} pie={<span>Pie</span>}>
        <span>Yerba</span>
      </Hoja>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
    expect(screen.getByRole('heading', { name: 'Agregar producto' })).toBeInTheDocument();
    expect(screen.getByText('Tildá lo comprado.')).toBeInTheDocument();
    expect(screen.getByText('Yerba')).toBeInTheDocument();
    expect(screen.getByText('Pie')).toBeInTheDocument();
  });

  test('tocar el velo (o el botón Cerrar) cierra', async () => {
    const alCerrar = vi.fn();
    render(
      <Hoja visible titulo="Categoría" alCerrar={alCerrar}>
        <span>Luz</span>
      </Hoja>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });
});
