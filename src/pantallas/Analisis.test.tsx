// Análisis con la capa de datos simulada: cambio de mes, Resumen (en vivo o cierre guardado, Cerrar y
// Reabrir con confirmación propia, CIERRE_DESACTUALIZADO), Categorías, Evolución y Detalle con filtros
// y paginado.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { GastoConItems } from '@/datos/tipos';
import { formatear, formatearPorcentaje } from '@/logica/dinero';
import { fechaLarga, mesActual, mesAnterior, mesSiguiente, nombreMes, rangoMes, ultimoDia } from '@/logica/meses';
import { enMayuscula } from '@/logica/texto';
import type { Acceso, Categoria, Cierre, Integrante } from '@/logica/tipos';

import { Analisis } from './Analisis';

// Intl separa el «$» con un espacio duro; el matcher de Testing Library normaliza a espacio común.
const texto = (s: string) => s.replace(/\u00a0/g, ' ');

const oyentes = new Set<() => void>();
const mockDatos = vi.hoisted(() => ({
  integrantes: vi.fn(),
  categorias: vi.fn(),
  gastosEntre: vi.fn(),
  cierre: vi.fn(),
  mesesCerrados: vi.fn(),
  cerrarMes: vi.fn(),
  reabrirMes: vi.fn(),
  escucharCambios: vi.fn((_f: () => void) => () => undefined),
  partesDelMes: vi.fn(),
  sueldos: vi.fn(),
}));
const sesion = vi.hoisted(() => ({ acceso: null as Acceso | null }));

vi.mock('@/sesion/sesion', () => ({ useSesion: () => sesion }));

