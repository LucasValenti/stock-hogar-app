// Cargar con la capa de datos simulada: validación, la hoja «Agregar producto», el guardado (también en
// cola), el mes cerrado y el gasto viejo por productos. (Fuera de src/app para que Expo Router no la tome.)

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import Cargar from '@/app/cargar';
import { centavosATexto, formatear } from '@/logica/dinero';
import { fechaLarga, hoy, mesActual, mesAnterior } from '@/logica/meses';
import type { Integrante, Producto } from '@/logica/tipos';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: { id?: string } = {};
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => mockParams,
}));
const mockNuevoId = jest.fn(() => '00000000-0000-4000-8000-000000000001');
jest.mock('@/datos/id', () => ({ nuevoId: () => mockNuevoId() }));
jest.mock('@/sesion/sesion', () => ({ useSesion: () => ({ yo: { id: 'ana', nombre: 'Ana' } }) }));

const mockLeerTexto = jest.fn();
jest.mock('@/comprobante/ocr', () => {
  const real = jest.requireActual('@/comprobante/ocr.comun');
  return {
    leerTexto: (...args: unknown[]) => mockLeerTexto(...args),
    MAX_BYTES: real.MAX_BYTES,
    OcrNoDisponible: real.OcrNoDisponible,
  };
});
const mockPicker = jest.fn();
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: (...args: unknown[]) => mockPicker(...args) }));

const mockDatos = {
  integrantes: jest.fn(),
  categorias: jest.fn(),
  productos: jest.fn(),
  anotaciones: jest.fn(),
  mesesCerrados: jest.fn(),
  gasto: jest.fn(),
  guardarGasto: jest.fn(),
  borrarGasto: jest.fn(),
  gastoPorOperacion: jest.fn(),
  categoriaDeDestino: jest.fn(),
  escucharCambios: jest.fn(() => () => undefined),
};
const mockCola = { pendientes: jest.fn(), rechazadas: jest.fn(), olvidarRechazada: jest.fn() };
jest.mock('@/datos', () => ({
  get datos() {
    return mockDatos;
  },
  obtenerCola: () => mockCola,
  escucharDescartes: () => () => undefined,
}));

const MES = mesActual();
const MES_ANTERIOR = mesAnterior(MES);

const persona = (id: string, nombre: string, extra: Partial<Integrante> = {}): Integrante => ({
  id,
  nombre,
  sueldo: 100_00,
  email: `${id}@example.com`,
  activo: true,
  baja_desde: null,
  tipo: 'integrante',
  creado: '2026-01-01T12:00:00.000Z',
  ...extra,
});
const producto = (id: string, nombre: string, stock: number, unidad: Producto['unidad'], oculto = false): Producto => ({
  id,
  nombre,
  stock,
  unidad,
  oculto,
  codigo_barras: null,
  marca: null,
  categoria_id: 'super',
  ultimo_movimiento: '2026-10-01T12:00:00.000Z',
  creado: '2026-01-01T12:00:00.000Z',
});
const gastoBase = {
  id: 'g1',
  fecha: `${MES}-05`,
  pagado_por: 'ana',
  total: 500_00,
  modo: 'total' as const,
  categoria_id: 'luz',
  nota: null,
  creado_por: 'ana',
  creado: '2026-10-05T12:00:00.000Z',
  mp_operacion: null,
};

