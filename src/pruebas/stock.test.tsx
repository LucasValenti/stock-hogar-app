// Stock con la capa de datos simulada: pestañas, buscador, − y + (con la unidad y sin conexión),
// la cantidad exacta, las anotaciones rápidas y los accesos a la ficha y al alta. (Fuera de src/app.)

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import Stock from '@/app/(pestanas)/stock';
import type { Anotacion, Producto } from '@/logica/tipos';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), setParams: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: { vista?: string } = {};
// La pantalla se vuelve a enfocar cuando la prueba llama a la última función registrada.
const mockFoco: Array<() => void> = [];
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    get router() {
      return mockRouter;
    },
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (fn: () => void) => {
      useEffect(() => {
        mockFoco.push(fn);
        return fn();
      }, [fn]);
    },
  };
});

const mockDatos = {
  productos: jest.fn(),
  categorias: jest.fn(),
  anotaciones: jest.fn(),
  ajustarStock: jest.fn(),
  crearAnotacion: jest.fn(),
  borrarAnotacion: jest.fn(),
  escucharCambios: jest.fn((_f: () => void) => () => undefined),
};
jest.mock('@/datos', () => ({
  get datos() {
    return mockDatos;
  },
}));

const producto = (id: string, nombre: string, stock: number, unidad: Producto['unidad'], extra: Partial<Producto> = {}): Producto => ({
  id,
  nombre,
  stock,
  unidad,
  oculto: false,
  codigo_barras: null,
  marca: null,
  categoria_id: 'almacen',
  ultimo_movimiento: '2026-10-01T12:00:00.000Z',
  creado: '2026-01-01T12:00:00.000Z',
  ...extra,
});
const pan: Anotacion = { id: 'pan', texto: 'Comprar pan', creado_por: 'ana', creado: '2026-10-01T12:00:00.000Z' };
const sinConexion = Object.assign(new Error('Sin conexión: no se guardó el cambio de stock. Probá de nuevo.'), { code: 'SIN_CONEXION' });

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockFoco.length = 0;
  mockDatos.categorias.mockResolvedValue([
    { id: 'almacen', nombre: 'Almacén', tipo: 'producto', dias_sin_movimiento: 20 },
    { id: 'limpieza', nombre: 'Limpieza', tipo: 'producto', dias_sin_movimiento: 30 },
  ]);
  mockDatos.productos.mockResolvedValue([
    producto('yerba', 'Yerba', 0, 'paquete'),
    producto('harina', 'Harina', 2.5, 'kg', { marca: 'Molino' }),
    producto('leche', 'Leche', 0, 'litro'),
    producto('detergente', 'Detergente', 3, 'unidad', { categoria_id: 'limpieza' }),
    producto('fernet', 'Fernet', 0, 'unidad', { oculto: true }),
  ]);
  mockDatos.anotaciones.mockResolvedValue([pan]);
  // Como la base: devuelve el stock nuevo.
  const enBase: Record<string, number> = { yerba: 0, harina: 2.5, leche: 0, detergente: 3, fernet: 0 };
  mockDatos.ajustarStock.mockImplementation(async (id: string, delta: number) => {
    enBase[id] = Math.max(0, Math.round((enBase[id] + delta) * 1000) / 1000);
    return enBase[id];
  });
  mockDatos.crearAnotacion.mockImplementation(async (texto: string) => ({ ...pan, id: 'nueva', texto }));
  mockDatos.borrarAnotacion.mockResolvedValue(undefined);
});

async function abrir() {
  await render(<Stock />);
  await screen.findByRole('tab', { name: 'Todo' });
}
const tocar = (rol: 'button' | 'tab', nombre: string | RegExp) => fireEvent.press(screen.getByRole(rol, { name: nombre }));
const escribir = (etiqueta: string, texto: string) => fireEvent.changeText(screen.getByLabelText(etiqueta), texto);
const fila = (nombre: string | RegExp) => screen.queryByRole('button', { name: nombre });

