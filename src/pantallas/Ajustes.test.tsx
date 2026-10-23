// Ajustes con la capa de datos simulada: integrantes (agregar, editar, tipo con su aviso, sueldo, email,
// activo y baja), categorías (agregar, editar, días de «¿todavía hay?», borrar), Cerrar sesión y la demo.
// Al final, con la base en memoria y cada integrante: Mi perfil, sueldos, altas y bajas y permisos según el acceso.

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { crearDatosEnMemoria, semillaDeEjemplo, type Semilla } from '@/datos/memoria';
import type { Datos } from '@/datos/tipos';
import { formatear } from '@/logica/dinero';
import { mesActual, mesSiguiente, nombreMes } from '@/logica/meses';
import type { Acceso, Categoria, Integrante } from '@/logica/tipos';
import { avisoCambioTipo } from '@/logica/validar';

import { Ajustes } from './Ajustes';

const m = vi.hoisted(() => ({
  datos: {
    integrantes: vi.fn(),
    categorias: vi.fn(),
    guardarIntegrante: vi.fn(),
    guardarCategoria: vi.fn(),
    borrarCategoria: vi.fn(),
    sueldos: vi.fn(),
    fijarSueldo: vi.fn(),
    permisosDeLaCasa: vi.fn(),
    escucharCambios: vi.fn((_f: () => void) => () => undefined),
  },
  /** Con la base en memoria en vez de los simulados. */
  memoria: null as Datos | null,
  sesion: {
    yo: { id: 'a', nombre: 'Ana' } as Integrante | null,
    acceso: { admin: true, permisos: [] } as Acceso | null,
    salir: vi.fn(),
    demo: false,
  },
  modoMemoria: false,
  oyentes: new Set<() => void>(),
}));

vi.mock('@/sesion/sesion', () => ({ useSesion: () => m.sesion }));
vi.mock('@/datos', () => ({
  get datos() {
    return m.memoria ?? m.datos;
  },
  esModoMemoria: () => m.modoMemoria,
}));

