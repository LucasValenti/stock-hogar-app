// Ajustes: integrantes (nombre, tipo, sueldo, email, activo), categorías (nombre, tipo y a los cuántos días
// pregunta «¿Todavía hay?») y la cuenta (de quién es la sesión, dónde están los datos y Cerrar sesión).
// Cada fila abre su hoja; desactivar a alguien, cambiarle el tipo y borrar una categoría se confirman en la
// misma hoja. Se actualiza en vivo. Permisos (altas y bajas, sueldos) son F7: hoy cualquiera de la casa edita.
import { useEffect, useState, type ReactNode } from 'react';

import { datos, esModoMemoria } from '@/datos';
import { esCorte } from '@/datos/cola';
import { centavosATexto, formatear } from '@/logica/dinero';
import { mensajeError } from '@/logica/errores';
import { mesActual, mesSiguiente, nombreMes } from '@/logica/meses';
import type { Categoria, Integrante, TipoCategoria, TipoIntegrante } from '@/logica/tipos';
import { avisoCambioTipo, validarCategoria, validarIntegrante, type ErroresCategoria, type ErroresIntegrante } from '@/logica/validar';
import { useSesion } from '@/sesion/sesion';
import { Aviso } from '@/ui/Aviso';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Chip } from '@/ui/Chip';
import { Esqueleto } from '@/ui/Esqueleto';
import { EstadoVacio } from '@/ui/EstadoVacio';
import { Estado, Fila } from '@/ui/Fila';
import { Hoja } from '@/ui/Hoja';
import { Icono } from '@/ui/Icono';
import { MensajeError } from '@/ui/MensajeError';
import { Monto } from '@/ui/Monto';
import { Pantalla } from '@/ui/Pantalla';
import { Tarjeta } from '@/ui/Tarjeta';
import { useEnVivo } from '@/ui/useEnVivo';

import estilos from './Ajustes.module.css';
import { CerrarSesion } from './Sesion';

type Casa = { integrantes: Integrante[]; categorias: Categoria[] };
type Seccion = 'integrantes' | 'categorias';
/** Una pregunta antes de guardar: título, qué pasa y el botón que acepta. */
type Paso = { titulo: string; texto: string; accion: string };

const DIAS_POR_DEFECTO = 20;
const esExterno = (t: TipoIntegrante) => t === 'pagador_externo';

function pedirCasa(): Promise<Casa> {
  return Promise.all([datos.integrantes(), datos.categorias()]).then(([integrantes, categorias]) => ({ integrantes, categorias }));
}

/** «Integrante · Activo», «Pagador externo · Inactivo desde marzo de 2026». */
function lineaIntegrante(i: Integrante): string {
  const tipo = esExterno(i.tipo) ? 'Pagador externo' : 'Integrante';
  if (i.activo) return `${tipo} · Activo`;
  if (!i.baja_desde) return `${tipo} · Inactivo`;
  const desde = nombreMes(i.baja_desde);
  return `${tipo} · ${i.baja_desde > mesActual() ? `Sale desde ${desde}` : `Inactivo desde ${desde}`}`;
}

const textoTipoCategoria = (t: TipoCategoria) => (t === 'servicio' ? 'Servicio' : 'Productos del súper');
const textoDias = (n: number) => (n === 1 ? 'pregunta al día' : `pregunta a los ${n} días`);

