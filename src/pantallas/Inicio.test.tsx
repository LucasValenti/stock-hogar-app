// Inicio con la capa de datos simulada: los estados de la maqueta «Elegida», la actualización en vivo,
// «¿Todavía hay?», el aviso de pendientes y los últimos gastos.

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { formatear } from '@/logica/dinero';
import type { Acceso, Categoria, Integrante, Producto } from '@/logica/tipos';

import { Inicio } from './Inicio';

// Intl separa el «$» con un espacio duro; el matcher de Testing Library normaliza a espacio común.
const texto = (s: string) => s.replace(/\u00a0/g, ' ');

const m = vi.hoisted(() => ({
  datos: {
    integrantes: vi.fn(),
    gastosEntre: vi.fn(),
    escucharCambios: vi.fn(),
    categorias: vi.fn(),
    productos: vi.fn(),
    anotaciones: vi.fn(),
    confirmarHay: vi.fn(),
    ajustarStock: vi.fn(),
    partesDelMes: vi.fn(),
    sueldos: vi.fn(),
  },
  cola: { pendientes: vi.fn(), rechazadas: vi.fn(), olvidarRechazada: vi.fn() },
  sesion: {
    yo: { id: 'a', nombre: 'Ana' } as Integrante | null,
    demo: false,
    salir: vi.fn(),
    acceso: { admin: false, permisos: [] } as Acceso | null,
  },
  memoria: false,
  oyentes: new Set<() => void>(),
}));

