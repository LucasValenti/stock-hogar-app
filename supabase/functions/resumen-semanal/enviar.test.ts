import { formatear } from '@/logica/dinero';

import { enviarResumen, type DatosSemana, type Suscripcion } from './enviar';

const sub = (n: number): Suscripcion => ({ endpoint: `https://push.example.com/${n}`, p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) });
const datos = (extra: Partial<DatosSemana> = {}): DatosSemana => ({
  gastos: [1000000, 500000],
  productos: ['Leche'],
  anotaciones: [{ texto: 'Pan', creado: '2026-10-20T12:00:00Z' }],
  suscripciones: [sub(1), sub(2)],
  ...extra,
});
// Domingo 25/10/2026 a las 20:00 de Argentina.
const AHORA = new Date('2026-10-25T23:00:00Z');

function preparar(d: DatosSemana, estados: Record<string, number | Error> = {}) {
  const pedirDatos = vi.fn(async () => d);
  const mandar = vi.fn(async (s: Suscripcion, _cuerpo: string) => {
    const r = estados[s.endpoint] ?? 201;
    if (r instanceof Error) throw r;
    return r;
  });
  const borrar = vi.fn(async (_endpoint: string) => undefined);
  return { pedirDatos, mandar, borrar, correr: () => enviarResumen({ ahora: AHORA, pedirDatos, mandar, borrar }) };
}

test('pide los datos de lunes a domingo de esta semana y manda el mismo aviso a cada suscripción', async () => {
  const p = preparar(datos());
  const r = await p.correr();
  expect(p.pedirDatos).toHaveBeenCalledWith('2026-10-19', '2026-10-25');
  expect(p.mandar).toHaveBeenCalledTimes(2);
  const cuerpo = JSON.parse(p.mandar.mock.calls[0][1]);
  expect(cuerpo).toEqual({ titulo: 'Stock del hogar', cuerpo: `Tu semana en la casa: ${formatear(1500000)} en 2 gastos. Faltan Leche y Pan.` });
  expect(p.mandar.mock.calls[1][1]).toBe(p.mandar.mock.calls[0][1]);
  expect(r).toEqual({ semana: { desde: '2026-10-19', hasta: '2026-10-25' }, enviados: 2, borrados: 0, fallidos: 0 });
});

test('una suscripción vencida (404 o 410) se borra; las demás se mandan igual', async () => {
  const p = preparar(datos({ suscripciones: [sub(1), sub(2), sub(3)] }), { [sub(1).endpoint]: 410, [sub(2).endpoint]: 404 });
  const r = await p.correr();
  expect(p.borrar.mock.calls.map((c) => c[0])).toEqual([sub(1).endpoint, sub(2).endpoint]);
  expect(r).toMatchObject({ enviados: 1, borrados: 2, fallidos: 0 });
});

test('un error o una respuesta rara en una no corta las demás ni borra nada', async () => {
  const p = preparar(datos({ suscripciones: [sub(1), sub(2), sub(3)] }), { [sub(1).endpoint]: new Error('sin red'), [sub(2).endpoint]: 500 });
  const r = await p.correr();
  expect(p.mandar).toHaveBeenCalledTimes(3);
  expect(p.borrar).not.toHaveBeenCalled();
  expect(r).toMatchObject({ enviados: 1, borrados: 0, fallidos: 2 });
});

test('semana vacía: no manda nada', async () => {
  const p = preparar(datos({ gastos: [], productos: [], anotaciones: [] }));
  const r = await p.correr();
  expect(p.mandar).not.toHaveBeenCalled();
  expect(r).toEqual({ semana: { desde: '2026-10-19', hasta: '2026-10-25' }, enviados: 0, borrados: 0, fallidos: 0, semanaVacia: true });
});

test('sin suscripciones no manda nada y no falla', async () => {
  const p = preparar(datos({ suscripciones: [] }));
  expect(await p.correr()).toMatchObject({ enviados: 0, borrados: 0, fallidos: 0 });
  expect(p.mandar).not.toHaveBeenCalled();
});

test('si no se pueden pedir los datos, el error sube (la ejecución del cron queda marcada como fallida)', async () => {
  const pedirDatos = vi.fn(async (): Promise<DatosSemana> => {
    throw new Error('sin base');
  });
  await expect(enviarResumen({ ahora: AHORA, pedirDatos, mandar: vi.fn(), borrar: vi.fn() })).rejects.toThrow('sin base');
});
