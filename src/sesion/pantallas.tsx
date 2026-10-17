// Pantallas de la sesión que no son el ingreso: cargando, error al abrir y cuenta ajena.

import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { mensajeError } from '@/logica/errores';
import { useTema } from '@/tema/tema';

import { useSesion } from './sesion';
import { Boton } from '@/ui/Boton';
import { Texto } from '@/ui/Texto';

import { Alerta, Pagina } from './ui';

/** Mientras cargan las fuentes y la sesión: nunca una pantalla en blanco. */
export function PantallaCarga() {
  const tema = useTema();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tema.color.fondo }}>
      <ActivityIndicator size="large" color={tema.color.acento} accessibilityLabel="Cargando" />
    </View>
  );
}

/**
 * No se pudo saber quién es la persona: falta la configuración (.env) o no hay conexión.
 * Si hay una sesión abierta, también se puede cerrar (por ejemplo, para entrar con otra cuenta).
 */
export function PantallaError({ error, onReintentar }: { error: unknown; onReintentar: () => void }) {
  const { email } = useSesion();
  return (
    <Pagina>
      <Texto variante="tituloTarjeta">No se pudo abrir la app</Texto>
      <Alerta>{mensajeError(error)}</Alerta>
      <Boton texto="Probar de nuevo" onPress={onReintentar} />
      {email ? <CerrarSesion variante="borde" /> : null}
    </Pagina>
  );
}

/** La cuenta existe pero nadie de la casa la agregó como integrante. */
export function PantallaAjena() {
  const { email } = useSesion();
  return (
    <Pagina>
      <Texto variante="tituloTarjeta">Esta cuenta no pertenece a la casa</Texto>
      <Texto>{`Pedile a alguien de la casa que agregue ${email ?? 'tu email'} en Ajustes → Integrantes.`}</Texto>
      <CerrarSesion />
    </Pagina>
  );
}

/** «Cerrar sesión», con su espera y el error si no pudo. */
function CerrarSesion({ variante }: { variante?: 'lleno' | 'borde' }) {
  const { salir } = useSesion();
  const [saliendo, setSaliendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cerrar() {
    setError(null);
    setSaliendo(true);
    try {
      await salir();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setSaliendo(false);
    }
  }

  return (
    <>
      {error ? <Alerta>{error}</Alerta> : null}
      <Boton texto="Cerrar sesión" variante={variante} onPress={cerrar} ocupado={saliendo} />
    </>
  );
}
