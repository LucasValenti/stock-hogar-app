// Stock: pestañas Todo · Pendientes N · Ocultos, buscador por nombre o marca (se limpia en cada visita),
// anotaciones rápidas («Anotá algo que falta») y la lista por categoría con − / + (deltaMenos: 2,5 kg → 2).
// El número cambia al instante y la base confirma; si falla (sin conexión), vuelve a lo que era y se avisa
// en la fila. Tocar el número deja escribir la cantidad exacta según la unidad. En Pendientes, lo que se
// tocó en esta visita no desaparece bajo el dedo. El nombre abre la ficha; las notas, su hoja.
// `?vista=pendientes` abre esa pestaña (el aviso de Inicio).

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { datos } from '@/datos';
import { mensajeError } from '@/logica/errores';
import {
  agruparPorCategoria,
  aplicarDelta,
  cantidadConUnidad,
  deltaMenos,
  esPendiente,
  formatearCantidad,
  normalizar,
  ocultos,
  pendientesConAnotaciones,
  productosVisibles,
  type VistaStock,
} from '@/logica/stock';
import type { Anotacion, Categoria, Producto } from '@/logica/tipos';
import { admiteDecimales, validarAnotacion, validarCantidad } from '@/logica/validar';
import { FAMILIAS } from '@/tema/fuentes';
import { useTema } from '@/tema/tema';
import { Aviso } from '@/ui/Aviso';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Esqueleto } from '@/ui/Esqueleto';
import { anilloDeFoco, useFoco } from '@/ui/estilos';
import { Estado, Fila, Notita } from '@/ui/Fila';
import { MensajeError } from '@/ui/FormularioProducto';
import { Hoja } from '@/ui/Hoja';
import { Pantalla } from '@/ui/Pantalla';
import { PestanasInternas } from '@/ui/PestanasInternas';
import { Tarjeta } from '@/ui/Tarjeta';
import { Texto } from '@/ui/Texto';

type Base = { productos: Producto[]; categorias: Categoria[]; anotaciones: Anotacion[] };
type Carga = { estado: 'cargando' } | { estado: 'error'; error: unknown } | { estado: 'listo' };

const VISTAS: VistaStock[] = ['todo', 'pendientes', 'ocultos'];
const vistaDe = (v: unknown): VistaStock => VISTAS.find((x) => x === v) ?? 'todo';
const conMarca = (p: Pick<Producto, 'nombre' | 'marca'>) => (p.marca ? `${p.nombre} · ${p.marca}` : p.nombre);
const redondear = (n: number) => Math.round(n * 1000) / 1000;
const textoNotita = (a: Anotacion) => `Anotado: ${a.texto} · tocalo para hacerlo producto`;

