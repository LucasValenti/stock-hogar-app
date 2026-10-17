import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import tokens from '@/tema/tokens.json';

import { BarraPestanas } from './BarraPestanas';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const plano = (s: unknown) => StyleSheet.flatten(s as never) ?? {};

async function dibujar(activa: 'index' | 'stock' | 'analisis' | 'ajustes' = 'index') {
  const alIr = jest.fn();
  const alCargar = jest.fn();
  await render(<BarraPestanas activa={activa} alIr={alIr} alCargar={alCargar} />);
  return { alIr, alCargar };
}

describe('BarraPestanas', () => {
  test('dibuja Inicio, Stock, Cargar, Análisis y Ajustes', async () => {
    await dibujar();
    for (const nombre of ['Inicio', 'Stock', 'Análisis', 'Ajustes']) {
      expect(screen.getByRole('tab', { name: nombre })).toBeTruthy();
      expect(screen.getByText(nombre)).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Cargar gasto' })).toBeTruthy();
  });

  test('la pestaña activa está seleccionada y las otras no', async () => {
    await dibujar('stock');
    expect(screen.getByRole('tab', { name: 'Stock' }).props.accessibilityState).toMatchObject({ selected: true });
    for (const nombre of ['Inicio', 'Análisis', 'Ajustes']) {
      expect(screen.getByRole('tab', { name: nombre }).props.accessibilityState).toMatchObject({ selected: false });
    }
  });

  test('la activa lleva la píldora de medida.indicadorAncho × indicadorAlto en acento; las otras la reservan vacía', async () => {
    await dibujar('analisis');
    const activo = plano(screen.getByTestId('indicador-analisis').props.style);
    expect(activo).toMatchObject({
      width: tokens.medida.indicadorAncho,
      height: tokens.medida.indicadorAlto,
      backgroundColor: tokens.color.claro.acento,
    });
    const inactivo = plano(screen.getByTestId('indicador-index').props.style);
    expect(inactivo).toMatchObject({ width: tokens.medida.indicadorAncho, height: tokens.medida.indicadorAlto });
    expect(inactivo.backgroundColor).not.toBe(tokens.color.claro.acento);
  });

  test('Cargar es un círculo de medida.cargar con el rótulo «Cargar gasto»', async () => {
    const { alCargar } = await dibujar();
    const cargar = screen.getByRole('button', { name: 'Cargar gasto' });
    expect(plano(cargar.props.style)).toMatchObject({ width: tokens.medida.cargar, height: tokens.medida.cargar });
    fireEvent.press(cargar);
    expect(alCargar).toHaveBeenCalledTimes(1);
  });

  test('tocar una pestaña avisa cuál', async () => {
    const { alIr } = await dibujar();
    fireEvent.press(screen.getByRole('tab', { name: 'Ajustes' }));
    expect(alIr).toHaveBeenCalledWith('ajustes');
  });

  test('las etiquetas crecen con la letra del sistema hasta letra.escalaMaxBarra', async () => {
    await dibujar();
    const etiqueta = screen.getByText('Inicio');
    expect(etiqueta.props.allowFontScaling).not.toBe(false);
    expect(etiqueta.props.maxFontSizeMultiplier).toBe(tokens.letra.escalaMaxBarra);
    expect(etiqueta.props.numberOfLines).toBe(1);
  });
});
