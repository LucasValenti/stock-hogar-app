// Cargar un gasto (modal sobre las pestañas). Un solo modo: monto, categoría, nota, fecha y quién pagó,
// más «Agregar producto»: una hoja con lo de Stock (lo que hay y lo que falta) y las anotaciones rápidas
// para tildar lo comprado, sin precios. Los tildados suben el stock y las anotaciones tildadas se borran,
// en la misma operación que guarda el gasto.
// Con `?id=` edita. Un gasto de un mes cerrado se ve bloqueado; uno viejo «por productos» (con precios)
// se ve en solo lectura y solo se puede borrar. Sin red, el gasto queda en el celu (cola de escritura)
// con su `nuevo_id`: aunque se reintente, la base lo guarda una sola vez.

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { useComprobante } from '@/comprobante/useComprobante';
import { datos } from '@/datos';
import { nuevoId } from '@/datos/id';
import type { GastoAGuardar } from '@/datos/tipos';
import { aCentavos, centavosATexto, formatear } from '@/logica/dinero';
import { mensajeError } from '@/logica/errores';
import { fechaDesdeTexto, fechaLarga, hoy, mesDe } from '@/logica/meses';
import { pagadoresDelMes } from '@/logica/reparto';
import { esPendiente, filtrarProductos, formatearCantidad, normalizar } from '@/logica/stock';
import type { Anotacion, Categoria, Gasto, GastoItem, Integrante, Producto, Tildado } from '@/logica/tipos';
import { admiteDecimales, validarCantidad, validarGasto, type ErroresGasto } from '@/logica/validar';
import { useSesion } from '@/sesion/sesion';
import { useTema } from '@/tema/tema';
import { Aviso } from '@/ui/Aviso';
import { AvisoCola } from '@/ui/AvisoCola';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Encabezado } from '@/ui/Encabezado';
import { Chip } from '@/ui/Chip';
import { Esqueleto } from '@/ui/Esqueleto';
import { EstadoVacio } from '@/ui/EstadoVacio';
import { Estado, Fila, Notita } from '@/ui/Fila';
import { Hoja } from '@/ui/Hoja';
import { Icono } from '@/ui/Icono';
import { Monto } from '@/ui/Monto';
import { Pantalla } from '@/ui/Pantalla';
import { Paso } from '@/ui/Paso';
import { Tarjeta } from '@/ui/Tarjeta';
import { Texto } from '@/ui/Texto';

type Existente = { gasto: Omit<Gasto, 'gasto_items'>; items: GastoItem[] };

type Base = {
  integrantes: Integrante[];
  categorias: Categoria[];
  productos: Producto[];
  anotaciones: Anotacion[];
  cerrados: Set<string>;
  existente: Existente | null;
};

type Carga = { estado: 'cargando' } | { estado: 'error'; error: unknown } | { estado: 'listo'; base: Base };

const AVISO_CERRADO = 'Este gasto es de un mes cerrado. Para cambiarlo, reabrí el mes desde Análisis.';

const volver = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** «Yerba × 2, Leche × 1,5 y Comprar pan». */
function enLista(partes: string[]): string {
  return partes.length < 2 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

export default function Cargar() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const idGasto = typeof id === 'string' && id ? id : null;
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCarga({ estado: 'cargando' });
    Promise.all([
      datos.integrantes(),
      datos.categorias(),
      datos.productos(),
      datos.anotaciones(),
      datos.mesesCerrados(),
      idGasto ? datos.gasto(idGasto) : Promise.resolve(null),
    ])
      .then(([integrantes, categorias, productos, anotaciones, cerrados, existente]) => {
        if (vigente) setCarga({ estado: 'listo', base: { integrantes, categorias, productos, anotaciones, cerrados, existente } });
      })
      .catch((error: unknown) => {
        if (vigente) setCarga({ estado: 'error', error });
      });
    return () => {
      vigente = false;
    };
  }, [idGasto, intento]);

  const titulo = idGasto ? 'Editar gasto' : 'Cargar gasto';
  if (carga.estado === 'cargando') {
    return (
      <Pantalla ocupado>
        <Encabezado titulo={titulo} alVolver={volver} />
        <Cargando />
      </Pantalla>
    );
  }
  if (carga.estado === 'error') {
    return (
      <Pantalla>
        <Encabezado titulo={titulo} alVolver={volver} />
        <Aviso
          alerta
          icono="nube"
          titulo="No pudimos traer los datos"
          texto={mensajeError(carga.error)}
          accion={{ texto: 'Reintentar', onPress: () => setIntento((n) => n + 1) }}
        />
      </Pantalla>
    );
  }
  const { existente } = carga.base;
  if (existente?.gasto.modo === 'productos') return <GastoPorProductos base={carga.base} existente={existente} />;
  return <Formulario base={carga.base} />;
}