export default function Stock() {
  const tema = useTema();
  const { vista: vistaPedida } = useLocalSearchParams<{ vista?: string }>();
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' });
  const [base, setBase] = useState<Base>({ productos: [], categorias: [], anotaciones: [] });
  const [vista, setVista] = useState<VistaStock>(vistaDe(vistaPedida));
  const [busqueda, setBusqueda] = useState('');
  const [tocados, setTocados] = useState<Set<string>>(() => new Set());
  const [erroresFila, setErroresFila] = useState<Record<string, string>>({});
  const [nota, setNota] = useState('');
  const [errorNota, setErrorNota] = useState<string | null>(null);
  const [anotando, setAnotando] = useState(false);
  const [hojaNota, setHojaNota] = useState<Anotacion | null>(null);
  const [hojaCantidad, setHojaCantidad] = useState<Producto | null>(null);

  // Lo último que se ve, para leerlo sin esperar a un render (toques seguidos).
  const productosRef = useRef<Producto[]>([]);
  // Por producto: pedidos sin respuesta (mientras haya, manda lo que ve la persona), el número del
  // último pedido y la respuesta del pedido más nuevo que ya volvió (si llegan desordenadas, gana esa).
  const enVuelo = useRef(new Map<string, number>());
  const ultimoPedido = useRef(new Map<string, number>());
  const mejorRespuesta = useRef(new Map<string, { pedido: number; real: number }>());
  // Cada recarga toma un turno: una respuesta vieja no pisa una más nueva.
  const turno = useRef(0);

  const ponerStock = useCallback((id: string, stock: number) => {
    productosRef.current = productosRef.current.map((p) => (p.id === id ? { ...p, stock } : p));
    const productos = productosRef.current;
    setBase((b) => ({ ...b, productos }));
  }, []);

  const recargar = useCallback(async () => {
    const mio = ++turno.current;
    try {
      const [productos, categorias, anotaciones] = await Promise.all([datos.productos(), datos.categorias(), datos.anotaciones()]);
      if (mio !== turno.current) return;
      const vistos = new Map(productosRef.current.map((p) => [p.id, p.stock]));
      const finales = productos.map((p) => {
        const visto = vistos.get(p.id);
        return enVuelo.current.get(p.id) && visto !== undefined ? { ...p, stock: visto } : p;
      });
      productosRef.current = finales;
      setBase({ productos: finales, categorias, anotaciones });
      setCarga({ estado: 'listo' });
    } catch (error) {
      if (mio !== turno.current) return;
      // Si ya había datos, se quedan: el próximo cambio o la próxima visita vuelven a pedir.
      setCarga((c) => (c.estado === 'listo' ? c : { estado: 'error', error }));
    }
  }, []);

  // Cada visita: la pestaña que pide el enlace, el buscador vacío y datos frescos.
  useFocusEffect(
    useCallback(() => {
      setVista(vistaDe(vistaPedida));
      setBusqueda('');
      setTocados(new Set());
      void recargar();
    }, [vistaPedida, recargar]),
  );

  useEffect(() => datos.escucharCambios(() => void recargar()), [recargar]);

  function elegirVista(v: VistaStock) {
    setVista(v);
    setTocados(new Set());
    router.setParams({ vista: v });
  }

  function ajustar(id: string, delta: number) {
    const actual = productosRef.current.find((p) => p.id === id);
    if (!actual || delta === 0) return;
    const antes = Number(actual.stock);
    const despues = aplicarDelta(antes, delta);
    const aplicado = redondear(despues - antes);
    if (aplicado === 0) return;
    if (vista === 'pendientes') setTocados((t) => new Set(t).add(id));
    setErroresFila(({ [id]: _, ...resto }) => resto);
    ponerStock(id, despues);
    const pedido = (ultimoPedido.current.get(id) ?? 0) + 1;
    ultimoPedido.current.set(id, pedido);
    enVuelo.current.set(id, (enVuelo.current.get(id) ?? 0) + 1);
    const quedan = () => {
      const n = (enVuelo.current.get(id) ?? 1) - 1;
      enVuelo.current.set(id, n);
      return n;
    };
    datos.ajustarStock(id, delta).then(
      (real) => {
        const mejor = mejorRespuesta.current.get(id);
        if (!mejor || pedido > mejor.pedido) mejorRespuesta.current.set(id, { pedido, real });
        if (quedan() === 0) {
          const final = mejorRespuesta.current.get(id);
          mejorRespuesta.current.delete(id);
          if (final) ponerStock(id, final.real);
        }
      },
      (e: unknown) => {
        if (quedan() === 0) mejorRespuesta.current.delete(id);
        const ahora = productosRef.current.find((p) => p.id === id);
        if (ahora) ponerStock(id, aplicarDelta(ahora.stock, -aplicado));
        setErroresFila((r) => ({ ...r, [id]: mensajeError(e) }));
      },
    );
  }

  async function anotar() {
    setErrorNota(null);
    const r = validarAnotacion(nota);
    if (!r.ok) {
      setErrorNota(r.error);
      return;
    }
    setAnotando(true);
    try {
      const nueva = await datos.crearAnotacion(r.valor);
      setBase((b) => (b.anotaciones.some((a) => a.id === nueva.id) ? b : { ...b, anotaciones: [...b.anotaciones, nueva] }));
      setNota('');
    } catch (e) {
      setErrorNota(mensajeError(e));
    } finally {
      setAnotando(false);
    }
  }

  if (carga.estado !== 'listo') {
    return (
      <Pantalla titulo="Stock" ocupado={carga.estado === 'cargando'}>
        {carga.estado === 'error' ? (
          <Aviso
            alerta
            icono="nube"
            titulo="No pudimos traer el stock"
            texto={mensajeError(carga.error)}
            accion={{
              texto: 'Reintentar',
              onPress: () => {
                setCarga({ estado: 'cargando' });
                void recargar();
              },
            }}
          />
        ) : (
          <>
            <Esqueleto alto={tema.medida.tactil} />
            <Esqueleto alto={tema.medida.tactil} />
            <Esqueleto alto={tema.medida.fila * 3} />
            <Texto variante="sub" centrado accessibilityLiveRegion="polite">
              Trayendo el stock de la casa…
            </Texto>
          </>
        )}
      </Pantalla>
    );
  }

  const { productos, categorias, anotaciones } = base;
  const cuantosPendientes = pendientesConAnotaciones(productos, anotaciones).length;
  const cuantosOcultos = ocultos(productos).length;
  const visibles = productosVisibles(productos, { vista, busqueda, tocados });
  const buscado = normalizar(busqueda);
  const notas = vista === 'ocultos' ? [] : anotaciones.filter((a) => normalizar(a.texto).includes(buscado));
  const grupos = agruparPorCategoria(visibles, categorias);
  const hayProductos = productos.length > 0;
  const nuevo = () => router.push('/producto/nuevo');

  let vacio: ReactNode = null;
  if (vista === 'todo' && !hayProductos) {
    vacio = (
      <Aviso
        icono="caja"
        titulo="El stock está vacío"
        texto="Sumá lo que suele terminarse en casa: yerba, leche, papel higiénico."
        accion={{ texto: 'Nuevo producto', icono: 'mas', onPress: nuevo }}
      />
    );
  } else if (!visibles.length && !(vista === 'pendientes' && notas.length)) {
    if (busqueda.trim()) {
      vacio = <Aviso icono="lupa" titulo="Sin resultados" texto={`Ningún producto coincide con «${busqueda.trim()}».`} />;
    } else if (vista === 'pendientes') {
      vacio = <Aviso bueno icono="ok" titulo="No falta nada" texto="Cuando algo se termine, o lo anotes arriba, aparece acá para la próxima compra." />;
    } else if (vista === 'ocultos') {
      vacio = <Aviso icono="caja" titulo="No hay productos ocultos" texto="Lo que tiene compras y ya no se usa se oculta desde su ficha." />;
    } else {
      vacio = <Aviso icono="caja" titulo="No hay productos a la vista" texto="Los ocultos están en la pestaña Ocultos." />;
    }
  }

  const tituloSeccion = (texto: string) => (
    <Texto variante="seccion" accessibilityRole="header" style={{ paddingTop: tema.espacio.s }}>
      {texto}
    </Texto>
  );

  return (
    <Pantalla titulo="Stock">
      <PestanasInternas
        etiqueta="Qué mostrar"
        opciones={[
          { clave: 'todo', texto: 'Todo' },
          { clave: 'pendientes', texto: `Pendientes ${cuantosPendientes}` },
          { clave: 'ocultos', texto: cuantosOcultos ? `Ocultos ${cuantosOcultos}` : 'Ocultos' },
        ]}
        activa={vista}
        alCambiar={elegirVista}
      />

      {hayProductos ? <Campo etiqueta="Buscar en el stock" valor={busqueda} alCambiar={setBusqueda} placeholder="Nombre o marca" /> : null}

      {vista !== 'ocultos' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: tema.espacio.s }}>
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: tema.medida.fila * 3 }}>
            <Campo etiqueta="Anotá algo que falta" valor={nota} alCambiar={setNota} placeholder="Pilas AA, pan…" error={errorNota} />
          </View>
          <Boton texto="Anotar" variante="borde" ocupado={anotando} onPress={() => void anotar()} />
        </View>
      ) : null}

      {vista === 'todo' ? notas.map((a) => <NotitaTocable key={a.id} texto={textoNotita(a)} onPress={() => setHojaNota(a)} />) : null}

      {vacio ?? (
        <Tarjeta iman>
          {grupos.map((g) => (
            <View key={g.categoria.id ?? 'sin'}>
              {tituloSeccion(g.categoria.nombre)}
              {g.productos.map((p, i) => (
                <FilaProducto
                  key={p.id}
                  producto={p}
                  separador={i > 0}
                  oculto={vista === 'ocultos'}
                  error={erroresFila[p.id]}
                  alRestar={() => {
                    if (Number(p.stock) > 0) ajustar(p.id, deltaMenos(p.stock));
                  }}
                  alSumar={() => ajustar(p.id, 1)}
                  alTocarCantidad={() => setHojaCantidad(p)}
                />
              ))}
            </View>
          ))}
          {vista === 'pendientes' && notas.length ? (
            <View>
              {tituloSeccion('Anotado')}
              {notas.map((a, i) => (
                <Fila
                  key={a.id}
                  nombre={a.texto}
                  descripcion="Anotación rápida"
                  detalle={<Notita texto="Anotación rápida · tocala para hacerla producto" />}
                  alTocar={() => setHojaNota(a)}
                  separador={i > 0}
                />
              ))}
            </View>
          ) : null}
        </Tarjeta>
      )}

      {vista === 'todo' && hayProductos ? <Boton texto="Nuevo producto" icono="mas" onPress={nuevo} /> : null}

      <HojaNota
        nota={hojaNota}
        alCerrar={() => setHojaNota(null)}
        alBorrar={(id) => setBase((b) => ({ ...b, anotaciones: b.anotaciones.filter((a) => a.id !== id) }))}
      />
      <HojaCantidad
        producto={hojaCantidad}
        alCerrar={() => setHojaCantidad(null)}
        alGuardar={(p, valor) => {
          setHojaCantidad(null);
          ajustar(p.id, redondear(valor - Number(p.stock)));
        }}
      />
    </Pantalla>
  );
}

