// Cargar un gasto (pantalla sobre las pestañas). Un solo modo: monto, categoría, nota, fecha y quién pagó,
// más «Agregar producto»: una hoja con lo de Stock (lo que hay y lo que falta) y las anotaciones rápidas
// para tildar lo comprado, sin precios. Los tildados suben el stock y las anotaciones tildadas se borran,
// en la misma operación que guarda el gasto.
// Con `?id=` edita. Un gasto de un mes cerrado se ve bloqueado; uno viejo «por productos» (con precios)
// se ve en solo lectura y solo se puede borrar. Sin red, el gasto queda en el celu (cola de escritura)
// con su `nuevo_id`: aunque se reintente, la base lo guarda una sola vez.
import { volver } from '@/ui/volver';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';

import { tomarPendiente } from '@/comprobante/useCompartidoPendiente';
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
import { Aviso } from '@/ui/Aviso';
import { AvisoCola } from '@/ui/AvisoCola';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Chip } from '@/ui/Chip';
import { Encabezado } from '@/ui/Encabezado';
import { Esqueleto } from '@/ui/Esqueleto';
import { EstadoVacio } from '@/ui/EstadoVacio';
import { Estado, Fila, Notita } from '@/ui/Fila';
import { Hoja } from '@/ui/Hoja';
import { Icono } from '@/ui/Icono';
import { MensajeError } from '@/ui/MensajeError';
import { Monto } from '@/ui/Monto';
import { Pantalla } from '@/ui/Pantalla';
import { Paso } from '@/ui/Paso';
import { Tarjeta } from '@/ui/Tarjeta';

import estilos from './Cargar.module.css';

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

/** «Yerba × 2, Leche × 1,5 y Comprar pan». */
function enLista(partes: string[]): string {
  return partes.length < 2 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

export function Cargar() {
  const [, navegar] = useLocation();
  const busqueda = useSearch();
  const { id, compartido } = useMemo(() => {
    const parametros = new URLSearchParams(busqueda);
    return { id: parametros.get('id'), compartido: parametros.get('compartido') };
  }, [busqueda]);
  const idGasto = id ? id : null;
  const esCompartido = compartido === '1';
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' });
  const [intento, setIntento] = useState(0);

  const alVolver = useCallback(() => volver(navegar), [navegar]);

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
        <Encabezado titulo={titulo} alVolver={alVolver} />
        <Cargando />
      </Pantalla>
    );
  }
  if (carga.estado === 'error') {
    return (
      <Pantalla>
        <Encabezado titulo={titulo} alVolver={alVolver} />
        <Aviso
          alerta
          icono="nube"
          titulo="No pudimos traer los datos"
          texto={mensajeError(carga.error)}
          accion={{ texto: 'Reintentar', onClick: () => setIntento((n) => n + 1) }}
        />
      </Pantalla>
    );
  }
  const { existente } = carga.base;
  if (existente?.gasto.modo === 'productos') {
    return <GastoPorProductos base={carga.base} existente={existente} alVolver={alVolver} />;
  }
  return <Formulario base={carga.base} compartido={esCompartido} alVolver={alVolver} />;
}

// ——— Cargar o editar (por total, con tildados) ———

type PropsFormulario = { base: Base; compartido: boolean; alVolver(): void };

