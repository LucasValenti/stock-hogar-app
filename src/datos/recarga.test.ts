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

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('crearRecarga', () => {
  test('varios avisos seguidos piden una sola vez, 300 ms después del último', async () => {
    const pedir = vi.fn(async () => 'ok');
    const alTener = vi.fn();
    const r = crearRecarga({ pedir, alTener, alFallar: vi.fn() });
    r.pronto();
    vi.advanceTimersByTime(200);
    r.pronto();
    vi.advanceTimersByTime(200);
    r.pronto();
    vi.advanceTimersByTime(299);
    expect(pedir).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(pedir).toHaveBeenCalledTimes(1);
    await vaciarPromesas();
    expect(alTener).toHaveBeenCalledWith('ok');
  });

  test('una respuesta vieja que llega después de una nueva no la pisa', async () => {
    const vieja = diferida<string>();
    const nueva = diferida<string>();
    const pedir = vi.fn().mockReturnValueOnce(vieja.promesa).mockReturnValueOnce(nueva.promesa);
    const alTener = vi.fn();
    const r = crearRecarga({ pedir, alTener, alFallar: vi.fn() });
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
    const pedir = vi.fn().mockReturnValueOnce(vieja.promesa).mockResolvedValueOnce('nueva');
    const alTener = vi.fn();
    const alFallar = vi.fn();
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
    const alFallar = vi.fn();
    const r = crearRecarga({ pedir: () => Promise.reject(falla), alTener: vi.fn(), alFallar });
    r.ahora();
    await vaciarPromesas();
    expect(alFallar).toHaveBeenCalledWith(falla);
  });

  test('ahora() cancela un aviso pendiente; cancelar() descarta lo que esté en vuelo', async () => {
    const enVuelo = diferida<string>();
    const pedir = vi.fn().mockResolvedValueOnce('primera').mockReturnValueOnce(enVuelo.promesa);
    const alTener = vi.fn();
    const r = crearRecarga({ pedir, alTener, alFallar: vi.fn() });
    r.pronto();
    r.ahora();
    vi.advanceTimersByTime(1000);
    expect(pedir).toHaveBeenCalledTimes(1);
    await vaciarPromesas();
    r.pronto();
    vi.advanceTimersByTime(300);
    r.cancelar();
    enVuelo.resolver('tarde');
    await vaciarPromesas();
    expect(alTener.mock.calls).toEqual([['primera']]);
    r.pronto();
    r.cancelar();
    vi.advanceTimersByTime(1000);
    expect(pedir).toHaveBeenCalledTimes(2);
  });
});
