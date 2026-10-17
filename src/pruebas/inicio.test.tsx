// Inicio con la capa de datos simulada: los estados de la maqueta «Elegida», la actualización en vivo,
// «¿Todavía hay?», el aviso de pendientes y los últimos gastos.
// (La prueba vive fuera de src/app para que Expo Router no la tome como pantalla.)

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import Inicio from '@/app/(pestanas)/index';
import { formatear } from '@/logica/dinero';
import type { Categoria, Integrante, Producto } from '@/logica/tipos';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));
jest.mock('@/sesion/sesion', () => ({ useSesion: () => ({ yo: { id: 'a', nombre: 'Ana' } }) }));

const mockDatos = {
  integrantes: jest.fn(),
  gastosEntre: jest.fn(),
  escucharCambios: jest.fn(),
  categorias: jest.fn(),
  productos: jest.fn(),
  anotaciones: jest.fn(),
  confirmarHay: jest.fn(),
  ajustarStock: jest.fn(),
};
const mockCola = { pendientes: jest.fn(), rechazadas: jest.fn(), olvidarRechazada: jest.fn() };
jest.mock('@/datos', () => ({
  get datos() {
    return mockDatos;
  },
  obtenerCola: () => mockCola,
  escucharDescartes: () => () => undefined,
}));

const persona = (id: string, nombre: string, sueldo: number): Integrante => ({
  id,
  nombre,
  sueldo,
  email: `${id}@example.com`,
  activo: true,
  baja_desde: null,
  tipo: 'integrante',
  creado: '2026-01-01T12:00:00.000Z',
});
const casa = [persona('a', 'Ana', 600), persona('b', 'Bruno', 400)];
const gasto = (pagado_por: string, total: number) => ({ pagado_por, total, fecha: '2026-10-05', id: `${pagado_por}${total}` });

const DIA = 24 * 60 * 60 * 1000;
const haceDias = (n: number) => new Date(Date.now() - n * DIA).toISOString();
const almacen: Categoria = { id: 'almacen', nombre: 'Almacén', tipo: 'producto', dias_sin_movimiento: 20 };
const producto = (id: string, nombre: string, stock: number, quieto: number, extra: Partial<Producto> = {}): Producto => ({
  id,
  nombre,
  stock,
  unidad: 'paquete',
  oculto: false,
  codigo_barras: null,
  marca: null,
  categoria_id: 'almacen',
  ultimo_movimiento: haceDias(quieto),
  creado: '2026-01-01T12:00:00.000Z',
  ...extra,
});
const sinConexion = () => Object.assign(new Error('Sin conexión: no se guardó. Probá de nuevo.'), { code: 'SIN_CONEXION' });

let avisarCambio: () => void = () => undefined;
beforeEach(() => {
  jest.clearAllMocks();
  mockDatos.integrantes.mockResolvedValue(casa);
  mockDatos.categorias.mockResolvedValue([almacen]);
  mockDatos.productos.mockResolvedValue([]);
  mockDatos.anotaciones.mockResolvedValue([]);
  mockDatos.confirmarHay.mockResolvedValue(undefined);
  mockDatos.ajustarStock.mockResolvedValue(0);
  mockCola.pendientes.mockResolvedValue([]);
  mockCola.rechazadas.mockResolvedValue([]);
  mockDatos.escucharCambios.mockImplementation((f: () => void) => {
    avisarCambio = f;
    return () => undefined;
  });
});

test('mientras carga muestra el esqueleto y «Trayendo los gastos de la casa…»', async () => {
  mockDatos.gastosEntre.mockReturnValue(new Promise(() => undefined));
  await render(<Inicio />);
  expect(screen.getByText('Hola, Ana')).toBeTruthy();
  expect(screen.getByText('Trayendo los gastos de la casa…')).toBeTruthy();
});

test('con gastos muestra el total del mes y cómo viene el reparto, con signo y palabra', async () => {
  mockDatos.gastosEntre.mockResolvedValue([gasto('a', 1000_00)]);
  await render(<Inicio />);
  expect(await screen.findByLabelText(`Gastos del mes: ${formatear(1000_00)}. 1 gasto.`)).toBeTruthy();
  expect(screen.getByText('Cómo viene el reparto')).toBeTruthy();
  // Ana puso todo y le toca 60 %: recibe 400; Bruno pone 400.
  expect(screen.getByText(`+ ${formatear(400_00)}`)).toBeTruthy();
  expect(screen.getByText('recibe')).toBeTruthy();
  expect(screen.getByText(`− ${formatear(400_00)}`)).toBeTruthy();
  expect(screen.getByText('pone')).toBeTruthy();
});

test('sin conexión avisa «No pudimos traer los datos» y Reintentar vuelve a pedir', async () => {
  mockDatos.gastosEntre.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await render(<Inicio />);
  expect(await screen.findByText('No pudimos traer los datos')).toBeTruthy();
  mockDatos.gastosEntre.mockResolvedValue([]);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Reintentar' })));
  expect(await screen.findByText(/^Arrancó /)).toBeTruthy();
});