vi.mock('@/datos', () => ({
  get datos() {
    return mockDatos;
  },
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
const casa = [{ ...persona('a', 'Ana', 600), admin: true }, persona('b', 'Bruno', 400)];
const categorias: Categoria[] = [
  { id: 'almacen', nombre: 'Almacén', tipo: 'producto', dias_sin_movimiento: 20 },
  { id: 'luz', nombre: 'Luz', tipo: 'servicio', dias_sin_movimiento: 20 },
];

const MES = mesActual();
const ANTERIOR = mesAnterior(MES);

let n = 0;
function gasto(fecha: string, pagado_por: string, total: number, extra: Partial<GastoConItems> = {}): GastoConItems {
  n += 1;
  return {
    id: `g${n}`,
    fecha,
    pagado_por,
    total,
    modo: 'total',
    categoria_id: 'almacen',
    nota: null,
    creado_por: pagado_por,
    creado: '2026-01-01T12:00:00.000Z',
    mp_operacion: null,
    gasto_items: [],
    ...extra,
  };
}

let todos: GastoConItems[] = [];
let cierres: Record<string, Cierre> = {};

beforeEach(() => {
  vi.clearAllMocks();
  history.replaceState(null, '', '/analisis');
  oyentes.clear();
  n = 0;
  todos = [
    gasto(`${MES}-03`, 'a', 700_00, { nota: 'Yerba y fideos' }),
    gasto(`${MES}-02`, 'a', 300_00, { categoria_id: 'luz' }),
    gasto(`${ANTERIOR}-15`, 'b', 200_00),
  ];
  cierres = {};
  mockDatos.integrantes.mockResolvedValue(casa);
  // Con el permiso de sueldos se reparte (y se cierra) con los sueldos reales.
  sesion.acceso = { admin: false, permisos: ['sueldos'] };
  mockDatos.sueldos.mockResolvedValue({ a: 600, b: 400 });
  mockDatos.partesDelMes.mockResolvedValue({ a: 600_000_000_000, b: 400_000_000_000 });
  mockDatos.categorias.mockResolvedValue(categorias);
  mockDatos.gastosEntre.mockImplementation(async (desde: string | null, hastaExcl: string | null) =>
    todos
      .filter((g) => (desde === null || g.fecha >= desde) && (hastaExcl === null || g.fecha < hastaExcl))
      .sort((x, y) => y.fecha.localeCompare(x.fecha)),
  );
  mockDatos.cierre.mockImplementation(async (mes: string) => cierres[mes] ?? null);
  mockDatos.mesesCerrados.mockImplementation(async () => new Set(Object.keys(cierres)));
  mockDatos.cerrarMes.mockResolvedValue(undefined);
  mockDatos.reabrirMes.mockResolvedValue(undefined);
  mockDatos.escucharCambios.mockImplementation((f: () => void) => {
    oyentes.add(f);
    return () => {
      oyentes.delete(f);
    };
  });
});

async function abrir() {
  render(<Analisis />);
  await screen.findByRole('tab', { name: 'Resumen' });
  await waitFor(() => expect(screen.queryByText('Trayendo los gastos de la casa…')).not.toBeInTheDocument());
}
const tocar = (rol: 'button' | 'tab', nombre: string | RegExp) => userEvent.click(screen.getByRole(rol, { name: nombre }));
const hoja = () => within(screen.getByRole('dialog'));
const filasDeGasto = () => screen.queryAllByRole('button', { name: /· pagó / });
async function escribir(etiqueta: string, valor: string) {
  const campo = screen.getByLabelText(etiqueta);
  await userEvent.clear(campo);
  if (valor) await userEvent.type(campo, valor);
}
const avisarCambio = () => {
  for (const f of [...oyentes]) f();
};
const soloMes = (mes: string) => nombreMes(mes).split(' ')[0];

// ——— Resumen ———

test('el mes en curso muestra el total, el reparto con lo que le toca a cada uno y las transferencias', async () => {
  await abrir();
  expect(screen.getByRole('heading', { name: enMayuscula(nombreMes(MES)) })).toBeInTheDocument();
  expect(screen.getByText('En curso')).toBeInTheDocument();
  expect(screen.getByLabelText(texto(`Gastos de ${soloMes(MES)}: ${formatear(1000_00)}. 2 gastos.`))).toBeInTheDocument();
  // Ana puso todo y le toca 60 %: recibe 400.
  expect(
    screen.getByLabelText(
      texto(
        `Ana, le toca ${formatearPorcentaje(0.6)} (${formatear(600_00)}), puso ${formatear(1000_00)}. Recibe ${formatear(400_00)}.`,
      ),
    ),
  ).toBeInTheDocument();
  expect(screen.getByLabelText(texto(`Bruno le pasa a Ana: ${formatear(400_00)}.`))).toBeInTheDocument();
  expect(filasDeGasto()).toHaveLength(2);
});

test('Cerrar mes pide confirmación propia y guarda el reparto con lo que se usó para calcularlo', async () => {
  await abrir();
  await tocar('button', 'Cerrar mes');
  expect(hoja().getByText(`¿Cerrar ${nombreMes(MES)}?`)).toBeInTheDocument();
  expect(mockDatos.cerrarMes).not.toHaveBeenCalled();
  cierres[MES] = {
    mes: MES,
    total: 1000_00,
    detalle: { filas: [], transferencias: [] },
    cerrado_por: 'a',
    fecha: '2026-10-01T23:15:00.123456+00:00',
  };
  await userEvent.click(hoja().getByRole('button', { name: 'Cerrar mes' }));
  const [mes, resultado, gastos, integrantes] = mockDatos.cerrarMes.mock.calls[0];
  expect(mes).toBe(MES);
  expect(resultado.total).toBe(1000_00);
  expect(resultado.filas).toHaveLength(2);
  expect(resultado.transferencias).toEqual([{ de: 'b', a: 'a', monto: 400_00 }]);
  expect(gastos.map((g: GastoConItems) => g.id).sort()).toEqual(['g1', 'g2']);
  // Los sueldos reales, y nada más que lo que la base compara.
  expect(integrantes).toEqual([
    { id: 'a', tipo: 'integrante', activo: true, baja_desde: null, sueldo: 600 },
    { id: 'b', tipo: 'integrante', activo: true, baja_desde: null, sueldo: 400 },
  ]);
  expect(await screen.findByText(`${enMayuscula(nombreMes(MES))} quedó cerrado.`)).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: `Cierre de ${soloMes(MES)}` })).toBeInTheDocument();
});

