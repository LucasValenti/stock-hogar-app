// Stock con la capa de datos simulada: pestañas, buscador, − y + (con la unidad y sin conexión),
// la cantidad exacta, las anotaciones rápidas y los accesos a la ficha y al alta.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Anotacion, Producto } from '@/logica/tipos';

import { Stock } from './Stock';

const m = vi.hoisted(() => ({
  datos: {
    productos: vi.fn(),
    categorias: vi.fn(),
    anotaciones: vi.fn(),
    ajustarStock: vi.fn(),
    crearAnotacion: vi.fn(),
    borrarAnotacion: vi.fn(),
    escucharCambios: vi.fn((_f: () => void) => () => undefined),
  },
}));

vi.mock('@/datos', () => ({
  get datos() {
    return m.datos;
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
  vi.clearAllMocks();
  history.replaceState(null, '', '/stock');
  m.datos.categorias.mockResolvedValue([
    { id: 'almacen', nombre: 'Almacén', tipo: 'producto', dias_sin_movimiento: 20 },
    { id: 'limpieza', nombre: 'Limpieza', tipo: 'producto', dias_sin_movimiento: 30 },
  ]);
  m.datos.productos.mockResolvedValue([
    producto('yerba', 'Yerba', 0, 'paquete'),
    producto('harina', 'Harina', 2.5, 'kg', { marca: 'Molino' }),
    producto('leche', 'Leche', 0, 'litro'),
    producto('detergente', 'Detergente', 3, 'unidad', { categoria_id: 'limpieza' }),
    producto('fernet', 'Fernet', 0, 'unidad', { oculto: true }),
  ]);
  m.datos.anotaciones.mockResolvedValue([pan]);
  // Como la base: devuelve el stock nuevo.
  const enBase: Record<string, number> = { yerba: 0, harina: 2.5, leche: 0, detergente: 3, fernet: 0 };
  m.datos.ajustarStock.mockImplementation(async (id: string, delta: number) => {
    enBase[id] = Math.max(0, Math.round((enBase[id] + delta) * 1000) / 1000);
    return enBase[id];
  });
  m.datos.crearAnotacion.mockImplementation(async (texto: string) => ({ ...pan, id: 'nueva', texto }));
  m.datos.borrarAnotacion.mockResolvedValue(undefined);
});

async function abrir() {
  const vista = render(<Stock />);
  await screen.findByRole('tab', { name: 'Todo' });
  return vista;
}
const tocar = (rol: 'button' | 'tab', nombre: string | RegExp) => userEvent.click(screen.getByRole(rol, { name: nombre }));
async function escribir(etiqueta: string, texto: string) {
  const campo = screen.getByLabelText(etiqueta);
  await userEvent.clear(campo);
  if (texto) await userEvent.type(campo, texto);
}
const fila = (nombre: string | RegExp) => screen.queryByRole('button', { name: nombre });

test('Todo agrupa por categoría lo que no está oculto; Pendientes y Ocultos cuentan lo suyo', async () => {
  await abrir();
  expect(screen.getByRole('tab', { name: 'Todo' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: 'Pendientes 3' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Ocultos 1' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Almacén' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Limpieza' })).toBeInTheDocument();
  expect(fila('Yerba, Falta')).toBeInTheDocument();
  expect(fila('Harina · Molino, Hay')).toBeInTheDocument();
  expect(fila('Detergente, Hay')).toBeInTheDocument();
  expect(fila(/^Fernet/)).toBeNull();
  // La anotación se ve como notita, para hacerla producto.
  expect(screen.getByRole('button', { name: 'Anotado: Comprar pan · tocalo para hacerlo producto' })).toBeInTheDocument();

  await tocar('tab', 'Pendientes 3');
  expect(fila('Yerba, Falta')).toBeInTheDocument();
  expect(fila('Leche, Falta')).toBeInTheDocument();
  expect(fila(/^Harina/)).toBeNull();
  expect(fila('Comprar pan, Anotación rápida')).toBeInTheDocument();

  await tocar('tab', 'Ocultos 1');
  expect(fila('Fernet, Oculto')).toBeInTheDocument();
  expect(fila(/^Yerba/)).toBeNull();
  expect(location.search).toBe('?vista=ocultos');
});

test('abre en la pestaña que pide el enlace (Inicio › Pendientes)', async () => {
  history.replaceState(null, '', '/stock?vista=pendientes');
  await abrir();
  expect(screen.getByRole('tab', { name: 'Pendientes 3' })).toHaveAttribute('aria-selected', 'true');
});

test('el buscador filtra por nombre o marca y se limpia en cada visita', async () => {
  const vista = await abrir();
  await escribir('Buscar en el stock', 'molino');
  expect(fila(/^Harina/)).toBeInTheDocument();
  expect(fila(/^Yerba/)).toBeNull();
  await escribir('Buscar en el stock', 'zzz');
  expect(screen.getByText('Ningún producto coincide con «zzz».')).toBeInTheDocument();

  // Entrar de nuevo a la pantalla es una visita nueva: el buscador arranca vacío.
  vista.unmount();
  await abrir();
  expect(screen.getByLabelText('Buscar en el stock')).toHaveValue('');
  expect(await screen.findByRole('button', { name: 'Yerba, Falta' })).toBeInTheDocument();
});

test('− baja según deltaMenos (2,5 kg → 2) y + suma 1; en 0 el − no hace nada', async () => {
  await abrir();
  expect(screen.getByRole('button', { name: 'Cantidad de Harina · Molino: 2,5 kg' })).toBeInTheDocument();
  await tocar('button', 'Restar a Harina · Molino');
  expect(m.datos.ajustarStock).toHaveBeenLastCalledWith('harina', -0.5);
  expect(await screen.findByRole('button', { name: 'Cantidad de Harina · Molino: 2 kg' })).toBeInTheDocument();

  await tocar('button', 'Sumar uno a Detergente');
  expect(m.datos.ajustarStock).toHaveBeenLastCalledWith('detergente', 1);
  expect(await screen.findByRole('button', { name: 'Cantidad de Detergente: 4' })).toBeInTheDocument();

  const menosYerba = screen.getByRole('button', { name: 'Restar a Yerba' });
  expect(menosYerba).toHaveAttribute('aria-disabled', 'true');
  await userEvent.click(menosYerba);
  expect(m.datos.ajustarStock).toHaveBeenCalledTimes(2);
});

test('dos toques de − antes de que se vuelva a dibujar: 2,5 kg → 2 → 1 (cada uno parte de lo último)', async () => {
  await abrir();
  await tocar('button', 'Restar a Harina · Molino');
  await tocar('button', 'Restar a Harina · Molino');
  expect(m.datos.ajustarStock.mock.calls).toEqual([
    ['harina', -0.5],
    ['harina', -1],
  ]);
  expect(await screen.findByRole('button', { name: 'Cantidad de Harina · Molino: 1 kg' })).toBeInTheDocument();
});

test('sin conexión: avisa y el número vuelve a lo que era', async () => {
  m.datos.ajustarStock.mockRejectedValueOnce(sinConexion);
  await abrir();
  await tocar('button', 'Sumar uno a Detergente');
  expect(await screen.findByText('Sin conexión: no se guardó el cambio de stock. Probá de nuevo.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cantidad de Detergente: 3' })).toBeInTheDocument();
});

test('en Pendientes, lo que se toca no desaparece bajo el dedo', async () => {
  await abrir();
  await tocar('tab', 'Pendientes 3');
  await tocar('button', 'Sumar uno a Yerba');
  expect(await screen.findByRole('button', { name: 'Cantidad de Yerba: 1' })).toBeInTheDocument();
  expect(fila('Yerba, Hay')).toBeInTheDocument();
});

test('la cantidad exacta se escribe según la unidad', async () => {
  await abrir();
  await tocar('button', 'Cantidad de Harina · Molino: 2,5 kg');
  expect(screen.getByRole('heading', { name: '¿Cuánto hay de Harina · Molino?' })).toBeInTheDocument();
  await escribir('Cantidad en kg', '1,25');
  await tocar('button', 'Guardar cantidad');
  expect(m.datos.ajustarStock).toHaveBeenLastCalledWith('harina', -1.25);
  expect(screen.queryByRole('heading', { name: '¿Cuánto hay de Harina · Molino?' })).toBeNull();

  await tocar('button', 'Cantidad de Detergente: 3');
  await escribir('Cantidad', '1,5');
  await tocar('button', 'Guardar cantidad');
  expect(screen.getByText('Para unidades y paquetes, solo números enteros.')).toBeInTheDocument();
  expect(m.datos.ajustarStock).toHaveBeenCalledTimes(1);
});

test('anotación rápida: se crea, se convierte en producto con su texto y se borra', async () => {
  await abrir();
  await tocar('button', 'Anotar');
  expect(screen.getByText('Escribí qué falta.')).toBeInTheDocument();
  expect(m.datos.crearAnotacion).not.toHaveBeenCalled();
  await escribir('Anotá algo que falta', '  Pilas AA ');
  await tocar('button', 'Anotar');
  expect(m.datos.crearAnotacion).toHaveBeenCalledWith('Pilas AA');
  expect(await screen.findByRole('button', { name: 'Anotado: Pilas AA · tocalo para hacerlo producto' })).toBeInTheDocument();
  expect(screen.getByLabelText('Anotá algo que falta')).toHaveValue('');

  await tocar('button', 'Anotado: Comprar pan · tocalo para hacerlo producto');
  const hoja = within(screen.getByRole('dialog'));
  expect(hoja.getByRole('heading', { name: 'Comprar pan' })).toBeInTheDocument();
  await userEvent.click(hoja.getByRole('button', { name: 'Hacerla producto' }));
  expect(location.pathname).toBe('/producto/nuevo');
  const parametros = new URLSearchParams(location.search);
  expect(parametros.get('nombre')).toBe('Comprar pan');
  expect(parametros.get('anotacion')).toBe('pan');

  await tocar('button', 'Anotado: Comprar pan · tocalo para hacerlo producto');
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Borrar nota' }));
  expect(m.datos.borrarAnotacion).toHaveBeenCalledWith('pan');
  expect(screen.queryByRole('button', { name: /^Anotado: Comprar pan/ })).toBeNull();
});

test('una nota que no se pudo guardar sin conexión queda escrita, con el aviso', async () => {
  m.datos.crearAnotacion.mockRejectedValueOnce(
    Object.assign(new Error('Sin conexión: no se guardó la nota. Probá de nuevo.'), { code: 'SIN_CONEXION' }),
  );
  await abrir();
  await escribir('Anotá algo que falta', 'Pilas AA');
  await tocar('button', 'Anotar');
  expect(await screen.findByText('Sin conexión: no se guardó la nota. Probá de nuevo.')).toBeInTheDocument();
  expect(screen.getByLabelText('Anotá algo que falta')).toHaveValue('Pilas AA');
});

test('el nombre abre la ficha y «Nuevo producto» abre el alta', async () => {
  await abrir();
  await tocar('button', 'Harina · Molino, Hay');
  expect(location.pathname).toBe('/producto/harina');
  await tocar('button', 'Nuevo producto');
  expect(location.pathname).toBe('/producto/nuevo');
});

test('vacíos: sin productos, sin pendientes y sin ocultos', async () => {
  m.datos.productos.mockResolvedValue([]);
  m.datos.anotaciones.mockResolvedValue([]);
  await abrir();
  expect(screen.getByText('El stock está vacío')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Nuevo producto' })).toHaveLength(1);
  await tocar('tab', 'Pendientes 0');
  expect(screen.getByText('No falta nada')).toBeInTheDocument();
  await tocar('tab', 'Ocultos');
  expect(screen.getByText('No hay productos ocultos')).toBeInTheDocument();
});

test('si no se pudo leer, avisa con Reintentar', async () => {
  m.datos.productos.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  render(<Stock />);
  expect(await screen.findByText('No pudimos traer el stock')).toBeInTheDocument();
  await tocar('button', 'Reintentar');
  expect(await screen.findByRole('tab', { name: 'Todo' })).toBeInTheDocument();
});
