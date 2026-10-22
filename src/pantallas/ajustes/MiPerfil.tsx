// Mi perfil (Ajustes): cada uno cambia su nombre y el color de su círculo, y nada más (`editarPerfil`).
// El círculo de la izquierda muestra cómo queda mientras se elige.
import { useEffect, useState } from 'react';

import { datos } from '@/datos';
import { mensajeError } from '@/logica/errores';
import { COLORES_PERFIL } from '@/logica/perfil';
import type { ColorPerfil, Integrante } from '@/logica/tipos';
import { Avatar } from '@/ui/Avatar';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';
import { Icono } from '@/ui/Icono';
import { MensajeError } from '@/ui/MensajeError';
import { Tarjeta } from '@/ui/Tarjeta';

import comunes from '../Ajustes.module.css';
import estilos from './ajustes.module.css';

const NOMBRE_COLOR: Record<ColorPerfil, string> = {
  naranja: 'Naranja',
  verde: 'Verde',
  azul: 'Azul',
  rosa: 'Rosa',
  violeta: 'Violeta',
  amarillo: 'Amarillo',
};

export function MiPerfil({ yo, alGuardar }: { yo: Integrante; alGuardar(aviso: string): void }) {
  const [nombre, setNombre] = useState(yo.nombre);
  const [color, setColor] = useState<ColorPerfil | null>(yo.color);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Si cambia en la base (otro dispositivo, o recién guardado), el formulario lo sigue.
  useEffect(() => {
    setNombre(yo.nombre);
    setColor(yo.color);
  }, [yo.id, yo.nombre, yo.color]);

  async function guardar() {
    setError(null);
    const limpio = nombre.trim();
    setErrorNombre(limpio ? null : 'Escribí un nombre.');
    if (!limpio) return;
    setOcupado(true);
    try {
      await datos.editarPerfil(limpio, color);
      alGuardar('Perfil guardado.'); // [PENDIENTE: validar con Lucas]
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Tarjeta className={estilos.perfil}>
      <div className={estilos.cabecera}>
        <Avatar nombre={nombre.trim() || yo.nombre} color={color} />
        <Campo
          className={estilos.nombre}
          etiqueta="Tu nombre" // [PENDIENTE: validar con Lucas]
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          error={errorNombre}
          autoComplete="name"
        />
      </div>
      <div className={comunes.tipo}>
        <p className={comunes.rotulo}>Color</p>
        {/* [PENDIENTE: validar con Lucas] «Color» y los nombres de los colores */}
        <div role="radiogroup" aria-label="Color" className={estilos.colores}>
          {COLORES_PERFIL.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === color}
              aria-label={NOMBRE_COLOR[c]}
              className={estilos.color}
              style={{ backgroundColor: `var(--color-perfil-${c})` }}
              onClick={() => setColor(c)}
            >
              {c === color ? <Icono nombre="ok" tamano={20} grueso /> : null}
            </button>
          ))}
        </div>
      </div>
      <MensajeError texto={error} />
      <Boton texto="Guardar perfil" variante="borde" ocupado={ocupado} onClick={() => void guardar()} />
      {/* [PENDIENTE: validar con Lucas] «Guardar perfil» */}
    </Tarjeta>
  );
}