const persona = (id: string, nombre: string, extra: Partial<Integrante> = {}): Integrante => ({
  id,
  nombre,
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
  persona('a', 'Ana', { admin: true }),
  persona('b', 'Bruno'),
  persona('c', 'Carla', { activo: false, baja_desde: '2026-03' }),
  persona('d', 'Dora', { tipo: 'pagador_externo' }),
];
// Bruno y Dora sin sueldo; los demás, aparte (como la tabla sueldos).
const sueldos = (): Record<string, number> => ({ a: 600_000_00, c: 600_000_00, e: 600_000_00, f: 600_000_00 });
const categorias = (): Categoria[] => [
  { id: 'almacen', nombre: 'Almacén', tipo: 'producto', dias_sin_movimiento: 20 },
  { id: 'luz', nombre: 'Luz', tipo: 'servicio', dias_sin_movimiento: 20 },
];

beforeEach(() => {
  vi.clearAllMocks();
  m.memoria = null;
  m.modoMemoria = false;
  m.sesion.demo = false;
  m.sesion.yo = persona('a', 'Ana', { admin: true });
  m.sesion.acceso = { admin: true, permisos: [] };
  m.oyentes.clear();
  m.datos.integrantes.mockResolvedValue(casa());
  m.datos.categorias.mockResolvedValue(categorias());
  m.datos.guardarIntegrante.mockImplementation(async (i: Partial<Integrante>) => ({ ...persona('n', ''), ...i }));
  m.datos.guardarCategoria.mockImplementation(async (c: Partial<Categoria>) => ({ id: 'n', ...c }));
  m.datos.borrarCategoria.mockResolvedValue(undefined);
  m.datos.sueldos.mockResolvedValue(sueldos());
  m.datos.fijarSueldo.mockResolvedValue(undefined);
  m.datos.permisosDeLaCasa.mockResolvedValue({});
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

test('agregar integrante valida, guarda con el email en minúscula y después fija el sueldo en centavos', async () => {
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
    activo: true,
    baja_desde: null,
  });
  // El sueldo va aparte, después del alta y con el id que le dio la base.
  expect(m.datos.fijarSueldo).toHaveBeenCalledWith('n', 1_500_000_00);
  expect(m.datos.guardarIntegrante.mock.invocationCallOrder[0]).toBeLessThan(m.datos.fijarSueldo.mock.invocationCallOrder[0]);
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
  expect(m.datos.fijarSueldo).not.toHaveBeenCalled();
});

test('cambiar o borrar el sueldo lo fija aparte; si no cambió, no se manda', async () => {
  await abrir();
  await tocar('button', /^Ana, /);
  await escribir('Sueldo mensual', '700.000');
  await enHoja('button', 'Guardar');
  expect(m.datos.fijarSueldo).toHaveBeenCalledWith('a', 700_000_00);
  await screen.findByText('Cambios guardados.');

  await tocar('button', /^Bruno, /);
  await escribir('Sueldo mensual', '');
  await enHoja('button', 'Guardar');
  await screen.findByText('Cambios guardados.');
  // Bruno ya estaba sin sueldo: nada que fijar.
  expect(m.datos.fijarSueldo).toHaveBeenCalledTimes(1);

  await tocar('button', /^Carla, /);
  await escribir('Sueldo mensual', '');
  await enHoja('button', 'Guardar');
  expect(m.datos.fijarSueldo).toHaveBeenLastCalledWith('c', null);
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
    activo: true,
    baja_desde: null,
  });
  expect(m.datos.fijarSueldo).not.toHaveBeenCalled();
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
    persona('g', 'Gabi', { tipo: 'pagador_externo', activo: false, baja_desde: null }),
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
  expect(m.datos.fijarSueldo).not.toHaveBeenCalled();
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
  expect(m.datos.fijarSueldo).not.toHaveBeenCalled();
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

test('mientras el acceso no se sabe no muestra sueldos, altas ni permisos, ni avisa de permisos', async () => {
  m.sesion.acceso = null;
  await abrir();
  expect(screen.getByText('Bruno')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Bruno, / })).not.toBeInTheDocument();
  expect(screen.queryByText(formatear(600_000_00))).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Agregar integrante' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Permisos' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Los demás datos los cambia/)).not.toBeInTheDocument();
  expect(m.datos.sueldos).not.toHaveBeenCalled();
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
  m.modoMemoria = true;
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

// ——— Perfil, sueldos y permisos, con la base en memoria y cada quien ———
// La casa de ejemplo: Ana es la admin; Bruno y Caro, comunes. Ana gana 900.000; Bruno, 600.000; Caro, 500.000.

const ANA = 'ejemplo-ana';
const BRUNO = 'ejemplo-bruno';
const CARO = 'ejemplo-caro';

/** Abre Ajustes como `yo`, con los permisos dados en la casa de ejemplo. */
async function abrirComo(yo: string, permisos: Semilla['permisos'] = []) {
  const datos = crearDatosEnMemoria({ ...semillaDeEjemplo(), permisos }, { yo });
  m.memoria = datos;
  m.sesion.yo = (await datos.integrantes()).find((i) => i.id === yo) ?? null;
  m.sesion.acceso = await datos.miAcceso();
  await abrir();
  return datos;
}
const grupo = (nombre: string) => within(screen.getByRole('group', { name: nombre }));