test('un mes sin gastos muestra $ 0 y el aviso con «Cargar gasto»', async () => {
  mockDatos.gastosEntre.mockResolvedValue([]);
  await render(<Inicio />);
  expect(await screen.findByText('Todavía no cargó nadie')).toBeTruthy();
  expect(screen.getByText(formatear(0))).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cargar gasto' })).toBeTruthy();
});

test('varios avisos seguidos (un gasto con sus ítems) piden los datos una sola vez', async () => {
  mockDatos.gastosEntre.mockResolvedValue([]);
  await render(<Inicio />);
  await screen.findByText('Todavía no cargó nadie');
  expect(mockDatos.gastosEntre).toHaveBeenCalledTimes(1);
  mockDatos.gastosEntre.mockResolvedValue([gasto('b', 500_00)]);
  await act(async () => {
    avisarCambio();
    avisarCambio();
    avisarCambio();
  });
  expect(await screen.findByLabelText(`Gastos del mes: ${formatear(500_00)}. 1 gasto.`)).toBeTruthy();
  expect(mockDatos.gastosEntre).toHaveBeenCalledTimes(2);
});

test('se actualiza solo cuando alguien cambia algo', async () => {
  mockDatos.gastosEntre.mockResolvedValue([]);
  await render(<Inicio />);
  await screen.findByText('Todavía no cargó nadie');
  mockDatos.gastosEntre.mockResolvedValue([gasto('b', 500_00)]);
  await act(async () => avisarCambio());
  expect(await screen.findByLabelText(`Gastos del mes: ${formatear(500_00)}. 1 gasto.`)).toBeTruthy();
});

test('avisa los gastos de quien tiene la sesión que esperan conexión', async () => {
  mockDatos.gastosEntre.mockResolvedValue([]);
  mockCola.pendientes.mockResolvedValue([
    { id: 'o1', tipo: 'guardarGasto', duenio: 'a', datos: {} },
    { id: 'o2', tipo: 'guardarGasto', duenio: 'b', datos: {} },
  ]);
  await render(<Inicio />);
  expect(await screen.findByText('1 gasto guardado en el celu: se manda cuando vuelva la conexión.')).toBeTruthy();
});

// ——— «¿Todavía hay?» ———

const yerba = () => producto('yerba', 'Yerba', 3, 40);
const arroz = () => producto('arroz', 'Arroz', 1, 30);
const tarjetaHay = () => within(screen.getByTestId('todavia-hay'));

test('«¿Todavía hay?» muestra de a uno, el que lleva más tiempo quieto, con Hay, Falta y Ajustar', async () => {
  mockDatos.gastosEntre.mockResolvedValue([]);
  mockDatos.productos.mockResolvedValue([arroz(), yerba(), producto('cafe', 'Café', 2, 3), producto('sal', 'Sal', 0, 90)]);
  await render(<Inicio />);
  expect(await screen.findByText('¿Todavía hay Yerba?')).toBeTruthy();
  expect(screen.queryByText('¿Todavía hay Arroz?')).toBeNull();
  // Ni lo reciente (café) ni lo que ya falta (sal: está en pendientes).
  expect(screen.queryByText(/Café\?|Sal\?/)).toBeNull();
  expect(tarjetaHay().getByText('Hace 40 días que no cambia. En Stock: 3.')).toBeTruthy();
  for (const nombre of ['Hay', 'Falta', 'Ajustar']) expect(tarjetaHay().getByRole('button', { name: nombre })).toBeTruthy();
});

test('Hay confirma, y la tarjeta pasa al siguiente al instante', async () => {
  mockDatos.gastosEntre.mockResolvedValue([]);
  mockDatos.productos.mockResolvedValue([arroz(), yerba()]);
  mockDatos.confirmarHay.mockReturnValue(new Promise(() => undefined));
  await render(<Inicio />);
  await screen.findByText('¿Todavía hay Yerba?');
  await act(async () => fireEvent.press(tarjetaHay().getByRole('button', { name: 'Hay' })));
  expect(mockDatos.confirmarHay).toHaveBeenCalledWith('yerba');
  expect(screen.getByText('¿Todavía hay Arroz?')).toBeTruthy();
});

test('Falta deja el stock en 0', async () => {
  mockDatos.gastosEntre.mockResolvedValue([]);
  mockDatos.productos.mockResolvedValue([yerba()]);
  await render(<Inicio />);
  await screen.findByText('¿Todavía hay Yerba?');
  await act(async () => fireEvent.press(tarjetaHay().getByRole('button', { name: 'Falta' })));
  expect(mockDatos.ajustarStock).toHaveBeenCalledWith('yerba', -3);
  expect(screen.queryByTestId('todavia-hay')).toBeNull();
});