vi.mock('@/sesion/sesion', () => ({ useSesion: () => m.sesion }));
vi.mock('@/datos', () => ({
  get datos() {
    return m.datos;
  },
  esModoMemoria: () => m.memoria,
  obtenerCola: () => m.cola,
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
  admin: false,
  color: null,
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

const avisarCambio = () => {
  for (const f of [...m.oyentes]) f();
};

beforeEach(() => {
  vi.clearAllMocks();
  m.memoria = false;
  m.sesion.demo = false;
  m.sesion.yo = casa[0];
  m.sesion.acceso = { admin: false, permisos: [] };
  // Sin el permiso «sueldos» se reparte con las partes del mes (60 % y 40 %).
  m.datos.partesDelMes.mockResolvedValue({ a: 600_000_000_000, b: 400_000_000_000 });
  m.datos.sueldos.mockResolvedValue({ a: 600, b: 400 });
  m.sesion.salir.mockReset().mockResolvedValue(undefined);
  m.oyentes.clear();
  m.datos.integrantes.mockResolvedValue(casa);
  m.datos.categorias.mockResolvedValue([almacen]);
  m.datos.productos.mockResolvedValue([]);
  m.datos.anotaciones.mockResolvedValue([]);
  m.datos.confirmarHay.mockResolvedValue(undefined);
  m.datos.ajustarStock.mockResolvedValue(0);
  m.cola.pendientes.mockResolvedValue([]);
  m.cola.rechazadas.mockResolvedValue([]);
  m.cola.olvidarRechazada.mockResolvedValue(undefined);
  m.datos.escucharCambios.mockImplementation((f: () => void) => {
    m.oyentes.add(f);
    return () => {
      m.oyentes.delete(f);
    };
  });
  history.replaceState(null, '', '/');
});

test('mientras carga muestra el esqueleto y «Trayendo los gastos de la casa…»', async () => {
  m.datos.gastosEntre.mockReturnValue(new Promise(() => undefined));
  render(<Inicio />);
  expect(screen.getByText('Hola, Ana')).toBeInTheDocument();
  expect(screen.getByText('Trayendo los gastos de la casa…')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^[A-ZÁÉÍÓÚ]/);
});

test('con gastos muestra el total del mes y cómo viene el reparto, con signo y palabra', async () => {
  m.datos.gastosEntre.mockResolvedValue([gasto('a', 1000_00)]);
  render(<Inicio />);
  expect(await screen.findByLabelText(texto(`Gastos del mes: ${formatear(1000_00)}. 1 gasto.`))).toBeInTheDocument();
  expect(screen.getByText('Cómo viene el reparto')).toBeInTheDocument();
  // Ana puso todo y le toca 60 %: recibe 400; Bruno pone 400.
  expect(screen.getByText(texto(`+ ${formatear(400_00)}`))).toBeInTheDocument();
  expect(screen.getByText('recibe')).toBeInTheDocument();
  expect(screen.getByText(texto(`− ${formatear(400_00)}`))).toBeInTheDocument();
  expect(screen.getByText('pone')).toBeInTheDocument();
});

test('sin conexión avisa «No pudimos traer los datos» y Reintentar vuelve a pedir', async () => {
  m.datos.gastosEntre.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  render(<Inicio />);
  expect(await screen.findByText('No pudimos traer los datos')).toBeInTheDocument();
  m.datos.gastosEntre.mockResolvedValue([]);
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText(/^Arrancó /)).toBeInTheDocument();
});

test('un mes sin gastos muestra $ 0 y el aviso con «Cargar gasto»', async () => {
  m.datos.gastosEntre.mockResolvedValue([]);
  render(<Inicio />);
  expect(await screen.findByText('Todavía no cargó nadie')).toBeInTheDocument();
  expect(screen.getByText(texto(formatear(0)))).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cargar gasto' })).toBeInTheDocument();
});

test('varios avisos seguidos (un gasto con sus ítems) piden los datos una sola vez', async () => {
  m.datos.gastosEntre.mockResolvedValue([]);
  render(<Inicio />);
  await screen.findByText('Todavía no cargó nadie');
  expect(m.datos.gastosEntre).toHaveBeenCalledTimes(1);
  m.datos.gastosEntre.mockResolvedValue([gasto('b', 500_00)]);
  act(() => {
    avisarCambio();
    avisarCambio();
    avisarCambio();
  });
  expect(await screen.findByLabelText(texto(`Gastos del mes: ${formatear(500_00)}. 1 gasto.`))).toBeInTheDocument();
  expect(m.datos.gastosEntre).toHaveBeenCalledTimes(2);
});

test('se actualiza solo cuando alguien cambia algo', async () => {
  m.datos.gastosEntre.mockResolvedValue([]);
  render(<Inicio />);
  await screen.findByText('Todavía no cargó nadie');
  m.datos.gastosEntre.mockResolvedValue([gasto('b', 500_00)]);
  act(() => avisarCambio());
  expect(await screen.findByLabelText(texto(`Gastos del mes: ${formatear(500_00)}. 1 gasto.`))).toBeInTheDocument();
});

test('avisa los gastos de quien tiene la sesión que esperan conexión', async () => {
  m.datos.gastosEntre.mockResolvedValue([]);
  m.cola.pendientes.mockResolvedValue([
    { id: 'o1', tipo: 'guardarGasto', duenio: 'a', datos: {} },
    { id: 'o2', tipo: 'guardarGasto', duenio: 'b', datos: {} },
  ]);
  render(<Inicio />);
  expect(await screen.findByText('1 gasto guardado en el celu: se manda cuando vuelva la conexión.')).toBeInTheDocument();
});

// ——— «¿Todavía hay?» ———

const yerba = () => producto('yerba', 'Yerba', 3, 40);
const arroz = () => producto('arroz', 'Arroz', 1, 30);
const tarjetaHay = () => within(screen.getByTestId('todavia-hay'));

test('«¿Todavía hay?» muestra de a uno, el que lleva más tiempo quieto, con Hay, Falta y Ajustar', async () => {
  m.datos.gastosEntre.mockResolvedValue([]);
  m.datos.productos.mockResolvedValue([arroz(), yerba(), producto('cafe', 'Café', 2, 3), producto('sal', 'Sal', 0, 90)]);
  render(<Inicio />);
  expect(await screen.findByText('¿Todavía hay Yerba?')).toBeInTheDocument();
  expect(screen.queryByText('¿Todavía hay Arroz?')).not.toBeInTheDocument();
  // Ni lo reciente (café) ni lo que ya falta (sal: está en pendientes).
  expect(screen.queryByText(/Café\?|Sal\?/)).not.toBeInTheDocument();
  expect(tarjetaHay().getByText('Hace 40 días que no cambia. En Stock: 3.')).toBeInTheDocument();
  for (const nombre of ['Hay', 'Falta', 'Ajustar']) {
    expect(tarjetaHay().getByRole('button', { name: nombre })).toBeInTheDocument();
  }
});

test('Hay confirma, y la tarjeta pasa al siguiente al instante', async () => {
  m.datos.gastosEntre.mockResolvedValue([]);
  m.datos.productos.mockResolvedValue([arroz(), yerba()]);
  m.datos.confirmarHay.mockReturnValue(new Promise(() => undefined));
  render(<Inicio />);
  await screen.findByText('¿Todavía hay Yerba?');
  await userEvent.click(tarjetaHay().getByRole('button', { name: 'Hay' }));
  expect(m.datos.confirmarHay).toHaveBeenCalledWith('yerba');
  expect(screen.getByText('¿Todavía hay Arroz?')).toBeInTheDocument();
});

test('Falta deja el stock en 0', async () => {
  m.datos.gastosEntre.mockResolvedValue([]);
  m.datos.productos.mockResolvedValue([yerba()]);
  render(<Inicio />);
  await screen.findByText('¿Todavía hay Yerba?');
  await userEvent.click(tarjetaHay().getByRole('button', { name: 'Falta' }));
  await waitFor(() => expect(m.datos.ajustarStock).toHaveBeenCalledWith('yerba', -3));
  await waitFor(() => expect(screen.queryByTestId('todavia-hay')).not.toBeInTheDocument());
});

// La base mueve el stock como ajustar_stock_producto: rechaza deltas de más de 1000 y no baja de 0.
function baseConStock(inicial: number) {
  let stock = inicial;
  m.datos.ajustarStock.mockImplementation(async (_id: string, delta: number) => {
    if (!delta || Math.abs(delta) > 1000) throw Object.assign(new Error('DELTA_INVALIDO'), { code: 'P0001' });
    stock = Math.max(0, Math.round((stock + delta) * 1000) / 1000);
    return stock;
  });
  return () => stock;
}

test('Falta usa el stock del producto al tocar y, si pasa de 1000, lo baja en pasos que la base acepta', async () => {
  m.datos.gastosEntre.mockResolvedValue([]);
  m.datos.productos.mockResolvedValue([yerba()]);
  render(<Inicio />);
  await screen.findByText('¿Todavía hay Yerba?');
  // Alguien cargó una compra grande mientras la tarjeta estaba a la vista.
  m.datos.productos.mockResolvedValue([producto('yerba', 'Yerba', 2500, 40)]);
  act(() => avisarCambio());
  await screen.findByText(/En Stock: 2\.?500/);
  const stock = baseConStock(2500);
  await userEvent.click(tarjetaHay().getByRole('button', { name: 'Falta' }));
  await waitFor(() => expect(m.datos.ajustarStock.mock.calls).toEqual([
    ['yerba', -1000],
    ['yerba', -1000],
    ['yerba', -500],
  ]));
  expect(stock()).toBe(0);
  await waitFor(() => expect(screen.queryByTestId('todavia-hay')).not.toBeInTheDocument());
  expect(screen.queryByText(/Algo salió mal/)).not.toBeInTheDocument();
});

test('Ajustar a una cantidad que se aleja más de 1000 la mueve en pasos que la base acepta', async () => {
  m.datos.gastosEntre.mockResolvedValue([]);
  m.datos.productos.mockResolvedValue([yerba()]);
  const stock = baseConStock(3);
  render(<Inicio />);
  await screen.findByText('¿Todavía hay Yerba?');
  await userEvent.click(tarjetaHay().getByRole('button', { name: 'Ajustar' }));
  const hoja = within(screen.getByRole('dialog'));
  const cantidad = hoja.getByLabelText('Cantidad');
  await userEvent.clear(cantidad);
  await userEvent.type(cantidad, '2500');
  await userEvent.click(hoja.getByRole('button', { name: 'Guardar cantidad' }));
  await waitFor(() => expect(m.datos.ajustarStock.mock.calls).toEqual([
    ['yerba', 1000],
    ['yerba', 1000],
    ['yerba', 497],
  ]));
  expect(stock()).toBe(2500);
  expect(screen.queryByText(/Algo salió mal/)).not.toBeInTheDocument();
});

test('Ajustar pide la cantidad según la unidad y la deja como dijo', async () => {
  m.datos.gastosEntre.mockResolvedValue([]);
  m.datos.productos.mockResolvedValue([yerba(), producto('harina', 'Harina', 2, 25, { unidad: 'kg' })]);
  render(<Inicio />);
  await screen.findByText('¿Todavía hay Yerba?');
  await userEvent.click(tarjetaHay().getByRole('button', { name: 'Ajustar' }));
  const hoja = within(screen.getByRole('dialog'));
  expect(hoja.getByText('¿Cuánto hay de Yerba?')).toBeInTheDocument();
  const cantidad = hoja.getByLabelText('Cantidad');
  await userEvent.clear(cantidad);
  await userEvent.type(cantidad, '1,5');
  await userEvent.click(hoja.getByRole('button', { name: 'Guardar cantidad' }));
  expect(hoja.getByText('Para unidades y paquetes, solo números enteros.')).toBeInTheDocument();
  expect(m.datos.ajustarStock).not.toHaveBeenCalled();
  await userEvent.clear(cantidad);
  await userEvent.type(cantidad, '1');
  await userEvent.click(hoja.getByRole('button', { name: 'Guardar cantidad' }));
  await waitFor(() => expect(m.datos.ajustarStock).toHaveBeenCalledWith('yerba', -2));
  expect(await screen.findByText('¿Todavía hay Harina?')).toBeInTheDocument();
});

test('Ajustar calcula la diferencia con el stock de ahora, no con el que había al abrir la hoja', async () => {
  m.datos.gastosEntre.mockResolvedValue([]);
  m.datos.productos.mockResolvedValue([yerba()]);
  render(<Inicio />);
  await screen.findByText('¿Todavía hay Yerba?');
  await userEvent.click(tarjetaHay().getByRole('button', { name: 'Ajustar' }));
  // Mientras tanto alguien cargó 2 más: hay 5.
  m.datos.productos.mockResolvedValue([producto('yerba', 'Yerba', 5, 40)]);
  act(() => avisarCambio());
  await screen.findByText('Hace 40 días que no cambia. En Stock: 5.');
  const hoja = within(screen.getByRole('dialog'));
  const cantidad = hoja.getByLabelText('Cantidad');
  await userEvent.clear(cantidad);
  await userEvent.type(cantidad, '1');
  await userEvent.click(hoja.getByRole('button', { name: 'Guardar cantidad' }));
  await waitFor(() => expect(m.datos.ajustarStock).toHaveBeenCalledWith('yerba', -4));
});

test('Ajustar a la misma cantidad cuenta como «Hay»', async () => {
  m.datos.gastosEntre.mockResolvedValue([]);
  m.datos.productos.mockResolvedValue([yerba()]);
  render(<Inicio />);
  await screen.findByText('¿Todavía hay Yerba?');
  await userEvent.click(tarjetaHay().getByRole('button', { name: 'Ajustar' }));
  const hoja = within(screen.getByRole('dialog'));
  await userEvent.click(hoja.getByRole('button', { name: 'Guardar cantidad' }));
  await waitFor(() => expect(m.datos.confirmarHay).toHaveBeenCalledWith('yerba'));
  expect(m.datos.ajustarStock).not.toHaveBeenCalled();
});

test('sin conexión, la respuesta no se pierde de vista: vuelve la tarjeta con el aviso', async () => {
  m.datos.gastosEntre.mockResolvedValue([]);
  m.datos.productos.mockResolvedValue([yerba()]);
  m.datos.confirmarHay.mockRejectedValue(sinConexion());
  render(<Inicio />);
  await screen.findByText('¿Todavía hay Yerba?');
  await userEvent.click(tarjetaHay().getByRole('button', { name: 'Hay' }));
  expect(await screen.findByText('Sin conexión: no se guardó. Probá de nuevo.')).toBeInTheDocument();
  expect(screen.getByText('¿Todavía hay Yerba?')).toBeInTheDocument();
});

// ——— Pendientes y últimos gastos ———

test('avisa lo que falta y lleva a Stock › Pendientes', async () => {
  m.datos.gastosEntre.mockResolvedValue([]);
  m.datos.productos.mockResolvedValue([producto('leche', 'Leche', 0, 1), producto('pan', 'Pan', 2, 1)]);
  m.datos.anotaciones.mockResolvedValue([{ id: 'n1', texto: 'Pilas AA', creado_por: 'a', creado: '2026-10-01T12:00:00.000Z' }]);
  render(<Inicio />);
  expect(await screen.findByText('Faltan Leche y Pilas AA.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Ver pendientes' }));
  expect(location.pathname).toBe('/stock');
  expect(location.search).toBe('?vista=pendientes');
});

test('sin pendientes no hay aviso', async () => {
  m.datos.gastosEntre.mockResolvedValue([]);
  m.datos.productos.mockResolvedValue([producto('pan', 'Pan', 2, 1)]);
  render(<Inicio />);
  await screen.findByText('Todavía no cargó nadie');
  expect(screen.queryByRole('button', { name: 'Ver pendientes' })).not.toBeInTheDocument();
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
  m.datos.gastosEntre.mockResolvedValue(gastos);
  render(<Inicio />);
  expect(await screen.findByRole('heading', { name: 'Últimos gastos' })).toBeInTheDocument();
  const filas = screen.getAllByRole('button', { name: /^Almacén, / });
  expect(filas).toHaveLength(5);
  expect(filas[0]).toHaveAttribute('aria-label', `Almacén, 19/10 · pagó Ana · Compra del sábado, ${formatear(100_00)}`);
  await userEvent.click(filas[1]);
  expect(location.pathname).toBe('/cargar');
  expect(location.search).toBe('?id=g2');
  await userEvent.click(screen.getByRole('button', { name: 'Ver todos los gastos' }));
  expect(location.pathname).toBe('/analisis');
  expect(location.search).toBe('?vista=detalle');
});

// ——— Demo ———

test('fuera de la demo no hay aviso', async () => {
  m.datos.gastosEntre.mockResolvedValue([]);
  render(<Inicio />);
  await screen.findByText('Todavía no cargó nadie');
  expect(screen.queryByText('Estás en la demo: los datos son inventados.')).not.toBeInTheDocument();
});

test('en la demo avisa arriba y «Salir de la demo» llama a salir', async () => {
  m.sesion.demo = true;
  m.datos.gastosEntre.mockResolvedValue([]);
  render(<Inicio />);
  expect(await screen.findByText('Estás en la demo: los datos son inventados.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Salir de la demo' }));
  expect(m.sesion.salir).toHaveBeenCalledTimes(1);
});

