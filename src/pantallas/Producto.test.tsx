// Alta y ficha de un producto con la capa de datos simulada: validarProducto, la anotación que se hace
// producto, el cambio de unidad con stock con decimales y borrar / ocultar / volver a mostrar.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Producto as ProductoTipo } from '@/logica/tipos';

import { Producto } from './Producto';
import { ProductoNuevo } from './ProductoNuevo';

const m = vi.hoisted(() => ({
  datos: {
    categorias: vi.fn(),
    producto: vi.fn(),
    tieneCompras: vi.fn(),
    crearProducto: vi.fn(),
    editarProducto: vi.fn(),
    borrarProducto: vi.fn(),
    ocultarProducto: vi.fn(),
    ajustarStock: vi.fn(),
    borrarAnotacion: vi.fn(),
  },
  params: {} as Record<string, string | undefined>,
  search: '',
}));

vi.mock('@/datos', () => ({
  get datos() {
    return m.datos;
  },
}));
vi.mock('wouter', async (importOriginal) => {
  const real = await importOriginal<typeof import('wouter')>();
  return { ...real, useParams: () => m.params, useSearch: () => m.search };
});

const harina: ProductoTipo = {
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
  vi.restoreAllMocks();
  vi.clearAllMocks();
  m.params = {};
  m.search = '';
  history.replaceState(null, '', '/');
  // Como si se viniera desde Stock: la entrada lleva su profundidad (ver src/ui/volver.ts).
  history.pushState({ profundidad: 1 }, '', '/producto/harina');
  vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
  m.datos.categorias.mockResolvedValue([
    { id: 'almacen', nombre: 'Almacén', tipo: 'producto', dias_sin_movimiento: 20 },
    { id: 'limpieza', nombre: 'Limpieza', tipo: 'producto', dias_sin_movimiento: 30 },
    { id: 'luz', nombre: 'Luz', tipo: 'servicio', dias_sin_movimiento: 20 },
  ]);
  m.datos.producto.mockResolvedValue(harina);
  m.datos.tieneCompras.mockResolvedValue(false);
  m.datos.crearProducto.mockImplementation(async (p: object) => ({ ...harina, ...p, id: 'nuevo', stock: 0 }));
  m.datos.editarProducto.mockImplementation(async (p: object) => ({ ...harina, ...p }));
  m.datos.borrarProducto.mockResolvedValue(undefined);
  m.datos.ocultarProducto.mockResolvedValue(undefined);
  m.datos.ajustarStock.mockResolvedValue(2);
  m.datos.borrarAnotacion.mockResolvedValue(undefined);
});

const tocar = (nombre: string | RegExp) => userEvent.click(screen.getByRole('button', { name: nombre }));
async function escribir(etiqueta: string, texto: string) {
  const campo = screen.getByLabelText(etiqueta);
  await userEvent.clear(campo);
  if (texto) await userEvent.type(campo, texto);
}
async function elegirCategoria(nombre: string) {
  await tocar(/^Categoría: /);
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: nombre }));
}

