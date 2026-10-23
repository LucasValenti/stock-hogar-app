// Avisos con el navegador y la capa de datos simulados: prender, apagar, permiso negado, falla de la base,
// suscripción ajena, demo e iPhone sin instalar.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Entorno } from '@/logica/avisos';

import { Avisos } from './Avisos';

const m = vi.hoisted(() => ({
  entorno: null as unknown as Entorno,
  sub: null as null | { endpoint: string; toJSON: () => unknown; unsubscribe: ReturnType<typeof vi.fn> },
  permiso: 'granted' as NotificationPermission,
  datos: {
    clavePublicaAvisos: vi.fn(async () => 'clave-publica' as string | null),
    misSuscripciones: vi.fn(async () => [] as string[]),
    guardarSuscripcion: vi.fn(async () => undefined),
    borrarSuscripcion: vi.fn(async () => undefined),
  },
  suscribir: vi.fn(),
  demo: false,
}));

vi.mock('@/sesion/sesion', () => ({ useSesion: () => ({ demo: m.demo }) }));
vi.mock('@/datos', () => ({ datos: m.datos }));
vi.mock('@/avisos/navegador', () => ({
  entornoAvisos: (_demo: boolean, configurada: boolean) => ({ ...m.entorno, configurada }),
  suscripcionDelNavegador: async () => m.sub,
  pedirPermiso: async () => m.permiso,
  suscribir: (clave: string) => m.suscribir(clave),
}));

const suscripcion = (endpoint = 'https://push.example.com/este') => ({
  endpoint,
  toJSON: () => ({ endpoint, keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }),
  unsubscribe: vi.fn(async () => true),
});

beforeEach(() => {
  m.entorno = { demo: false, soportado: true, permiso: 'default', esIOS: false, instalada: false, configurada: true };
  m.sub = null;
  m.permiso = 'granted';
  m.demo = false;
  m.datos.clavePublicaAvisos.mockReset().mockResolvedValue('clave-publica');
  m.datos.misSuscripciones.mockReset().mockResolvedValue([]);
  m.datos.guardarSuscripcion.mockReset().mockResolvedValue(undefined);
  m.datos.borrarSuscripcion.mockReset().mockResolvedValue(undefined);
  m.suscribir.mockReset().mockImplementation(async () => {
    m.sub = suscripcion();
    return m.sub;
  });
});

const interruptor = () => screen.getByRole('switch', { name: 'Resumen de los domingos' });

test('apagado: al prenderlo pide permiso, suscribe el navegador con la clave pública y guarda la suscripción', async () => {
  render(<Avisos />);
  await waitFor(() => expect(interruptor()).toBeEnabled());
  expect(interruptor()).toHaveAttribute('aria-checked', 'false');
  await userEvent.click(interruptor());
  await waitFor(() => expect(interruptor()).toHaveAttribute('aria-checked', 'true'));
  expect(m.suscribir).toHaveBeenCalledWith('clave-publica');
  expect(m.datos.guardarSuscripcion).toHaveBeenCalledWith({ endpoint: 'https://push.example.com/este', p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) });
  expect(screen.getByText('Te llega los domingos a las 20 con lo que se gastó en la semana y lo que falta.')).toBeInTheDocument();
});

test('prendido (el navegador y la base coinciden): al apagarlo borra la suscripción de la base y del navegador', async () => {
  m.sub = suscripcion();
  m.datos.misSuscripciones.mockResolvedValue(['https://push.example.com/este']);
  render(<Avisos />);
  await waitFor(() => expect(interruptor()).toHaveAttribute('aria-checked', 'true'));
  const sub = m.sub;
  await userEvent.click(interruptor());
  await waitFor(() => expect(interruptor()).toHaveAttribute('aria-checked', 'false'));
  expect(m.datos.borrarSuscripcion).toHaveBeenCalledWith('https://push.example.com/este');
  expect(sub.unsubscribe).toHaveBeenCalled();
});

test('si la suscripción del navegador no es de esta cuenta (dispositivo compartido), figura apagado', async () => {
  m.sub = suscripcion();
  m.datos.misSuscripciones.mockResolvedValue(['https://push.example.com/otro']);
  render(<Avisos />);
  await waitFor(() => expect(interruptor()).toBeEnabled());
  expect(interruptor()).toHaveAttribute('aria-checked', 'false');
});

test('si niega el permiso, no suscribe y explica cómo habilitarlo', async () => {
  m.permiso = 'denied';
  render(<Avisos />);
  await waitFor(() => expect(interruptor()).toBeEnabled());
  await userEvent.click(interruptor());
  expect(await screen.findByText('Bloqueaste los avisos para esta app. Se habilitan desde los ajustes del navegador.')).toBeInTheDocument();
  expect(m.suscribir).not.toHaveBeenCalled();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
});

test('si la base falla, deshace la suscripción del navegador, muestra el error y queda apagado', async () => {
  m.datos.guardarSuscripcion.mockRejectedValue(Object.assign(new Error('SIN_PERMISO'), { code: '42501' }));
  render(<Avisos />);
  await waitFor(() => expect(interruptor()).toBeEnabled());
  await userEvent.click(interruptor());
  await waitFor(() => expect(m.sub?.unsubscribe).toHaveBeenCalled());
  expect(interruptor()).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

test('si la función todavía no generó la clave pública, avisa que los avisos no están listos', async () => {
  m.datos.clavePublicaAvisos.mockResolvedValue(null);
  render(<Avisos />);
  expect(await screen.findByText('Los avisos todavía no están listos.')).toBeInTheDocument();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
});

test('en la demo no hay interruptor ni se habla con la base', async () => {
  m.entorno = { ...m.entorno, demo: true };
  m.demo = true;
  render(<Avisos />);
  expect(screen.getByText('En la demo no hay avisos.')).toBeInTheDocument();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(m.datos.misSuscripciones).not.toHaveBeenCalled();
  expect(m.datos.clavePublicaAvisos).not.toHaveBeenCalled();
});

test('en iPhone sin instalar, explica que primero hay que agregarla a la pantalla de inicio', () => {
  m.entorno = { ...m.entorno, esIOS: true, soportado: false };
  render(<Avisos />);
  expect(screen.getByText('En iPhone, primero agregá la app a la pantalla de inicio (Compartir → Agregar a inicio).')).toBeInTheDocument();
});

test('si el navegador ya tenía una suscripción (de otra cuenta) y falla la base, no la borra', async () => {
  const ajena = suscripcion('https://push.example.com/de-otra-cuenta');
  m.sub = ajena;
  m.datos.misSuscripciones.mockResolvedValue([]);
  m.suscribir.mockImplementation(async () => ajena);
  m.datos.guardarSuscripcion.mockRejectedValue(new Error('sin red'));
  render(<Avisos />);
  await waitFor(() => expect(interruptor()).toBeEnabled());
  await userEvent.click(interruptor());
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(ajena.unsubscribe).not.toHaveBeenCalled();
  expect(interruptor()).toHaveAttribute('aria-checked', 'false');
});

test('si cierra el diálogo de permiso sin elegir, se lo explica y no suscribe', async () => {
  m.permiso = 'default';
  render(<Avisos />);
  await waitFor(() => expect(interruptor()).toBeEnabled());
  await userEvent.click(interruptor());
  expect(await screen.findByText('Para recibir el resumen, aceptá el permiso de avisos que pide el navegador.')).toBeInTheDocument();
  expect(m.suscribir).not.toHaveBeenCalled();
  expect(interruptor()).toHaveAttribute('aria-checked', 'false');
});
