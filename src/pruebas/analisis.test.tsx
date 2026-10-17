// Análisis con la capa de datos simulada: cambio de mes, Resumen (en vivo o cierre guardado, Cerrar y
// Reabrir con confirmación propia, CIERRE_DESACTUALIZADO), Categorías, Evolución y Detalle con filtros
// y paginado. (Fuera de src/app para que Expo Router no la tome como pantalla.)

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import Analisis from '@/app/(pestanas)/analisis';
import type { GastoConItems } from '@/datos/tipos';
import { formatear, formatearPorcentaje } from '@/logica/dinero';
import { fechaLarga, mesActual, mesAnterior, mesSiguiente, nombreMes, rangoMes, ultimoDia } from '@/logica/meses';
import type { Categoria, Cierre, Integrante } from '@/logica/tipos';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockRouter = { push: jest.fn(), setParams: jest.fn() };
let mockParams: { vista?: string; mes?: string } = {};
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => mockParams,
}));

const mockDatos = {
  integrantes: jest.fn(),
  categorias: jest.fn(),
  gastosEntre: jest.fn(),
  cierre: jest.fn(),
  mesesCerrados: jest.fn(),
  cerrarMes: jest.fn(),
  reabrirMes: jest.fn(),
  escucharCambios: jest.fn((_f: () => void) => () => undefined),
};
jest.mock('@/datos', () => ({
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
});
const casa = [persona('a', 'Ana', 600), persona('b', 'Bruno', 400)];
const categorias: Categoria[] = [
  { id: 'almacen', nombre: 'Almacén', tipo: 'producto', dias_sin_movimiento: 20 },
  { id: 'luz', nombre: 'Luz', tipo: 'servicio', dias_sin_movimiento: 20 },
];

const MES = mesActual();
const ANTERIOR = mesAnterior(MES);
const enMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

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
  jest.clearAllMocks();
  mockParams = {};
  n = 0;
  todos = [
    gasto(`${MES}-03`, 'a', 700_00, { nota: 'Yerba y fideos' }),
    gasto(`${MES}-02`, 'a', 300_00, { categoria_id: 'luz' }),
    gasto(`${ANTERIOR}-15`, 'b', 200_00),
  ];
  cierres = {};
  mockDatos.integrantes.mockResolvedValue(casa);
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
});

async function abrir() {
  await render(<Analisis />);
  await screen.findByRole('tab', { name: 'Resumen' });
}
const tocar = async (rol: 'button' | 'tab' | 'radio', nombre: string | RegExp) => {
  await act(async () => fireEvent.press(screen.getByRole(rol, { name: nombre })));
};
const hoja = () => within(screen.getByTestId('hoja'));
const filasDeGasto = () => screen.queryAllByRole('button', { name: /· pagó / });

// ——— Resumen ———

test('el mes en curso muestra el total, el reparto con lo que le toca a cada uno y las transferencias', async () => {
  await abrir();
  expect(screen.getByRole('header', { name: enMayuscula(nombreMes(MES)) })).toBeTruthy();
  expect(screen.getByText('En curso')).toBeTruthy();
  expect(screen.getByLabelText(`Gastos de ${nombreMes(MES).split(' ')[0]}: ${formatear(1000_00)}. 2 gastos.`)).toBeTruthy();
  // Ana puso todo y le toca 60 %: recibe 400.
  expect(screen.getByLabelText(`Ana, le toca ${formatearPorcentaje(0.6)} (${formatear(600_00)}), puso ${formatear(1000_00)}. Recibe ${formatear(400_00)}.`)).toBeTruthy();
  expect(screen.getByLabelText(`Bruno le pasa a Ana: ${formatear(400_00)}.`)).toBeTruthy();
  expect(filasDeGasto()).toHaveLength(2);
});