test('Cancelar en la confirmación no cierra nada', async () => {
  await abrir();
  await tocar('button', 'Cerrar mes');
  await userEvent.click(hoja().getByRole('button', { name: 'Cancelar' }));
  expect(mockDatos.cerrarMes).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('si alguien cambió algo mientras tanto (CIERRE_DESACTUALIZADO), lo avisa y muestra el reparto nuevo', async () => {
  await abrir();
  mockDatos.cerrarMes.mockRejectedValue(Object.assign(new Error('CIERRE_DESACTUALIZADO'), { code: 'P0001' }));
  await tocar('button', 'Cerrar mes');
  todos.push(gasto(`${MES}-04`, 'b', 500_00));
  await userEvent.click(hoja().getByRole('button', { name: 'Cerrar mes' }));
  expect(
    await screen.findByText('Mientras mirabas, alguien cargó o cambió algo del mes. Revisá el reparto nuevo y cerrá otra vez.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(await screen.findByLabelText(texto(`Gastos de ${soloMes(MES)}: ${formatear(1500_00)}. 3 gastos.`))).toBeInTheDocument();
});

test('otro error al cerrar queda en la hoja', async () => {
  await abrir();
  mockDatos.cerrarMes.mockRejectedValue(new TypeError('Failed to fetch'));
  await tocar('button', 'Cerrar mes');
  await userEvent.click(hoja().getByRole('button', { name: 'Cerrar mes' }));
  expect(hoja().getByText('Sin conexión. Revisá internet y probá de nuevo: lo que cargaste sigue acá.')).toBeInTheDocument();
});

test('un mes cerrado se ve como registro, con quién y cuándo cerró, y se reabre con confirmación', async () => {
  cierres[MES] = {
    mes: MES,
    total: 1000_00,
    detalle: {
      filas: [
        { id: 'a', nombre: 'Ana', participa: true, peso: 0.6, leCorresponde: 600_00, pago: 1000_00, saldo: 400_00 },
        { id: 'b', nombre: 'Bruno', participa: true, peso: 0.4, leCorresponde: 400_00, pago: 0, saldo: -400_00 },
      ],
      transferencias: [{ de: 'b', a: 'a', monto: 400_00 }],
    },
    cerrado_por: 'a',
    fecha: '2026-10-01T23:15:00.123456+00:00',
  };
  await abrir();
  expect(screen.getByText('Cerrado')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: `Cierre de ${soloMes(MES)}` })).toBeInTheDocument();
  expect(screen.getByText(/^Cerrado el \d{2}\/\d{2}\/\d{4} a las \d{2}:\d{2} por Ana$/)).toBeInTheDocument();
  expect(screen.getByLabelText(texto(`Total del mes: ${formatear(1000_00)}`))).toBeInTheDocument();
  expect(
    screen.getByLabelText(
      texto(`Ana (${formatearPorcentaje(0.6)}): puso ${formatear(1000_00)}, le tocaba ${formatear(600_00)}`),
    ),
  ).toBeInTheDocument();
  expect(screen.getByLabelText(texto(`Bruno le pasa a Ana: ${formatear(400_00)}`))).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cerrar mes' })).not.toBeInTheDocument();
  expect(filasDeGasto()[0].getAttribute('aria-label')).toMatch(/, mes cerrado$/);

  await tocar('button', 'Reabrir mes');
  expect(hoja().getByText(`¿Reabrir ${nombreMes(MES)}?`)).toBeInTheDocument();
  delete cierres[MES];
  await userEvent.click(hoja().getByRole('button', { name: 'Reabrir mes' }));
  expect(mockDatos.reabrirMes).toHaveBeenCalledWith(MES);
  expect(await screen.findByText(`${enMayuscula(nombreMes(MES))} está abierto otra vez.`)).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Cerrar mes' })).toBeInTheDocument();
});

test('si falta un sueldo, no ofrece cerrar y dice dónde se carga', async () => {
  mockDatos.sueldos.mockResolvedValue({ a: 600 });
  await abrir();
  expect(screen.getByText('Para repartir falta el sueldo de Bruno. Se carga en Ajustes → Integrantes.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cerrar mes' })).not.toBeInTheDocument();
});

test('un mes que todavía no llegó no ofrece «Cerrar mes»', async () => {
  const SIGUIENTE = mesSiguiente(MES);
  history.replaceState(null, '', `/analisis?mes=${SIGUIENTE}`);
  await abrir();
  expect(await screen.findByLabelText(texto(`Gastos de ${soloMes(SIGUIENTE)}: ${formatear(0)}. 0 gastos.`))).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cerrar mes' })).not.toBeInTheDocument();
});

test('si el reparto deja de cerrar con la hoja abierta, la cierra y dice por qué', async () => {
  await abrir();
  await tocar('button', 'Cerrar mes');
  // Mientras confirma, a Bruno le borraron el sueldo.
  mockDatos.sueldos.mockResolvedValue({ a: 600 });
  act(() => avisarCambio());
  expect(await screen.findByText('Para repartir falta el sueldo de Bruno. Se carga en Ajustes → Integrantes.')).toBeInTheDocument();
  await userEvent.click(hoja().getByRole('button', { name: 'Cerrar mes' }));
  expect(mockDatos.cerrarMes).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.getByText(`No se pudo cerrar ${nombreMes(MES)}. Para repartir falta el sueldo de Bruno. Se carga en Ajustes → Integrantes.`),
  ).toBeInTheDocument();
});

