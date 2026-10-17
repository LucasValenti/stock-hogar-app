// Mes cerrado: el registro (DESIGN.md). `superficie`, borde `medida.bordeFuerte` en `cerrado`, radio
// `radio.registro`, sin imán. Cabecera con candado, «Cierre de septiembre» y quién y cuándo cerró, con
// una línea discontinua debajo; renglones con separador punteado: total, por persona (puso · le tocaba)
// y transferencias. Cada renglón se lee como un solo dato.

import type { ReactNode } from 'react';
import { View } from 'react-native';

import { normalizarTimestamp } from '@/datos/fechas';
import { formatear, formatearPorcentaje } from '@/logica/dinero';
import { fechaLarga, hoy, nombreMes } from '@/logica/meses';
import type { Cierre, Integrante } from '@/logica/tipos';
import { useTema } from '@/tema/tema';

import { Icono } from '../Icono';
import { Monto } from '../Monto';
import { Texto } from '../Texto';
import { textoTransferencia } from './Reparto';

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
  const tema = useTema();
  const { filas, transferencias } = cierre.detalle;
  const nombres = new Map(filas.map((f) => [f.id, f.nombre]));
  return (
    <View
      style={{
        backgroundColor: tema.color.superficie,
        borderWidth: tema.medida.bordeFuerte,
        borderColor: tema.color.cerrado,
        borderRadius: tema.radio.registro,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: tema.espacio.m,
          paddingVertical: tema.espacio.m,
          paddingHorizontal: tema.espacio.l,
          borderBottomWidth: tema.medida.bordeFuerte,
          borderBottomColor: tema.color.cerrado,
          borderStyle: 'dashed',
        }}
      >
        <Icono nombre="candado" tamano={tema.medida.icono} color={tema.color.cerrado} />
        <View style={{ flex: 1 }}>
          <Texto
            variante="tituloTarjeta"
            aria-level={2}
            style={{ fontSize: tema.tamano.l, lineHeight: tema.tamano.l * tema.letra.interlineadoTitulo }}
          >
            {`Cierre de ${nombreMes(cierre.mes).split(' ')[0]}`}
          </Texto>
          <Texto variante="sub">{textoCierre(cierre, integrantes)}</Texto>
        </View>
      </View>
      <View style={{ paddingTop: tema.espacio.s, paddingBottom: tema.espacio.m, paddingHorizontal: tema.espacio.l }}>
        <Renglon etiqueta={`Total del mes: ${formatear(cierre.total)}`} primero>
          <Texto variante="fuerte" style={{ flexShrink: 1 }}>
            Total del mes
          </Texto>
          <Monto centavos={cierre.total} tamano="fila" style={{ marginLeft: 'auto' }} />
        </Renglon>

        {filas.length ? <Rotulo texto="Por persona" /> : null}
        {filas.map((f, i) => {
          const quien = `${f.nombre} (${f.participa ? formatearPorcentaje(f.peso) : 'no participa'})`;
          const tocaba = f.participa ? `, le tocaba ${formatear(f.leCorresponde)}` : '';
          return (
            <Renglon key={f.id} etiqueta={`${quien}: puso ${formatear(f.pago)}${tocaba}`} primero={i === 0}>
              <Texto style={{ flexShrink: 1 }}>{quien}</Texto>
              <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
                <Par texto="puso" centavos={f.pago} />
                {f.participa ? <Par texto="le tocaba" centavos={f.leCorresponde} /> : null}
              </View>
            </Renglon>
          );
        })}

        <Rotulo texto="Transferencias" />
        {transferencias.length ? (
          transferencias.map((t, i) => (
            <Renglon key={`${t.de}-${t.a}`} etiqueta={`${textoTransferencia(t, nombres)}: ${formatear(t.monto)}`} primero={i === 0}>
              <Texto style={{ flexShrink: 1 }}>{textoTransferencia(t, nombres)}</Texto>
              <Monto centavos={t.monto} tamano="fila" style={{ marginLeft: 'auto' }} />
            </Renglon>
          ))
        ) : (
          <Renglon etiqueta="Quedaron todos al día." primero>
            <Texto>Quedaron todos al día.</Texto>
          </Renglon>
        )}
      </View>
    </View>
  );
}

function Renglon({ etiqueta, primero = false, children }: { etiqueta: string; primero?: boolean; children: ReactNode }) {
  const tema = useTema();
  return (
    <View
      accessible
      accessibilityLabel={etiqueta}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: tema.espacio.m,
        minHeight: tema.medida.tactil,
        paddingVertical: tema.espacio.xs,
        borderTopWidth: primero ? 0 : tema.medida.borde,
        borderTopColor: tema.color.borde,
        borderStyle: 'dotted',
      }}
    >
      {children}
    </View>
  );
}

function Par({ texto, centavos }: { texto: string; centavos: number }) {
  return (
    <Texto variante="sub">
      {`${texto} `}
      <Texto variante="subMedio" color="texto" style={{ fontVariant: ['tabular-nums'] }}>
        {formatear(centavos)}
      </Texto>
    </Texto>
  );
}

/** Rótulo del registro: mayúsculas con `letra.rastroRotulo`, solo acá (DESIGN.md, Tipografía). */
function Rotulo({ texto }: { texto: string }) {
  const tema = useTema();
  return (
    <Texto
      variante="rotulo"
      color="cerrado"
      accessibilityRole="header"
      aria-level={3}
      style={{ textTransform: 'uppercase', letterSpacing: tema.letra.rastroRotulo * tema.tamano.xs, paddingTop: tema.espacio.m }}
    >
      {texto}
    </Texto>
  );
}
