import { vaciarAlVolver, type FuentesDeVuelta } from './reintentos';

type Oyente = (...a: unknown[]) => void;

function fuentes() {
  const oyentes = { ventana: new Map<string, Oyente[]>(), documento: new Map<string, Oyente[]>() };
  const quitados: string[] = [];
  const documento = {
    visibilityState: 'visible',
    addEventListener: (t: string, f: Oyente) => oyentes.documento.set(t, [...(oyentes.documento.get(t) ?? []), f]),
    removeEventListener: (t: string) => {
      oyentes.documento.delete(t);
      quitados.push(`documento:${t}`);
    },
  };
  const ventana = {
    addEventListener: (t: string, fn: Oyente) => oyentes.ventana.set(t, [...(oyentes.ventana.get(t) ?? []), fn]),
    removeEventListener: (t: string) => {
      oyentes.ventana.delete(t);
      quitados.push(`ventana:${t}`);
    },
  };
  const f: FuentesDeVuelta = { ventana, documento };
  const emitir = {
    ventana: (t: string) => (oyentes.ventana.get(t) ?? []).forEach((o) => o()),
    documento: (t: string) => (oyentes.documento.get(t) ?? []).forEach((o) => o()),
  };
  return { f, oyentes, emitir, documento, quitados };
}

let quitar: (() => void) | null = null;
afterEach(() => {
  quitar?.();
  quitar = null;
});

describe('vaciarAlVolver', () => {
  test('en la web: al volver online y cuando la pestaña vuelve a verse', () => {
    const { f, emitir, documento } = fuentes();
    const vaciar = vi.fn();
    quitar = vaciarAlVolver(vaciar, f);
    emitir.ventana('online');
    expect(vaciar).toHaveBeenCalledTimes(1);
    documento.visibilityState = 'hidden';
    emitir.documento('visibilitychange');
    expect(vaciar).toHaveBeenCalledTimes(1);
    documento.visibilityState = 'visible';
    emitir.documento('visibilitychange');
    expect(vaciar).toHaveBeenCalledTimes(2);
  });

  test('llamarlo otra vez no registra oyentes repetidos', () => {
    const { f, oyentes, emitir } = fuentes();
    const vaciar = vi.fn();
    quitar = vaciarAlVolver(vaciar, f);
    const otraVez = vaciarAlVolver(vaciar, f);
    expect(otraVez).toBe(quitar);
    expect(oyentes.ventana.get('online')).toHaveLength(1);
    expect(oyentes.documento.get('visibilitychange')).toHaveLength(1);
    emitir.ventana('online');
    expect(vaciar).toHaveBeenCalledTimes(1);
  });

  test('quitar saca todos los oyentes y permite registrar de nuevo', () => {
    const { f, quitados, oyentes } = fuentes();
    vaciarAlVolver(vi.fn(), f)();
    expect(quitados.sort()).toEqual(['documento:visibilitychange', 'ventana:online']);
    quitar = vaciarAlVolver(vi.fn(), f);
    expect(oyentes.ventana.get('online')).toHaveLength(1);
  });
});