export function Ajustes() {
  const { demo } = useSesion();
  const { carga, reintentar } = useEnVivo(pedirCasa, 'ajustes');
  const [integrante, setIntegrante] = useState<Integrante | 'nuevo' | null>(null);
  const [categoria, setCategoria] = useState<Categoria | 'nueva' | null>(null);
  // `vez` cambia con cada guardado: el aviso se vuelve a montar y se anuncia aunque el texto sea el mismo.
  const [aviso, setAviso] = useState<{ seccion: Seccion; texto: string; vez: number } | null>(null);
  const avisar = (seccion: Seccion, texto: string) => setAviso((a) => ({ seccion, texto, vez: (a?.vez ?? 0) + 1 }));
  // Al abrir una hoja, el aviso del guardado anterior ya no corresponde.
  const abrirIntegrante = (i: Integrante | 'nuevo') => {
    setAviso(null);
    setIntegrante(i);
  };
  const abrirCategoria = (c: Categoria | 'nueva') => {
    setAviso(null);
    setCategoria(c);
  };

  const avisoDe = (seccion: Seccion) => (aviso?.seccion === seccion ? aviso : null);

  return (
    <Pantalla titulo="Ajustes" ocupado={carga.estado === 'cargando'}>
      {demo ? <AvisoDemo /> : null}
      {carga.estado === 'cargando' ? (
        <>
          <Esqueleto alto={144} />
          <Esqueleto alto={96} />
          <p className={estilos.centrado} aria-live="polite">
            Trayendo los ajustes de la casa…
          </p>
        </>
      ) : carga.estado === 'error' ? (
        <Aviso
          alerta
          icono="nube"
          titulo="No pudimos traer los ajustes"
          texto={esCorte(carga.error) ? 'Revisá el wifi o los datos del celu y probá de nuevo.' : mensajeError(carga.error)}
          accion={{ texto: 'Reintentar', onClick: reintentar }}
        />
      ) : (
        <>
          <Apartado titulo="Integrantes" aviso={avisoDe('integrantes')}>
            <p className={estilos.sub}>
              El sueldo define qué parte del gasto del mes le toca a cada uno. Un pagador externo carga gastos pero no entra al
              reparto: se le devuelve lo que pagó.
            </p>
            <p className={estilos.sub}>
              Para que alguien nuevo pueda entrar, además de sumarlo acá hay que invitar su email desde Supabase (Authentication →
              Users → Invite user).
            </p>
            <Tarjeta className={estilos.lista}>
              {carga.valor.integrantes.length ? (
                carga.valor.integrantes.map((i, n) => (
                  <FilaIntegrante key={i.id} integrante={i} separador={n > 0} alTocar={() => abrirIntegrante(i)} />
                ))
              ) : (
                <EstadoVacio icono="casa" titulo="Todavía no hay nadie en la casa." />
              )}
            </Tarjeta>
            <Boton texto="Agregar integrante" variante="borde" icono="mas" onClick={() => abrirIntegrante('nuevo')} />
          </Apartado>

          <Apartado titulo="Categorías" aviso={avisoDe('categorias')}>
            <p className={estilos.sub}>Cada categoría dice a los cuántos días sin cambios en el stock Inicio pregunta «¿Todavía hay?».</p>
            <Tarjeta className={estilos.lista}>
              {carga.valor.categorias.length ? (
                carga.valor.categorias.map((c, n) => {
                  const linea = `${textoTipoCategoria(c.tipo)} · ${textoDias(c.dias_sin_movimiento)}`;
                  return (
                    <Fila
                      key={c.id}
                      nombre={c.nombre}
                      descripcion={linea}
                      detalle={<span className={estilos.sub}>{linea}</span>}
                      alTocar={() => abrirCategoria(c)}
                      separador={n > 0}
                    />
                  );
                })
              ) : (
                <EstadoVacio icono="caja" titulo="Todavía no hay categorías." />
              )}
            </Tarjeta>
            <Boton texto="Agregar categoría" variante="borde" icono="mas" onClick={() => abrirCategoria('nueva')} />
          </Apartado>
        </>
      )}

      <Cuenta />

      <HojaIntegrante
        integrante={integrante}
        alCerrar={() => setIntegrante(null)}
        alGuardar={(texto) => {
          setIntegrante(null);
          avisar('integrantes', texto);
        }}
      />
      <HojaCategoria
        categoria={categoria}
        alCerrar={() => setCategoria(null)}
        alGuardar={(texto) => {
          setCategoria(null);
          avisar('categorias', texto);
        }}
      />
    </Pantalla>
  );
}

