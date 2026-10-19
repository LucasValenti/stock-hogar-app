import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Chip } from './Chip';

const css = readFileSync(resolve(process.cwd(), 'src/ui/Chip.module.css'), 'utf8');

describe('Chip', () => {
  test('como opción: botón con aria-pressed, activo lleno de acento, alto ≥ medida.tactil', async () => {
    const onClick = vi.fn();
    render(
      <>
        <Chip texto="Ana" activo onClick={onClick} />
        <Chip texto="Bruno" activo={false} onClick={onClick} />
      </>,
    );
    const ana = screen.getByRole('button', { name: 'Ana' });
    expect(ana).toHaveAttribute('aria-pressed', 'true');
    expect(css).toMatch(/\.chip\[aria-pressed='true'\][^{]*\{[^}]*background:\s*var\(--color-acento\)/s);
    expect(css).toMatch(/min-height:\s*var\(--medida-tactil\)/);
    const bruno = screen.getByRole('button', { name: 'Bruno' });
    expect(bruno).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(bruno);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('con flecha es un botón que abre una hoja; bloqueado no responde', async () => {
    const onClick = vi.fn();
    render(<Chip texto="Súper" flecha aria-label="Categoría: Súper" bloqueado onClick={onClick} />);
    const chip = screen.getByRole('button', { name: 'Categoría: Súper' });
    expect(chip).toBeDisabled();
    expect(chip.querySelector('svg')).not.toBeNull();
    await userEvent.click(chip);
    expect(onClick).not.toHaveBeenCalled();
  });
});
