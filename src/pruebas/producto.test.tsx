// Alta y ficha de un producto con la capa de datos simulada: validarProducto, la anotación que se hace
// producto, el cambio de unidad con stock con decimales y borrar / ocultar / volver a mostrar.

import { fireEvent, render, screen, within } from '@testing-library/react-native';

import FichaProducto from '@/app/producto/[id]';
import NuevoProducto from '@/app/producto/nuevo';
import type { Producto } from '@/logica/tipos';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => mockParams,
}));

const mockDatos = {
  categorias: jest.fn(),
  producto: jest.fn(),
  tieneCompras: jest.fn(),
  crearProducto: jest.fn(),
  editarProducto: jest.fn(),
  borrarProducto: jest.fn(),
  ocultarProducto: jest.fn(),
  ajustarStock: jest.fn(),
  borrarAnotacion: jest.fn(),
};
jest.mock('@/datos', () => ({
  get datos() {
    return mockDatos;
  },
}));

const harina: Producto = {
  id: 'harina',
  nombre: 'Harina',
  marca: 'Molino',
  categoria_id: 'almacen',
  stock: 1.5,
  unidad: 'kg',
  oculto: false,
  codigo_barras: null,
  ultimo_movimiento: '2026-10-01T12:00:00.000Z',
  creado: '2026-01-01T12:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockDatos.categorias.mockResolvedValue([
    { id: 'almacen', nombre: 'Almacén', tipo: 'producto', dias_sin_movimiento: 20 },
    { id: 'limpieza', nombre: 'Limpieza', tipo: 'producto', dias_sin_movimiento: 30 },
    { id: 'luz', nombre: 'Luz', tipo: 'servicio', dias_sin_movimiento: 20 },
  ]);
  mockDatos.producto.mockResolvedValue(harina);
  mockDatos.tieneCompras.mockResolvedValue(false);
  mockDatos.crearProducto.mockImplementation(async (p: object) => ({ ...harina, ...p, id: 'nuevo', stock: 0 }));
  mockDatos.editarProducto.mockImplementation(async (p: object) => ({ ...harina, ...p }));
  mockDatos.borrarProducto.mockResolvedValue(undefined);
  mockDatos.ocultarProducto.mockResolvedValue(undefined);
  mockDatos.ajustarStock.mockResolvedValue(2);
  mockDatos.borrarAnotacion.mockResolvedValue(undefined);
});

const tocar = (rol: 'button' | 'radio', nombre: string | RegExp) => fireEvent.press(screen.getByRole(rol, { name: nombre }));
const escribir = (etiqueta: string, texto: string) => fireEvent.changeText(screen.getByLabelText(etiqueta), texto);
async function elegirCategoria(nombre: string) {
  await tocar('button', /^Categoría: /);
  await tocar('radio', nombre);
}

describe('Nuevo producto', () => {
  async function abrir() {
    await render(<NuevoProducto />);
    await screen.findByRole('button', { name: 'Crear producto' });
  }

  test('valida con validarProducto y crea con nombre, marca, categoría y unidad', async () => {
    await abrir();
    await tocar('button', 'Crear producto');
    expect(screen.getByText('Escribí un nombre.')).toBeTruthy();
    expect(screen.getByText('Elegí una categoría.')).toBeTruthy();
    expect(mockDatos.crearProducto).not.toHaveBeenCalled();

    await escribir('Nombre', '  Aceite ');
    await escribir('Marca (opcional)', 'Natura');
    await tocar('button', /^Categoría: /);
    // Solo las categorías de productos: los servicios no tienen stock.
    expect(screen.queryByRole('radio', { name: 'Luz' })).toBeNull();
    await tocar('radio', 'Almacén');
    expect(screen.getByRole('radio', { name: 'Unidades' }).props.accessibilityState).toMatchObject({ checked: true });
    await tocar('radio', 'Litros');
    await tocar('button', 'Crear producto');
    expect(mockDatos.crearProducto).toHaveBeenCalledWith({ nombre: 'Aceite', marca: 'Natura', categoria_id: 'almacen', unidad: 'litro' });
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockDatos.borrarAnotacion).not.toHaveBeenCalled();
  });

  test('desde una anotación: arranca con su texto y, al crear, la borra', async () => {
    mockParams = { nombre: 'Pilas AA', anotacion: 'pilas' };
    await abrir();
    expect(screen.getByLabelText('Nombre').props.value).toBe('Pilas AA');
    await elegirCategoria('Limpieza');
    await tocar('button', 'Crear producto');
    expect(mockDatos.crearProducto).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Pilas AA', categoria_id: 'limpieza' }));
    expect(mockDatos.borrarAnotacion).toHaveBeenCalledWith('pilas');
    expect(mockRouter.back).toHaveBeenCalled();
  });

  test('si la nota no se pudo borrar, el producto queda creado y lo dice (no se crea dos veces)', async () => {
    mockParams = { nombre: 'Pilas AA', anotacion: 'pilas' };
    mockDatos.borrarAnotacion.mockRejectedValueOnce(
      Object.assign(new Error('Sin conexión: no se guardó el cambio en la nota. Probá de nuevo.'), { code: 'SIN_CONEXION' }),
    );
    await abrir();
    await elegirCategoria('Limpieza');
    await tocar('button', 'Crear producto');
    expect(await screen.findByText('Pilas AA ya está en Stock, pero la nota sigue anotada: borrala desde Stock.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Crear producto' })).toBeNull();
    await tocar('button', 'Volver a Stock');
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockDatos.crearProducto).toHaveBeenCalledTimes(1);
  });

  test('un nombre repetido muestra el error de la base', async () => {
    mockDatos.crearProducto.mockRejectedValueOnce({ code: '23505', message: 'duplicate key value' });
    await abrir();
    await escribir('Nombre', 'Yerba');
    await elegirCategoria('Almacén');
    await tocar('button', 'Crear producto');
    expect(await screen.findByText('Ya existe uno con ese dato (nombre, email o código repetido).')).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});

