// Cargar con la capa de datos simulada: validación, la hoja «Agregar producto», el guardado (también en
// cola), el mes cerrado, el gasto viejo por productos y el comprobante (subido y compartido).

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { guardarPendiente, tomarPendiente } from '@/comprobante/useCompartidoPendiente';
import { centavosATexto, formatear } from '@/logica/dinero';
import { fechaLarga, hoy, mesActual, mesAnterior } from '@/logica/meses';
import type { Integrante, Producto } from '@/logica/tipos';

import { Cargar } from './Cargar';

const m = vi.hoisted(() => ({
  datos: {
    integrantes: vi.fn(),
    categorias: vi.fn(),
    productos: vi.fn(),
    anotaciones: vi.fn(),
    mesesCerrados: vi.fn(),
    gasto: vi.fn(),
    guardarGasto: vi.fn(),
    borrarGasto: vi.fn(),
    gastoPorOperacion: vi.fn(),
    categoriaDeDestino: vi.fn(),
    escucharCambios: vi.fn(() => () => undefined),
  },
  cola: { pendientes: vi.fn(), rechazadas: vi.fn(), olvidarRechazada: vi.fn() },
  nuevoId: vi.fn(),
  leerTexto: vi.fn(),
  leerTextoPdf: vi.fn(),
}));

vi.mock('@/datos', () => ({
  get datos() {
    return m.datos;
  },
  obtenerCola: () => m.cola,
  escucharDescartes: () => () => undefined,
}));
vi.mock('@/datos/id', () => ({ nuevoId: () => m.nuevoId() }));
vi.mock('@/sesion/sesion', () => ({ useSesion: () => ({ yo: { id: 'ana', nombre: 'Ana' } }) }));
vi.mock('@/comprobante/ocr', async () => {
  const real = await vi.importActual<typeof import('@/comprobante/ocr.comun')>('@/comprobante/ocr.comun');
  return {
    leerTexto: (...args: unknown[]) => m.leerTexto(...args),
    MAX_BYTES: real.MAX_BYTES,
    OcrNoDisponible: real.OcrNoDisponible,
  };
});
vi.mock('@/comprobante/pdf', () => ({ leerTextoPdf: (...args: unknown[]) => m.leerTextoPdf(...args) }));

import { OcrNoDisponible } from '@/comprobante/ocr';

const MES = mesActual();
const MES_ANTERIOR = mesAnterior(MES);

// Intl separa el «$» con un espacio duro; el matcher de Testing Library normaliza a espacio común.
const texto = (s: string) => s.replace(/\u00a0/g, ' ');

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

function irA(ruta: string) {
  history.replaceState(null, '', '/');
  // Como si se viniera desde otra pantalla de la app: la entrada lleva su profundidad (ver src/ui/volver.ts).
  history.pushState({ profundidad: 1 }, '', ruta);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  m.nuevoId.mockReturnValue('00000000-0000-4000-8000-000000000001');
  m.datos.integrantes.mockResolvedValue([
    persona('ana', 'Ana'),
    persona('bruno', 'Bruno'),
    // Dejó la casa este mes: puede figurar como pagadora solo en los meses anteriores.
    persona('caro', 'Caro', { activo: false, baja_desde: MES }),
    persona('dani', 'Dani', { tipo: 'pagador_externo', sueldo: null }),
  ]);
  m.datos.categorias.mockResolvedValue([
    { id: 'super', nombre: 'Súper', tipo: 'producto', dias_sin_movimiento: 20 },
    { id: 'luz', nombre: 'Luz', tipo: 'servicio', dias_sin_movimiento: 20 },
  ]);
  m.datos.productos.mockResolvedValue([
    producto('yerba', 'Yerba', 1, 'paquete'),
    producto('leche', 'Leche', 0, 'litro'),
    producto('fernet', 'Fernet', 0, 'unidad', true),
  ]);
  m.datos.anotaciones.mockResolvedValue([{ id: 'pan', texto: 'Comprar pan', creado_por: 'ana', creado: '2026-10-01T12:00:00.000Z' }]);
  m.datos.mesesCerrados.mockResolvedValue(new Set());
  m.datos.gasto.mockResolvedValue(null);
  m.datos.guardarGasto.mockResolvedValue({ estado: 'hecho', id: 'nuevo' });
  m.datos.borrarGasto.mockResolvedValue(undefined);
  m.datos.gastoPorOperacion.mockResolvedValue(null);
  m.datos.categoriaDeDestino.mockResolvedValue(null);
  m.datos.escucharCambios.mockReturnValue(() => undefined);
  m.cola.pendientes.mockResolvedValue([]);
  m.cola.rechazadas.mockResolvedValue([]);
  m.cola.olvidarRechazada.mockResolvedValue(undefined);
  tomarPendiente();
  URL.createObjectURL = vi.fn(() => 'blob:c');
  URL.revokeObjectURL = vi.fn();
  history.replaceState(null, '', '/');
  vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
});