// Nombres de fantasía: el comprobante original traía los de personas reales.
const COMPROBANTE = `Comprobante de transferencia
8/octubre/2026 a las 11:29.
$ 48.600
Motivo: Varios
Origen y destino
EG Ana Gómez
Mercado Pago
CVU: 0000000000000000000000
EG Beto Salas
Mercado Pago
CVU: 0000000000000000000000
N.* de operación de Mercado Pago
123456789012`;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockDatos.integrantes.mockResolvedValue([
    persona('ana', 'Ana'),
    persona('bruno', 'Bruno'),
    // Dejó la casa este mes: puede figurar como pagadora solo en los meses anteriores.
    persona('caro', 'Caro', { activo: false, baja_desde: MES }),
    persona('dani', 'Dani', { tipo: 'pagador_externo', sueldo: null }),
  ]);
  mockDatos.categorias.mockResolvedValue([
    { id: 'super', nombre: 'Súper', tipo: 'producto', dias_sin_movimiento: 20 },
    { id: 'luz', nombre: 'Luz', tipo: 'servicio', dias_sin_movimiento: 20 },
  ]);
  mockDatos.productos.mockResolvedValue([
    producto('yerba', 'Yerba', 1, 'paquete'),
    producto('leche', 'Leche', 0, 'litro'),
    producto('fernet', 'Fernet', 0, 'unidad', true),
  ]);
  mockDatos.anotaciones.mockResolvedValue([{ id: 'pan', texto: 'Comprar pan', creado_por: 'ana', creado: '2026-10-01T12:00:00.000Z' }]);
  mockDatos.mesesCerrados.mockResolvedValue(new Set());
  mockDatos.guardarGasto.mockResolvedValue({ estado: 'hecho', id: 'nuevo' });
  mockDatos.borrarGasto.mockResolvedValue(undefined);
  mockDatos.gastoPorOperacion.mockResolvedValue(null);
  mockDatos.categoriaDeDestino.mockResolvedValue(null);
  mockCola.pendientes.mockResolvedValue([]);
  mockCola.rechazadas.mockResolvedValue([]);
});

async function abrir() {
  await render(<Cargar />);
  await screen.findByRole('button', { name: /^Guardar|^Borrar gasto$/ });
}
const tocar = (rol: 'button' | 'radio' | 'checkbox', nombre: string | RegExp) => fireEvent.press(screen.getByRole(rol, { name: nombre }));
const escribir = (etiqueta: string, texto: string) => fireEvent.changeText(screen.getByLabelText(etiqueta), texto);
async function elegirCategoria(nombre: string) {
  await tocar('button', /^Categoría: /);
  await tocar('radio', nombre);
}

test('valida el monto y la categoría antes de guardar', async () => {
  await abrir();
  await tocar('button', 'Guardar gasto');
  expect(screen.getByText('Ingresá un monto mayor a 0, por ejemplo 85.000.')).toBeTruthy();
  expect(screen.getByText('Elegí una categoría.')).toBeTruthy();
  await escribir('Monto', '12,345');
  await tocar('button', 'Guardar gasto');
  expect(screen.getByText('Ingresá un monto mayor a 0, por ejemplo 85.000.')).toBeTruthy();
  expect(mockDatos.guardarGasto).not.toHaveBeenCalled();
});

test('guarda 1.234,50 por total con categoría, Pagó y nota, con el mismo nuevo_id al reintentar', async () => {
  await abrir();
  await escribir('Monto', '1.234,50');
  await elegirCategoria('Luz');
  expect(screen.getByRole('button', { name: 'Categoría: Luz' })).toBeTruthy();
  await tocar('radio', 'Bruno');
  await escribir('Nota', 'Factura de octubre');

  mockDatos.guardarGasto.mockRejectedValueOnce(Object.assign(new Error('se cayó algo'), { code: 'XX000' }));
  await tocar('button', 'Guardar gasto');
  expect(await screen.findByText('Algo salió mal. Probá de nuevo.')).toBeTruthy();
  expect(mockRouter.back).not.toHaveBeenCalled();

  await tocar('button', 'Guardar gasto');
  expect(mockRouter.back).toHaveBeenCalled();
  const [[primero, items], [segundo]] = mockDatos.guardarGasto.mock.calls;
  expect(primero).toEqual(
    expect.objectContaining({
      modo: 'total',
      total: 1_234_50,
      categoria_id: 'luz',
      pagado_por: 'bruno',
      nota: 'Factura de octubre',
      fecha: hoy(),
      tildados: [],
      anotaciones: [],
    }),
  );
  expect(primero.id ?? null).toBeNull();
  expect(typeof primero.nuevo_id).toBe('string');
  expect(segundo.nuevo_id).toBe(primero.nuevo_id);
  expect(items).toEqual([]);
});

test('la fecha tiene que existir y no puede ser de un mes cerrado', async () => {
  mockDatos.mesesCerrados.mockResolvedValue(new Set([MES_ANTERIOR]));
  await abrir();
  expect(screen.getByLabelText('Fecha').props.value).toBe(fechaLarga(hoy()));
  await escribir('Fecha', '31/02/2026');
  await tocar('button', 'Guardar gasto');
  expect(screen.getByText('Elegí una fecha.')).toBeTruthy();
  await escribir('Fecha', fechaLarga(`${MES_ANTERIOR}-10`));
  await tocar('button', 'Guardar gasto');
  expect(screen.getByText('Ese mes está cerrado. Reabrilo desde Análisis para cargar gastos.')).toBeTruthy();
  expect(mockDatos.guardarGasto).not.toHaveBeenCalled();
});