// ——— Filas ———

type PropsFila = {
  producto: Producto;
  separador: boolean;
  oculto: boolean;
  error?: string;
  alRestar(): void;
  alSumar(): void;
  alTocarCantidad(): void;
};

function FilaProducto({ producto: p, separador, oculto, error, alRestar, alSumar, alTocarCantidad }: PropsFila) {
  const nombre = conMarca(p);
  const abrir = () => router.push({ pathname: '/producto/[id]', params: { id: p.id } });
  if (oculto) {
    return <Fila nombre={nombre} descripcion="Oculto" detalle={<Texto variante="sub">Oculto</Texto>} alTocar={abrir} separador={separador} />;
  }
  const falta = esPendiente(p);
  return (
    <Fila
      nombre={nombre}
      descripcion={falta ? 'Falta' : 'Hay'}
      detalle={
        <>
          <Estado tipo={falta ? 'falta' : 'hay'} texto={falta ? 'Falta' : 'Hay'} />
          <MensajeError texto={error} />
        </>
      }
      alTocar={abrir}
      separador={separador}
      derecha={<PasoStock nombre={nombre} producto={p} alRestar={alRestar} alSumar={alSumar} alTocarCantidad={alTocarCantidad} />}
    />
  );
}

type PropsPaso = { nombre: string; producto: Producto; alRestar(): void; alSumar(): void; alTocarCantidad(): void };