test('las flechas cambian de mes y lo recuerdan en la ruta', async () => {
  await abrir();
  await tocar('button', 'Mes anterior');
  expect(await screen.findByRole('heading', { name: enMayuscula(nombreMes(ANTERIOR)) })).toBeInTheDocument();
  expect(location.search).toContain(`mes=${ANTERIOR}`);
  expect(await screen.findByText('Sin cerrar')).toBeInTheDocument();
  await waitFor(() => expect(mockDatos.cierre).toHaveBeenLastCalledWith(ANTERIOR));
  expect(await screen.findByLabelText(texto(`Gastos de ${soloMes(ANTERIOR)}: ${formatear(200_00)}. 1 gasto.`))).toBeInTheDocument();
  await tocar('button', 'Mes siguiente');
  expect(await screen.findByRole('heading', { name: enMayuscula(nombreMes(MES)) })).toBeInTheDocument();
});

test('sin conexión avisa y Reintentar vuelve a pedir', async () => {
  mockDatos.gastosEntre.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  render(<Analisis />);
  expect(await screen.findByText('No pudimos traer los datos')).toBeInTheDocument();
  await tocar('button', 'Reintentar');
  expect(await screen.findByRole('button', { name: 'Cerrar mes' })).toBeInTheDocument();
});

// ——— Permiso de sueldos ———

test('sin el permiso de sueldos se ve el reparto con las partes, sin «Cerrar mes» y con el aviso de a quién pedirlo', async () => {
  sesion.acceso = { admin: false, permisos: ['altas_bajas'] };
  await abrir();
  expect(
    screen.getByLabelText(
      texto(
        `Ana, le toca ${formatearPorcentaje(0.6)} (${formatear(600_00)}), puso ${formatear(1000_00)}. Recibe ${formatear(400_00)}.`,
      ),
    ),
  ).toBeInTheDocument();
  expect(mockDatos.sueldos).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Cerrar mes' })).not.toBeInTheDocument();
  expect(screen.getByText('Para cerrar el mes hace falta el permiso de sueldos. Se lo pedís a Ana.')).toBeInTheDocument();
});

test('sin el permiso de sueldos un mes cerrado no ofrece «Reabrir mes» y dice a quién pedirlo', async () => {
  sesion.acceso = { admin: false, permisos: [] };
  cierres[MES] = { mes: MES, total: 0, detalle: { filas: [], transferencias: [] }, cerrado_por: 'a', fecha: '2026-10-01T23:15:00.123456+00:00' };
  await abrir();
  expect(screen.queryByRole('button', { name: 'Reabrir mes' })).not.toBeInTheDocument();
  expect(screen.getByText('Para reabrir el mes hace falta el permiso de sueldos. Se lo pedís a Ana.')).toBeInTheDocument();
  expect(mockDatos.sueldos).not.toHaveBeenCalled();
});

test('mientras no se sabe el acceso no se ofrece cerrar ni se piden sueldos', async () => {
  sesion.acceso = null;
  await abrir();
  expect(screen.queryByRole('button', { name: 'Cerrar mes' })).not.toBeInTheDocument();
  expect(mockDatos.sueldos).not.toHaveBeenCalled();
});

test('sin el permiso, a quien falta el sueldo lo ven todos, sin mandar a Ajustes', async () => {
  sesion.acceso = { admin: false, permisos: [] };
  mockDatos.partesDelMes.mockResolvedValue({ a: 1_000_000_000_000, b: 0 });
  await abrir();
  expect(screen.getByText('Para repartir falta el sueldo de Bruno.')).toBeInTheDocument();
  expect(screen.queryByText(/Ajustes → Integrantes/)).not.toBeInTheDocument();
});

test('si le quitaron el permiso con la pantalla abierta, «Cerrar» dice que la cuenta no tiene permiso', async () => {
  await abrir();
  await tocar('button', 'Cerrar mes');
  // La base ya no le da los sueldos y rechaza el cierre.
  mockDatos.sueldos.mockResolvedValue({});
  mockDatos.cerrarMes.mockRejectedValue(Object.assign(new Error('SIN_PERMISO'), { code: '42501' }));
  await userEvent.click(hoja().getByRole('button', { name: 'Cerrar mes' }));
  expect(await hoja().findByText('Esta cuenta no tiene permiso para hacer eso.')).toBeInTheDocument();
});

