// Cuándo volver a intentar mandar lo pendiente: al volver la red (NetInfo), al volver la app al
// frente en el teléfono (AppState 'active') y, en la web, con 'online' y cuando la pestaña vuelve a
// verse. Lo que la base rechazó por un rato (servidor caído, token vencido) sale en la próxima vuelta.
// Los oyentes se registran una sola vez aunque se llame de nuevo.

type Quitar = () => void;

type Eventos = {
  addEventListener(tipo: string, f: () => void): void;
  removeEventListener(tipo: string, f: () => void): void;
};

export type FuentesDeVuelta = {
  web: boolean;
  netInfo: { addEventListener(f: (estado: { isConnected: boolean | null }) => void): Quitar };
  appState: { addEventListener(tipo: 'change', f: (estado: string) => void): { remove(): void } };
  ventana?: Eventos;
  documento?: Eventos & { visibilityState: string };
};

let registrado: Quitar | null = null;

export function vaciarAlVolver(vaciar: () => void, f: FuentesDeVuelta): Quitar {
  if (registrado) return registrado;
  const quitar: Quitar[] = [];

  // NetInfo avisa también al suscribirse: si quedó algo de la sesión anterior, sale ahora.
  quitar.push(
    f.netInfo.addEventListener((estado) => {
      if (estado.isConnected !== false) vaciar();
    }),
  );

  if (f.web) {
    // En la web, AppState de react-native-web sale de visibilitychange: se escucha eso directo.
    const { ventana, documento } = f;
    if (ventana) {
      ventana.addEventListener('online', vaciar);
      quitar.push(() => ventana.removeEventListener('online', vaciar));
    }
    if (documento) {
      const alVerse = () => {
        if (documento.visibilityState === 'visible') vaciar();
      };
      documento.addEventListener('visibilitychange', alVerse);
      quitar.push(() => documento.removeEventListener('visibilitychange', alVerse));
    }
  } else {
    const sub = f.appState.addEventListener('change', (estado) => {
      if (estado === 'active') vaciar();
    });
    quitar.push(() => sub.remove());
  }

  const quitarTodo: Quitar = () => {
    if (registrado !== quitarTodo) return;
    registrado = null;
    quitar.forEach((q) => q());
  };
  registrado = quitarTodo;
  return quitarTodo;
}