// ——— Cargar o editar (por total, con tildados) ———

function Formulario({ base }: { base: Base }) {
  const tema = useTema();
  const { yo } = useSesion();
  const { integrantes, categorias, productos, anotaciones, cerrados, existente } = base;
  const g = existente?.gasto ?? null;
  const cerrado = g !== null && cerrados.has(mesDe(g.fecha));

  const [monto, setMonto] = useState(g ? centavosATexto(g.total) : '');
  const [categoriaId, setCategoriaId] = useState<string | null>(g?.categoria_id ?? null);
  const [nota, setNota] = useState(g?.nota ?? '');
  const [fecha, setFecha] = useState(fechaLarga(g?.fecha ?? hoy()));
  const [pagadoPor, setPagadoPor] = useState<string | null>(g?.pagado_por ?? yo?.id ?? null);
  // Producto tildado → cantidad como se tipea. Al editar, los tildados son los ítems sin precio.
  const [tildados, setTildados] = useState<Map<string, string>>(
    () =>
      new Map(
        (existente?.items ?? [])
          .filter((i) => i.precio_unitario === null)
          .map((i) => [i.producto_id, formatearCantidad(i.cantidad)] as const),
      ),
  );
  const [notas, setNotas] = useState<Set<string>>(() => new Set());
  const [errores, setErrores] = useState<ErroresGasto>({});
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [enCola, setEnCola] = useState(false);
  // Lo que viaja con el gasto si se cargó un comprobante: el n.º de operación y el destinatario (normalizado).
  const [comprobante, setComprobante] = useState<{ operacion: string | null; destino: string | null } | null>(null);
  const [hoja, setHoja] = useState<'categoria' | 'productos' | 'borrar' | null>(null);
  // El id del alta se elige una vez: si se reintenta (error o cola), la base no lo duplica.
  const idNuevo = useRef<string | null>(null);
  if (!g && idNuevo.current === null) idNuevo.current = nuevoId();

  const bloqueado = cerrado || enCola;
  const fechaIso = fechaDesdeTexto(fecha);
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  // Quién pudo pagar depende del mes de la fecha (altas, bajas y externos). Al editar, quien figura queda.
  const pagadores = useMemo(() => {
    const lista = pagadoresDelMes(integrantes, mesDe(fechaIso ?? g?.fecha ?? hoy()));
    const actual = g ? integrantes.find((i) => i.id === g.pagado_por) : undefined;
    return actual && !lista.some((p) => p.id === actual.id) ? [...lista, actual] : lista;
  }, [integrantes, fechaIso, g]);
  const pagador = pagadores.some((p) => p.id === pagadoPor) ? pagadoPor : null;

  const sinError = (campo: keyof ErroresGasto) =>
    setErrores((e) => {
      if (!e[campo]) return e;
      const resto = { ...e };
      delete resto[campo];
      return resto;
    });

  // Subir un comprobante solo en el alta: pasa lo leído al formulario y deja lo que viaja con el gasto.
  const lectura = useComprobante({
    integrantes,
    notaActual: () => nota,
    aplicar: (c, categoriaSugerida) => {
      if (c.monto !== undefined) {
        setMonto(c.monto);
        sinError('total');
      }
      if (c.fecha) {
        setFecha(fechaLarga(c.fecha));
        sinError('fecha');
      }
      if (c.pagadoPor) {
        setPagadoPor(c.pagadoPor);
        sinError('pagado_por');
      }
      if (c.nota !== undefined) setNota(c.nota);
      if (categoriaSugerida) {
        setCategoriaId(categoriaSugerida);
        sinError('categoria_id');
      }
      setComprobante(c.comprobante);
    },
  });

  async function guardar() {
    setErrorGuardar(null);
    let errorTildados: string | null = null;
    const listos: Tildado[] = [];
    for (const [productoId, texto] of tildados) {
      const p = porId.get(productoId);
      if (!p) {
        errorTildados = 'Hay un producto tildado que ya no existe.';
        break;
      }
      const r = validarCantidad(p.unidad, texto);
      if (!r.ok) {
        errorTildados = `${p.nombre}: ${r.error}`;
        break;
      }
      listos.push({ producto_id: productoId, cantidad: r.valor });
    }
    const r = validarGasto(
      { fecha: fechaIso ?? '', pagado_por: pagador, modo: 'total', total: aCentavos(monto), categoria_id: categoriaId, tildados: listos },
      { mesesCerrados: cerrados, productos },
    );
    const todos: ErroresGasto = errorTildados ? { ...r.errores, tildados: errorTildados } : r.errores;
    setErrores(todos);
    if (Object.keys(todos).length) return;

    const gasto: GastoAGuardar = {
      ...(g ? { id: g.id } : { nuevo_id: idNuevo.current }),
      fecha: fechaIso as string,
      pagado_por: pagador as string,
      total: r.total,
      modo: 'total',
      categoria_id: categoriaId,
      nota: nota.trim() || null,
      ...(comprobante ? { mp_operacion: comprobante.operacion, destino: comprobante.destino } : {}),
      tildados: listos,
      anotaciones: [...notas],
    };
    setGuardando(true);
    try {
      const res = await datos.guardarGasto(gasto, []);
      if (res.estado === 'en-cola') {
        setEnCola(true);
      } else {
        volver();
      }
    } catch (e) {
      setErrorGuardar(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  }

  const categoria = categorias.find((c) => c.id === categoriaId);
  const elegidos = [
    ...[...tildados].map(([pid, cant]) => `${porId.get(pid)?.nombre ?? 'Producto'} × ${cant}`),
    ...anotaciones.filter((a) => notas.has(a.id)).map((a) => a.texto),
  ];
  const cuantos = tildados.size + notas.size;

  return (
    <Pantalla>
      <Encabezado titulo={g ? 'Editar gasto' : 'Cargar gasto'} alVolver={volver} />
      {/* En cola, la tarjeta de abajo ya dice que espera: el aviso de la cola no lo repite, pero sigue
          mostrando los gastos que la base rechazó. */}
      <AvisoCola soloRechazadas={enCola} />
      {cerrado ? <AvisoCerrado /> : null}

      {!g && !enCola ? (
        <View style={{ gap: tema.espacio.s }}>
          <Boton texto="Subir comprobante" variante="borde" icono="nota" ocupado={lectura.leyendo} onPress={() => void lectura.elegir()} />
          {lectura.leyendo ? (
            <Texto variante="sub" accessibilityLiveRegion="polite">
              Leyendo el comprobante…
            </Texto>
          ) : null}
          {lectura.aviso ? (
            <Texto variante="sub" accessibilityRole="alert" accessibilityLiveRegion="polite">
              {lectura.aviso}
            </Texto>
          ) : null}
        </View>
      ) : null}

      <Campo
        etiqueta="Monto"
        grande
        teclado="decimal-pad"
        placeholder="0"
        valor={monto}
        alCambiar={(t) => {
          setMonto(t);
          sinError('total');
        }}
        error={errores.total}
        bloqueado={bloqueado}
      />

      <View style={{ gap: tema.espacio.xs }}>
        <Texto variante="rotulo">Categoría</Texto>
        <View style={{ flexDirection: 'row' }}>
          <Chip
            texto={categoria?.nombre ?? 'Elegí una'}
            accessibilityLabel={`Categoría: ${categoria?.nombre ?? 'Elegí una'}`}
            flecha
            bloqueado={bloqueado}
            onPress={() => setHoja('categoria')}
          />
        </View>
        <ErrorCampo texto={errores.categoria_id} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tema.espacio.s }}>
        <View style={{ flexGrow: 1, flexBasis: tema.medida.fila * 2 }}>
          <Campo etiqueta="Nota" ayuda="Opcional" valor={nota} alCambiar={setNota} bloqueado={bloqueado} />
        </View>
        <View style={{ flexGrow: 1, flexBasis: tema.medida.fila * 2 }}>
          <Campo
            etiqueta="Fecha"
            ayuda="Día/mes/año"
            teclado="numbers-and-punctuation"
            valor={fecha}
            alCambiar={(t) => {
              setFecha(t);
              sinError('fecha');
            }}
            error={errores.fecha}
            bloqueado={bloqueado}
          />
        </View>
      </View>

      <View style={{ gap: tema.espacio.xs }}>
        <Texto variante="rotulo" nativeID="pago">
          Pagó
        </Texto>
        <View accessibilityRole="radiogroup" aria-labelledby="pago" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tema.espacio.s }}>
          {pagadores.map((p) => (
            <Chip
              key={p.id}
              texto={p.nombre}
              activo={p.id === pagador}
              bloqueado={bloqueado}
              onPress={() => {
                setPagadoPor(p.id);
                sinError('pagado_por');
              }}
            />
          ))}
        </View>
        <ErrorCampo texto={errores.pagado_por} />
      </View>

      <View style={{ gap: tema.espacio.s }}>
        {!bloqueado ? <Boton texto="Agregar producto" variante="borde" icono="mas" onPress={() => setHoja('productos')} /> : null}
        {elegidos.length ? <Texto variante="sub">{`En este gasto: ${enLista(elegidos)}.`}</Texto> : null}
        <ErrorCampo texto={errores.tildados} />
      </View>

      {enCola ? (
        <Tarjeta>
          <Texto accessibilityRole="alert" accessibilityLiveRegion="polite">
            Guardado en el celu: se manda cuando vuelva la conexión.
          </Texto>
          <Boton texto="Listo" onPress={volver} />
        </Tarjeta>
      ) : !cerrado ? (
        <View style={{ gap: tema.espacio.s }}>
          <ErrorCampo texto={errorGuardar} />
          <Boton texto={g ? 'Guardar cambios' : 'Guardar gasto'} ocupado={guardando} onPress={() => void guardar()} />
          {g ? <Boton texto="Borrar gasto" variante="borde" onPress={() => setHoja('borrar')} /> : null}
        </View>
      ) : null}

      <Hoja visible={hoja === 'categoria'} titulo="Categoría" alCerrar={() => setHoja(null)}>
        {categorias.length ? (
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tema.espacio.s }}>
            {categorias.map((c) => (
              <Chip
                key={c.id}
                texto={c.nombre}
                activo={c.id === categoriaId}
                onPress={() => {
                  setCategoriaId(c.id);
                  sinError('categoria_id');
                  setHoja(null);
                }}
              />
            ))}
          </View>
        ) : (
          <EstadoVacio icono="nota" titulo="No hay categorías" texto="Creá una en Ajustes y aparece acá." />
        )}
      </Hoja>

      <HojaProductos
        visible={hoja === 'productos'}
        alCerrar={() => setHoja(null)}
        productos={productos}
        anotaciones={anotaciones}
        tildados={tildados}
        notas={notas}
        cuantos={cuantos}
        alCambiarTildados={(m) => {
          setTildados(m);
          sinError('tildados');
        }}
        alCambiarNotas={setNotas}
      />

      {g ? <HojaBorrar visible={hoja === 'borrar'} id={g.id} alCerrar={() => setHoja(null)} /> : null}
    </Pantalla>
  );
}