// El paso de Stock: − / + de `medida.tactil` y en el medio el número (con su unidad), que se toca para
// escribir la cantidad exacta. En 0 el − se ve apagado pero conserva el foco (no se deshabilita).
function PasoStock({ nombre, producto: p, alRestar, alSumar, alTocarCantidad }: PropsPaso) {
  const tema = useTema();
  const cantidad = cantidadConUnidad(p.stock, p.unidad);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: tema.medida.borde,
        borderColor: tema.color.borde,
        borderRadius: tema.radio.boton,
        backgroundColor: tema.color.superficie,
      }}
    >
      <BotonPaso etiqueta={`Restar a ${nombre}`} apagado={Number(p.stock) <= 0} onPress={alRestar} signo="−" />
      <BotonPaso etiqueta={`Cantidad de ${nombre}: ${cantidad}`} pista="Escribí cuánto hay" onPress={alTocarCantidad} cifra>
        <Texto variante="fuerte" centrado style={{ fontFamily: FAMILIAS.numeros, fontVariant: ['tabular-nums'] }} aria-hidden>
          {cantidad}
        </Texto>
      </BotonPaso>
      <BotonPaso etiqueta={`Sumar uno a ${nombre}`} onPress={alSumar} signo="+" />
    </View>
  );
}

type PropsBotonPaso = { etiqueta: string; onPress(): void; signo?: string; pista?: string; apagado?: boolean; cifra?: boolean; children?: ReactNode };