// ——— Categorías y Evolución ———

test('Categorías muestra cuánto se fue en cada una, con su parte y el total', async () => {
  await abrir();
  await tocar('tab', 'Categorías');
  expect(screen.getByRole('heading', { name: 'Gasto por categoría' })).toBeInTheDocument();
  expect(screen.getByLabelText(texto(`Almacén: ${formatear(700_00)}, ${formatearPorcentaje(0.7)}`))).toBeInTheDocument();
  expect(screen.getByLabelText(texto(`Luz: ${formatear(300_00)}, ${formatearPorcentaje(0.3)}`))).toBeInTheDocument();
  expect(screen.getByLabelText(texto(`Total: ${formatear(1000_00)}`))).toBeInTheDocument();
  expect(location.search).toContain('vista=categorias');
});

test('Evolución muestra el gasto de los últimos 6 meses, sin precio por producto', async () => {
  await abrir();
  await tocar('tab', 'Evolución');
  expect(screen.getByRole('heading', { name: 'Gasto por mes' })).toBeInTheDocument();
  expect(screen.getAllByLabelText(/^[A-ZÁÉÍÓÚ][a-záéíóú]+ de \d{4}: /)).toHaveLength(6);
  expect(screen.getByLabelText(texto(`${enMayuscula(nombreMes(MES))}: ${formatear(1000_00)}`))).toBeInTheDocument();
  expect(screen.getByLabelText(texto(`${enMayuscula(nombreMes(ANTERIOR))}: ${formatear(200_00)}`))).toBeInTheDocument();
  expect(screen.queryByText(/precio/i)).not.toBeInTheDocument();
});

test('Categorías en un mes sin gastos lo dice', async () => {
  todos = [];
  await abrir();
  await tocar('tab', 'Categorías');
  expect(screen.getByText('Todavía no hay gastos en este mes.')).toBeInTheDocument();
});

// ——— Detalle ———

test('Detalle filtra por quién pagó, por categoría y por texto, con el total de lo que se ve', async () => {
  todos.push(gasto(`${MES}-05`, 'b', 50_00, { nota: 'Pan' }));
  history.replaceState(null, '', '/analisis?vista=detalle');
  render(<Analisis />);
  expect(await screen.findByLabelText('Buscar')).toBeInTheDocument();
  expect(await screen.findByText('3 gastos')).toBeInTheDocument();
  expect(screen.getByLabelText('Desde')).toHaveValue(fechaLarga(`${MES}-01`));
  expect(screen.getByLabelText('Hasta')).toHaveValue(fechaLarga(ultimoDia(MES)));
  expect(filasDeGasto()).toHaveLength(3);
  expect(screen.getByLabelText(texto(`Total: ${formatear(1050_00)}`))).toBeInTheDocument();

  await tocar('button', 'Bruno');
  expect(filasDeGasto()).toHaveLength(1);
  await tocar('button', 'Todos');

  await tocar('button', 'Categoría: Todas');
  await userEvent.click(hoja().getByRole('button', { name: 'Luz' }));
  expect(filasDeGasto()).toHaveLength(1);
  expect(screen.getByLabelText(texto(`Total en Luz: ${formatear(300_00)}`))).toBeInTheDocument();
  await tocar('button', 'Categoría: Luz');
  await userEvent.click(hoja().getByRole('button', { name: 'Todas' }));

  await escribir('Buscar', 'YERBA');
  expect(filasDeGasto()).toHaveLength(1);
  await escribir('Buscar', 'nada que ver');
  expect(filasDeGasto()).toHaveLength(0);
  expect(await screen.findByText('No hay gastos con esos filtros.')).toBeInTheDocument();
});

test('Detalle pide los gastos entre Desde y Hasta y avisa las fechas que no sirven', async () => {
  history.replaceState(null, '', '/analisis?vista=detalle');
  render(<Analisis />);
  await screen.findByLabelText('Buscar');
  await escribir('Desde', '32/13/2026');
  expect(screen.getByText('Escribí la fecha como dd/mm/aaaa.')).toBeInTheDocument();
  await escribir('Desde', fechaLarga(`${MES}-20`));
  await escribir('Hasta', fechaLarga(`${MES}-10`));
  expect(screen.getByText('La fecha Desde es posterior a Hasta.')).toBeInTheDocument();
  await escribir('Desde', fechaLarga(`${ANTERIOR}-01`));
  expect(await screen.findByLabelText(texto(`Total: ${formatear(1200_00)}`))).toBeInTheDocument();
  expect(mockDatos.gastosEntre).toHaveBeenLastCalledWith(`${ANTERIOR}-01`, `${MES}-11`);
  // Sin Hasta: sin límite.
  await escribir('Hasta', '');
  expect(mockDatos.gastosEntre).toHaveBeenLastCalledWith(`${ANTERIOR}-01`, null);
});