test('Pagó ofrece a quienes estaban en la casa ese mes, y arranca con quien carga', async () => {
  await abrir();
  expect(screen.getByRole('radio', { name: 'Ana' }).props.accessibilityState).toMatchObject({ checked: true });
  expect(screen.getByRole('radio', { name: 'Dani' })).toBeTruthy();
  expect(screen.queryByRole('radio', { name: 'Caro' })).toBeNull();

  await escribir('Fecha', fechaLarga(`${MES_ANTERIOR}-10`));
  await tocar('radio', 'Caro');
  // Al volver a este mes, Caro ya no está: hay que elegir de nuevo.
  await escribir('Fecha', fechaLarga(hoy()));
  expect(screen.queryByRole('radio', { name: 'Caro' })).toBeNull();
  await escribir('Monto', '500');
  await elegirCategoria('Luz');
  await tocar('button', 'Guardar gasto');
  expect(screen.getByText('Elegí quién pagó.')).toBeTruthy();
  expect(mockDatos.guardarGasto).not.toHaveBeenCalled();
});

test('«Agregar producto» lista Stock y anotaciones, tilda con 1, respeta la unidad y guarda tildados y anotaciones', async () => {
  await abrir();
  await tocar('button', 'Agregar producto');
  expect(screen.getByRole('header', { name: 'Agregar producto' })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Yerba, Hay 1' })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Leche, Falta' })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Comprar pan, Anotación rápida' })).toBeTruthy();
  expect(screen.queryByText('Fernet')).toBeNull();

  await tocar('checkbox', 'Leche, Falta');
  expect(screen.getByRole('checkbox', { name: 'Leche, Falta' }).props.accessibilityState).toMatchObject({ checked: true });
  expect(screen.getByLabelText('Cantidad de Leche').props.value).toBe('1');
  await escribir('Cantidad de Leche', '1,5');
  await tocar('checkbox', 'Yerba, Hay 1');
  await escribir('Cantidad de Yerba', '1,5');
  await tocar('checkbox', 'Comprar pan, Anotación rápida');
  await tocar('button', 'Sumar 3 al gasto');
  expect(screen.queryByRole('header', { name: 'Agregar producto' })).toBeNull();

  await escribir('Monto', '8.000');
  await elegirCategoria('Súper');
  await tocar('button', 'Guardar gasto');
  expect(screen.getByText('Yerba: Para unidades y paquetes, solo números enteros.')).toBeTruthy();
  expect(mockDatos.guardarGasto).not.toHaveBeenCalled();

  await tocar('button', 'Agregar producto');
  await escribir('Cantidad de Yerba', '2');
  await tocar('button', 'Sumar 3 al gasto');
  await tocar('button', 'Guardar gasto');
  const [g] = mockDatos.guardarGasto.mock.calls[0];
  expect(g).toEqual(expect.objectContaining({ modo: 'total', total: 8_000_00, categoria_id: 'super', anotaciones: ['pan'] }));
  expect(g.tildados).toHaveLength(2);
  expect(g.tildados).toEqual(
    expect.arrayContaining([
      { producto_id: 'leche', cantidad: 1.5 },
      { producto_id: 'yerba', cantidad: 2 },
    ]),
  );
});

test('el id del alta se elige una sola vez, aunque la pantalla se dibuje muchas', async () => {
  await abrir();
  await escribir('Monto', '5');
  await escribir('Monto', '50');
  await escribir('Monto', '500');
  expect(mockNuevoId).toHaveBeenCalledTimes(1);
});