// ——— La hoja «Agregar producto» ———

type PropsHojaProductos = {
  visible: boolean;
  alCerrar(): void;
  productos: Producto[];
  anotaciones: Anotacion[];
  tildados: Map<string, string>;
  notas: Set<string>;
  cuantos: number;
  alCambiarTildados(m: Map<string, string>): void;
  alCambiarNotas(s: Set<string>): void;
};

function HojaProductos({ visible, alCerrar, productos, anotaciones, tildados, notas, cuantos, alCambiarTildados, alCambiarNotas }: PropsHojaProductos) {
  const [busqueda, setBusqueda] = useState('');
  // Los ocultos no se ofrecen, salvo que el gasto ya los tenga tildados (así se pueden destildar).
  const lista = useMemo(() => {
    const visibles = productos.filter((p) => !p.oculto || tildados.has(p.id));
    return filtrarProductos(visibles, busqueda).sort(
      (a, b) => Number(esPendiente(b)) - Number(esPendiente(a)) || a.nombre.localeCompare(b.nombre, 'es'),
    );
  }, [productos, tildados, busqueda]);
  const buscado = normalizar(busqueda);
  const notasVisibles = anotaciones.filter((a) => normalizar(a.texto).includes(buscado));

  const tildar = (p: Producto) => {
    const m = new Map(tildados);
    if (m.has(p.id)) m.delete(p.id);
    else m.set(p.id, '1');
    alCambiarTildados(m);
  };
  const tildarNota = (a: Anotacion) => {
    const s = new Set(notas);
    if (s.has(a.id)) s.delete(a.id);
    else s.add(a.id);
    alCambiarNotas(s);
  };

  const vacio = !productos.length && !anotaciones.length;
  return (
    <Hoja
      visible={visible}
      titulo="Agregar producto"
      subtitulo="Tildá lo comprado: sube el stock y sale de pendientes."
      alCerrar={alCerrar}
      pie={<Boton texto={cuantos ? `Sumar ${cuantos} al gasto` : 'Listo'} onPress={alCerrar} />}
    >
      {vacio ? (
        <EstadoVacio icono="caja" titulo="Todavía no hay productos" texto="Sumalos desde Stock y aparecen acá para tildar." />
      ) : (
        <>
          <Campo etiqueta="Buscar en el stock" valor={busqueda} alCambiar={setBusqueda} />
          <View>
            {lista.map((p, i) => {
              const estado = esPendiente(p) ? 'Falta' : `Hay ${formatearCantidad(p.stock)}`;
              const cantidad = tildados.get(p.id);
              return (
                <Fila
                  key={p.id}
                  separador={i > 0}
                  nombre={p.nombre}
                  descripcion={estado}
                  detalle={<Estado tipo={esPendiente(p) ? 'falta' : 'hay'} texto={estado} />}
                  tildado={cantidad !== undefined}
                  alTildar={() => tildar(p)}
                  derecha={
                    cantidad !== undefined ? (
                      <Paso
                        nombre={p.nombre}
                        valor={cantidad}
                        decimales={admiteDecimales(p.unidad)}
                        alCambiar={(t) => alCambiarTildados(new Map(tildados).set(p.id, t))}
                      />
                    ) : undefined
                  }
                />
              );
            })}
            {notasVisibles.map((a, i) => (
              <Fila
                key={a.id}
                separador={i > 0 || lista.length > 0}
                nombre={a.texto}
                descripcion="Anotación rápida"
                detalle={<Notita texto="Anotación rápida" />}
                tildado={notas.has(a.id)}
                alTildar={() => tildarNota(a)}
              />
            ))}
          </View>
          {!lista.length && !notasVisibles.length ? (
            <EstadoVacio icono="lupa" titulo="No está en Stock" texto="Probá con otro nombre, o sumalo desde Stock." />
          ) : null}
        </>
      )}
    </Hoja>
  );
}