test('Detalle muestra de a 20 y «Ver más» trae los siguientes; cada gasto abre Cargar', async () => {
  todos = Array.from({ length: 25 }, (_, i) => gasto(`${MES}-${String((i % 28) + 1).padStart(2, '0')}`, 'a', 10_00));
  history.replaceState(null, '', '/analisis?vista=detalle');
  render(<Analisis />);
  await screen.findByLabelText('Buscar');
  expect(await screen.findByText('25 gastos')).toBeInTheDocument();
  expect(filasDeGasto()).toHaveLength(20);
  await tocar('button', 'Ver 5 más');
  expect(filasDeGasto()).toHaveLength(25);
  expect(screen.queryByRole('button', { name: /^Ver \d+ más$/ })).not.toBeInTheDocument();
  const primero = filasDeGasto()[0];
  await userEvent.click(primero);
  expect(location.pathname).toBe('/cargar');
  expect(location.search).toMatch(/^\?id=g\d+$/);
});

test('Detalle anuncia cuántos hay cuando se deja de tipear (600 ms), en una región que no se desmonta', async () => {
  history.replaceState(null, '', '/analisis?vista=detalle');
  render(<Analisis />);
  await screen.findByLabelText('Buscar');
  const region = await screen.findByTestId('conteo-detalle');
  expect(region).toHaveAttribute('aria-live', 'polite');
  await waitFor(() => expect(within(region).getByText('2 gastos')).toBeInTheDocument());

  // Los temporizadores se activan después de la carga: el retardo es lo único que se prueba acá.
  vi.useFakeTimers();
  try {
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'yerba' } });
    expect(filasDeGasto()).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(within(region).getByText('2 gastos')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(within(region).getByText('1 gasto')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'nada que ver' } });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(within(screen.getByTestId('conteo-detalle')).getByText('No hay gastos con esos filtros.')).toBeInTheDocument();
    expect(screen.getByTestId('conteo-detalle')).toBe(region);
  } finally {
    vi.useRealTimers();
  }
});

test('Detalle marca con candado los gastos de todos los meses cerrados del rango', async () => {
  cierres[ANTERIOR] = { mes: ANTERIOR, total: 200_00, detalle: { filas: [], transferencias: [] }, cerrado_por: 'b', fecha: '2026-09-30T23:00:00+00:00' };
  history.replaceState(null, '', '/analisis?vista=detalle');
  render(<Analisis />);
  await screen.findByLabelText('Buscar');
  await escribir('Desde', fechaLarga(`${ANTERIOR}-01`));
  await screen.findByText('3 gastos');
  const etiquetas = filasDeGasto().map((f) => String(f.getAttribute('aria-label')));
  expect(etiquetas.filter((e) => e.endsWith(', mes cerrado'))).toHaveLength(1);
});

test('Detalle conserva los filtros del mes al ir a otra pestaña y volver; otro mes empieza limpio', async () => {
  history.replaceState(null, '', '/analisis?vista=detalle');
  render(<Analisis />);
  await screen.findByLabelText('Buscar');
  await tocar('button', 'Bruno');
  await escribir('Buscar', 'pan');
  await tocar('tab', 'Resumen');
  await tocar('tab', 'Detalle');
  expect(screen.getByLabelText('Buscar')).toHaveValue('pan');
  expect(screen.getByRole('button', { name: 'Bruno' })).toHaveAttribute('aria-pressed', 'true');
  await tocar('button', 'Mes anterior');
  await screen.findByLabelText('Buscar');
  expect(screen.getByLabelText('Buscar')).toHaveValue('');
  expect(screen.getByLabelText('Desde')).toHaveValue(fechaLarga(`${ANTERIOR}-01`));
});

test('el rango de Evolución pide 6 meses de una vez', async () => {
  await abrir();
  const desde6 = rangoMes(mesAnterior(mesAnterior(mesAnterior(mesAnterior(mesAnterior(MES)))))).desde;
  expect(mockDatos.gastosEntre).toHaveBeenCalledWith(desde6, rangoMes(MES).hastaExcl);
});
