// Mes cerrado: el registro (DESIGN.md). `superficie`, borde `medida.bordeFuerte` en `cerrado`, radio
// `radio.registro`, sin imán. Cabecera con candado, «Cierre de septiembre» y quién y cuándo cerró, con
// una línea discontinua debajo; renglones con separador punteado: total, por persona (puso · le tocaba)
// y transferencias. Cada renglón se lee como un solo dato.
import type { ReactNode } from 'react';

import { normalizarTimestamp } from '@/datos/fechas';
import { formatear, formatearPorcentaje } from '@/logica/dinero';
import { fechaLarga, hoy, nombreMes } from '@/logica/meses';
import type { Cierre, Integrante } from '@/logica/tipos';

import estilos from './Registro.module.css';
import { textoTransferencia } from './Reparto';
import { Icono } from '../Icono';
import { Monto } from '../Monto';

const dos = (n: number) => String(n).padStart(2, '0');

/** «Cerrado el 01/10/2026 a las 20:15 por Ana», en hora local. */
export function textoCierre(cierre: Pick<Cierre, 'fecha' | 'cerrado_por'>, integrantes: Pick<Integrante, 'id' | 'nombre'>[]): string {
  const cuando = new Date(normalizarTimestamp(cierre.fecha));
  const quien = integrantes.find((i) => i.id === cierre.cerrado_por)?.nombre;
  const fecha = Number.isNaN(cuando.getTime())
    ? 'Cerrado'
    : `Cerrado el ${fechaLarga(hoy(cuando))} a las ${dos(cuando.getHours())}:${dos(cuando.getMinutes())}`;
  return quien ? `${fecha} por ${quien}` : fecha;
}

export function Registro({ cierre, integrantes }: { cierre: Cierre; integrantes: Integrante[] }) {
  const { filas, transferencias } = cierre.detalle;
  const nombres = new Map(filas.map((f) => [f.id, f.nombre]));
  return (
    <section className={estilos.registro}>
      <div className={estilos.cabecera}>
        <span className={estilos.candado}>
          <Icono nombre="candado" tamano={20} />
        </span>
        <div className={estilos.cabeceraTexto}>
          <h2 className={estilos.titulo}>{`Cierre de ${nombreMes(cierre.mes).split(' ')[0]}`}</h2>
          <p className={estilos.sub}>{textoCierre(cierre, integrantes)}</p>
        </div>
      </div>
      <div className={estilos.cuerpo}>
        <div role="list" className={estilos.renglones}>
          <Renglon etiqueta={`Total del mes: ${formatear(cierre.total)}`} primero>
            <span className={estilos.fuerte}>Total del mes</span>
            <Monto centavos={cierre.total} tamano="fila" className={estilos.monto} />
          </Renglon>

          {filas.length ? <Rotulo texto="Por persona" /> : null}
          {filas.map((f, i) => {
            const quien = `${f.nombre} (${f.participa ? formatearPorcentaje(f.peso) : 'no participa'})`;
            const tocaba = f.participa ? `, le tocaba ${formatear(f.leCorresponde)}` : '';
            return (
              <Renglon key={f.id} etiqueta={`${quien}: puso ${formatear(f.pago)}${tocaba}`} primero={i === 0}>
                <span className={estilos.nombre}>{quien}</span>
                <span className={estilos.pares}>
                  <Par texto="puso" centavos={f.pago} />
                  {f.participa ? <Par texto="le tocaba" centavos={f.leCorresponde} /> : null}
                </span>
              </Renglon>
            );
          })}

          <Rotulo texto="Transferencias" />
          {transferencias.length ? (
            transferencias.map((t, i) => (
              <Renglon key={`${t.de}-${t.a}`} etiqueta={`${textoTransferencia(t, nombres)}: ${formatear(t.monto)}`} primero={i === 0}>
                <span className={estilos.nombre}>{textoTransferencia(t, nombres)}</span>
                <Monto centavos={t.monto} tamano="fila" className={estilos.monto} />
              </Renglon>
            ))
          ) : (
            <Renglon etiqueta="Quedaron todos al día." primero>
              <span>Quedaron todos al día.</span>
            </Renglon>
          )}
        </div>
      </div>
    </section>
  );
}

type PropsRenglon = { etiqueta: string; primero?: boolean; children: ReactNode };

function Renglon({ etiqueta, primero = false, children }: PropsRenglon) {
  return (
    <div role="listitem" aria-label={etiqueta} className={[estilos.renglon, !primero && estilos.separador].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

function Par({ texto, centavos }: { texto: string; centavos: number }) {
  return (
    <span className={estilos.par}>
      {`${texto} `}
      <span className={['tabular', estilos.montoPar].join(' ')}>{formatear(centavos)}</span>
    </span>
  );
}

/** Rótulo del registro: mayúsculas con `letra.rastroRotulo`, solo acá (DESIGN.md, Tipografía). */
function Rotulo({ texto }: { texto: string }) {
  return <h3 className={estilos.rotulo}>{texto}</h3>;
}
