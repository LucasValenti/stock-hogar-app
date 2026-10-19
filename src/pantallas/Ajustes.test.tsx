// Ajustes con la capa de datos simulada: integrantes (agregar, editar, tipo con su aviso, sueldo, email,
// activo y baja), categorías (agregar, editar, días de «¿todavía hay?», borrar), Cerrar sesión y la demo.

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { formatear } from '@/logica/dinero';
import { mesActual, mesSiguiente, nombreMes } from '@/logica/meses';
import type { Categoria, Integrante } from '@/logica/tipos';
import { avisoCambioTipo } from '@/logica/validar';

import { Ajustes } from './Ajustes';

const m = vi.hoisted(() => ({
  datos: {
    integrantes: vi.fn(),
    categorias: vi.fn(),
    guardarIntegrante: vi.fn(),
    guardarCategoria: vi.fn(),
    borrarCategoria: vi.fn(),
    escucharCambios: vi.fn((_f: () => void) => () => undefined),
  },
  sesion: { yo: { id: 'a', nombre: 'Ana' } as Integrante | null, salir: vi.fn(), demo: false },
  memoria: false,
  oyentes: new Set<() => void>(),
}));

vi.mock('@/sesion/sesion', () => ({ useSesion: () => m.sesion }));
vi.mock('@/datos', () => ({
  get datos() {
    return m.datos;
  },
  esModoMemoria: () => m.memoria,
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
  admin: false,
  color: null,
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
  vi.clearAllMocks();
  m.memoria = false;
  m.sesion.demo = false;
  m.oyentes.clear();
  m.datos.integrantes.mockResolvedValue(casa());
  m.datos.categorias.mockResolvedValue(categorias());
  m.datos.guardarIntegrante.mockImplementation(async (i: Partial<Integrante>) => ({ ...persona('n', ''), ...i }));
  m.datos.guardarCategoria.mockImplementation(async (c: Partial<Categoria>) => ({ id: 'n', ...c }));
  m.datos.borrarCategoria.mockResolvedValue(undefined);
  m.datos.escucharCambios.mockImplementation((f: () => void) => {
    m.oyentes.add(f);
    return () => {
      m.oyentes.delete(f);
    };
  });
  m.sesion.salir.mockReset().mockResolvedValue(undefined);
});

async function abrir() {
  render(<Ajustes />);
  await screen.findByRole('heading', { name: 'Integrantes' });
}
const tocar = (rol: 'button' | 'radio' | 'checkbox', nombre: string | RegExp) =>
  userEvent.click(screen.getByRole(rol, { name: nombre }));
const hoja = () => within(screen.getByRole('dialog'));
const enHoja = (rol: 'button' | 'radio' | 'checkbox', nombre: string | RegExp) =>
  userEvent.click(hoja().getByRole(rol, { name: nombre }));
async function escribir(etiqueta: string, valor: string) {
  const campo = hoja().getByLabelText(etiqueta);
  await userEvent.clear(campo);
  if (valor) await userEvent.type(campo, valor);
}

// ——— Integrantes ———

test('lista a la casa con su tipo, si está activo y el sueldo; explica el reparto y la invitación', async () => {
  await abrir();
  expect(
    screen.getByRole('button', { name: `Ana, Integrante · Activo, ${formatear(600_000_00)}` }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Bruno, Integrante · Activo, Sin sueldo' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', {
      name: `Carla, Integrante · Inactivo desde ${nombreMes('2026-03')}, ${formatear(600_000_00)}`,
    }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Dora, Pagador externo · Activo, No participa' })).toBeInTheDocument();
  expect(screen.getByText(/El sueldo define qué parte del gasto del mes le toca a cada uno/)).toBeInTheDocument();
  expect(screen.getByText(/hay que invitar su email desde Supabase/)).toBeInTheDocument();
});

test('agregar integrante valida y guarda con el email en minúscula y el sueldo en centavos', async () => {
  await abrir();
  await tocar('button', 'Agregar integrante');
  expect(hoja().getByText('Agregar integrante')).toBeInTheDocument();
  expect(hoja().queryByRole('checkbox')).not.toBeInTheDocument();
  await enHoja('button', 'Agregar');
  expect(hoja().getByText('Escribí un nombre.')).toBeInTheDocument();
  expect(hoja().getByText('Escribí un email válido.')).toBeInTheDocument();
  expect(m.datos.guardarIntegrante).not.toHaveBeenCalled();

  await escribir('Nombre', '  Eva ');
  await escribir('Sueldo mensual', '1.500.000');
  await escribir('Email de su cuenta', 'Eva@Example.com');
  await enHoja('button', 'Agregar');
  expect(m.datos.guardarIntegrante).toHaveBeenCalledWith({
    nombre: 'Eva',
    tipo: 'integrante',
    email: 'eva@example.com',
    sueldo: 1_500_000_00,
    activo: true,
    baja_desde: null,
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(await screen.findByText('Eva se agregó a la casa.')).toBeInTheDocument();
});

test('un sueldo mal escrito no se guarda', async () => {
  await abrir();
  await tocar('button', /^Ana, /);
  await escribir('Sueldo mensual', 'mucho');
  await enHoja('button', 'Guardar');
  expect(hoja().getByText('Ingresá un monto válido, por ejemplo 1.500.000.')).toBeInTheDocument();
  expect(m.datos.guardarIntegrante).not.toHaveBeenCalled();
});

test('editar trae los datos de la persona y guarda con su id', async () => {
  await abrir();
  await tocar('button', /^Ana, /);
  expect(hoja().getByLabelText('Nombre')).toHaveValue('Ana');
  expect(hoja().getByLabelText('Sueldo mensual')).toHaveValue('600000');
  expect(hoja().getByLabelText('Email de su cuenta')).toHaveValue('a@example.com');
  expect(hoja().getByRole('radio', { name: 'Integrante' })).toBeChecked();
  expect(hoja().getByRole('checkbox', { name: /^Activo/ })).toBeChecked();
  await escribir('Nombre', 'Ana María');
  await escribir('Email de su cuenta', 'ana@example.com');
  await enHoja('button', 'Guardar');
  expect(m.datos.guardarIntegrante).toHaveBeenCalledWith({
    id: 'a',
    nombre: 'Ana María',
    tipo: 'integrante',
    email: 'ana@example.com',
    sueldo: 600_000_00,
    activo: true,
    baja_desde: null,
  });
  expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
});

test('«Cambios guardados.» se va al abrir otra hoja y vuelve a aparecer (y anunciarse) con cada guardado', async () => {
  await abrir();
  await tocar('button', /^Ana, /);
  await enHoja('button', 'Guardar');
  const primero = await screen.findByText('Cambios guardados.');
  await tocar('button', /^Bruno, /);
  expect(screen.queryByText('Cambios guardados.')).not.toBeInTheDocument();
  await enHoja('button', 'Guardar');
  const segundo = await screen.findByText('Cambios guardados.');
  expect(segundo).not.toBe(primero);
  await tocar('button', 'Agregar categoría');
  expect(screen.queryByText('Cambios guardados.')).not.toBeInTheDocument();
});

test('quien tiene la baja más adelante «Sale desde» ese mes; sin mes de baja, «Inactivo»', async () => {
  m.datos.integrantes.mockResolvedValue([
    persona('e', 'Eva', { activo: false, baja_desde: PROXIMO }),
    persona('f', 'Fede', { activo: false, baja_desde: null }),
    persona('g', 'Gabi', { tipo: 'pagador_externo', sueldo: null, activo: false, baja_desde: null }),
  ]);
  await abrir();
  expect(
    screen.getByRole('button', {
      name: `Eva, Integrante · Sale desde ${nombreMes(PROXIMO)}, ${formatear(600_000_00)}`,
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: `Fede, Integrante · Inactivo, ${formatear(600_000_00)}` }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Gabi, Pagador externo · Inactivo, No participa' })).toBeInTheDocument();
});

test('un pagador externo no lleva sueldo: el campo se va y no se envía', async () => {
  await abrir();
  await tocar('button', 'Agregar integrante');
  await enHoja('radio', 'Pagador externo');
  expect(hoja().queryByLabelText('Sueldo mensual')).not.toBeInTheDocument();
  expect(hoja().getByText(/se le devuelve lo que pagó/)).toBeInTheDocument();
  await escribir('Nombre', 'Abuela');
  await escribir('Email de su cuenta', 'abuela@example.com');
  await enHoja('button', 'Agregar');
  expect(m.datos.guardarIntegrante).toHaveBeenCalledWith({
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
  expect(hoja().getByText(aviso)).toBeInTheDocument();
  expect(m.datos.guardarIntegrante).not.toHaveBeenCalled();
  await enHoja('button', 'Volver');
  expect(hoja().getByLabelText('Nombre')).toHaveValue('Bruno');
  expect(hoja().getByRole('radio', { name: 'Pagador externo' })).toBeChecked();
  await enHoja('button', 'Guardar');
  await enHoja('button', 'Cambiar tipo');
  expect(m.datos.guardarIntegrante).toHaveBeenCalledWith(expect.objectContaining({ id: 'b', tipo: 'pagador_externo' }));
  expect(m.datos.guardarIntegrante.mock.calls[0][0]).not.toHaveProperty('sueldo');
});

test('desactivar pide confirmación y la baja queda desde el mes que viene', async () => {
  await abrir();
  await tocar('button', /^Bruno, /);
  await enHoja('checkbox', /^Activo/);
  await enHoja('button', 'Guardar');
  expect(hoja().getByText('¿Desactivar a Bruno?')).toBeInTheDocument();
  expect(hoja().getByText('Sigue en el reparto de este mes y sale desde el que viene.')).toBeInTheDocument();
  await enHoja('button', 'Desactivar');
  expect(m.datos.guardarIntegrante).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'b', activo: false, baja_desde: PROXIMO }),
  );
});

test('al pagador externo, desactivarlo le saca el acceso', async () => {
  await abrir();
  await tocar('button', /^Dora, /);
  expect(hoja().getByRole('checkbox', { name: /pierde el acceso desde el mes que viene/ })).toBeInTheDocument();
  await enHoja('checkbox', /^Activo/);
  await enHoja('button', 'Guardar');
  expect(hoja().getByText('Pierde el acceso desde el mes que viene.')).toBeInTheDocument();
});

test('cambiar de tipo y desactivar a la vez confirma las dos cosas, de a una', async () => {
  await abrir();
  await tocar('button', /^Bruno, /);
  await enHoja('radio', 'Pagador externo');
  await enHoja('checkbox', /^Activo/);
  await enHoja('button', 'Guardar');
  await enHoja('button', 'Desactivar');
  expect(m.datos.guardarIntegrante).not.toHaveBeenCalled();
  await enHoja('button', 'Cambiar tipo');
  expect(m.datos.guardarIntegrante).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'b', tipo: 'pagador_externo', activo: false, baja_desde: PROXIMO }),
  );
});

test('quien ya estaba inactivo conserva su baja; reactivarlo la borra sin preguntar', async () => {
  await abrir();
  await tocar('button', /^Carla, /);
  await escribir('Nombre', 'Carla B.');
  await enHoja('button', 'Guardar');
  expect(m.datos.guardarIntegrante).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'c', activo: false, baja_desde: '2026-03' }),
  );

  await tocar('button', /^Carla, /);
  await enHoja('checkbox', /^Activo/);
  await enHoja('button', 'Guardar');
  expect(m.datos.guardarIntegrante).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: 'c', activo: true, baja_desde: null }),
  );
});

