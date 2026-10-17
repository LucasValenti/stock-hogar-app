import { crearRecarga } from './recarga';

/** Una promesa que se resuelve o rechaza desde afuera. */
function diferida<T>() {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

const vaciarPromesas = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('crearRecarga', () => {
  test('varios avisos seguidos piden una sola vez, 300 ms después del último', async () => {
    const pedir = jest.fn(async () => 'ok');
    const alTener = jest.fn();
    const r = crearRecarga({ pedir, alTener, alFallar: jest.fn() });
    r.pronto();
    jest.advanceTimersByTime(200);
    r.pronto();
    jest.advanceTimersByTime(200);
    r.pronto();
    jest.advanceTimersByTime(299);
    expect(pedir).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(pedir).toHaveBeenCalledTimes(1);
    await vaciarPromesas();
    expect(alTener).toHaveBeenCalledWith('ok');
  });

  test('una respuesta vieja que llega después de una nueva no la pisa', async () => {
    const vieja = diferida<string>();
    const nueva = diferida<string>();
    const pedir = jest.fn().mockReturnValueOnce(vieja.promesa).mockReturnValueOnce(nueva.promesa);
    const alTener = jest.fn();
    const r = crearRecarga({ pedir, alTener, alFallar: jest.fn() });
    r.ahora();
    r.ahora();
    nueva.resolver('nueva');
    await vaciarPromesas();
    vieja.resolver('vieja');
    await vaciarPromesas();
    expect(alTener.mock.calls).toEqual([['nueva']]);
  });

  test('un error de un pedido viejo tampoco pisa al nuevo', async () => {
    const vieja = diferida<string>();
    const pedir = jest.fn().mockReturnValueOnce(vieja.promesa).mockResolvedValueOnce('nueva');
    const alTener = jest.fn();
    const alFallar = jest.fn();
    const r = crearRecarga({ pedir, alTener, alFallar });
    r.ahora();
    r.ahora();
    await vaciarPromesas();
    vieja.rechazar(new Error('tarde'));
    await vaciarPromesas();
    expect(alTener.mock.calls).toEqual([['nueva']]);
    expect(alFallar).not.toHaveBeenCalled();
  });

  test('el último pedido que falla avisa el error', async () => {
    const falla = new Error('sin red');
    const alFallar = jest.fn();
    const r = crearRecarga({ pedir: () => Promise.reject(falla), alTener: jest.fn(), alFallar });
    r.ahora();
    await vaciarPromesas();
    expect(alFallar).toHaveBeenCalledWith(falla);
  });

  test('ahora() cancela un aviso pendiente; cancelar() descarta lo que esté en vuelo', async () => {
    const enVuelo = diferida<string>();
    const pedir = jest.fn().mockResolvedValueOnce('primera').mockReturnValueOnce(enVuelo.promesa);
    const alTener = jest.fn();
    const r = crearRecarga({ pedir, alTener, alFallar: jest.fn() });
    r.pronto();
    r.ahora();
    jest.advanceTimersByTime(1000);
    expect(pedir).toHaveBeenCalledTimes(1);
    await vaciarPromesas();
    r.pronto();
    jest.advanceTimersByTime(300);
    r.cancelar();
    enVuelo.resolver('tarde');
    await vaciarPromesas();
    expect(alTener.mock.calls).toEqual([['primera']]);
    r.pronto();
    r.cancelar();
    jest.advanceTimersByTime(1000);
    expect(pedir).toHaveBeenCalledTimes(2);
  });
});
