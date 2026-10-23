import { formatear } from '@/logica/dinero';
import { textoPendientes } from '@/logica/stock';

import { armarResumen, faltantesEnOrden, formatearMonto, semanaDe, textoFaltantes } from './resumen';

describe('armarResumen', () => {
  test('con gastos y faltantes: total de la semana y lo que falta', () => {
    expect(
      armarResumen({ gastos: [1200000, 2000000, 1320000], faltantes: ['Leche', 'Yerba', 'Arroz', 'Fideos'] }),
    ).toEqual({
      titulo: 'Stock del hogar',
      // Intl pone un espacio duro después del $, como en el resto de la app.
      cuerpo: `Tu semana en la casa: ${formatear(4520000)} en 3 gastos. Faltan Leche, Yerba y 2 más.`,
    });
    expect(formatear(4520000)).toBe('$ 45.200');
  });

  test('un solo gasto va en singular', () => {
    expect(armarResumen({ gastos: [990050], faltantes: [] })?.cuerpo).toBe('Tu semana en la casa: $ 9.900,50 en 1 gasto.');
  });

  test('solo faltantes: no habla de gastos', () => {
    expect(armarResumen({ gastos: [], faltantes: ['Leche', 'Yerba'] })?.cuerpo).toBe('Faltan Leche y Yerba.');
  });

  test('semana vacía: no se manda nada', () => {
    expect(armarResumen({ gastos: [], faltantes: [] })).toBeNull();
  });
});

describe('textoFaltantes', () => {
  test.each([
    [[], ''],
    [['Leche'], 'Falta Leche.'],
    [['Leche', 'Yerba'], 'Faltan Leche y Yerba.'],
    [['Leche', 'Yerba', 'Arroz'], 'Faltan Leche, Yerba y 1 más.'],
    [['Leche', 'Yerba', 'Arroz', 'Fideos', 'Sal'], 'Faltan Leche, Yerba y 3 más.'],
  ])('%j → %s, igual que Inicio', (nombres, texto) => {
    expect(textoFaltantes(nombres)).toBe(texto);
    expect(textoFaltantes(nombres)).toBe(textoPendientes(nombres));
  });
});

describe('formatearMonto', () => {
  test.each([0, 100, 4520000, 990050, 12345678901, 5])('%i centavos se escriben igual que en la app', (centavos) => {
    expect(formatearMonto(centavos)).toBe(formatear(centavos));
  });
});

describe('faltantesEnOrden', () => {
  test('primero los productos sin stock, después las anotaciones de la más vieja a la más nueva', () => {
    expect(
      faltantesEnOrden(
        ['Leche', 'Yerba'],
        [
          { texto: 'Pan', creado: '2026-10-20T12:00:00Z' },
          { texto: 'Pilas', creado: '2026-10-18T09:00:00Z' },
        ],
      ),
    ).toEqual(['Leche', 'Yerba', 'Pilas', 'Pan']);
  });
});

describe('semanaDe', () => {
  // El cron corre el domingo a las 23:00 UTC, que en Argentina (UTC−3) son las 20:00 del domingo.
  test('el domingo a las 20 de Argentina toma de lunes a domingo de esa semana', () => {
    expect(semanaDe(new Date('2026-10-25T23:00:00Z'))).toEqual({ desde: '2026-10-19', hasta: '2026-10-25' });
  });

  test('el borde lo pone la hora de Argentina, no la de UTC', () => {
    // Lunes 02:00 UTC = domingo 23:00 en Argentina: todavía es la semana que termina ese domingo.
    expect(semanaDe(new Date('2026-10-26T02:00:00Z'))).toEqual({ desde: '2026-10-19', hasta: '2026-10-25' });
    // Lunes 03:00 UTC = lunes 00:00 en Argentina: empieza la semana nueva.
    expect(semanaDe(new Date('2026-10-26T03:00:00Z'))).toEqual({ desde: '2026-10-26', hasta: '2026-11-01' });
  });

  test('cruza meses y años', () => {
    expect(semanaDe(new Date('2027-01-01T15:00:00Z'))).toEqual({ desde: '2026-12-28', hasta: '2027-01-03' });
  });
});