/** Aviso de la demo de tiempo de ejecución. En el build solo-memoria no hay a dónde salir: va sin botón. */
function AvisoDemo() {
  const { salir } = useSesion();
  return (
    <Tarjeta className={estilos.avisoFila}>
      <span className={estilos.avisoTexto}>
        <span className={estilos.icono}>
          <Icono nombre="casa" tamano={20} />
        </span>
        <p className={estilos.fuerte}>Estás en la demo: los datos son inventados.</p>
      </span>
      {esModoMemoria() ? null : <Boton texto="Salir de la demo" variante="borde" onClick={() => void salir()} />}
    </Tarjeta>
  );
}

function Apartado({ titulo, aviso, children }: { titulo: string; aviso?: { texto: string; vez: number } | null; children: ReactNode }) {
  return (
    <section className={estilos.apartado}>
      <h2 className={estilos.seccion}>{titulo}</h2>
      {/* Siempre montado: lo que se guardó se anuncia al aparecer. */}
      <div aria-live="polite">{aviso ? <Estado key={aviso.vez} tipo="hay" texto={aviso.texto} /> : null}</div>
      {children}
    </section>
  );
}

function FilaIntegrante({ integrante: i, separador, alTocar }: { integrante: Integrante; separador: boolean; alTocar(): void }) {
  const linea = lineaIntegrante(i);
  const sinMonto = esExterno(i.tipo) ? 'No participa' : i.sueldo === null ? 'Sin sueldo' : null;
  return (
    <Fila
      nombre={i.nombre}
      descripcion={`${linea}, ${sinMonto ?? formatear(i.sueldo as number)}`}
      detalle={<span className={estilos.sub}>{linea}</span>}
      alTocar={alTocar}
      separador={separador}
      derecha={sinMonto ? <span className={estilos.sub}>{sinMonto}</span> : <Monto centavos={i.sueldo as number} tamano="fila" />}
    />
  );
}

function Cuenta() {
  const { yo } = useSesion();
  return (
    <Apartado titulo="Cuenta">
      <Tarjeta className={estilos.cuenta}>
        {yo ? <p>{`Entraste como ${yo.nombre}.`}</p> : null}
        <p className={estilos.sub}>Los emails, sueldos y gastos de la casa se guardan en Supabase y solo los ven las cuentas de esta lista.</p>
        {esModoMemoria() ? <p className={estilos.sub}>Es la casa de ejemplo: no hay cuenta, así que cerrar sesión no hace nada.</p> : null}
        <CerrarSesion variante="borde" />
      </Tarjeta>
    </Apartado>
  );
}

/** «Tipo» con sus dos opciones y, debajo, qué significa la elegida. */
function ElegirTipo<T extends string>({ opciones, activa, alElegir, explicacion }: {
  opciones: Array<{ clave: T; texto: string }>;
  activa: T;
  alElegir(t: T): void;
  explicacion: string;
}) {
  return (
    <div className={estilos.tipo}>
      <p className={estilos.rotulo}>Tipo</p>
      <div role="radiogroup" aria-label="Tipo" className={estilos.chips}>
        {opciones.map((o) => (
          <Chip key={o.clave} texto={o.texto} rol="radio" activo={o.clave === activa} onClick={() => alElegir(o.clave)} />
        ))}
      </div>
      <p className={estilos.sub}>{explicacion}</p>
    </div>
  );
}

// ——— Hoja de integrante ———

type PropsHojaIntegrante = { integrante: Integrante | 'nuevo' | null; alCerrar(): void; alGuardar(aviso: string): void };