describe('Ficha de producto', () => {
  async function abrir(p: Partial<Producto> = {}) {
    mockParams = { id: 'harina' };
    mockDatos.producto.mockResolvedValue({ ...harina, ...p });
    await render(<FichaProducto />);
    await screen.findByRole('button', { name: 'Guardar cambios' });
  }

  test('muestra lo que hay en casa y edita con validarProducto', async () => {
    await abrir({ stock: 2.5 });
    expect(screen.getByText('En casa: 2,5 kg')).toBeTruthy();
    expect(screen.getByLabelText('Marca (opcional)').props.value).toBe('Molino');
    expect(screen.getByRole('button', { name: 'Categoría: Almacén' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Kilos' }).props.accessibilityState).toMatchObject({ checked: true });

    await escribir('Nombre', ' ');
    await tocar('button', 'Guardar cambios');
    expect(screen.getByText('Escribí un nombre.')).toBeTruthy();
    expect(mockDatos.editarProducto).not.toHaveBeenCalled();

    await escribir('Nombre', 'Harina 000');
    await escribir('Marca (opcional)', '');
    await elegirCategoria('Limpieza');
    await tocar('button', 'Guardar cambios');
    expect(mockDatos.editarProducto).toHaveBeenCalledWith({
      id: 'harina',
      nombre: 'Harina 000',
      marca: null,
      categoria_id: 'limpieza',
      unidad: 'kg',
    });
    expect(mockDatos.ajustarStock).not.toHaveBeenCalled();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  test('sin conexión: avisa y no vuelve', async () => {
    mockDatos.editarProducto.mockRejectedValueOnce(
      Object.assign(new Error('Sin conexión: no se guardó el cambio del producto. Probá de nuevo.'), { code: 'SIN_CONEXION' }),
    );
    await abrir();
    await tocar('button', 'Guardar cambios');
    expect(await screen.findByText('Sin conexión: no se guardó el cambio del producto. Probá de nuevo.')).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  test('de kg a paquetes con 1,5 en casa: avisa que no se convierte y ofrece redondear', async () => {
    await abrir();
    await tocar('radio', 'Paquetes');
    expect(screen.getByText('Cambiar cómo se cuenta no convierte lo que hay: 1,5 pasa a ser 1,5 paquetes.')).toBeTruthy();
    await tocar('button', 'Guardar cambios');
    const hoja = within(screen.getByTestId('hoja'));
    expect(hoja.getByRole('header', { name: '¿Redondeamos lo que hay?' })).toBeTruthy();
    expect(hoja.getByText('Hay 1,5 en casa: en paquetes solo van números enteros.')).toBeTruthy();
    await fireEvent.press(hoja.getByRole('button', { name: 'Guardar y redondear a 2' }));
    expect(mockDatos.editarProducto).toHaveBeenCalledWith(expect.objectContaining({ unidad: 'paquete' }));
    expect(mockDatos.ajustarStock).toHaveBeenCalledWith('harina', 0.5);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  test('también se puede guardar sin redondear', async () => {
    await abrir();
    await tocar('radio', 'Unidades');
    await tocar('button', 'Guardar cambios');
    await fireEvent.press(within(screen.getByTestId('hoja')).getByRole('button', { name: 'Guardar con 1,5' }));
    expect(mockDatos.editarProducto).toHaveBeenCalledWith(expect.objectContaining({ unidad: 'unidad' }));
    expect(mockDatos.ajustarStock).not.toHaveBeenCalled();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  test('nunca se compró: se puede borrar, con confirmación', async () => {
    await abrir();
    expect(mockDatos.tieneCompras).toHaveBeenCalledWith('harina');
    await tocar('button', 'Borrar producto');
    const hoja = within(screen.getByTestId('hoja'));
    expect(hoja.getByText('Nunca se compró, así que no se pierde ningún gasto.')).toBeTruthy();
    await fireEvent.press(hoja.getByRole('button', { name: 'Borrar' }));
    expect(mockDatos.borrarProducto).toHaveBeenCalledWith('harina');
    expect(mockRouter.back).toHaveBeenCalled();
  });

  test('con compras: no se borra, se oculta (con confirmación)', async () => {
    mockDatos.tieneCompras.mockResolvedValue(true);
    await abrir();
    expect(screen.queryByRole('button', { name: 'Borrar producto' })).toBeNull();
    await tocar('button', 'Ocultar de Stock');
    await fireEvent.press(within(screen.getByTestId('hoja')).getByRole('button', { name: 'Ocultar' }));
    expect(mockDatos.ocultarProducto).toHaveBeenCalledWith('harina', true);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  test('oculto: se vuelve a mostrar en Stock de un toque', async () => {
    mockDatos.tieneCompras.mockResolvedValue(true);
    await abrir({ oculto: true });
    expect(screen.getByText('Oculto: no aparece en Stock ni en pendientes.')).toBeTruthy();
    await tocar('button', 'Volver a mostrar en Stock');
    expect(mockDatos.ocultarProducto).toHaveBeenCalledWith('harina', false);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  test('un producto que ya no existe lo dice', async () => {
    mockParams = { id: 'no-existe' };
    mockDatos.producto.mockResolvedValue(null);
    await render(<FichaProducto />);
    expect(await screen.findByText('Ese producto ya no existe. Puede que alguien lo haya borrado.')).toBeTruthy();
    await tocar('button', 'Volver a Stock');
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
