// Raíz de la app: la sesión decide qué se ve (carga, error, cuenta ajena, ingreso o la app) y,
// con la sesión lista, las rutas de wouter reparten las pantallas bajo la barra de pestañas.
import { useCallback, useEffect, type ReactNode } from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';

import { registrarSw } from '@/comprobante/registrarSw';
import { useCompartidoPendiente } from '@/comprobante/useCompartidoPendiente';
import { SesionProvider, useSesion } from '@/sesion/sesion';
import { BarraPestanas } from '@/ui/BarraPestanas';

import estilos from './App.module.css';
import { Cargar } from './Cargar';
import { EnConstruccion } from './EnConstruccion';
import { Ingresar } from './Ingresar';
import { Inicio } from './Inicio';
import { PantallaAjena, PantallaCarga, PantallaError } from './Sesion';

export function App() {
  return (
    <SesionProvider>
      <Raiz />
    </SesionProvider>
  );
}

function Raiz() {
  const { estado, error, reintentar } = useSesion();
  const [, navegar] = useLocation();
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
        <Switch>
          <Route path="/">
            <Conteo titulo="Inicio">
              <Inicio />
            </Conteo>
          </Route>
          <Route path="/stock">
            <Conteo titulo="Stock">
              <EnConstruccion titulo="Stock" />
            </Conteo>
          </Route>
          <Route path="/analisis">
            <Conteo titulo="Análisis">
              <EnConstruccion titulo="Análisis" />
            </Conteo>
          </Route>
          <Route path="/ajustes">
            <Conteo titulo="Ajustes">
              <EnConstruccion titulo="Ajustes" conSalida />
            </Conteo>
          </Route>
          <Route path="/cargar">
            <Conteo titulo="Cargar gasto">
              <Cargar />
            </Conteo>
          </Route>
          <Route path="/producto/:id">
            <Conteo titulo="Producto">
              <EnConstruccion titulo="Producto" />
            </Conteo>
          </Route>
          {/* /ingresar con la sesión lista, o cualquier ruta desconocida: a Inicio. */}
          <Route>
            <Redirect to="/" replace />
          </Route>
        </Switch>
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