test('Cerrar mes pide confirmación propia y guarda el reparto con lo que se usó para calcularlo', async () => {
  await abrir();
  await tocar('button', 'Cerrar mes');
  expect(hoja().getByText(`¿Cerrar ${nombreMes(MES)}?`)).toBeTruthy();
  expect(mockDatos.cerrarMes).not.toHaveBeenCalled();
  cierres[MES] = {
    mes: MES,
    total: 1000_00,
    detalle: { filas: [], transferencias: [] },
    cerrado_por: 'a',
    fecha: '2026-10-01T23:15:00.123456+00:00',
  };
  await act(async () => fireEvent.press(hoja().getByRole('button', { name: 'Cerrar mes' })));
  const [mes, resultado, gastos, integrantes] = mockDatos.cerrarMes.mock.calls[0];
  expect(mes).toBe(MES);
  expect(resultado.total).toBe(1000_00);
  expect(resultado.filas).toHaveLength(2);
  expect(resultado.transferencias).toEqual([{ de: 'b', a: 'a', monto: 400_00 }]);
  expect(gastos.map((g: GastoConItems) => g.id).sort()).toEqual(['g1', 'g2']);
  expect(integrantes).toBe(casa);
  expect(await screen.findByText(`${enMayuscula(nombreMes(MES))} quedó cerrado.`)).toBeTruthy();
  expect(await screen.findByRole('header', { name: `Cierre de ${nombreMes(MES).split(' ')[0]}` })).toBeTruthy();
});

test('Cancelar en la confirmación no cierra nada', async () => {
  await abrir();
  await tocar('button', 'Cerrar mes');
  await act(async () => fireEvent.press(hoja().getByRole('button', { name: 'Cancelar' })));
  expect(mockDatos.cerrarMes).not.toHaveBeenCalled();
  expect(screen.queryByTestId('hoja')).toBeNull();
});

test('si alguien cambió algo mientras tanto (CIERRE_DESACTUALIZADO), lo avisa y muestra el reparto nuevo', async () => {
  await abrir();
  mockDatos.cerrarMes.mockRejectedValue(Object.assign(new Error('CIERRE_DESACTUALIZADO'), { code: 'P0001' }));
  await tocar('button', 'Cerrar mes');
  todos.push(gasto(`${MES}-04`, 'b', 500_00));
  await act(async () => fireEvent.press(hoja().getByRole('button', { name: 'Cerrar mes' })));
  expect(
    await screen.findByText('Mientras mirabas, alguien cargó o cambió algo del mes. Revisá el reparto nuevo y cerrá otra vez.'),
  ).toBeTruthy();
  expect(screen.queryByTestId('hoja')).toBeNull();
  expect(await screen.findByLabelText(`Gastos de ${nombreMes(MES).split(' ')[0]}: ${formatear(1500_00)}. 3 gastos.`)).toBeTruthy();
});

test('otro error al cerrar queda en la hoja', async () => {
  await abrir();
  mockDatos.cerrarMes.mockRejectedValue(new TypeError('Failed to fetch'));
  await tocar('button', 'Cerrar mes');
  await act(async () => fireEvent.press(hoja().getByRole('button', { name: 'Cerrar mes' })));
  expect(hoja().getByText('Sin conexión. Revisá internet y probá de nuevo: lo que cargaste sigue acá.')).toBeTruthy();
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
  expect(screen.getByText('Cerrado')).toBeTruthy();
  expect(screen.getByRole('header', { name: `Cierre de ${nombreMes(MES).split(' ')[0]}` })).toBeTruthy();
  expect(screen.getByText(/^Cerrado el \d{2}\/\d{2}\/\d{4} a las \d{2}:\d{2} por Ana$/)).toBeTruthy();
  expect(screen.getByLabelText(`Total del mes: ${formatear(1000_00)}`)).toBeTruthy();
  expect(screen.getByLabelText(`Ana (${formatearPorcentaje(0.6)}): puso ${formatear(1000_00)}, le tocaba ${formatear(600_00)}`)).toBeTruthy();
  expect(screen.getByLabelText(`Bruno le pasa a Ana: ${formatear(400_00)}`)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Cerrar mes' })).toBeNull();
  expect(filasDeGasto()[0].props.accessibilityLabel).toMatch(/, mes cerrado$/);

  await tocar('button', 'Reabrir mes');
  expect(hoja().getByText(`¿Reabrir ${nombreMes(MES)}?`)).toBeTruthy();
  delete cierres[MES];
  await act(async () => fireEvent.press(hoja().getByRole('button', { name: 'Reabrir mes' })));
  expect(mockDatos.reabrirMes).toHaveBeenCalledWith(MES);
  expect(await screen.findByText(`${enMayuscula(nombreMes(MES))} está abierto otra vez.`)).toBeTruthy();
  expect(await screen.findByRole('button', { name: 'Cerrar mes' })).toBeTruthy();
});

test('si falta un sueldo, no ofrece cerrar y dice dónde se carga', async () => {
  mockDatos.integrantes.mockResolvedValue([casa[0], { ...casa[1], sueldo: null }]);
  await abrir();
  expect(screen.getByText('Para repartir falta el sueldo de Bruno. Se carga en Ajustes → Integrantes.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Cerrar mes' })).toBeNull();
});