async function abrir() {
  irA('/cargar');
  render(<Cargar />);
  await screen.findByRole('button', { name: /^Guardar|^Borrar gasto$/ });
}

const tocar = (rol: 'button' | 'checkbox' | 'radio', nombre: string | RegExp) =>
  userEvent.click(screen.getByRole(rol, { name: nombre }));

async function escribir(etiqueta: string, texto: string) {
  const campo = screen.getByLabelText(etiqueta);
  await userEvent.clear(campo);
  if (texto) await userEvent.type(campo, texto);
}

async function elegirCategoria(nombre: string) {
  await tocar('button', /^Categoría: /);
  const hoja = within(screen.getByRole('dialog'));
  await userEvent.click(hoja.getByRole('button', { name: nombre }));
}

async function subir(archivo: File) {
  await userEvent.upload(screen.getByLabelText('Subir comprobante'), archivo);
}

test('valida el monto y la categoría antes de guardar', async () => {
  await abrir();
  await tocar('button', 'Guardar gasto');
  expect(screen.getByText('Ingresá un monto mayor a 0, por ejemplo 85.000.')).toBeInTheDocument();
  expect(screen.getByText('Elegí una categoría.')).toBeInTheDocument();
  await escribir('Monto', '12,345');
  await tocar('button', 'Guardar gasto');
  expect(screen.getByText('Ingresá un monto mayor a 0, por ejemplo 85.000.')).toBeInTheDocument();
  expect(m.datos.guardarGasto).not.toHaveBeenCalled();
});

test('guarda 1.234,50 por total con categoría, Pagó y nota, con el mismo nuevo_id al reintentar', async () => {
  await abrir();
  await escribir('Monto', '1.234,50');
  await elegirCategoria('Luz');
  expect(screen.getByRole('button', { name: 'Categoría: Luz' })).toBeInTheDocument();
  await tocar('button', 'Bruno');
  await escribir('Nota', 'Factura de octubre');

  m.datos.guardarGasto.mockRejectedValueOnce(Object.assign(new Error('se cayó algo'), { code: 'XX000' }));
  await tocar('button', 'Guardar gasto');
  expect(await screen.findByText('Algo salió mal. Probá de nuevo.')).toBeInTheDocument();
  expect(window.history.back).not.toHaveBeenCalled();

  await tocar('button', 'Guardar gasto');
  expect(window.history.back).toHaveBeenCalled();
  const [[primero, items], [segundo]] = m.datos.guardarGasto.mock.calls;
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
  m.datos.mesesCerrados.mockResolvedValue(new Set([MES_ANTERIOR]));
  await abrir();
  expect(screen.getByLabelText('Fecha')).toHaveValue(fechaLarga(hoy()));
  await escribir('Fecha', '31/02/2026');
  await tocar('button', 'Guardar gasto');
  expect(screen.getByText('Elegí una fecha.')).toBeInTheDocument();
  await escribir('Fecha', fechaLarga(`${MES_ANTERIOR}-10`));
  await tocar('button', 'Guardar gasto');
  expect(screen.getByText('Ese mes está cerrado. Reabrilo desde Análisis para cargar gastos.')).toBeInTheDocument();
  expect(m.datos.guardarGasto).not.toHaveBeenCalled();
});