test('en el build solo-memoria el aviso va sin botón de salir', async () => {
  m.sesion.demo = true;
  m.memoria = true;
  m.datos.gastosEntre.mockResolvedValue([]);
  render(<Inicio />);
  expect(await screen.findByText('Estás en la demo: los datos son inventados.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Salir de la demo' })).not.toBeInTheDocument();
});

// ——— Reparto con pesos y permisos ———

test('sin el permiso de sueldos, el reparto sale de las partes del mes y nunca se piden los sueldos', async () => {
  m.datos.gastosEntre.mockResolvedValue([gasto('a', 1000_00)]);
  render(<Inicio />);
  expect(await screen.findByText(texto(`+ ${formatear(400_00)}`))).toBeInTheDocument();
  expect(m.datos.partesDelMes).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}$/));
  expect(m.datos.sueldos).not.toHaveBeenCalled();
});

test('con el permiso de sueldos, el reparto sale de los sueldos', async () => {
  m.sesion.acceso = { admin: false, permisos: ['sueldos'] };
  m.datos.gastosEntre.mockResolvedValue([gasto('a', 1000_00)]);
  render(<Inicio />);
  expect(await screen.findByText(texto(`+ ${formatear(400_00)}`))).toBeInTheDocument();
  expect(m.datos.sueldos).toHaveBeenCalled();
  expect(m.datos.partesDelMes).not.toHaveBeenCalled();
});

test('a quien falta el sueldo lo ven todos; sin el permiso, sin mandar a Ajustes', async () => {
  m.datos.partesDelMes.mockResolvedValue({ a: 1_000_000_000_000, b: 0 });
  m.datos.gastosEntre.mockResolvedValue([gasto('a', 1000_00)]);
  render(<Inicio />);
  expect(await screen.findByText('Para repartir falta el sueldo de Bruno.')).toBeInTheDocument();
  expect(screen.queryByText(/Ajustes → Integrantes/)).not.toBeInTheDocument();
});

test('con el permiso de sueldos, el aviso del sueldo que falta manda a Ajustes', async () => {
  m.sesion.acceso = { admin: true, permisos: [] };
  m.datos.sueldos.mockResolvedValue({ a: 600 });
  m.datos.gastosEntre.mockResolvedValue([gasto('a', 1000_00)]);
  render(<Inicio />);
  expect(await screen.findByText('Para repartir falta el sueldo de Bruno. Se carga en Ajustes → Integrantes.')).toBeInTheDocument();
});