test('Todo agrupa por categoría lo que no está oculto; Pendientes y Ocultos cuentan lo suyo', async () => {
  await abrir();
  expect(screen.getByRole('tab', { name: 'Todo' }).props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByRole('tab', { name: 'Pendientes 3' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Ocultos 1' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Almacén' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Limpieza' })).toBeTruthy();
  expect(fila('Yerba, Falta')).toBeTruthy();
  expect(fila('Harina · Molino, Hay')).toBeTruthy();
  expect(fila('Detergente, Hay')).toBeTruthy();
  expect(fila(/^Fernet/)).toBeNull();
  // La anotación se ve como notita, para hacerla producto.
  expect(screen.getByRole('button', { name: 'Anotado: Comprar pan · tocalo para hacerlo producto' })).toBeTruthy();

  await tocar('tab', 'Pendientes 3');
  expect(fila('Yerba, Falta')).toBeTruthy();
  expect(fila('Leche, Falta')).toBeTruthy();
  expect(fila(/^Harina/)).toBeNull();
  expect(fila('Comprar pan, Anotación rápida')).toBeTruthy();

  await tocar('tab', 'Ocultos 1');
  expect(fila('Fernet, Oculto')).toBeTruthy();
  expect(fila(/^Yerba/)).toBeNull();
  expect(mockRouter.setParams).toHaveBeenLastCalledWith({ vista: 'ocultos' });
});

test('abre en la pestaña que pide el enlace (Inicio › Pendientes)', async () => {
  mockParams = { vista: 'pendientes' };
  await abrir();
  expect(screen.getByRole('tab', { name: 'Pendientes 3' }).props.accessibilityState).toMatchObject({ selected: true });
});

test('el buscador filtra por nombre o marca y se limpia en cada visita', async () => {
  await abrir();
  await escribir('Buscar en el stock', 'molino');
  expect(fila(/^Harina/)).toBeTruthy();
  expect(fila(/^Yerba/)).toBeNull();
  await escribir('Buscar en el stock', 'zzz');
  expect(screen.getByText('Ningún producto coincide con «zzz».')).toBeTruthy();

  await act(async () => mockFoco[mockFoco.length - 1]());
  expect(screen.getByLabelText('Buscar en el stock').props.value).toBe('');
  expect(await screen.findByRole('button', { name: 'Yerba, Falta' })).toBeTruthy();
});

test('− baja según deltaMenos (2,5 kg → 2) y + suma 1; en 0 el − no hace nada', async () => {
  await abrir();
  expect(screen.getByRole('button', { name: 'Cantidad de Harina · Molino: 2,5 kg' })).toBeTruthy();
  await tocar('button', 'Restar a Harina · Molino');
  expect(mockDatos.ajustarStock).toHaveBeenLastCalledWith('harina', -0.5);
  expect(await screen.findByRole('button', { name: 'Cantidad de Harina · Molino: 2 kg' })).toBeTruthy();

  await tocar('button', 'Sumar uno a Detergente');
  expect(mockDatos.ajustarStock).toHaveBeenLastCalledWith('detergente', 1);
  expect(await screen.findByRole('button', { name: 'Cantidad de Detergente: 4' })).toBeTruthy();

  const menosYerba = screen.getByRole('button', { name: 'Restar a Yerba' });
  expect(menosYerba.props.accessibilityState).toMatchObject({ disabled: true });
  await fireEvent.press(menosYerba);
  expect(mockDatos.ajustarStock).toHaveBeenCalledTimes(2);
});

test('sin conexión: avisa y el número vuelve a lo que era', async () => {
  mockDatos.ajustarStock.mockRejectedValueOnce(sinConexion);
  await abrir();
  await tocar('button', 'Sumar uno a Detergente');
  expect(await screen.findByText('Sin conexión: no se guardó el cambio de stock. Probá de nuevo.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cantidad de Detergente: 3' })).toBeTruthy();
});

test('en Pendientes, lo que se toca no desaparece bajo el dedo', async () => {
  await abrir();
  await tocar('tab', 'Pendientes 3');
  await tocar('button', 'Sumar uno a Yerba');
  expect(await screen.findByRole('button', { name: 'Cantidad de Yerba: 1' })).toBeTruthy();
  expect(fila('Yerba, Hay')).toBeTruthy();
});

test('la cantidad exacta se escribe según la unidad', async () => {
  await abrir();
  await tocar('button', 'Cantidad de Harina · Molino: 2,5 kg');
  expect(screen.getByRole('header', { name: '¿Cuánto hay de Harina · Molino?' })).toBeTruthy();
  await escribir('Cantidad en kg', '1,25');
  await tocar('button', 'Guardar cantidad');
  expect(mockDatos.ajustarStock).toHaveBeenLastCalledWith('harina', -1.25);
  expect(screen.queryByRole('header', { name: '¿Cuánto hay de Harina · Molino?' })).toBeNull();

  await tocar('button', 'Cantidad de Detergente: 3');
  await escribir('Cantidad', '1,5');
  await tocar('button', 'Guardar cantidad');
  expect(screen.getByText('Para unidades y paquetes, solo números enteros.')).toBeTruthy();
  expect(mockDatos.ajustarStock).toHaveBeenCalledTimes(1);
});

test('anotación rápida: se crea, se convierte en producto con su texto y se borra', async () => {
  await abrir();
  await tocar('button', 'Anotar');
  expect(screen.getByText('Escribí qué falta.')).toBeTruthy();
  expect(mockDatos.crearAnotacion).not.toHaveBeenCalled();
  await escribir('Anotá algo que falta', '  Pilas AA ');
  await tocar('button', 'Anotar');
  expect(mockDatos.crearAnotacion).toHaveBeenCalledWith('Pilas AA');
  expect(await screen.findByRole('button', { name: 'Anotado: Pilas AA · tocalo para hacerlo producto' })).toBeTruthy();
  expect(screen.getByLabelText('Anotá algo que falta').props.value).toBe('');

  await tocar('button', 'Anotado: Comprar pan · tocalo para hacerlo producto');
  const hoja = within(screen.getByTestId('hoja'));
  expect(hoja.getByRole('header', { name: 'Comprar pan' })).toBeTruthy();
  await fireEvent.press(hoja.getByRole('button', { name: 'Hacerla producto' }));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/producto/nuevo', params: { nombre: 'Comprar pan', anotacion: 'pan' } });

  await tocar('button', 'Anotado: Comprar pan · tocalo para hacerlo producto');
  await fireEvent.press(within(screen.getByTestId('hoja')).getByRole('button', { name: 'Borrar nota' }));
  expect(mockDatos.borrarAnotacion).toHaveBeenCalledWith('pan');
  expect(screen.queryByRole('button', { name: /^Anotado: Comprar pan/ })).toBeNull();
});

test('una nota que no se pudo guardar sin conexión queda escrita, con el aviso', async () => {
  mockDatos.crearAnotacion.mockRejectedValueOnce(
    Object.assign(new Error('Sin conexión: no se guardó la nota. Probá de nuevo.'), { code: 'SIN_CONEXION' }),
  );
  await abrir();
  await escribir('Anotá algo que falta', 'Pilas AA');
  await tocar('button', 'Anotar');
  expect(await screen.findByText('Sin conexión: no se guardó la nota. Probá de nuevo.')).toBeTruthy();
  expect(screen.getByLabelText('Anotá algo que falta').props.value).toBe('Pilas AA');
});

test('el nombre abre la ficha y «Nuevo producto» abre el alta', async () => {
  await abrir();
  await tocar('button', 'Harina · Molino, Hay');
  expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/producto/[id]', params: { id: 'harina' } });
  await tocar('button', 'Nuevo producto');
  expect(mockRouter.push).toHaveBeenLastCalledWith('/producto/nuevo');
});

test('vacíos: sin productos, sin pendientes y sin ocultos', async () => {
  mockDatos.productos.mockResolvedValue([]);
  mockDatos.anotaciones.mockResolvedValue([]);
  await abrir();
  expect(screen.getByText('El stock está vacío')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Nuevo producto' })).toHaveLength(1);
  await tocar('tab', 'Pendientes 0');
  expect(screen.getByText('No falta nada')).toBeTruthy();
  await tocar('tab', 'Ocultos');
  expect(screen.getByText('No hay productos ocultos')).toBeTruthy();
});

test('si no se pudo leer, avisa con Reintentar', async () => {
  mockDatos.productos.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await render(<Stock />);
  expect(await screen.findByText('No pudimos traer el stock')).toBeTruthy();
  await tocar('button', 'Reintentar');
  expect(await screen.findByRole('tab', { name: 'Todo' })).toBeTruthy();
});
