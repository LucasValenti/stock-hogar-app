// Pasar lo leído de un comprobante al formulario de Cargar. Lógica pura, sin DOM.
import { avisoLectura, integrantePorNombre, normalizarNombre } from './comprobante';
import type { AvisoLectura, DatosComprobante } from './comprobante';
import { centavosATexto } from './dinero';

// Solo lo que cambia en el formulario; lo que falta se deja como estaba.
export type CambiosLectura = {
  monto?: string;
  /** 'AAAA-MM-DD'. */
  fecha?: string;
  pagadoPor?: string;
  nota?: string;
  comprobante: { operacion: string | null; destino: string | null } | null;
  aviso: AvisoLectura;
};

export function lecturaAFormulario(
  r: DatosComprobante,
  integrantes: { id: string; nombre: string }[],
  notaActual: string,
): CambiosLectura {
  const aviso = avisoLectura(r);
  // Si no se leyó nada, el formulario (y lo que viaja con el gasto) queda como estaba.
  if (aviso.tipo === 'nada') return { comprobante: null, aviso };
  const cambios: CambiosLectura = {
    comprobante: { operacion: r.operacion ?? null, destino: r.destino ? normalizarNombre(r.destino) : null },
    aviso,
  };
  if (r.fecha) cambios.fecha = r.fecha;
  if (r.centavos) cambios.monto = centavosATexto(r.centavos);
  const pagador = integrantePorNombre(r.origen, integrantes);
  if (pagador) cambios.pagadoPor = pagador;
  if (r.destino && !notaActual.trim()) cambios.nota = r.destino;
  return cambios;
}

// El comprobante ya está cargado: vaciar el borrador (guardarlo crearía el gasto dos veces).
export function sinRepetido(c: CambiosLectura): CambiosLectura {
  return { ...c, monto: '', nota: '', comprobante: null };
}