test('sin conexión queda en la cola: «Guardado en el celu: se manda cuando vuelva la conexión»', async () => {
  mockDatos.guardarGasto.mockResolvedValue({ estado: 'en-cola', id: 'x' });
  await abrir();
  await escribir('Monto', '500');
  await elegirCategoria('Luz');
  // Al guardar, la op ya está en la cola.
  mockCola.pendientes.mockResolvedValue([{ id: 'o1', tipo: 'guardarGasto', duenio: 'ana', datos: {} }]);
  await tocar('button', 'Guardar gasto');
  expect(await screen.findByText(/^Guardado en el celu: se manda cuando vuelva la conexión/)).toBeTruthy();
  expect(mockRouter.back).not.toHaveBeenCalled();
  // Lo dice una vez: la tarjeta de la cola no lo repite.
  await act(async () => undefined);
  expect(screen.queryByText('1 gasto guardado en el celu: se manda cuando vuelva la conexión.')).toBeNull();
  await tocar('button', 'Listo');
  expect(mockRouter.back).toHaveBeenCalled();
});

test('un gasto de un mes cerrado se ve con los campos bloqueados y el aviso, sin guardar ni borrar', async () => {
  mockParams = { id: 'g1' };
  mockDatos.mesesCerrados.mockResolvedValue(new Set([MES_ANTERIOR]));
  mockDatos.gasto.mockResolvedValue({ gasto: { ...gastoBase, fecha: `${MES_ANTERIOR}-10` }, items: [] });
  await render(<Cargar />);
  expect(await screen.findByText('Este gasto es de un mes cerrado. Para cambiarlo, reabrí el mes desde Análisis.')).toBeTruthy();
  expect(screen.getByLabelText('Monto').props.editable).toBe(false);
  expect(screen.getByLabelText('Monto').props.value).toBe('500');
  expect(screen.getByRole('button', { name: 'Categoría: Luz' }).props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.getByRole('radio', { name: 'Ana' }).props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.queryByRole('button', { name: /^Guardar/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Borrar gasto' })).toBeNull();
});

test('editar un gasto con productos tildados manda su id y los tildados', async () => {
  mockParams = { id: 'g1' };
  mockDatos.gasto.mockResolvedValue({
    gasto: gastoBase,
    items: [{ id: 'i1', gasto_id: 'g1', producto_id: 'yerba', cantidad: 2, precio_unitario: null }],
  });
  await render(<Cargar />);
  await screen.findByRole('button', { name: 'Guardar cambios' });
  expect(screen.getByLabelText('Monto').props.value).toBe('500');
  await escribir('Monto', '600');
  await tocar('button', 'Guardar cambios');
  const [g] = mockDatos.guardarGasto.mock.calls[0];
  expect(g).toEqual(
    expect.objectContaining({ id: 'g1', total: 600_00, modo: 'total', tildados: [{ producto_id: 'yerba', cantidad: 2 }], anotaciones: [] }),
  );
});

test('un gasto viejo por productos se abre en solo lectura con sus precios y solo se puede borrar', async () => {
  mockParams = { id: 'g1' };
  mockDatos.gasto.mockResolvedValue({
    gasto: { ...gastoBase, modo: 'productos', categoria_id: null, total: 8_200_00 },
    items: [
      { id: 'i1', gasto_id: 'g1', producto_id: 'yerba', cantidad: 1, precio_unitario: 5_200_00 },
      { id: 'i2', gasto_id: 'g1', producto_id: 'leche', cantidad: 2, precio_unitario: 1_500_00 },
    ],
  });
  await render(<Cargar />);
  expect(await screen.findByText(/^Este gasto se cargó por productos, con precios/)).toBeTruthy();
  expect(screen.getByText('Yerba')).toBeTruthy();
  expect(screen.getByText(`1 × ${formatear(5_200_00)}`)).toBeTruthy();
  expect(screen.getByText(`2 × ${formatear(1_500_00)}`)).toBeTruthy();
  expect(screen.getByText(formatear(8_200_00))).toBeTruthy();
  expect(screen.queryByLabelText('Monto')).toBeNull();
  expect(screen.queryByRole('button', { name: /^Guardar/ })).toBeNull();

  await tocar('button', 'Borrar gasto');
  expect(screen.getByRole('header', { name: '¿Borrar este gasto?' })).toBeTruthy();
  await act(async () => tocar('button', 'Borrar'));
  expect(mockDatos.borrarGasto).toHaveBeenCalledWith('g1');
  expect(mockRouter.back).toHaveBeenCalled();
});

test('muestra lo que espera en la cola del integrante con sesión', async () => {
  mockCola.pendientes.mockResolvedValue([{ id: 'o1', tipo: 'guardarGasto', duenio: 'ana', datos: {} }]);
  await abrir();
  expect(await screen.findByText('1 gasto guardado en el celu: se manda cuando vuelva la conexión.')).toBeTruthy();
});

test('con el gasto en cola, sigue mostrando los que la base rechazó (sin repetir cuántos esperan)', async () => {
  mockDatos.guardarGasto.mockResolvedValue({ estado: 'en-cola', id: 'x' });
  mockCola.pendientes.mockResolvedValue([{ id: 'o0', tipo: 'guardarGasto', duenio: 'ana', datos: {} }]);
  mockCola.rechazadas.mockResolvedValue([
    {
      op: { id: 'o9', tipo: 'guardarGasto', duenio: 'ana', datos: { gasto: { fecha: `${MES}-03`, total: 300_00 } } },
      code: 'P0001',
      message: 'MES_CERRADO',
      cuando: '2026-10-03T12:00:00.000Z',
    },
  ]);
  await abrir();
  expect(await screen.findByText(/^No se pudo guardar el gasto del /)).toBeTruthy();
  await escribir('Monto', '500');
  await elegirCategoria('Luz');
  await tocar('button', 'Guardar gasto');
  expect(await screen.findByText(/^Guardado en el celu: se manda cuando vuelva la conexión/)).toBeTruthy();
  await act(async () => undefined);
  expect(screen.getByText(/^No se pudo guardar el gasto del /)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Descartar' })).toBeTruthy();
  expect(screen.queryByText(/gastos? guardados? en el celu: se mand/)).toBeNull();
});

test('sin la app instalada, «Subir comprobante» avisa que el OCR no está y no llena nada', async () => {
  mockPicker.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://c.png', fileSize: 1000, mimeType: 'image/png' }] });
  mockLeerTexto.mockRejectedValue(new (jest.requireActual('@/comprobante/ocr.comun').OcrNoDisponible)());
  await abrir();
  await tocar('button', 'Subir comprobante');
  expect(await screen.findByText('Para leer comprobantes instalá la app (APK); en Expo Go no se puede.')).toBeTruthy();
  expect(screen.getByLabelText('Monto').props.value).toBe('');
});

test('mientras lee, avisa «Leyendo el comprobante…»', async () => {
  mockPicker.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://c.png', fileSize: 1000, mimeType: 'image/png' }] });
  let resolver: (texto: string) => void = () => undefined;
  mockLeerTexto.mockReturnValue(new Promise<string>((r) => { resolver = r; }));
  await abrir();
  await tocar('button', 'Subir comprobante');
  expect(await screen.findByText('Leyendo el comprobante…')).toBeTruthy();
  await act(async () => {
    resolver(COMPROBANTE);
  });
});

test('«Subir comprobante» llena el formulario y al guardar manda mp_operacion y destino', async () => {
  mockPicker.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://c.png', fileSize: 1000, mimeType: 'image/png' }] });
  mockLeerTexto.mockResolvedValue(COMPROBANTE);
  mockDatos.categoriaDeDestino.mockResolvedValue('super');
  await abrir();
  await tocar('button', 'Subir comprobante');
  expect(await screen.findByText('Leímos el comprobante: revisá los datos y guardá.')).toBeTruthy();
  await waitFor(() => expect(screen.getByLabelText('Monto').props.value).toBe(centavosATexto(4860000)));
  expect(screen.getByRole('button', { name: 'Categoría: Súper' })).toBeTruthy();
  expect(screen.getByLabelText('Fecha').props.value).toBe(fechaLarga('2026-10-08'));
  expect(screen.getByLabelText('Nota').props.value).toBe('Beto Salas');

  await tocar('button', 'Guardar gasto');
  const [g] = mockDatos.guardarGasto.mock.calls[0];
  expect(g).toEqual(expect.objectContaining({ total: 48_600_00, mp_operacion: '123456789012', destino: 'beto salas' }));
});

test('en edición no se ofrece subir comprobante', async () => {
  mockParams = { id: 'g1' };
  mockDatos.gasto.mockResolvedValue({ gasto: gastoBase, items: [] });
  await render(<Cargar />);
  await screen.findByRole('button', { name: 'Guardar cambios' });
  expect(screen.queryByRole('button', { name: 'Subir comprobante' })).toBeNull();
});