function Formulario({ base, compartido, alVolver }: PropsFormulario) {
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
  const archivo = useRef<HTMLInputElement>(null);

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

  // Un comprobante que llegó compartido desde otra app: se lee una sola vez, solo en el alta.
  const { usar } = lectura;
  const yaTomoCompartido = useRef(false);
  useEffect(() => {
    if (!compartido || g || yaTomoCompartido.current) return;
    yaTomoCompartido.current = true;
    const a = tomarPendiente();
    if (a) void usar(a.uri, a.bytes, a.tipo);
  }, [compartido, g, usar]);

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
        alVolver();
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
      <Encabezado titulo={g ? 'Editar gasto' : 'Cargar gasto'} alVolver={alVolver} />
      {/* En cola, la tarjeta de abajo ya dice que espera: el aviso de la cola no lo repite, pero sigue
          mostrando los gastos que la base rechazó. */}
      <AvisoCola soloRechazadas={enCola} />
      {cerrado ? <AvisoCerrado /> : null}

      {!g && !enCola ? (
        <div className={estilos.grupo}>
          <input
            ref={archivo}
            type="file"
            accept="image/*,application/pdf"
            aria-label="Subir comprobante"
            className="solo-lectores"
            onChange={(e) => {
              const elegido = e.target.files?.[0];
              e.target.value = '';
              if (elegido) void lectura.elegir(elegido);
            }}
          />
          <Boton
            texto="Subir comprobante"
            variante="borde"
            icono="nota"
            ocupado={lectura.leyendo}
            onClick={() => archivo.current?.click()}
          />
          {lectura.leyendo ? (
            <p className={estilos.sub} aria-live="polite">
              Leyendo el comprobante…
            </p>
          ) : null}
          {lectura.aviso ? (
            <p className={estilos.sub} role="alert" aria-live="polite">
              {lectura.aviso}
            </p>
          ) : null}
        </div>
      ) : null}

      <Campo
        etiqueta="Monto"
        grande
        inputMode="decimal"
        placeholder="0"
        value={monto}
        onChange={(e) => {
          setMonto(e.target.value);
          sinError('total');
        }}
        error={errores.total}
        bloqueado={bloqueado}
      />

      <div className={estilos.grupoChico}>
        <p className={estilos.rotulo}>Categoría</p>
        <div className={estilos.chips}>
          <Chip
            texto={categoria?.nombre ?? 'Elegí una'}
            aria-label={`Categoría: ${categoria?.nombre ?? 'Elegí una'}`}
            flecha
            bloqueado={bloqueado}
            onClick={() => setHoja('categoria')}
          />
        </div>
        <MensajeError texto={errores.categoria_id} />
      </div>

      <div className={estilos.filaCampos}>
        <div className={estilos.campoMitad}>
          <Campo etiqueta="Nota" ayuda="Opcional" value={nota} onChange={(e) => setNota(e.target.value)} bloqueado={bloqueado} />
        </div>
        <div className={estilos.campoMitad}>
          <Campo
            etiqueta="Fecha"
            ayuda="Día/mes/año"
            inputMode="numeric"
            value={fecha}
            onChange={(e) => {
              setFecha(e.target.value);
              sinError('fecha');
            }}
            error={errores.fecha}
            bloqueado={bloqueado}
          />
        </div>
      </div>

      <div className={estilos.grupoChico}>
        <p id="pago" className={estilos.rotulo}>
          Pagó
        </p>
        <div role="radiogroup" aria-labelledby="pago" className={estilos.chips}>
          {pagadores.map((p) => (
            <Chip
              key={p.id}
              texto={p.nombre}
              activo={p.id === pagador}
              bloqueado={bloqueado}
              onClick={() => {
                setPagadoPor(p.id);
                sinError('pagado_por');
              }}
            />
          ))}
        </div>
        <MensajeError texto={errores.pagado_por} />
      </div>

      <div className={estilos.grupo}>
        {!bloqueado ? <Boton texto="Agregar producto" variante="borde" icono="mas" onClick={() => setHoja('productos')} /> : null}
        {elegidos.length ? <p className={estilos.sub}>{`En este gasto: ${enLista(elegidos)}.`}</p> : null}
        <MensajeError texto={errores.tildados} />
      </div>

      {enCola ? (
        <Tarjeta className={estilos.grupo}>
          <p className={estilos.parrafo} role="alert" aria-live="polite">
            Guardado en el celu: se manda cuando vuelva la conexión.
          </p>
          <Boton texto="Listo" onClick={alVolver} />
        </Tarjeta>
      ) : !cerrado ? (
        <div className={estilos.acciones}>
          <MensajeError texto={errorGuardar} />
          <Boton texto={g ? 'Guardar cambios' : 'Guardar gasto'} ocupado={guardando} onClick={() => void guardar()} />
          {g ? <Boton texto="Borrar gasto" variante="borde" onClick={() => setHoja('borrar')} /> : null}
        </div>
      ) : null}

      <Hoja visible={hoja === 'categoria'} titulo="Categoría" alCerrar={() => setHoja(null)}>
        {categorias.length ? (
          <div role="radiogroup" aria-label="Categoría" className={estilos.chips}>
            {categorias.map((c) => (
              <Chip
                key={c.id}
                texto={c.nombre}
                activo={c.id === categoriaId}
                onClick={() => {
                  setCategoriaId(c.id);
                  sinError('categoria_id');
                  setHoja(null);
                }}
              />
            ))}
          </div>
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

      {g ? <HojaBorrar visible={hoja === 'borrar'} id={g.id} alCerrar={() => setHoja(null)} alVolver={alVolver} /> : null}
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
      pie={<Boton texto={cuantos ? `Sumar ${cuantos} al gasto` : 'Listo'} onClick={alCerrar} />}
    >
      {vacio ? (
        <EstadoVacio icono="caja" titulo="Todavía no hay productos" texto="Sumalos desde Stock y aparecen acá para tildar." />
      ) : (
        <>
          <Campo etiqueta="Buscar en el stock" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <div>
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
          </div>
          {!lista.length && !notasVisibles.length ? (
            <EstadoVacio icono="lupa" titulo="No está en Stock" texto="Probá con otro nombre, o sumalo desde Stock." />
          ) : null}
        </>
      )}
    </Hoja>
  );
}

// ——— Gasto viejo por productos: solo lectura ———

type PropsProductos = { base: Base; existente: Existente; alVolver(): void };

function GastoPorProductos({ base, existente, alVolver }: PropsProductos) {
  const { gasto: g, items } = existente;
  const cerrado = base.cerrados.has(mesDe(g.fecha));
  const [borrar, setBorrar] = useState(false);
  const nombreDe = (id: string) => base.productos.find((p) => p.id === id)?.nombre ?? 'Producto';
  const quien = base.integrantes.find((i) => i.id === g.pagado_por)?.nombre ?? 'Alguien que ya no está';

  return (
    <Pantalla>
      <Encabezado titulo="Gasto" alVolver={alVolver} />
      <AvisoCola />
      {cerrado ? <AvisoCerrado /> : null}
      <Tarjeta>
        <p className={estilos.parrafo}>
          Este gasto se cargó por productos, con precios. Se puede ver o borrar; para cambiarlo, borralo y cargalo de nuevo.
        </p>
      </Tarjeta>
      <Tarjeta className={estilos.lista}>
        {items.map((it, i) => (
          <Fila
            key={it.id}
            separador={i > 0}
            nombre={nombreDe(it.producto_id)}
            detalle={<span className={estilos.sub}>{`${formatearCantidad(it.cantidad)} × ${formatear(it.precio_unitario ?? 0)}`}</span>}
            derecha={<Monto centavos={Math.round(it.cantidad * (it.precio_unitario ?? 0))} tamano="fila" />}
          />
        ))}
        <div className={estilos.total}>
          <p className={estilos.fuerte}>Total</p>
          <Monto centavos={g.total} tamano="fila" />
        </div>
      </Tarjeta>
      <Tarjeta className={estilos.datos}>
        <p className={estilos.parrafo}>{`Fecha: ${fechaLarga(g.fecha)}`}</p>
        <p className={estilos.parrafo}>{`Pagó: ${quien}`}</p>
        {g.nota ? <p className={estilos.parrafo}>{`Nota: ${g.nota}`}</p> : null}
      </Tarjeta>
      {!cerrado ? <Boton texto="Borrar gasto" variante="borde" onClick={() => setBorrar(true)} /> : null}
      <HojaBorrar visible={borrar} id={g.id} alCerrar={() => setBorrar(false)} alVolver={alVolver} />
    </Pantalla>
  );
}

// ——— Piezas ———

type PropsBorrar = { visible: boolean; id: string; alCerrar(): void; alVolver(): void };

function HojaBorrar({ visible, id, alCerrar, alVolver }: PropsBorrar) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const borrar = useCallback(async () => {
    setOcupado(true);
    setError(null);
    try {
      await datos.borrarGasto(id);
      alCerrar();
      alVolver();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  }, [id, alCerrar, alVolver]);
  return (
    <Hoja
      visible={visible}
      titulo="¿Borrar este gasto?"
      subtitulo="Si tenía productos, también se descuentan del stock."
      alCerrar={alCerrar}
      pie={
        <>
          <MensajeError texto={error} />
          <Boton texto="Borrar" ocupado={ocupado} onClick={() => void borrar()} />
          <Boton texto="Cancelar" variante="borde" onClick={alCerrar} />
        </>
      }
    />
  );
}

function AvisoCerrado() {
  return (
    <div className={estilos.cerrado}>
      <span className={estilos.iconoCerrado}>
        <Icono nombre="candado" tamano={20} />
      </span>
      <p className={estilos.textoCerrado}>{AVISO_CERRADO}</p>
    </div>
  );
}

function Cargando() {
  return (
    <>
      <Esqueleto alto={40} />
      <Esqueleto ancho="40%" alto={48} />
      <Esqueleto alto={48} />
      <Esqueleto ancho="70%" alto={48} />
      <p className={estilos.centrado} aria-live="polite">
        Trayendo los datos de la casa…
      </p>
    </>
  );
}
