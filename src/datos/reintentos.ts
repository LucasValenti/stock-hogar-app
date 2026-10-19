// Cuándo volver a intentar mandar lo pendiente en la web: cuando el navegador vuelve a estar
// 'online' y cuando la pestaña vuelve a verse. Lo que la base rechazó por un rato (servidor caído,
// token vencido) sale en la próxima vuelta. Los oyentes se registran una sola vez aunque se llame de nuevo.

type Quitar = () => void;

type Eventos = {
  addEventListener(tipo: string, f: () => void): void;
  removeEventListener(tipo: string, f: () => void): void;
};

export type FuentesDeVuelta = {
  ventana: Eventos;
  documento: Eventos & { visibilityState: string };
};

let registrado: Quitar | null = null;

export function vaciarAlVolver(vaciar: () => void, f: FuentesDeVuelta): Quitar {
  if (registrado) return registrado;
  const quitar: Quitar[] = [];

  f.ventana.addEventListener('online', vaciar);
  quitar.push(() => f.ventana.removeEventListener('online', vaciar));

  const alVerse = () => {
    if (f.documento.visibilityState === 'visible') vaciar();
  };
  f.documento.addEventListener('visibilitychange', alVerse);
  quitar.push(() => f.documento.removeEventListener('visibilitychange', alVerse));

  const quitarTodo: Quitar = () => {
    if (registrado !== quitarTodo) return;
    registrado = null;
    quitar.forEach((q) => q());
  };
  registrado = quitarTodo;
  return quitarTodo;
}