describe('Nuevo producto', () => {
  async function abrir() {
    render(<ProductoNuevo />);
    await screen.findByRole('button', { name: 'Crear producto' });
  }

  test('valida con validarProducto y crea con nombre, marca, categoría y unidad', async () => {
    await abrir();
    await tocar('Crear producto');
    expect(screen.getByText('Escribí un nombre.')).toBeInTheDocument();
    expect(screen.getByText('Elegí una categoría.')).toBeInTheDocument();
    expect(m.datos.crearProducto).not.toHaveBeenCalled();

    await escribir('Nombre', '  Aceite ');
    await escribir('Marca (opcional)', 'Natura');
    await tocar(/^Categoría: /);
    // Solo las categorías de productos: los servicios no tienen stock.
    expect(screen.queryByRole('button', { name: 'Luz' })).toBeNull();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Almacén' }));
    expect(screen.getByRole('button', { name: 'Unidades' })).toHaveAttribute('aria-pressed', 'true');
    await tocar('Litros');
    await tocar('Crear producto');
    expect(m.datos.crearProducto).toHaveBeenCalledWith({ nombre: 'Aceite', marca: 'Natura', categoria_id: 'almacen', unidad: 'litro' });
    expect(window.history.back).toHaveBeenCalled();
    expect(m.datos.borrarAnotacion).not.toHaveBeenCalled();
  });

  test('desde una anotación: arranca con su texto y, al crear, la borra', async () => {
    m.search = '?nombre=Pilas+AA&anotacion=pilas';
    await abrir();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Pilas AA');
    await elegirCategoria('Limpieza');
    await tocar('Crear producto');
    expect(m.datos.crearProducto).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Pilas AA', categoria_id: 'limpieza' }));
    expect(m.datos.borrarAnotacion).toHaveBeenCalledWith('pilas');
    expect(window.history.back).toHaveBeenCalled();
  });

  test('si la nota no se pudo borrar, el producto queda creado y lo dice (no se crea dos veces)', async () => {
    m.search = '?nombre=Pilas+AA&anotacion=pilas';
    m.datos.borrarAnotacion.mockRejectedValueOnce(
      Object.assign(new Error('Sin conexión: no se guardó el cambio en la nota. Probá de nuevo.'), { code: 'SIN_CONEXION' }),
    );
    await abrir();
    await elegirCategoria('Limpieza');
    await tocar('Crear producto');
    expect(await screen.findByText('Pilas AA ya está en Stock, pero la nota sigue anotada: borrala desde Stock.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear producto' })).toBeNull();
    await tocar('Volver a Stock');
    expect(window.history.back).toHaveBeenCalled();
    expect(m.datos.crearProducto).toHaveBeenCalledTimes(1);
  });

  test('un nombre repetido muestra el error de la base', async () => {
    m.datos.crearProducto.mockRejectedValueOnce({ code: '23505', message: 'duplicate key value' });
    await abrir();
    await escribir('Nombre', 'Yerba');
    await elegirCategoria('Almacén');
    await tocar('Crear producto');
    expect(await screen.findByText('Ya existe uno con ese dato (nombre, email o código repetido).')).toBeInTheDocument();
    expect(window.history.back).not.toHaveBeenCalled();
  });
});

