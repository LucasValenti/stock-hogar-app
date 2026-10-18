// Ajustes con la capa de datos simulada: integrantes (agregar, editar, tipo con su aviso, sueldo, email,
// activo y baja), categorías (agregar, editar, días de «¿todavía hay?», borrar) y Cerrar sesión.
// (Fuera de src/app para que Expo Router no la tome como pantalla.)

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import Ajustes from '@/app/(pestanas)/ajustes';
import { formatear } from '@/logica/dinero';
import { mesActual, mesSiguiente, nombreMes } from '@/logica/meses';
import type { Categoria, Integrante } from '@/logica/tipos';
import { avisoCambioTipo } from '@/logica/validar';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockSesion = { yo: { id: 'a', nombre: 'Ana' }, salir: jest.fn() };
jest.mock('@/sesion/sesion', () => ({ useSesion: () => mockSesion }));

const mockDatos = {
  integrantes: jest.fn(),
  categorias: jest.fn(),
  guardarIntegrante: jest.fn(),
  guardarCategoria: jest.fn(),
  borrarCategoria: jest.fn(),
  escucharCambios: jest.fn((_f: () => void) => () => undefined),
};
let mockMemoria = false;
jest.mock('@/datos', () => ({
  get datos() {
    return mockDatos;
  },
  esModoMemoria: () => mockMemoria,
}));

const persona = (id: string, nombre: string, extra: Partial<Integrante> = {}): Integrante => ({
  id,
  nombre,
  sueldo: 600_000_00,
  email: `${id}@example.com`,
  activo: true,
  baja_desde: null,
  tipo: 'integrante',
  creado: '2026-01-01T12:00:00.000Z',
  ...extra,
});
const PROXIMO = mesSiguiente(mesActual());
const casa = () => [
  persona('a', 'Ana'),
  persona('b', 'Bruno', { sueldo: null }),
  persona('c', 'Carla', { activo: false, baja_desde: '2026-03' }),
  persona('d', 'Dora', { tipo: 'pagador_externo', sueldo: null }),
];
const categorias = (): Categoria[] => [
  { id: 'almacen', nombre: 'Almacén', tipo: 'producto', dias_sin_movimiento: 20 },
  { id: 'luz', nombre: 'Luz', tipo: 'servicio', dias_sin_movimiento: 20 },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockMemoria = false;
  mockDatos.integrantes.mockResolvedValue(casa());
  mockDatos.categorias.mockResolvedValue(categorias());
  mockDatos.guardarIntegrante.mockImplementation(async (i: Partial<Integrante>) => ({ ...persona('n', ''), ...i }));
  mockDatos.guardarCategoria.mockImplementation(async (c: Partial<Categoria>) => ({ id: 'n', ...c }));
  mockDatos.borrarCategoria.mockResolvedValue(undefined);
  mockSesion.salir.mockResolvedValue(undefined);
});

async function abrir() {
  await render(<Ajustes />);
  await screen.findByRole('header', { name: 'Integrantes' });
}
const tocar = async (rol: 'button' | 'radio' | 'checkbox', nombre: string | RegExp) => {
  await act(async () => fireEvent.press(screen.getByRole(rol, { name: nombre })));
};
const hoja = () => within(screen.getByTestId('hoja'));
const enHoja = async (rol: 'button' | 'radio' | 'checkbox', nombre: string | RegExp) => {
  await act(async () => fireEvent.press(hoja().getByRole(rol, { name: nombre })));
};
const escribir = async (etiqueta: string, texto: string) => {
  await act(async () => fireEvent.changeText(hoja().getByLabelText(etiqueta), texto));
};

// ——— Integrantes ———