describe('según el acceso', () => {
  test('alguien común ve y cambia su perfil, ve la casa sin sueldos y no ve altas ni permisos', async () => {
    const datos = await abrirComo(CARO);
    const sueldos = vi.spyOn(datos, 'sueldos');
    expect(screen.getByRole('heading', { name: 'Mi perfil' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tu nombre')).toHaveValue('Caro');
    // La casa, sin sueldos ni filas para tocar.
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Bruno')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ana, / })).not.toBeInTheDocument();
    expect(screen.queryByText(formatear(900_000_00))).not.toBeInTheDocument();
    expect(screen.queryByText('Sin sueldo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar integrante' })).not.toBeInTheDocument();
    expect(screen.queryByText(/hay que invitar su email/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Permisos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();

    // Mi perfil: nombre y color, solo los propios.
    await userEvent.clear(screen.getByLabelText('Tu nombre'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));
    expect(screen.getByText('Escribí un nombre.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Tu nombre'), 'Carolina');
    const colores = within(screen.getByRole('radiogroup', { name: 'Color' }));
    expect(colores.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual([
      'Naranja',
      'Verde',
      'Azul',
      'Rosa',
      'Violeta',
      'Amarillo',
    ]);
    await userEvent.click(colores.getByRole('radio', { name: 'Verde' }));
    expect(colores.getByRole('radio', { name: 'Verde' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));
    expect(await screen.findByText('Perfil guardado.')).toBeInTheDocument();
    expect((await datos.integrantes()).find((i) => i.id === CARO)).toMatchObject({ nombre: 'Carolina', color: 'verde' });
    expect(sueldos).not.toHaveBeenCalled();
  });

  test('con «sueldos» ve y cambia los sueldos, pero no da altas ni bajas ni ve permisos', async () => {
    const datos = await abrirComo(BRUNO, [{ integrante_id: BRUNO, permiso: 'sueldos' }]);
    const guardar = vi.spyOn(datos, 'guardarIntegrante');
    expect(await screen.findByRole('button', { name: `Ana, Integrante · Activo, ${formatear(900_000_00)}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar integrante' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Permisos' })).not.toBeInTheDocument();

    await tocar('button', /^Caro, /);
    expect(hoja().getByLabelText('Sueldo mensual')).toHaveValue('500000');
    expect(hoja().queryByLabelText('Email de su cuenta')).not.toBeInTheDocument();
    expect(hoja().queryByLabelText('Nombre')).not.toBeInTheDocument();
    expect(hoja().queryByRole('checkbox')).not.toBeInTheDocument();
    expect(hoja().getByText(/Los demás datos los cambia quien tiene el permiso de altas y bajas/)).toBeInTheDocument();
    await escribir('Sueldo mensual', '550.000');
    await enHoja('button', 'Guardar');
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
    expect((await datos.sueldos())[CARO]).toBe(550_000_00);
    expect(guardar).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: `Caro, Integrante · Activo, ${formatear(550_000_00)}` })).toBeInTheDocument();
  });

  test('con «altas y bajas» agrega gente sin sueldo; al admin no le cambia el email, el tipo ni la baja', async () => {
    const datos = await abrirComo(BRUNO, [{ integrante_id: BRUNO, permiso: 'altas_bajas' }]);
    const fijar = vi.spyOn(datos, 'fijarSueldo');
    expect(screen.queryByText(formatear(900_000_00))).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Permisos' })).not.toBeInTheDocument();

    await tocar('button', 'Agregar integrante');
    expect(hoja().queryByLabelText('Sueldo mensual')).not.toBeInTheDocument();
    await escribir('Nombre', 'Eva');
    await escribir('Email de su cuenta', 'eva@example.com');
    await enHoja('button', 'Agregar');
    expect(await screen.findByText('Eva se agregó a la casa.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Eva, Integrante · Activo' })).toBeInTheDocument();
    expect(fijar).not.toHaveBeenCalled();

    await tocar('button', /^Ana, /);
    const razon = 'Solo el admin puede cambiar el email, el tipo o la baja de Ana.';
    const email = hoja().getByLabelText('Email de su cuenta');
    expect(email).toHaveAttribute('aria-disabled', 'true');
    expect(email).toHaveAttribute('readonly');
    expect(email).toHaveAccessibleDescription(razon);
    expect(hoja().getByRole('radio', { name: 'Pagador externo' })).toBeDisabled();
    expect(hoja().getByRole('checkbox', { name: /^Activo/ })).toBeDisabled();
    expect(hoja().getAllByText(razon).length).toBeGreaterThan(0);
    // A un integrante común, sí.
    await enHoja('button', 'Cerrar');
    await tocar('button', /^Caro, /);
    expect(hoja().getByLabelText('Email de su cuenta')).not.toHaveAttribute('readonly');
    expect(hoja().getByRole('checkbox', { name: /^Activo/ })).toBeEnabled();
  });

  test('con «altas y bajas» no cambia el email, el tipo ni la baja de quien tiene permisos', async () => {
    await abrirComo(BRUNO, [
      { integrante_id: BRUNO, permiso: 'altas_bajas' },
      { integrante_id: CARO, permiso: 'sueldos' },
    ]);
    await tocar('button', /^Caro, /);
    const razon = 'Solo el admin puede cambiar el email, el tipo o la baja de Caro.';
    const email = hoja().getByLabelText('Email de su cuenta');
    expect(email).toHaveAttribute('aria-disabled', 'true');
    expect(email).toHaveAttribute('readonly');
    expect(email).toHaveAccessibleDescription(razon);
    expect(hoja().getByRole('radio', { name: 'Pagador externo' })).toBeDisabled();
    expect(hoja().getByRole('checkbox', { name: /^Activo/ })).toBeDisabled();
    expect(hoja().getAllByText(razon).length).toBeGreaterThan(0);
    // El nombre sí: la base lo permite y no es lo que puedeTocarIntegrante niega.
    expect(hoja().getByLabelText('Nombre')).not.toHaveAttribute('readonly');
  });

  test('el admin ve todo: da y quita permisos a Bruno, y cede el rol con confirmación', async () => {
    const datos = await abrirComo(ANA);
    expect(screen.getByRole('button', { name: `Bruno, Integrante · Activo, ${formatear(600_000_00)}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar integrante' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Permisos' })).toBeInTheDocument();
    // La admin no se da permisos a sí misma: ya lo puede todo.
    expect(screen.queryByRole('group', { name: 'Ana' })).not.toBeInTheDocument();

    const sueldos = () => grupo('Bruno').getByRole('switch', { name: 'Ver y cambiar sueldos' });
    expect(sueldos()).toHaveAttribute('aria-checked', 'false');
    expect(grupo('Bruno').getByRole('switch', { name: 'Altas y bajas' })).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sueldos());
    expect(await datos.permisosDeLaCasa()).toEqual({ [BRUNO]: ['sueldos'] });
    await waitFor(() => expect(sueldos()).toHaveAttribute('aria-checked', 'true'));
    await userEvent.click(sueldos());
    expect(await datos.permisosDeLaCasa()).toEqual({});
    await waitFor(() => expect(sueldos()).toHaveAttribute('aria-checked', 'false'));

    await userEvent.click(grupo('Bruno').getByRole('button', { name: 'Ceder el rol de admin' }));
    expect(hoja().getByText('¿Ceder el rol de admin a Bruno?')).toBeInTheDocument();
    expect(hoja().getByText(/conservás los dos permisos/)).toBeInTheDocument();
    expect((await datos.miAcceso()).admin).toBe(true);
    await enHoja('button', 'Volver');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect((await datos.miAcceso()).admin).toBe(true);

    await userEvent.click(grupo('Bruno').getByRole('button', { name: 'Ceder el rol de admin' }));
    await enHoja('button', 'Ceder el rol');
    expect(await screen.findByText('Ahora Bruno es admin.')).toBeInTheDocument();
    expect(await datos.miAcceso()).toEqual({ admin: false, permisos: ['altas_bajas', 'sueldos'] });
    expect((await datos.integrantes()).find((i) => i.id === BRUNO)?.admin).toBe(true);
  });

  test('a alguien inactivo no se le cede el rol: el botón está deshabilitado y dice por qué', async () => {
    const semilla = semillaDeEjemplo();
    const caro = semilla.integrantes.find((i) => i.id === CARO) as Integrante;
    caro.activo = false;
    caro.baja_desde = '2026-01';
    const datos = crearDatosEnMemoria(semilla, { yo: ANA });
    m.memoria = datos;
    m.sesion.yo = (await datos.integrantes()).find((i) => i.id === ANA) ?? null;
    m.sesion.acceso = await datos.miAcceso();
    await abrir();
    expect(grupo('Caro').getByRole('button', { name: 'Ceder el rol de admin' })).toBeDisabled();
    expect(grupo('Caro').getByText('Para cederle el rol, Caro tiene que estar activo.')).toBeInTheDocument();
  });
});
