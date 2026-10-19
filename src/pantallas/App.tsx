// Raíz de la app: la sesión decide qué se ve (carga, error, cuenta ajena, ingreso o la app) y,
// con la sesión lista, las rutas de wouter reparten las pantallas bajo la barra de pestañas.
import { lazy, Suspense, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';

import { registrarSw } from '@/comprobante/registrarSw';
import { useCompartidoPendiente } from '@/comprobante/useCompartidoPendiente';
import { SesionProvider, useSesion } from '@/sesion/sesion';
import { BarraPestanas } from '@/ui/BarraPestanas';
import { anotarEntrada } from '@/ui/volver';

import estilos from './App.module.css';
import { Ingresar } from './Ingresar';
import { Inicio } from './Inicio';
import { PantallaAjena, PantallaCarga, PantallaError } from './Sesion';

// Inicio va en el paquete principal (es la primera pantalla); el resto se baja al entrar.
const Stock = lazy(() => import('./Stock').then((m) => ({ default: m.Stock })));
const Analisis = lazy(() => import('./Analisis').then((m) => ({ default: m.Analisis })));
const Ajustes = lazy(() => import('./Ajustes').then((m) => ({ default: m.Ajustes })));
const Cargar = lazy(() => import('./Cargar').then((m) => ({ default: m.Cargar })));
const Producto = lazy(() => import('./Producto').then((m) => ({ default: m.Producto })));
const ProductoNuevo = lazy(() => import('./ProductoNuevo').then((m) => ({ default: m.ProductoNuevo })));

export function App() {
  return (
    <SesionProvider>
      <Raiz />
    </SesionProvider>
  );
}

function Raiz() {
  const { estado, error, reintentar } = useSesion();
  const [ubicacion, navegar] = useLocation();
  // Cada entrada del historial queda marcada con su profundidad en la app (para «Volver»).
  const primera = useRef(true);
  useEffect(() => {
    anotarEntrada(primera.current);
    primera.current = false;
  }, [ubicacion]);
  // Un comprobante compartido desde otra app abre Cargar cuando la sesión está lista.
  const irACargar = useCallback(() => navegar('/cargar?compartido=1'), [navegar]);
  useCompartidoPendiente(irACargar);

  // En la web instalada, el service worker recibe los comprobantes compartidos desde otra app.
  useEffect(() => {
    registrarSw();
  }, []);

  if (error !== null) return <PantallaError error={error} onReintentar={reintentar} />;
  if (estado === 'cargando') return <PantallaCarga />;
  if (estado === 'ajena') return <PantallaAjena />;
  if (estado === 'sin-sesion') {
    return (
      <Conteo titulo="Ingresar">
        <Ingresar />
      </Conteo>
    );
  }
  return <Pestanas />;
}

function Pestanas() {
  return (
    <div className={estilos.app}>
      <main className={estilos.contenido} id="contenido">
        <Suspense fallback={<span className="solo-lectores">Cargando</span>}>
          <Switch>
            <Route path="/">
              <Conteo titulo="Inicio">
                <Inicio />
              </Conteo>
            </Route>
            <Route path="/stock">
              <Conteo titulo="Stock">
                <Stock />
              </Conteo>
            </Route>
            <Route path="/analisis">
              <Conteo titulo="Análisis">
                <Analisis />
              </Conteo>
            </Route>
            <Route path="/ajustes">
              <Conteo titulo="Ajustes">
                <Ajustes />
              </Conteo>
            </Route>
            <Route path="/cargar">
              <Conteo titulo="Cargar gasto">
                <Cargar />
              </Conteo>
            </Route>
            <Route path="/producto/nuevo">
              <Conteo titulo="Producto nuevo">
                <ProductoNuevo />
              </Conteo>
            </Route>
            <Route path="/producto/:id">
              <Conteo titulo="Producto">
                <Producto />
              </Conteo>
            </Route>
            {/* /ingresar con la sesión lista, o cualquier ruta desconocida: a Inicio. */}
            <Route>
              <Redirect to="/" replace />
            </Route>
          </Switch>
        </Suspense>
      </main>
      <BarraPestanas />
    </div>
  );
}

/** Pone el título de la pestaña del navegador según la pantalla. */
function Conteo({ titulo, children }: { titulo: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${titulo} · Stock del hogar`;
  }, [titulo]);
  return <>{children}</>;
}