test('lista a la casa con su tipo, si está activo y el sueldo; explica el reparto y la invitación', async () => {
  await abrir();
  expect(screen.getByRole('button', { name: `Ana, Integrante · Activo, ${formatear(600_000_00)}` })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Bruno, Integrante · Activo, Sin sueldo' })).toBeTruthy();
  expect(screen.getByRole('button', { name: `Carla, Integrante · Inactivo desde ${nombreMes('2026-03')}, ${formatear(600_000_00)}` })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Dora, Pagador externo · Activo, No participa' })).toBeTruthy();
  expect(screen.getByText(/El sueldo define qué parte del gasto del mes le toca a cada uno/)).toBeTruthy();
  expect(screen.getByText(/hay que invitar su email desde Supabase/)).toBeTruthy();
});

test('agregar integrante valida y guarda con el email en minúscula y el sueldo en centavos', async () => {
  await abrir();
  await tocar('button', 'Agregar integrante');
  expect(hoja().getByText('Agregar integrante')).toBeTruthy();
  expect(hoja().queryByRole('checkbox')).toBeNull();
  await enHoja('button', 'Agregar');
  expect(hoja().getByText('Escribí un nombre.')).toBeTruthy();
  expect(hoja().getByText('Escribí un email válido.')).toBeTruthy();
  expect(mockDatos.guardarIntegrante).not.toHaveBeenCalled();

  await escribir('Nombre', '  Eva ');
  await escribir('Sueldo mensual', '1.500.000');
  await escribir('Email de su cuenta', 'Eva@Example.com');
  await enHoja('button', 'Agregar');
  expect(mockDatos.guardarIntegrante).toHaveBeenCalledWith({
    nombre: 'Eva',
    tipo: 'integrante',
    email: 'eva@example.com',
    sueldo: 1_500_000_00,
    activo: true,
    baja_desde: null,
  });
  expect(screen.queryByTestId('hoja')).toBeNull();
  expect(await screen.findByText('Eva se agregó a la casa.')).toBeTruthy();
});

test('un sueldo mal escrito no se guarda', async () => {
  await abrir();
  await tocar('button', /^Ana, /);
  await escribir('Sueldo mensual', 'mucho');
  await enHoja('button', 'Guardar');
  expect(hoja().getByText('Ingresá un monto válido, por ejemplo 1.500.000.')).toBeTruthy();
  expect(mockDatos.guardarIntegrante).not.toHaveBeenCalled();
});

test('editar trae los datos de la persona y guarda con su id', async () => {
  await abrir();
  await tocar('button', /^Ana, /);
  expect(hoja().getByLabelText('Nombre').props.value).toBe('Ana');
  expect(hoja().getByLabelText('Sueldo mensual').props.value).toBe('600000');
  expect(hoja().getByLabelText('Email de su cuenta').props.value).toBe('a@example.com');
  expect(hoja().getByRole('radio', { name: 'Integrante' }).props.accessibilityState).toMatchObject({ checked: true });
  expect(hoja().getByRole('checkbox', { name: /^Activo/ }).props.accessibilityState).toMatchObject({ checked: true });
  await escribir('Nombre', 'Ana María');
  await escribir('Email de su cuenta', 'ana@example.com');
  await enHoja('button', 'Guardar');
  expect(mockDatos.guardarIntegrante).toHaveBeenCalledWith({
    id: 'a',
    nombre: 'Ana María',
    tipo: 'integrante',
    email: 'ana@example.com',
    sueldo: 600_000_00,
    activo: true,
    baja_desde: null,
  });
  expect(await screen.findByText('Cambios guardados.')).toBeTruthy();
});

test('«Cambios guardados.» se va al abrir otra hoja y vuelve a aparecer (y anunciarse) con cada guardado', async () => {
  await abrir();
  await tocar('button', /^Ana, /);
  await enHoja('button', 'Guardar');
  const primero = await screen.findByText('Cambios guardados.');
  await tocar('button', /^Bruno, /);
  expect(screen.queryByText('Cambios guardados.')).toBeNull();
  await enHoja('button', 'Guardar');
  const segundo = await screen.findByText('Cambios guardados.');
  expect(segundo).not.toBe(primero);
  await tocar('button', 'Agregar categoría');
  expect(screen.queryByText('Cambios guardados.')).toBeNull();
});

test('quien tiene la baja más adelante «Sale desde» ese mes; sin mes de baja, «Inactivo»', async () => {
  mockDatos.integrantes.mockResolvedValue([
    persona('e', 'Eva', { activo: false, baja_desde: PROXIMO }),
    persona('f', 'Fede', { activo: false, baja_desde: null }),
    persona('g', 'Gabi', { tipo: 'pagador_externo', sueldo: null, activo: false, baja_desde: null }),
  ]);
  await abrir();
  expect(screen.getByRole('button', { name: `Eva, Integrante · Sale desde ${nombreMes(PROXIMO)}, ${formatear(600_000_00)}` })).toBeTruthy();
  expect(screen.getByRole('button', { name: `Fede, Integrante · Inactivo, ${formatear(600_000_00)}` })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Gabi, Pagador externo · Inactivo, No participa' })).toBeTruthy();
});

test('un pagador externo no lleva sueldo: el campo se va y no se envía', async () => {
  await abrir();
  await tocar('button', 'Agregar integrante');
  await enHoja('radio', 'Pagador externo');
  expect(hoja().queryByLabelText('Sueldo mensual')).toBeNull();
  expect(hoja().getByText(/se le devuelve lo que pagó/)).toBeTruthy();
  await escribir('Nombre', 'Abuela');
  await escribir('Email de su cuenta', 'abuela@example.com');
  await enHoja('button', 'Agregar');
  expect(mockDatos.guardarIntegrante).toHaveBeenCalledWith({
    nombre: 'Abuela',
    tipo: 'pagador_externo',
    email: 'abuela@example.com',
    activo: true,
    baja_desde: null,
  });
});

test('cambiar el tipo de alguien pide confirmación con el aviso del reparto; Volver no guarda', async () => {
  await abrir();
  await tocar('button', /^Bruno, /);
  await enHoja('radio', 'Pagador externo');
  await enHoja('button', 'Guardar');
  const aviso = avisoCambioTipo({ nombre: 'Bruno', tipo: 'integrante' }, 'pagador_externo') as string;
  expect(hoja().getByText(aviso)).toBeTruthy();
  expect(mockDatos.guardarIntegrante).not.toHaveBeenCalled();
  await enHoja('button', 'Volver');
  expect(hoja().getByLabelText('Nombre').props.value).toBe('Bruno');
  expect(hoja().getByRole('radio', { name: 'Pagador externo' }).props.accessibilityState).toMatchObject({ checked: true });
  await enHoja('button', 'Guardar');
  await enHoja('button', 'Cambiar tipo');
  expect(mockDatos.guardarIntegrante).toHaveBeenCalledWith(expect.objectContaining({ id: 'b', tipo: 'pagador_externo' }));
  expect(mockDatos.guardarIntegrante.mock.calls[0][0]).not.toHaveProperty('sueldo');
});

test('desactivar pide confirmación y la baja queda desde el mes que viene', async () => {
  await abrir();
  await tocar('button', /^Bruno, /);
  await enHoja('checkbox', /^Activo/);
  await enHoja('button', 'Guardar');
  expect(hoja().getByText('¿Desactivar a Bruno?')).toBeTruthy();
  expect(hoja().getByText('Sigue en el reparto de este mes y sale desde el que viene.')).toBeTruthy();
  await enHoja('button', 'Desactivar');
  expect(mockDatos.guardarIntegrante).toHaveBeenCalledWith(expect.objectContaining({ id: 'b', activo: false, baja_desde: PROXIMO }));
});

test('al pagador externo, desactivarlo le saca el acceso', async () => {
  await abrir();
  await tocar('button', /^Dora, /);
  expect(hoja().getByRole('checkbox', { name: /pierde el acceso desde el mes que viene/ })).toBeTruthy();
  await enHoja('checkbox', /^Activo/);
  await enHoja('button', 'Guardar');
  expect(hoja().getByText('Pierde el acceso desde el mes que viene.')).toBeTruthy();
});

test('cambiar de tipo y desactivar a la vez confirma las dos cosas, de a una', async () => {
  await abrir();
  await tocar('button', /^Bruno, /);
  await enHoja('radio', 'Pagador externo');
  await enHoja('checkbox', /^Activo/);
  await enHoja('button', 'Guardar');
  await enHoja('button', 'Desactivar');
  expect(mockDatos.guardarIntegrante).not.toHaveBeenCalled();
  await enHoja('button', 'Cambiar tipo');
  expect(mockDatos.guardarIntegrante).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'b', tipo: 'pagador_externo', activo: false, baja_desde: PROXIMO }),
  );
});

