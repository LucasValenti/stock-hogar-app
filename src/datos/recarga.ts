// Volver a traer datos cuando la casa cambia, sin pedir de más ni mostrar datos viejos.
// Una carga o un borrado llegan como varios avisos de fila seguidos (gasto + ítems): se espera
// a que se calmen y se pide una vez, como alCambiar en stock-hogar/js/app.js. Y como las
// respuestas pueden llegar desordenadas, solo cuenta la del último pedido.

export const ESPERA_RECARGA_MS = 300;

export type OpcionesRecarga<T> = {
  pedir(): Promise<T>;
  alTener(resultado: T): void;
  alFallar(error: unknown): void;
  espera?: number;
};

export type Recarga = {
  /** Pide ya (carga inicial, Reintentar). Anula un aviso que estuviera esperando. */
  ahora(): void;
  /** Hubo un cambio: pide cuando pasen `espera` ms sin otro aviso. */
  pronto(): void;
  /** Al desmontar: no pide más y descarta lo que esté en vuelo. */
  cancelar(): void;
};

export function crearRecarga<T>({ pedir, alTener, alFallar, espera = ESPERA_RECARGA_MS }: OpcionesRecarga<T>): Recarga {
  let ultimo = 0;
  let reloj: ReturnType<typeof setTimeout> | null = null;

  const frenar = () => {
    if (reloj !== null) clearTimeout(reloj);
    reloj = null;
  };

  function ahora() {
    frenar();
    const numero = ++ultimo;
    pedir().then(
      (r) => {
        if (numero === ultimo) alTener(r);
      },
      (e: unknown) => {
        if (numero === ultimo) alFallar(e);
      },
    );
  }

  return {
    ahora,
    pronto() {
      frenar();
      reloj = setTimeout(ahora, espera);
    },
    cancelar() {
      frenar();
      ultimo++;
    },
  };
}