describe('Ficha de producto', () => {
  async function abrir(p: Partial<ProductoTipo> = {}) {
    m.params = { id: 'harina' };
    m.datos.producto.mockResolvedValue({ ...harina, ...p });
    render(<Producto />);
    await screen.findByRole('button', { name: 'Guardar cambios' });
  }

  test('muestra lo que hay en casa y edita con validarProducto', async () => {
    await abrir({ stock: 2.5 });
    expect(screen.getByText('En casa: 2,5 kg')).toBeInTheDocument();
    expect(screen.getByLabelText('Marca (opcional)')).toHaveValue('Molino');
    expect(screen.getByRole('button', { name: 'Categoría: Almacén' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kilos' })).toHaveAttribute('aria-pressed', 'true');

    await escribir('Nombre', ' ');
    await tocar('Guardar cambios');
    expect(screen.getByText('Escribí un nombre.')).toBeInTheDocument();
    expect(m.datos.editarProducto).not.toHaveBeenCalled();

    await escribir('Nombre', 'Harina 000');
    await escribir('Marca (opcional)', '');
    await elegirCategoria('Limpieza');
    await tocar('Guardar cambios');
    expect(m.datos.editarProducto).toHaveBeenCalledWith({
      id: 'harina',
      nombre: 'Harina 000',
      marca: null,
      categoria_id: 'limpieza',
      unidad: 'kg',
    });
    expect(m.datos.ajustarStock).not.toHaveBeenCalled();
    expect(window.history.back).toHaveBeenCalled();
  });

  test('sin conexión: avisa y no vuelve', async () => {
    m.datos.editarProducto.mockRejectedValueOnce(
      Object.assign(new Error('Sin conexión: no se guardó el cambio del producto. Probá de nuevo.'), { code: 'SIN_CONEXION' }),
    );
    await abrir();
    await tocar('Guardar cambios');
    expect(await screen.findByText('Sin conexión: no se guardó el cambio del producto. Probá de nuevo.')).toBeInTheDocument();
    expect(window.history.back).not.toHaveBeenCalled();
  });

  test('de kg a paquetes con 1,5 en casa: avisa que no se convierte y ofrece redondear', async () => {
    await abrir();
    await tocar('Paquetes');
    expect(screen.getByText('Cambiar cómo se cuenta no convierte lo que hay: 1,5 pasa a ser 1,5 paquetes.')).toBeInTheDocument();
    await tocar('Guardar cambios');
    const hoja = within(screen.getByRole('dialog'));
    expect(hoja.getByRole('heading', { name: '¿Redondeamos lo que hay?' })).toBeInTheDocument();
    expect(hoja.getByText('Hay 1,5 en casa: en paquetes solo van números enteros.')).toBeInTheDocument();
    await userEvent.click(hoja.getByRole('button', { name: 'Guardar y redondear a 2' }));
    expect(m.datos.editarProducto).toHaveBeenCalledWith(expect.objectContaining({ unidad: 'paquete' }));
    expect(m.datos.ajustarStock).toHaveBeenCalledWith('harina', 0.5);
    expect(window.history.back).toHaveBeenCalled();
  });

  test('también se puede guardar sin redondear', async () => {
    await abrir();
    await tocar('Unidades');
    await tocar('Guardar cambios');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar con 1,5' }));
    expect(m.datos.editarProducto).toHaveBeenCalledWith(expect.objectContaining({ unidad: 'unidad' }));
    expect(m.datos.ajustarStock).not.toHaveBeenCalled();
    expect(window.history.back).toHaveBeenCalled();
  });

  test('nunca se compró: se puede borrar, con confirmación', async () => {
    await abrir();
    expect(m.datos.tieneCompras).toHaveBeenCalledWith('harina');
    await tocar('Borrar producto');
    const hoja = within(screen.getByRole('dialog'));
    expect(hoja.getByText('Nunca se compró, así que no se pierde ningún gasto.')).toBeInTheDocument();
    await userEvent.click(hoja.getByRole('button', { name: 'Borrar' }));
    expect(m.datos.borrarProducto).toHaveBeenCalledWith('harina');
    expect(window.history.back).toHaveBeenCalled();
  });

  test('con compras: no se borra, se oculta (con confirmación)', async () => {
    m.datos.tieneCompras.mockResolvedValue(true);
    await abrir();
    expect(screen.queryByRole('button', { name: 'Borrar producto' })).toBeNull();
    await tocar('Ocultar de Stock');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ocultar' }));
    expect(m.datos.ocultarProducto).toHaveBeenCalledWith('harina', true);
    expect(window.history.back).toHaveBeenCalled();
  });

  test('oculto: se vuelve a mostrar en Stock de un toque', async () => {
    m.datos.tieneCompras.mockResolvedValue(true);
    await abrir({ oculto: true });
    expect(screen.getByText('Oculto: no aparece en Stock ni en pendientes.')).toBeInTheDocument();
    await tocar('Volver a mostrar en Stock');
    expect(m.datos.ocultarProducto).toHaveBeenCalledWith('harina', false);
    expect(window.history.back).toHaveBeenCalled();
  });

  test('un producto que ya no existe lo dice', async () => {
    m.params = { id: 'no-existe' };
    m.datos.producto.mockResolvedValue(null);
    render(<Producto />);
    expect(await screen.findByText('Ese producto ya no existe. Puede que alguien lo haya borrado.')).toBeInTheDocument();
    await tocar('Volver a Stock');
    expect(window.history.back).toHaveBeenCalled();
  });
});