// ——— Gasto viejo por productos: solo lectura ———

function GastoPorProductos({ base, existente }: { base: Base; existente: Existente }) {
  const tema = useTema();
  const { gasto: g, items } = existente;
  const cerrado = base.cerrados.has(mesDe(g.fecha));
  const [borrar, setBorrar] = useState(false);
  const nombreDe = (id: string) => base.productos.find((p) => p.id === id)?.nombre ?? 'Producto';
  const quien = base.integrantes.find((i) => i.id === g.pagado_por)?.nombre ?? 'Alguien que ya no está';

  return (
    <Pantalla>
      <Encabezado titulo="Gasto" alVolver={volver} />
      <AvisoCola />
      {cerrado ? <AvisoCerrado /> : null}
      <Tarjeta>
        <Texto>
          Este gasto se cargó por productos, con precios. Se puede ver o borrar; para cambiarlo, borralo y cargalo de nuevo.
        </Texto>
      </Tarjeta>
      <Tarjeta style={{ paddingVertical: 0, gap: 0 }}>
        {items.map((it, i) => (
          <Fila
            key={it.id}
            separador={i > 0}
            nombre={nombreDe(it.producto_id)}
            detalle={<Texto variante="sub">{`${formatearCantidad(it.cantidad)} × ${formatear(it.precio_unitario ?? 0)}`}</Texto>}
            derecha={<Monto centavos={Math.round(it.cantidad * (it.precio_unitario ?? 0))} tamano="fila" />}
          />
        ))}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: tema.medida.fila,
            borderTopWidth: tema.medida.borde,
            borderTopColor: tema.color.borde,
          }}
        >
          <Texto variante="fuerte">Total</Texto>
          <Monto centavos={g.total} tamano="fila" />
        </View>
      </Tarjeta>
      <Tarjeta>
        <Texto>{`Fecha: ${fechaLarga(g.fecha)}`}</Texto>
        <Texto>{`Pagó: ${quien}`}</Texto>
        {g.nota ? <Texto>{`Nota: ${g.nota}`}</Texto> : null}
      </Tarjeta>
      {!cerrado ? <Boton texto="Borrar gasto" variante="borde" onPress={() => setBorrar(true)} /> : null}
      <HojaBorrar visible={borrar} id={g.id} alCerrar={() => setBorrar(false)} />
    </Pantalla>
  );
}