test('si la base no guarda (email repetido), el error queda en la hoja', async () => {
  m.datos.guardarIntegrante.mockRejectedValue(
    Object.assign(new Error('duplicate key value violates unique constraint "integrantes_email_key"'), { code: '23505' }),
  );
  await abrir();
  await tocar('button', /^Ana, /);
  await escribir('Email de su cuenta', 'b@example.com');
  await enHoja('button', 'Guardar');
  expect(hoja().getByText('Ya existe uno con ese dato (nombre, email o código repetido).')).toBeInTheDocument();
});

test('se actualiza sola cuando alguien cambia algo', async () => {
  await abrir();
  m.datos.integrantes.mockResolvedValue([...casa(), persona('e', 'Eva')]);
  act(() => {
    for (const f of [...m.oyentes]) f();
  });
  expect(await screen.findByRole('button', { name: /^Eva, / })).toBeInTheDocument();
});

// ——— Categorías ———

test('lista las categorías con su tipo y a los cuántos días pregunta', async () => {
  await abrir();
  expect(screen.getByRole('button', { name: 'Almacén, Productos del súper · pregunta a los 20 días' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Luz, Servicio · pregunta a los 20 días' })).toBeInTheDocument();
});

test('agregar categoría valida nombre y días (1 a 365) y guarda', async () => {
  await abrir();
  await tocar('button', 'Agregar categoría');
  expect(hoja().getByLabelText('Días para preguntar «¿Todavía hay?»')).toHaveValue('20');
  await enHoja('button', 'Agregar');
  expect(hoja().getByText('Escribí un nombre.')).toBeInTheDocument();
  await escribir('Nombre', 'Limpieza');
  await escribir('Días para preguntar «¿Todavía hay?»', '400');
  await enHoja('button', 'Agregar');
  expect(hoja().getByText('Poné un número de días entre 1 y 365.')).toBeInTheDocument();
  expect(m.datos.guardarCategoria).not.toHaveBeenCalled();
  await escribir('Días para preguntar «¿Todavía hay?»', '30');
  await enHoja('button', 'Agregar');
  expect(m.datos.guardarCategoria).toHaveBeenCalledWith({ nombre: 'Limpieza', tipo: 'producto', dias_sin_movimiento: 30 });
  expect(await screen.findByText('Categoría guardada.')).toBeInTheDocument();
});

test('editar una categoría cambia nombre, tipo y días con su id', async () => {
  await abrir();
  await tocar('button', /^Luz, /);
  expect(hoja().getByRole('radio', { name: 'Servicio' })).toBeChecked();
  await escribir('Nombre', 'Luz y gas');
  await escribir('Días para preguntar «¿Todavía hay?»', '365');
  await enHoja('button', 'Guardar');
  expect(m.datos.guardarCategoria).toHaveBeenCalledWith({ id: 'luz', nombre: 'Luz y gas', tipo: 'servicio', dias_sin_movimiento: 365 });
});

test('borrar una categoría pide confirmación; si está en uso, lo dice', async () => {
  await abrir();
  await tocar('button', /^Luz, /);
  await enHoja('button', 'Borrar categoría');
  expect(hoja().getByText('¿Borrar la categoría Luz?')).toBeInTheDocument();
  expect(m.datos.borrarCategoria).not.toHaveBeenCalled();
  await enHoja('button', 'Borrar');
  expect(m.datos.borrarCategoria).toHaveBeenCalledWith('luz');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(await screen.findByText('Categoría borrada.')).toBeInTheDocument();

  m.datos.borrarCategoria.mockRejectedValue(
    Object.assign(new Error('violates foreign key constraint'), { code: '23503' }),
  );
  await tocar('button', /^Almacén, /);
  await enHoja('button', 'Borrar categoría');
  await enHoja('button', 'Borrar');
  expect(hoja().getByText('No se puede borrar porque está en uso.')).toBeInTheDocument();
});

// ——— Cuenta y estados ———

test('Cerrar sesión cierra la de este dispositivo; si no puede, lo dice', async () => {
  await abrir();
  expect(screen.getByText('Entraste como Ana.')).toBeInTheDocument();
  expect(screen.getByText(/solo los ven las cuentas de esta lista/)).toBeInTheDocument();
  await tocar('button', 'Cerrar sesión');
  expect(m.sesion.salir).toHaveBeenCalledTimes(1);
  m.sesion.salir.mockRejectedValue(Object.assign(new Error('No se pudo cerrar la sesión.'), { code: 'SIN_CONEXION' }));
  await tocar('button', 'Cerrar sesión');
  expect(await screen.findByText('No se pudo cerrar la sesión.')).toBeInTheDocument();
});

test('en la casa de ejemplo avisa que cerrar sesión no hace nada', async () => {
  m.memoria = true;
  await abrir();
  expect(
    screen.getByText('Es la casa de ejemplo: no hay cuenta, así que cerrar sesión no hace nada.'),
  ).toBeInTheDocument();
});

test('en la demo, Ajustes avisa y deja salir de la demo', async () => {
  m.sesion.demo = true;
  await abrir();
  expect(screen.getByText('Estás en la demo: los datos son inventados.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Salir de la demo' }));
  expect(m.sesion.salir).toHaveBeenCalled();
});

test('sin conexión avisa, deja cerrar sesión y Reintentar vuelve a pedir', async () => {
  m.datos.integrantes.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  render(<Ajustes />);
  expect(await screen.findByText('No pudimos traer los ajustes')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  await tocar('button', 'Reintentar');
  expect(await screen.findByRole('button', { name: /^Ana, / })).toBeInTheDocument();
});
