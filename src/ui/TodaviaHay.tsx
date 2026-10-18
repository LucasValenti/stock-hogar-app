// «¿Todavía hay?» de Inicio (maqueta «Elegida»): de a un producto, el que lleva más tiempo quieto según
// paraRevisar, en una tarjeta con imán y tres respuestas que reparten el ancho: Hay (renueva el plazo),
// Falta (stock en 0: pasa a pendientes) y Ajustar (la cantidad exacta, según la unidad).
// La respuesta saca la tarjeta al instante y deja ver el siguiente; si la base no la toma (sin conexión),
// el producto vuelve con el aviso.

import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { datos } from '@/datos';
import { mensajeError } from '@/logica/errores';
import { paraRevisar } from '@/logica/revisar';
import { cantidadConUnidad, formatearCantidad } from '@/logica/stock';
import type { Categoria, Producto } from '@/logica/tipos';
import { admiteDecimales, validarCantidad } from '@/logica/validar';
import { useTema } from '@/tema/tema';

import { Boton } from './Boton';
import { Campo } from './Campo';
import { MensajeError } from './FormularioProducto';
import { Hoja } from './Hoja';
import { Tarjeta } from './Tarjeta';
import { Texto } from './Texto';

const DIA_MS = 24 * 60 * 60 * 1000;
const redondear = (n: number) => Math.round(n * 1000) / 1000;
// ajustar_stock_producto rechaza deltas de más de 1000 (DELTA_INVALIDO): lo que se aleja más va en pasos.
const LIMITE_DELTA = 1000;

/** Mueve el stock `delta` en pasos que la base acepta. */
async function moverEnPasos(id: string, delta: number): Promise<void> {
  let resto = redondear(delta);
  while (resto !== 0) {
    const paso = Math.max(-LIMITE_DELTA, Math.min(LIMITE_DELTA, resto));
    await datos.ajustarStock(id, paso);
    resto = redondear(resto - paso);
  }
}

/**
 * «Falta»: lleva el stock a 0 desde `stock` (el del producto al tocar), en pasos que la base acepta.
 * Sigue con lo que la base dice que quedó, así una compra que entró mientras tanto también se vacía.
 */
async function vaciar(id: string, stock: number): Promise<void> {
  let queda = stock;
  for (let i = 0; queda > 0 && i < 100; i++) {
    queda = Number(await datos.ajustarStock(id, -Math.min(queda, LIMITE_DELTA)));
  }
}

type Props = {
  productos: Producto[];
  categorias: Categoria[];
  /** Si en la pantalla ya hay otro botón lleno (el «Cargar gasto» del mes vacío), Hay va con borde. */
  sinLleno?: boolean;
};

export function TodaviaHay({ productos, categorias, sinLleno = false }: Props) {
  const tema = useTema();
  // Respondidos en esta visita: no vuelven aunque la recarga tarde.
  const [respondidos, setRespondidos] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<{ id: string; texto: string } | null>(null);
  const [ajustando, setAjustando] = useState<Producto | null>(null);

  const ahora = new Date();
  const p = paraRevisar(productos, categorias, ahora).find((x) => !respondidos.has(x.id));
  if (!p) return null;

  function responder(producto: Producto, pedir: () => Promise<unknown>) {
    setError(null);
    setRespondidos((r) => new Set(r).add(producto.id));
    pedir().catch((e: unknown) => {
      setRespondidos((r) => {
        const otra = new Set(r);
        otra.delete(producto.id);
        return otra;
      });
      setError({ id: producto.id, texto: mensajeError(e) });
    });
  }

  const dias = Math.floor((ahora.getTime() - Date.parse(p.ultimo_movimiento)) / DIA_MS);
  // El producto como está al tocar (la lista se renueva en vivo), no el de cuando se dibujó la tarjeta.
  const actualDe = (prod: Producto) => productos.find((x) => x.id === prod.id) ?? prod;

  return (
    <>
      <Tarjeta iman testID="todavia-hay">
        <Texto variante="tituloTarjeta" accessibilityRole="header" aria-level={2}>
          {`¿Todavía hay ${p.nombre}?`}
        </Texto>
        <Texto variante="sub">{`Hace ${dias} días que no cambia. En Stock: ${cantidadConUnidad(p.stock, p.unidad)}.`}</Texto>
        <MensajeError texto={error?.id === p.id ? error.texto : null} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tema.espacio.s }}>
          <View style={{ flexGrow: 1, flexBasis: tema.medida.fila * 1.5 }}>
            <Boton texto="Hay" icono="ok" variante={sinLleno ? 'borde' : 'lleno'} onPress={() => responder(p, () => datos.confirmarHay(p.id))} />
          </View>
          <View style={{ flexGrow: 1, flexBasis: tema.medida.fila * 1.5 }}>
            <Boton texto="Falta" variante="borde" onPress={() => responder(p, () => vaciar(p.id, Number(actualDe(p).stock)))} />
          </View>
          <View style={{ flexGrow: 1, flexBasis: tema.medida.fila * 1.5 }}>
            <Boton texto="Ajustar" variante="borde" onPress={() => setAjustando(p)} />
          </View>
        </View>
      </Tarjeta>
      <HojaAjuste
        producto={ajustando}
        alCerrar={() => setAjustando(null)}
        alGuardar={(prod, valor) => {
          setAjustando(null);
          // Contra el stock de ahora: si alguien lo cambió con la hoja abierta, queda lo que se dijo.
          const delta = redondear(valor - Number(actualDe(prod).stock));
          // La misma cantidad que figuraba: es un «Hay».
          responder(prod, () => (delta === 0 ? datos.confirmarHay(prod.id) : moverEnPasos(prod.id, delta)));
        }}
      />
    </>
  );
}

type PropsHoja = { producto: Producto | null; alCerrar(): void; alGuardar(p: Producto, valor: number): void };

function HojaAjuste({ producto: p, alCerrar, alGuardar }: PropsHoja) {
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
      titulo={p ? `¿Cuánto hay de ${p.nombre}?` : ''}
      subtitulo={decimales ? 'Podés usar decimales, por ejemplo 1,5. Si se terminó, tocá Falta.' : 'Si se terminó, tocá Falta.'}
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