test('Ajustar pide la cantidad según la unidad y la deja como dijo', async () => {
  mockDatos.gastosEntre.mockResolvedValue([]);
  mockDatos.productos.mockResolvedValue([yerba(), producto('harina', 'Harina', 2, 25, { unidad: 'kg' })]);
  await render(<Inicio />);
  await screen.findByText('¿Todavía hay Yerba?');
  await act(async () => fireEvent.press(tarjetaHay().getByRole('button', { name: 'Ajustar' })));
  const hoja = within(screen.getByTestId('hoja'));
  expect(hoja.getByText('¿Cuánto hay de Yerba?')).toBeTruthy();
  await act(async () => fireEvent.changeText(hoja.getByLabelText('Cantidad'), '1,5'));
  await act(async () => fireEvent.press(hoja.getByRole('button', { name: 'Guardar cantidad' })));
  expect(hoja.getByText('Para unidades y paquetes, solo números enteros.')).toBeTruthy();
  expect(mockDatos.ajustarStock).not.toHaveBeenCalled();
  await act(async () => fireEvent.changeText(hoja.getByLabelText('Cantidad'), '1'));
  await act(async () => fireEvent.press(hoja.getByRole('button', { name: 'Guardar cantidad' })));
  expect(mockDatos.ajustarStock).toHaveBeenCalledWith('yerba', -2);
  expect(screen.getByText('¿Todavía hay Harina?')).toBeTruthy();
});

test('Ajustar a la misma cantidad cuenta como «Hay»', async () => {
  mockDatos.gastosEntre.mockResolvedValue([]);
  mockDatos.productos.mockResolvedValue([yerba()]);
  await render(<Inicio />);
  await screen.findByText('¿Todavía hay Yerba?');
  await act(async () => fireEvent.press(tarjetaHay().getByRole('button', { name: 'Ajustar' })));
  const hoja = within(screen.getByTestId('hoja'));
  await act(async () => fireEvent.press(hoja.getByRole('button', { name: 'Guardar cantidad' })));
  expect(mockDatos.confirmarHay).toHaveBeenCalledWith('yerba');
  expect(mockDatos.ajustarStock).not.toHaveBeenCalled();
});

test('sin conexión, la respuesta no se pierde de vista: vuelve la tarjeta con el aviso', async () => {
  mockDatos.gastosEntre.mockResolvedValue([]);
  mockDatos.productos.mockResolvedValue([yerba()]);
  mockDatos.confirmarHay.mockRejectedValue(sinConexion());
  await render(<Inicio />);
  await screen.findByText('¿Todavía hay Yerba?');
  await act(async () => fireEvent.press(tarjetaHay().getByRole('button', { name: 'Hay' })));
  expect(await screen.findByText('Sin conexión: no se guardó. Probá de nuevo.')).toBeTruthy();
  expect(screen.getByText('¿Todavía hay Yerba?')).toBeTruthy();
});

// ——— Pendientes y últimos gastos ———

test('avisa lo que falta y lleva a Stock › Pendientes', async () => {
  mockDatos.gastosEntre.mockResolvedValue([]);
  mockDatos.productos.mockResolvedValue([producto('leche', 'Leche', 0, 1), producto('pan', 'Pan', 2, 1)]);
  mockDatos.anotaciones.mockResolvedValue([{ id: 'n1', texto: 'Pilas AA', creado_por: 'a', creado: '2026-10-01T12:00:00.000Z' }]);
  await render(<Inicio />);
  expect(await screen.findByText('Faltan Leche y Pilas AA.')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Ver pendientes' })));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/stock', params: { vista: 'pendientes' } });
});

test('sin pendientes no hay aviso', async () => {
  mockDatos.gastosEntre.mockResolvedValue([]);
  mockDatos.productos.mockResolvedValue([producto('pan', 'Pan', 2, 1)]);
  await render(<Inicio />);
  await screen.findByText('Todavía no cargó nadie');
  expect(screen.queryByRole('button', { name: 'Ver pendientes' })).toBeNull();
});

test('muestra los últimos 5 gastos y cada uno abre Cargar para editarlo', async () => {
  const gastos = [1, 2, 3, 4, 5, 6].map((n) => ({
    id: `g${n}`,
    fecha: `2026-10-${String(20 - n).padStart(2, '0')}`,
    pagado_por: n % 2 ? 'a' : 'b',
    total: n * 100_00,
    modo: 'total' as const,
    categoria_id: 'almacen',
    nota: n === 1 ? 'Compra del sábado' : null,
    gasto_items: [],
  }));
  mockDatos.gastosEntre.mockResolvedValue(gastos);
  await render(<Inicio />);
  expect(await screen.findByRole('header', { name: 'Últimos gastos' })).toBeTruthy();
  const filas = screen.getAllByRole('button', { name: /^Almacén, / });
  expect(filas).toHaveLength(5);
  expect(filas[0].props.accessibilityLabel).toBe(`Almacén, 19/10 · pagó Ana · Compra del sábado, ${formatear(100_00)}`);
  await act(async () => fireEvent.press(filas[1]));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/cargar', params: { id: 'g2' } });
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Ver todos los gastos' })));
  expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/analisis', params: { vista: 'detalle' } });
});
