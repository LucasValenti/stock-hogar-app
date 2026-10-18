// Ingreso en dos pasos, sin contraseña: el email y después el código que llega por correo.
// Mismos textos y reglas que stock-hogar/js/pantallas/login.js. Si el código sirve, Supabase guarda la
// sesión y avisa: el layout raíz cambia solo a la app (esta pantalla no navega).

import { useState } from 'react';
import { View } from 'react-native';

import { mensajeError } from '@/logica/errores';
import { pedirCodigo, verificarCodigo } from '@/sesion/acceso';
import { codigoValido, emailValido, mensajeDeCodigo, normalizarCodigo, normalizarEmail } from '@/sesion/codigo';
import { useSesion } from '@/sesion/sesion';
import { Campo, Pagina } from '@/sesion/ui';
import { useTema } from '@/tema/tema';
import { Boton } from '@/ui/Boton';
import { Texto } from '@/ui/Texto';

export default function Ingresar() {
  const tema = useTema();
  const { entrarDemo } = useSesion();
  const [paso, setPaso] = useState<'email' | 'codigo'>('email');
  const [email, setEmail] = useState('');
  // El email al que se mandó el código (ya limpio): es con el que se verifica.
  const [enviadoA, setEnviadoA] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviarCodigo() {
    if (enviando) return;
    const limpio = normalizarEmail(email);
    if (!emailValido(limpio)) {
      setError('Escribí un email válido.');
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await pedirCodigo(limpio);
      setEnviadoA(limpio);
      setCodigo('');
      setPaso('codigo');
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setEnviando(false);
    }
  }

  async function entrar() {
    if (enviando) return;
    const token = normalizarCodigo(codigo);
    if (!codigoValido(token)) {
      setError('El código son solo números.');
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await verificarCodigo(enviadoA, token);
    } catch (e) {
      setError(mensajeDeCodigo(e));
    } finally {
      setEnviando(false);
    }
  }

  function otroEmail() {
    setError(null);
    setPaso('email');
  }

  // Cada paso con su `key`: así el campo del código se crea de nuevo y toma el foco (autoFocus solo actúa al montarse).
  if (paso === 'codigo') {
    return (
      <Pagina key="codigo">
        <Texto variante="tituloTarjeta">Ingresá el código</Texto>
        <Texto>{`Te mandamos un código a ${enviadoA}. Puede tardar un minuto; revisá también spam.`}</Texto>
        <Campo
          etiqueta="Código"
          value={codigo}
          onChangeText={setCodigo}
          error={error}
          inputMode="numeric"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={10}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={entrar}
        />
        <View style={{ gap: tema.espacio.s }}>
          <Boton texto="Entrar" onPress={entrar} ocupado={enviando} />
          <Boton texto="Usar otro email" onPress={otroEmail} variante="borde" />
        </View>
      </Pagina>
    );
  }

  return (
    <Pagina key="email">
      <Texto variante="tituloTarjeta">Stock del hogar</Texto>
      <Texto>Ingresá con tu email: te mandamos un código para entrar.</Texto>
      <Campo
        etiqueta="Tu email"
        value={email}
        onChangeText={setEmail}
        error={error}
        inputMode="email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={enviarCodigo}
      />
      <Boton texto="Enviarme un código" onPress={enviarCodigo} ocupado={enviando} />
      <View style={{ gap: tema.espacio.s }}>
        <Boton texto="Probar la demo" onPress={entrarDemo} variante="borde" />
        <Texto variante="sub" centrado>Con datos inventados de una casa de ejemplo. No se guarda nada.</Texto>
      </View>
    </Pagina>
  );
}