test('Pagó ofrece a quienes estaban en la casa ese mes, y arranca con quien carga', async () => {
  await abrir();
  expect(screen.getByRole('button', { name: 'Ana' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Dani' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Caro' })).not.toBeInTheDocument();

  await escribir('Fecha', fechaLarga(`${MES_ANTERIOR}-10`));
  await tocar('button', 'Caro');
  // Al volver a este mes, Caro ya no está: hay que elegir de nuevo.
  await escribir('Fecha', fechaLarga(hoy()));
  expect(screen.queryByRole('button', { name: 'Caro' })).not.toBeInTheDocument();
  await escribir('Monto', '500');
  await elegirCategoria('Luz');
  await tocar('button', 'Guardar gasto');
  expect(screen.getByText('Elegí quién pagó.')).toBeInTheDocument();
  expect(m.datos.guardarGasto).not.toHaveBeenCalled();
});

test('«Agregar producto» lista Stock y anotaciones, tilda con 1, respeta la unidad y guarda tildados y anotaciones', async () => {
  await abrir();
  await tocar('button', 'Agregar producto');
  expect(screen.getByRole('heading', { name: 'Agregar producto' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Yerba, Hay 1' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Leche, Falta' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Comprar pan, Anotación rápida' })).toBeInTheDocument();
  expect(screen.queryByText('Fernet')).not.toBeInTheDocument();

  await tocar('checkbox', 'Leche, Falta');
  expect(screen.getByRole('checkbox', { name: 'Leche, Falta' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByLabelText('Cantidad de Leche')).toHaveValue('1');
  await escribir('Cantidad de Leche', '1,5');
  await tocar('checkbox', 'Yerba, Hay 1');
  await escribir('Cantidad de Yerba', '1,5');
  await tocar('checkbox', 'Comprar pan, Anotación rápida');
  await tocar('button', 'Sumar 3 al gasto');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  await escribir('Monto', '8.000');
  await elegirCategoria('Súper');
  await tocar('button', 'Guardar gasto');
  expect(screen.getByText('Yerba: Para unidades y paquetes, solo números enteros.')).toBeInTheDocument();
  expect(m.datos.guardarGasto).not.toHaveBeenCalled();

  await tocar('button', 'Agregar producto');
  await escribir('Cantidad de Yerba', '2');
  await tocar('button', 'Sumar 3 al gasto');
  await tocar('button', 'Guardar gasto');
  const [g] = m.datos.guardarGasto.mock.calls[0];
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
  expect(m.nuevoId).toHaveBeenCalledTimes(1);
});

test('sin conexión queda en la cola: «Guardado en el celu: se manda cuando vuelva la conexión»', async () => {
  m.datos.guardarGasto.mockResolvedValue({ estado: 'en-cola', id: 'x' });
  await abrir();
  await escribir('Monto', '500');
  await elegirCategoria('Luz');
  // Al guardar, la op ya está en la cola.
  m.cola.pendientes.mockResolvedValue([{ id: 'o1', tipo: 'guardarGasto', duenio: 'ana', datos: {} }]);
  await tocar('button', 'Guardar gasto');
  expect(await screen.findByText(/^Guardado en el celu: se manda cuando vuelva la conexión/)).toBeInTheDocument();
  expect(window.history.back).not.toHaveBeenCalled();
  // Lo dice una vez: la tarjeta de la cola no lo repite.
  await act(async () => undefined);
  expect(screen.queryByText('1 gasto guardado en el celu: se manda cuando vuelva la conexión.')).not.toBeInTheDocument();
  await tocar('button', 'Listo');
  expect(window.history.back).toHaveBeenCalled();
});

test('un gasto de un mes cerrado se ve con los campos bloqueados y el aviso, sin guardar ni borrar', async () => {
  m.datos.mesesCerrados.mockResolvedValue(new Set([MES_ANTERIOR]));
  m.datos.gasto.mockResolvedValue({ gasto: { ...gastoBase, fecha: `${MES_ANTERIOR}-10` }, items: [] });
  irA('/cargar?id=g1');
  render(<Cargar />);
  expect(await screen.findByText('Este gasto es de un mes cerrado. Para cambiarlo, reabrí el mes desde Análisis.')).toBeInTheDocument();
  expect(screen.getByLabelText('Monto')).toHaveValue('500');
  expect(screen.getByLabelText('Monto')).toHaveAttribute('readonly');
  expect(screen.getByRole('button', { name: 'Categoría: Luz' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Ana' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /^Guardar/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Borrar gasto' })).not.toBeInTheDocument();
});

test('editar un gasto con productos tildados manda su id y los tildados', async () => {
  m.datos.gasto.mockResolvedValue({
    gasto: gastoBase,
    items: [{ id: 'i1', gasto_id: 'g1', producto_id: 'yerba', cantidad: 2, precio_unitario: null }],
  });
  irA('/cargar?id=g1');
  render(<Cargar />);
  await screen.findByRole('button', { name: 'Guardar cambios' });
  expect(screen.getByLabelText('Monto')).toHaveValue('500');
  await escribir('Monto', '600');
  await tocar('button', 'Guardar cambios');
  const [g] = m.datos.guardarGasto.mock.calls[0];
  expect(g).toEqual(
    expect.objectContaining({ id: 'g1', total: 600_00, modo: 'total', tildados: [{ producto_id: 'yerba', cantidad: 2 }], anotaciones: [] }),
  );
});

test('un gasto viejo por productos se abre en solo lectura con sus precios y solo se puede borrar', async () => {
  m.datos.gasto.mockResolvedValue({
    gasto: { ...gastoBase, modo: 'productos', categoria_id: null, total: 8_200_00 },
    items: [
      { id: 'i1', gasto_id: 'g1', producto_id: 'yerba', cantidad: 1, precio_unitario: 5_200_00 },
      { id: 'i2', gasto_id: 'g1', producto_id: 'leche', cantidad: 2, precio_unitario: 1_500_00 },
    ],
  });
  irA('/cargar?id=g1');
  render(<Cargar />);
  expect(await screen.findByText(/^Este gasto se cargó por productos, con precios/)).toBeInTheDocument();
  expect(screen.getByText('Yerba')).toBeInTheDocument();
  expect(screen.getByText(texto(`1 × ${formatear(5_200_00)}`))).toBeInTheDocument();
  expect(screen.getByText(texto(`2 × ${formatear(1_500_00)}`))).toBeInTheDocument();
  expect(screen.getByText(texto(formatear(8_200_00)))).toBeInTheDocument();
  expect(screen.queryByLabelText('Monto')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Guardar/ })).not.toBeInTheDocument();

  await tocar('button', 'Borrar gasto');
  expect(screen.getByRole('heading', { name: '¿Borrar este gasto?' })).toBeInTheDocument();
  const hoja = within(screen.getByRole('dialog'));
  await userEvent.click(hoja.getByRole('button', { name: 'Borrar' }));
  await waitFor(() => expect(m.datos.borrarGasto).toHaveBeenCalledWith('g1'));
  expect(window.history.back).toHaveBeenCalled();
});

test('muestra lo que espera en la cola del integrante con sesión', async () => {
  m.cola.pendientes.mockResolvedValue([{ id: 'o1', tipo: 'guardarGasto', duenio: 'ana', datos: {} }]);
  await abrir();
  expect(await screen.findByText('1 gasto guardado en el celu: se manda cuando vuelva la conexión.')).toBeInTheDocument();
});

test('con el gasto en cola, sigue mostrando los que la base rechazó (sin repetir cuántos esperan)', async () => {
  m.datos.guardarGasto.mockResolvedValue({ estado: 'en-cola', id: 'x' });
  m.cola.pendientes.mockResolvedValue([{ id: 'o0', tipo: 'guardarGasto', duenio: 'ana', datos: {} }]);
  m.cola.rechazadas.mockResolvedValue([
    {
      op: { id: 'o9', tipo: 'guardarGasto', duenio: 'ana', datos: { gasto: { fecha: `${MES}-03`, total: 300_00 } } },
      code: 'P0001',
      message: 'MES_CERRADO',
      cuando: '2026-10-03T12:00:00.000Z',
    },
  ]);
  await abrir();
  expect(await screen.findByText(/^No se pudo guardar el gasto del /)).toBeInTheDocument();
  await escribir('Monto', '500');
  await elegirCategoria('Luz');
  await tocar('button', 'Guardar gasto');
  expect(await screen.findByText(/^Guardado en el celu: se manda cuando vuelva la conexión/)).toBeInTheDocument();
  await act(async () => undefined);
  expect(screen.getByText(/^No se pudo guardar el gasto del /)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Descartar' })).toBeInTheDocument();
  expect(screen.queryByText(/gastos? guardados? en el celu: se mand/)).not.toBeInTheDocument();
});

test('sin la app instalada, «Subir comprobante» avisa que el OCR no está y no llena nada', async () => {
  m.leerTexto.mockRejectedValue(new OcrNoDisponible());
  await abrir();
  await subir(new File([COMPROBANTE], 'c.png', { type: 'image/png' }));
  expect(await screen.findByText('Para leer comprobantes instalá la app (APK); en Expo Go no se puede.')).toBeInTheDocument();
  expect(screen.getByLabelText('Monto')).toHaveValue('');
});

test('mientras lee, avisa «Leyendo el comprobante…»', async () => {
  let resolver: (texto: string) => void = () => undefined;
  m.leerTexto.mockReturnValue(new Promise<string>((r) => { resolver = r; }));
  await abrir();
  await subir(new File([COMPROBANTE], 'c.png', { type: 'image/png' }));
  expect(await screen.findByText('Leyendo el comprobante…')).toBeInTheDocument();
  await act(async () => {
    resolver(COMPROBANTE);
    await Promise.resolve();
  });
});

test('«Subir comprobante» llena el formulario, libera la URL y al guardar manda mp_operacion y destino', async () => {
  m.leerTexto.mockResolvedValue(COMPROBANTE);
  m.datos.categoriaDeDestino.mockResolvedValue('super');
  await abrir();
  await subir(new File([COMPROBANTE], 'c.png', { type: 'image/png' }));
  expect(await screen.findByText('Leímos el comprobante: revisá los datos y guardá.')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('Monto')).toHaveValue(centavosATexto(4860000)));
  expect(screen.getByRole('button', { name: 'Categoría: Súper' })).toBeInTheDocument();
  expect(screen.getByLabelText('Fecha')).toHaveValue(fechaLarga('2026-10-08'));
  expect(screen.getByLabelText('Nota')).toHaveValue('Beto Salas');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:c');

  await tocar('button', 'Guardar gasto');
  const [g] = m.datos.guardarGasto.mock.calls[0];
  expect(g).toEqual(expect.objectContaining({ total: 48_600_00, mp_operacion: '123456789012', destino: 'beto salas' }));
});

test('en edición no se ofrece subir comprobante', async () => {
  m.datos.gasto.mockResolvedValue({ gasto: gastoBase, items: [] });
  irA('/cargar?id=g1');
  render(<Cargar />);
  await screen.findByRole('button', { name: 'Guardar cambios' });
  expect(screen.queryByRole('button', { name: 'Subir comprobante' })).not.toBeInTheDocument();
});

// ——— El comprobante compartido desde otra app ———

test('Cargar con compartido=1 toma el pendiente y lo pasa a leer', async () => {
  m.leerTextoPdf.mockResolvedValue('Comprobante sin datos');
  guardarPendiente({ uri: 'file://compartido.pdf', tipo: 'application/pdf', bytes: 1234 });
  irA('/cargar?compartido=1');
  render(<Cargar />);

  await waitFor(() => expect(m.leerTextoPdf).toHaveBeenCalledWith('file://compartido.pdf'));
  expect(tomarPendiente()).toBeNull();
});

test('Cargar sin el parámetro compartido no lee nada solo', async () => {
  guardarPendiente({ uri: 'file://compartido.pdf', tipo: 'application/pdf', bytes: 1234 });
  irA('/cargar');
  render(<Cargar />);
  await act(async () => undefined);

  expect(m.leerTextoPdf).not.toHaveBeenCalled();
  expect(tomarPendiente()).not.toBeNull();
});