function BotonPaso({ etiqueta, onPress, signo, pista, apagado = false, cifra = false, children }: PropsBotonPaso) {
  const tema = useTema();
  const { conFoco, alFoco } = useFoco();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityHint={pista}
      accessibilityState={{ disabled: apagado }}
      onPress={() => {
        if (!apagado) onPress();
      }}
      {...alFoco}
      style={[
        {
          minWidth: tema.medida.tactil,
          minHeight: tema.medida.tactil,
          paddingHorizontal: cifra ? tema.espacio.xs : 0,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: tema.radio.boton,
        },
        conFoco && anilloDeFoco(tema),
      ]}
    >
      {children ?? (
        <Texto variante="tituloTarjeta" color={apagado ? 'textoSuave' : 'texto'} accessibilityRole="none" aria-hidden>
          {signo}
        </Texto>
      )}
    </Pressable>
  );
}

// Notita de la pestaña Todo: se toca para hacerla producto o borrarla (alto ≥ `medida.tactil`).
function NotitaTocable({ texto, onPress }: { texto: string; onPress(): void }) {
  const tema = useTema();
  const { conFoco, alFoco } = useFoco();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={texto}
      onPress={onPress}
      {...alFoco}
      style={[{ minHeight: tema.medida.tactil, justifyContent: 'center', borderRadius: tema.radio.boton }, conFoco && anilloDeFoco(tema)]}
    >
      <Notita texto={texto} />
    </Pressable>
  );
}

// ——— Hojas ———

function HojaNota({ nota, alCerrar, alBorrar }: { nota: Anotacion | null; alCerrar(): void; alBorrar(id: string): void }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setError(null), [nota]);

  async function borrar() {
    if (!nota) return;
    setOcupado(true);
    setError(null);
    try {
      await datos.borrarAnotacion(nota.id);
      alBorrar(nota.id);
      alCerrar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  }

  function hacerProducto() {
    if (!nota) return;
    alCerrar();
    router.push({ pathname: '/producto/nuevo', params: { nombre: nota.texto, anotacion: nota.id } });
  }

  return (
    <Hoja
      visible={nota !== null}
      titulo={nota?.texto ?? ''}
      subtitulo="Hacela producto para llevar la cuenta en Stock, o borrala si ya no hace falta."
      alCerrar={alCerrar}
      pie={
        <>
          <MensajeError texto={error} />
          <Boton texto="Hacerla producto" onPress={hacerProducto} />
          <Boton texto="Borrar nota" variante="borde" ocupado={ocupado} onPress={() => void borrar()} />
        </>
      }
    />
  );
}

type PropsHojaCantidad = { producto: Producto | null; alCerrar(): void; alGuardar(p: Producto, valor: number): void };

function HojaCantidad({ producto: p, alCerrar, alGuardar }: PropsHojaCantidad) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTexto(p ? formatearCantidad(p.stock) : '');
    setError(null);
  }, [p]);

  const decimales = p ? admiteDecimales(p.unidad) : false;
  const etiqueta = p?.unidad === 'kg' ? 'Cantidad en kg' : p?.unidad === 'litro' ? 'Cantidad en litros' : 'Cantidad';

  function guardar() {
    if (!p) return;
    const r = validarCantidad(p.unidad, texto);
    if (r.ok) alGuardar(p, r.valor);
    else setError(r.error);
  }

  return (
    <Hoja
      visible={p !== null}
      titulo={p ? `¿Cuánto hay de ${conMarca(p)}?` : ''}
      subtitulo={decimales ? 'Podés usar decimales, por ejemplo 1,5. Si se terminó, usá el −.' : 'Si se terminó, usá el −.'}
      alCerrar={alCerrar}
      pie={<Boton texto="Guardar cantidad" onPress={guardar} />}
    >
      <Campo
        etiqueta={etiqueta}
        valor={texto}
        alCambiar={(t) => {
          setTexto(t);
          setError(null);
        }}
        teclado={decimales ? 'decimal-pad' : 'number-pad'}
        error={error}
      />
    </Hoja>
  );
}