// ——— Piezas ———

function HojaBorrar({ visible, id, alCerrar }: { visible: boolean; id: string; alCerrar(): void }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const borrar = useCallback(async () => {
    setOcupado(true);
    setError(null);
    try {
      await datos.borrarGasto(id);
      alCerrar();
      volver();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  }, [id, alCerrar]);
  return (
    <Hoja
      visible={visible}
      titulo="¿Borrar este gasto?"
      subtitulo="Si tenía productos, también se descuentan del stock."
      alCerrar={alCerrar}
      pie={
        <>
          <ErrorCampo texto={error} />
          <Boton texto="Borrar" ocupado={ocupado} onPress={() => void borrar()} />
          <Boton texto="Cancelar" variante="borde" onPress={alCerrar} />
        </>
      }
    />
  );
}

function AvisoCerrado() {
  const tema = useTema();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: tema.espacio.s,
        padding: tema.espacio.m,
        borderWidth: tema.medida.bordeFuerte,
        borderColor: tema.color.cerrado,
        borderRadius: tema.radio.registro,
        backgroundColor: tema.color.superficie,
      }}
    >
      <Icono nombre="candado" tamano={tema.medida.icono} color={tema.color.cerrado} />
      <Texto style={{ flexShrink: 1 }}>{AVISO_CERRADO}</Texto>
    </View>
  );
}

function ErrorCampo({ texto }: { texto?: string | null }) {
  if (!texto) return null;
  return (
    <Texto variante="sub" color="falta" accessibilityRole="alert" accessibilityLiveRegion="polite">
      {texto}
    </Texto>
  );
}

function Cargando() {
  const tema = useTema();
  return (
    <>
      <Esqueleto alto={tema.tamano.xxxl} />
      <Esqueleto ancho="40%" alto={tema.medida.tactil} />
      <Esqueleto alto={tema.medida.tactil} />
      <Esqueleto ancho="70%" alto={tema.medida.tactil} />
      <Texto variante="sub" centrado accessibilityLiveRegion="polite">
        Trayendo los datos de la casa…
      </Texto>
    </>
  );
}