function HojaIntegrante({ integrante, alCerrar, alGuardar }: PropsHojaIntegrante) {
  const existente = integrante && integrante !== 'nuevo' ? integrante : null;
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoIntegrante>('integrante');
  const [sueldo, setSueldo] = useState('');
  const [email, setEmail] = useState('');
  const [activo, setActivo] = useState(true);
  const [errores, setErrores] = useState<ErroresIntegrante>({});
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pasos, setPasos] = useState<Paso[]>([]);

  // Cada vez que se abre: lo de esa persona, o vacío para una nueva.
  useEffect(() => {
    const i = integrante && integrante !== 'nuevo' ? integrante : null;
    setNombre(i?.nombre ?? '');
    setTipo(i?.tipo ?? 'integrante');
    setSueldo(i?.sueldo != null ? centavosATexto(i.sueldo) : '');
    setEmail(i?.email ?? '');
    setActivo(i?.activo ?? true);
    setErrores({});
    setError(null);
    setPasos([]);
  }, [integrante]);

  const externo = esExterno(tipo);
  const consecuenciaBaja = externo ? 'pierde el acceso desde el mes que viene' : 'sale del reparto desde el mes que viene';
  const validar = () => validarIntegrante({ nombre, sueldo, email, tipo });

  function guardar() {
    setError(null);
    const r = validar();
    setErrores(r.errores);
    if (!r.ok) return;
    const preguntas: Paso[] = [];
    if (existente?.activo && !activo) {
      preguntas.push({
        titulo: `¿Desactivar a ${r.valor.nombre}?`,
        texto: externo ? 'Pierde el acceso desde el mes que viene.' : 'Sigue en el reparto de este mes y sale desde el que viene.',
        accion: 'Desactivar',
      });
    }
    const cambio = avisoCambioTipo(existente, r.valor.tipo);
    if (cambio) preguntas.push({ titulo: `¿Cambiar el tipo de ${r.valor.nombre}?`, texto: cambio, accion: 'Cambiar tipo' });
    if (preguntas.length) setPasos(preguntas);
    else void enviar();
  }

  function aceptarPaso() {
    if (pasos.length > 1) setPasos(pasos.slice(1));
    else void enviar();
  }

  async function enviar() {
    const r = validar();
    if (!r.ok) return;
    // Quien ya estaba inactivo conserva su baja; quien se desactiva ahora sale desde el mes que viene.
    const baja_desde = activo ? null : existente && !existente.activo ? existente.baja_desde : mesSiguiente(mesActual());
    setOcupado(true);
    try {
      await datos.guardarIntegrante({ ...(existente ? { id: existente.id } : {}), ...r.valor, activo, baja_desde });
      alGuardar(existente ? 'Cambios guardados.' : `${r.valor.nombre} se agregó a la casa.`);
    } catch (e) {
      // El error se ve en el formulario, con todo lo que se escribió.
      setPasos([]);
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  }

  const paso = pasos[0];
  if (paso) {
    return (
      <Hoja
        visible={integrante !== null}
        titulo={paso.titulo}
        subtitulo={paso.texto}
        alCerrar={alCerrar}
        pie={
          <>
            <Boton texto={paso.accion} ocupado={ocupado} onClick={aceptarPaso} />
            <Boton texto="Volver" variante="borde" onClick={() => setPasos([])} />
          </>
        }
      />
    );
  }

  return (
    <Hoja
      visible={integrante !== null}
      titulo={existente ? existente.nombre : 'Agregar integrante'}
      alCerrar={alCerrar}
      pie={
        <>
          <MensajeError texto={error} />
          <Boton texto={existente ? 'Guardar' : 'Agregar'} ocupado={ocupado} onClick={guardar} />
        </>
      }
    >
      <div className={estilos.formulario}>
        <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errores.nombre} />
        <ElegirTipo<TipoIntegrante>
          opciones={[
            { clave: 'integrante', texto: 'Integrante' },
            { clave: 'pagador_externo', texto: 'Pagador externo' },
          ]}
          activa={tipo}
          alElegir={setTipo}
          explicacion={externo ? 'Paga gastos y se le devuelve lo que pagó: no participa del reparto.' : 'Participa del reparto según su sueldo.'}
        />
        {externo ? null : (
          <Campo
            etiqueta="Sueldo mensual"
            value={sueldo}
            onChange={(e) => setSueldo(e.target.value)}
            placeholder="Ej.: 1.500.000"
            ayuda="Sin sueldo no se puede repartir el mes."
            error={errores.sueldo}
            inputMode="decimal"
          />
        )}
        <Campo
          etiqueta="Email de su cuenta"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errores.email}
          type="email"
          autoComplete="email"
          autoCorrect="off"
        />
        {existente ? (
          <Fila
            nombre="Activo"
            descripcion={`si lo desactivás, ${consecuenciaBaja}`}
            detalle={<span className={estilos.sub}>{`Si lo desactivás, ${consecuenciaBaja}.`}</span>}
            tildado={activo}
            alTildar={() => setActivo((a) => !a)}
          />
        ) : null}
      </div>
    </Hoja>
  );
}