test('quien ya estaba inactivo conserva su baja; reactivarlo la borra sin preguntar', async () => {
  await abrir();
  await tocar('button', /^Carla, /);
  await escribir('Nombre', 'Carla B.');
  await enHoja('button', 'Guardar');
  expect(mockDatos.guardarIntegrante).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'c', activo: false, baja_desde: '2026-03' }));

  await tocar('button', /^Carla, /);
  await enHoja('checkbox', /^Activo/);
  await enHoja('button', 'Guardar');
  expect(mockDatos.guardarIntegrante).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'c', activo: true, baja_desde: null }));
});

test('si la base no guarda (email repetido), el error queda en la hoja', async () => {
  mockDatos.guardarIntegrante.mockRejectedValue(Object.assign(new Error('duplicate key value violates unique constraint "integrantes_email_key"'), { code: '23505' }));
  await abrir();
  await tocar('button', /^Ana, /);
  await escribir('Email de su cuenta', 'b@example.com');
  await enHoja('button', 'Guardar');
  expect(hoja().getByText('Ya existe uno con ese dato (nombre, email o código repetido).')).toBeTruthy();
});

test('se actualiza sola cuando alguien cambia algo', async () => {
  await abrir();
  mockDatos.integrantes.mockResolvedValue([...casa(), persona('e', 'Eva')]);
  const avisar = mockDatos.escucharCambios.mock.calls.at(-1)?.[0] as () => void;
  await act(async () => avisar());
  expect(await screen.findByRole('button', { name: /^Eva, / })).toBeTruthy();
});

