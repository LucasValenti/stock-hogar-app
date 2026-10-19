// Ingreso en dos pasos, sin contraseña: el email y después el código que llega por correo.
// Si el código sirve, Supabase guarda la sesión y avisa: la app cambia sola (esta pantalla no navega).
import { useState, type FormEvent } from 'react';

import { mensajeError } from '@/logica/errores';
import { pedirCodigo, verificarCodigo } from '@/sesion/acceso';
import { codigoValido, emailValido, mensajeDeCodigo, normalizarCodigo, normalizarEmail } from '@/sesion/codigo';
import { useSesion } from '@/sesion/sesion';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';

import { Pagina } from './Pagina';
import estilos from './Pagina.module.css';

export function Ingresar() {
  const { entrarDemo } = useSesion();
  const [paso, setPaso] = useState<'email' | 'codigo'>('email');
  const [email, setEmail] = useState('');
  // El email al que se mandó el código (ya limpio): es con el que se verifica.
  const [enviadoA, setEnviadoA] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviarCodigo(e: FormEvent) {
    e.preventDefault();
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
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  async function entrar(e: FormEvent) {
    e.preventDefault();
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
    } catch (err) {
      setError(mensajeDeCodigo(err));
    } finally {
      setEnviando(false);
    }
  }

  function otroEmail() {
    setError(null);
    setPaso('email');
  }

  // Cada paso con su `key`: el campo del código se crea de nuevo y toma el foco.
  if (paso === 'codigo') {
    return (
      <Pagina key="codigo">
        <h1>Ingresá el código</h1>
        <p>{`Te mandamos un código a ${enviadoA}. Puede tardar un minuto; revisá también spam.`}</p>
        <form className={estilos.grupo} onSubmit={entrar} noValidate>
          <Campo
            etiqueta="Código"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            error={error}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            autoFocus
          />
          <div className={estilos.grupo}>
            <Boton type="submit" texto="Entrar" ocupado={enviando} />
            <Boton texto="Usar otro email" onClick={otroEmail} variante="borde" />
          </div>
        </form>
      </Pagina>
    );
  }

  return (
    <Pagina key="email">
      <h1>Stock del hogar</h1>
      <p>Ingresá con tu email: te mandamos un código para entrar.</p>
      <form className={estilos.grupo} onSubmit={enviarCodigo} noValidate>
        <Campo
          etiqueta="Tu email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="email"
          spellCheck={false}
        />
        <Boton type="submit" texto="Enviarme un código" ocupado={enviando} />
      </form>
      <div className={estilos.grupo}>
        <Boton texto="Probar la demo" onClick={entrarDemo} variante="borde" />
        <p className={estilos.sub}>Con datos inventados de una casa de ejemplo. No se guarda nada.</p>
      </div>
    </Pagina>
  );
}
