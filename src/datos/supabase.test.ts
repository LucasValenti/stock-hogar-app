// escucharCambios con un cliente falso que se porta como realtime-js 2.x: channel() devuelve el
// canal que ya existe con ese nombre, y .on() después de subscribe() lanza.

import type { SupabaseClient } from '@supabase/supabase-js';

import { crearDatosSupabase } from './supabase';

type Estado = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

function clienteFalso() {
  const canales: Array<{
    topic: string;
    suscripto: boolean;
    alCambio: Array<() => void>;
    filtros: unknown[];
    alEstado: Array<(e: Estado) => void>;
    emitir(): void;
    estado(e: Estado): void;
  }> = [];
  const removidos: string[] = [];
  const cliente = {
    channel(nombre: string) {
      const topic = `realtime:${nombre}`;
      const existe = canales.find((c) => c.topic === topic);
      if (existe) return api(existe);
      const c = {
        topic,
        suscripto: false,
        alCambio: [] as Array<() => void>,
        filtros: [] as unknown[],
        alEstado: [] as Array<(e: Estado) => void>,
        emitir() {
          this.alCambio.forEach((f) => f());
        },
        estado(e: Estado) {
          this.alEstado.forEach((f) => f(e));
        },
      };
      canales.push(c);
      return api(c);
    },
    async removeChannel(canal: { topic: string }) {
      const i = canales.findIndex((c) => c.topic === canal.topic);
      if (i >= 0) canales.splice(i, 1);
      removidos.push(canal.topic);
      return 'ok';
    },
  };
  function api(c: (typeof canales)[number]) {
    const canal = {
      topic: c.topic,
      on(_tipo: string, filtro: unknown, f: () => void) {
        if (c.suscripto) throw new Error('cannot add `postgres_changes` callbacks after `subscribe()`.');
        c.filtros.push(filtro);
        c.alCambio.push(f);
        return canal;
      },
      subscribe(f?: (e: Estado) => void) {
        c.suscripto = true;
        if (f) c.alEstado.push(f);
        return canal;
      },
    };
    return canal;
  }
  return { cliente: cliente as unknown as SupabaseClient, canales, removidos };
}

describe('escucharCambios', () => {
  test('dos oyentes comparten un solo canal y los dos reciben cada cambio', () => {
    const { cliente, canales } = clienteFalso();
    const datos = crearDatosSupabase(cliente);
    const a = jest.fn();
    const b = jest.fn();
    datos.escucharCambios(a);
    expect(() => datos.escucharCambios(b)).not.toThrow();
    expect(canales).toHaveLength(1);
    canales[0].emitir();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  test('escucha todo el esquema público, sin filtrar por tabla: las anotaciones (publicadas por la 007) también avisan', () => {
    const { cliente, canales } = clienteFalso();
    crearDatosSupabase(cliente).escucharCambios(jest.fn());
    expect(canales[0].filtros).toEqual([{ event: '*', schema: 'public' }]);
  });

  test('el canal es uno por cliente aunque la capa de datos se arme dos veces', () => {
    const { cliente, canales } = clienteFalso();
    const a = jest.fn();
    const b = jest.fn();
    crearDatosSupabase(cliente).escucharCambios(a);
    crearDatosSupabase(cliente).escucharCambios(b);
    expect(canales).toHaveLength(1);
    canales[0].emitir();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  test('sacar un oyente deja al otro escuchando; sacar los dos cierra el canal', () => {
    const { cliente, canales, removidos } = clienteFalso();
    const datos = crearDatosSupabase(cliente);
    const a = jest.fn();
    const b = jest.fn();
    const dejarA = datos.escucharCambios(a);
    const dejarB = datos.escucharCambios(b);
    dejarA();
    expect(removidos).toEqual([]);
    canales[0].emitir();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    // Llamar dos veces al mismo cierre no saca a otro oyente.
    dejarA();
    expect(removidos).toEqual([]);
    dejarB();
    expect(removidos).toHaveLength(1);
    expect(canales).toHaveLength(0);
  });

  test('después de cerrarse, un oyente nuevo abre otro canal y recibe', () => {
    const { cliente, canales } = clienteFalso();
    const datos = crearDatosSupabase(cliente);
    datos.escucharCambios(jest.fn())();
    const c = jest.fn();
    datos.escucharCambios(c);
    expect(canales).toHaveLength(1);
    canales[0].emitir();
    expect(c).toHaveBeenCalledTimes(1);
  });

  test('si el canal se cae y vuelve, avisa a todos (lo del corte no llegó); la primera conexión no', () => {
    const { cliente, canales } = clienteFalso();
    const datos = crearDatosSupabase(cliente);
    const a = jest.fn();
    const b = jest.fn();
    datos.escucharCambios(a);
    datos.escucharCambios(b);
    canales[0].estado('SUBSCRIBED');
    expect(a).not.toHaveBeenCalled();
    canales[0].estado('CHANNEL_ERROR');
    canales[0].estado('SUBSCRIBED');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    canales[0].estado('SUBSCRIBED');
    expect(a).toHaveBeenCalledTimes(1);
  });
});