// ——— Categorías ———

test('lista las categorías con su tipo y a los cuántos días pregunta', async () => {
  await abrir();
  expect(screen.getByRole('button', { name: 'Almacén, Productos del súper · pregunta a los 20 días' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Luz, Servicio · pregunta a los 20 días' })).toBeTruthy();
});

test('agregar categoría valida nombre y días (1 a 365) y guarda', async () => {
  await abrir();
  await tocar('button', 'Agregar categoría');
  expect(hoja().getByLabelText('Días para preguntar «¿Todavía hay?»').props.value).toBe('20');
  await enHoja('button', 'Agregar');
  expect(hoja().getByText('Escribí un nombre.')).toBeTruthy();
  await escribir('Nombre', 'Limpieza');
  await escribir('Días para preguntar «¿Todavía hay?»', '400');
  await enHoja('button', 'Agregar');
  expect(hoja().getByText('Poné un número de días entre 1 y 365.')).toBeTruthy();
  expect(mockDatos.guardarCategoria).not.toHaveBeenCalled();
  await escribir('Días para preguntar «¿Todavía hay?»', '30');
  await enHoja('button', 'Agregar');
  expect(mockDatos.guardarCategoria).toHaveBeenCalledWith({ nombre: 'Limpieza', tipo: 'producto', dias_sin_movimiento: 30 });
  expect(await screen.findByText('Categoría guardada.')).toBeTruthy();
});

test('editar una categoría cambia nombre, tipo y días con su id', async () => {
  await abrir();
  await tocar('button', /^Luz, /);
  expect(hoja().getByRole('radio', { name: 'Servicio' }).props.accessibilityState).toMatchObject({ checked: true });
  await escribir('Nombre', 'Luz y gas');
  await escribir('Días para preguntar «¿Todavía hay?»', '365');
  await enHoja('button', 'Guardar');
  expect(mockDatos.guardarCategoria).toHaveBeenCalledWith({ id: 'luz', nombre: 'Luz y gas', tipo: 'servicio', dias_sin_movimiento: 365 });
});

test('borrar una categoría pide confirmación; si está en uso, lo dice', async () => {
  await abrir();
  await tocar('button', /^Luz, /);
  await enHoja('button', 'Borrar categoría');
  expect(hoja().getByText('¿Borrar la categoría Luz?')).toBeTruthy();
  expect(mockDatos.borrarCategoria).not.toHaveBeenCalled();
  await enHoja('button', 'Borrar');
  expect(mockDatos.borrarCategoria).toHaveBeenCalledWith('luz');
  expect(screen.queryByTestId('hoja')).toBeNull();
  expect(await screen.findByText('Categoría borrada.')).toBeTruthy();

  mockDatos.borrarCategoria.mockRejectedValue(Object.assign(new Error('violates foreign key constraint'), { code: '23503' }));
  await tocar('button', /^Almacén, /);
  await enHoja('button', 'Borrar categoría');
  await enHoja('button', 'Borrar');
  expect(hoja().getByText('No se puede borrar porque está en uso.')).toBeTruthy();
});

// ——— Cuenta y estados ———

test('Cerrar sesión cierra la de este dispositivo; si no puede, lo dice', async () => {
  await abrir();
  expect(screen.getByText('Entraste como Ana.')).toBeTruthy();
  expect(screen.getByText(/solo los ven las cuentas de esta lista/)).toBeTruthy();
  await tocar('button', 'Cerrar sesión');
  expect(mockSesion.salir).toHaveBeenCalledTimes(1);
  mockSesion.salir.mockRejectedValue(Object.assign(new Error('No se pudo cerrar la sesión.'), { code: 'SIN_CONEXION' }));
  await tocar('button', 'Cerrar sesión');
  expect(await screen.findByText('No se pudo cerrar la sesión.')).toBeTruthy();
});

test('en la casa de ejemplo avisa que cerrar sesión no hace nada', async () => {
  mockMemoria = true;
  await abrir();
  expect(screen.getByText('Es la casa de ejemplo: no hay cuenta, así que cerrar sesión no hace nada.')).toBeTruthy();
});

test('sin conexión avisa, deja cerrar sesión y Reintentar vuelve a pedir', async () => {
  mockDatos.integrantes.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await render(<Ajustes />);
  expect(await screen.findByText('No pudimos traer los ajustes')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
  await tocar('button', 'Reintentar');
  expect(await screen.findByRole('button', { name: /^Ana, / })).toBeTruthy();
});