test('un mes que todavía no llegó no ofrece «Cerrar mes»', async () => {
  mockParams = { mes: mesSiguiente(MES) };
  await abrir();
  expect(await screen.findByLabelText(`Gastos de ${nombreMes(mesSiguiente(MES)).split(' ')[0]}: ${formatear(0)}. 0 gastos.`)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Cerrar mes' })).toBeNull();
});

test('si el reparto deja de cerrar con la hoja abierta, la cierra y dice por qué', async () => {
  await abrir();
  await tocar('button', 'Cerrar mes');
  // Mientras confirma, a Bruno le borraron el sueldo.
  mockDatos.integrantes.mockResolvedValue([casa[0], { ...casa[1], sueldo: null }]);
  const avisar = mockDatos.escucharCambios.mock.calls.at(-1)?.[0] as () => void;
  await act(async () => avisar());
  expect(await screen.findByText('Para repartir falta el sueldo de Bruno. Se carga en Ajustes → Integrantes.')).toBeTruthy();
  await act(async () => fireEvent.press(hoja().getByRole('button', { name: 'Cerrar mes' })));
  expect(mockDatos.cerrarMes).not.toHaveBeenCalled();
  expect(screen.queryByTestId('hoja')).toBeNull();
  expect(
    screen.getByText(`No se pudo cerrar ${nombreMes(MES)}. Para repartir falta el sueldo de Bruno. Se carga en Ajustes → Integrantes.`),
  ).toBeTruthy();
});

test('las flechas cambian de mes y lo recuerdan en la ruta', async () => {
  await abrir();
  await tocar('button', 'Mes anterior');
  expect(await screen.findByRole('header', { name: enMayuscula(nombreMes(ANTERIOR)) })).toBeTruthy();
  expect(mockRouter.setParams).toHaveBeenLastCalledWith({ mes: ANTERIOR });
  expect(screen.getByText('Sin cerrar')).toBeTruthy();
  expect(mockDatos.cierre).toHaveBeenLastCalledWith(ANTERIOR);
  expect(await screen.findByLabelText(`Gastos de ${nombreMes(ANTERIOR).split(' ')[0]}: ${formatear(200_00)}. 1 gasto.`)).toBeTruthy();
  await tocar('button', 'Mes siguiente');
  expect(await screen.findByRole('header', { name: enMayuscula(nombreMes(MES)) })).toBeTruthy();
});

test('sin conexión avisa y Reintentar vuelve a pedir', async () => {
  mockDatos.gastosEntre.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await render(<Analisis />);
  expect(await screen.findByText('No pudimos traer los datos')).toBeTruthy();
  await tocar('button', 'Reintentar');
  expect(await screen.findByRole('button', { name: 'Cerrar mes' })).toBeTruthy();
});

// ——— Categorías y Evolución ———

test('Categorías muestra cuánto se fue en cada una, con su parte y el total', async () => {
  await abrir();
  await tocar('tab', 'Categorías');
  expect(screen.getByRole('header', { name: 'Gasto por categoría' })).toBeTruthy();
  expect(screen.getByLabelText(`Almacén: ${formatear(700_00)}, ${formatearPorcentaje(0.7)}`)).toBeTruthy();
  expect(screen.getByLabelText(`Luz: ${formatear(300_00)}, ${formatearPorcentaje(0.3)}`)).toBeTruthy();
  expect(screen.getByLabelText(`Total: ${formatear(1000_00)}`)).toBeTruthy();
  expect(mockRouter.setParams).toHaveBeenLastCalledWith({ vista: 'categorias' });
});

test('Evolución muestra el gasto de los últimos 6 meses, sin precio por producto', async () => {
  await abrir();
  await tocar('tab', 'Evolución');
  expect(screen.getByRole('header', { name: 'Gasto por mes' })).toBeTruthy();
  expect(screen.getAllByLabelText(/^[A-ZÁÉÍÓÚ][a-záéíóú]+ de \d{4}: /)).toHaveLength(6);
  expect(screen.getByLabelText(`${enMayuscula(nombreMes(MES))}: ${formatear(1000_00)}`)).toBeTruthy();
  expect(screen.getByLabelText(`${enMayuscula(nombreMes(ANTERIOR))}: ${formatear(200_00)}`)).toBeTruthy();
  expect(screen.queryByText(/precio/i)).toBeNull();
});

test('Categorías en un mes sin gastos lo dice', async () => {
  todos = [];
  await abrir();
  await tocar('tab', 'Categorías');
  expect(screen.getByText('Todavía no hay gastos en este mes.')).toBeTruthy();
});

// ——— Detalle ———

test('Detalle filtra por quién pagó, por categoría y por texto, con el total de lo que se ve', async () => {
  todos.push(gasto(`${MES}-05`, 'b', 50_00, { nota: 'Pan' }));
  mockParams = { vista: 'detalle' };
  await render(<Analisis />);
  expect(await screen.findByLabelText('Buscar')).toBeTruthy();
  expect(screen.getByLabelText('Desde').props.value).toBe(fechaLarga(`${MES}-01`));
  expect(screen.getByLabelText('Hasta').props.value).toBe(fechaLarga(ultimoDia(MES)));
  expect(filasDeGasto()).toHaveLength(3);
  expect(screen.getByLabelText(`Total: ${formatear(1050_00)}`)).toBeTruthy();

  await tocar('radio', 'Bruno');
  expect(filasDeGasto()).toHaveLength(1);
  await tocar('radio', 'Todos');

  await tocar('button', 'Categoría: Todas');
  await act(async () => fireEvent.press(hoja().getByRole('radio', { name: 'Luz' })));
  expect(filasDeGasto()).toHaveLength(1);
  expect(screen.getByLabelText(`Total en Luz: ${formatear(300_00)}`)).toBeTruthy();
  await tocar('button', 'Categoría: Luz');
  await act(async () => fireEvent.press(hoja().getByRole('radio', { name: 'Todas' })));

  await act(async () => fireEvent.changeText(screen.getByLabelText('Buscar'), 'YERBA'));
  expect(filasDeGasto()).toHaveLength(1);
  await act(async () => fireEvent.changeText(screen.getByLabelText('Buscar'), 'nada que ver'));
  expect(filasDeGasto()).toHaveLength(0);
  expect(await screen.findByText('No hay gastos con esos filtros.')).toBeTruthy();
});

test('Detalle pide los gastos entre Desde y Hasta y avisa las fechas que no sirven', async () => {
  mockParams = { vista: 'detalle' };
  await render(<Analisis />);
  await screen.findByLabelText('Buscar');
  await act(async () => fireEvent.changeText(screen.getByLabelText('Desde'), '32/13/2026'));
  expect(screen.getByText('Escribí la fecha como dd/mm/aaaa.')).toBeTruthy();
  await act(async () => fireEvent.changeText(screen.getByLabelText('Desde'), fechaLarga(`${MES}-20`)));
  await act(async () => fireEvent.changeText(screen.getByLabelText('Hasta'), fechaLarga(`${MES}-10`)));
  expect(screen.getByText('La fecha Desde es posterior a Hasta.')).toBeTruthy();
  await act(async () => fireEvent.changeText(screen.getByLabelText('Desde'), fechaLarga(`${ANTERIOR}-01`)));
  expect(await screen.findByLabelText(`Total: ${formatear(1200_00)}`)).toBeTruthy();
  expect(mockDatos.gastosEntre).toHaveBeenLastCalledWith(`${ANTERIOR}-01`, `${MES}-11`);
  // Sin Hasta: sin límite.
  await act(async () => fireEvent.changeText(screen.getByLabelText('Hasta'), ''));
  expect(mockDatos.gastosEntre).toHaveBeenLastCalledWith(`${ANTERIOR}-01`, null);
});

test('Detalle muestra de a 20 y «Ver más» trae los siguientes; cada gasto abre Cargar', async () => {
  todos = Array.from({ length: 25 }, (_, i) => gasto(`${MES}-${String((i % 28) + 1).padStart(2, '0')}`, 'a', 10_00));
  mockParams = { vista: 'detalle' };
  await render(<Analisis />);
  await screen.findByLabelText('Buscar');
  expect(screen.getByText('25 gastos')).toBeTruthy();
  expect(filasDeGasto()).toHaveLength(20);
  await tocar('button', 'Ver 5 más');
  expect(filasDeGasto()).toHaveLength(25);
  expect(screen.queryByRole('button', { name: /^Ver \d+ más$/ })).toBeNull();
  await act(async () => fireEvent.press(filasDeGasto()[0]));
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/cargar', params: { id: expect.any(String) } });
});

test('Detalle anuncia cuántos hay cuando se deja de tipear (600 ms), en una región que no se desmonta', async () => {
  mockParams = { vista: 'detalle' };
  await render(<Analisis />);
  await screen.findByLabelText('Buscar');
  const region = screen.getByTestId('conteo-detalle');
  expect(region.props.accessibilityLiveRegion).toBe('polite');
  expect(within(region).getByText('2 gastos')).toBeTruthy();
  await act(async () => fireEvent.changeText(screen.getByLabelText('Buscar'), 'yerba'));
  expect(filasDeGasto()).toHaveLength(1);
  expect(within(region).getByText('2 gastos')).toBeTruthy();
  expect(await within(region).findByText('1 gasto')).toBeTruthy();
  await act(async () => fireEvent.changeText(screen.getByLabelText('Buscar'), 'nada que ver'));
  expect(await within(screen.getByTestId('conteo-detalle')).findByText('No hay gastos con esos filtros.')).toBeTruthy();
  expect(screen.getByTestId('conteo-detalle')).toBe(region);
});

test('Detalle marca con candado los gastos de todos los meses cerrados del rango', async () => {
  cierres[ANTERIOR] = { mes: ANTERIOR, total: 200_00, detalle: { filas: [], transferencias: [] }, cerrado_por: 'b', fecha: '2026-09-30T23:00:00+00:00' };
  mockParams = { vista: 'detalle' };
  await render(<Analisis />);
  await screen.findByLabelText('Buscar');
  await act(async () => fireEvent.changeText(screen.getByLabelText('Desde'), fechaLarga(`${ANTERIOR}-01`)));
  await screen.findByText('3 gastos');
  const etiquetas = filasDeGasto().map((f) => String(f.props.accessibilityLabel));
  expect(etiquetas.filter((e) => e.endsWith(', mes cerrado'))).toHaveLength(1);
});

test('Detalle conserva los filtros del mes al ir a otra pestaña y volver; otro mes empieza limpio', async () => {
  mockParams = { vista: 'detalle' };
  await render(<Analisis />);
  await screen.findByLabelText('Buscar');
  await tocar('radio', 'Bruno');
  await act(async () => fireEvent.changeText(screen.getByLabelText('Buscar'), 'pan'));
  await tocar('tab', 'Resumen');
  await tocar('tab', 'Detalle');
  expect(screen.getByLabelText('Buscar').props.value).toBe('pan');
  expect(screen.getByRole('radio', { name: 'Bruno' }).props.accessibilityState).toMatchObject({ checked: true });
  await tocar('button', 'Mes anterior');
  await screen.findByLabelText('Buscar');
  expect(screen.getByLabelText('Buscar').props.value).toBe('');
  expect(screen.getByLabelText('Desde').props.value).toBe(fechaLarga(`${ANTERIOR}-01`));
});

test('el rango de Evolución pide 6 meses de una vez', async () => {
  await abrir();
  const desde6 = rangoMes(mesAnterior(mesAnterior(mesAnterior(mesAnterior(mesAnterior(MES)))))).desde;
  expect(mockDatos.gastosEntre).toHaveBeenCalledWith(desde6, rangoMes(MES).hastaExcl);
});