// ——— Hoja de categoría ———

type PropsHojaCategoria = { categoria: Categoria | 'nueva' | null; alCerrar(): void; alGuardar(aviso: string): void };

function HojaCategoria({ categoria, alCerrar, alGuardar }: PropsHojaCategoria) {
  const existente = categoria && categoria !== 'nueva' ? categoria : null;
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoCategoria>('producto');
  const [dias, setDias] = useState('');
  const [errores, setErrores] = useState<ErroresCategoria>({});
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [borrando, setBorrando] = useState(false);

  useEffect(() => {
    const c = categoria && categoria !== 'nueva' ? categoria : null;
    setNombre(c?.nombre ?? '');
    setTipo(c?.tipo ?? 'producto');
    setDias(String(c?.dias_sin_movimiento ?? DIAS_POR_DEFECTO));
    setErrores({});
    setError(null);
    setBorrando(false);
  }, [categoria]);

  async function hacer(pedir: () => Promise<unknown>, aviso: string) {
    setError(null);
    setOcupado(true);
    try {
      await pedir();
      alGuardar(aviso);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  }

  function guardar() {
    const r = validarCategoria({ nombre, tipo, dias });
    setErrores(r.errores);
    if (!r.ok) return;
    void hacer(() => datos.guardarCategoria({ ...(existente ? { id: existente.id } : {}), ...r.valor }), 'Categoría guardada.');
  }

  function volver() {
    setError(null);
    setBorrando(false);
  }

  if (borrando && existente) {
    return (
      <Hoja
        visible
        titulo={`¿Borrar la categoría ${existente.nombre}?`}
        subtitulo="Solo se puede si ningún producto ni gasto la usa."
        alCerrar={alCerrar}
        pie={
          <>
            <MensajeError texto={error} />
            <Boton texto="Borrar" ocupado={ocupado} onClick={() => void hacer(() => datos.borrarCategoria(existente.id), 'Categoría borrada.')} />
            <Boton texto="Volver" variante="borde" onClick={volver} />
          </>
        }
      />
    );
  }

  return (
    <Hoja
      visible={categoria !== null}
      titulo={existente ? existente.nombre : 'Agregar categoría'}
      alCerrar={alCerrar}
      pie={
        <>
          <MensajeError texto={error} />
          <Boton texto={existente ? 'Guardar' : 'Agregar'} ocupado={ocupado} onClick={guardar} />
          {existente ? (
            <Boton
              texto="Borrar categoría"
              variante="borde"
              onClick={() => {
                setError(null);
                setBorrando(true);
              }}
            />
          ) : null}
        </>
      }
    >
      <div className={estilos.formulario}>
        <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errores.nombre} />
        <ElegirTipo<TipoCategoria>
          opciones={[
            { clave: 'producto', texto: 'Productos del súper' },
            { clave: 'servicio', texto: 'Servicio' },
          ]}
          activa={tipo}
          alElegir={setTipo}
          explicacion={tipo === 'servicio' ? 'Luz, gas, internet…' : 'Lo que se compra y se guarda en la casa.'}
        />
        <Campo
          etiqueta="Días para preguntar «¿Todavía hay?»"
          value={dias}
          onChange={(e) => setDias(e.target.value)}
          ayuda="De 1 a 365. Pasados esos días sin cambios en el stock, Inicio pregunta si todavía hay."
          error={errores.dias}
          inputMode="numeric"
        />
      </div>
    </Hoja>
  );
}
