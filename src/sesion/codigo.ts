// Reglas del ingreso por código, las mismas que stock-hogar/js/pantallas/login.js.

import { esErrorDeRed } from '@/datos/cola';
import { mensajeError } from '@/logica/errores';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODIGO = /^\d{6,10}$/;

export const normalizarEmail = (texto: string): string => texto.trim().toLowerCase();
export const emailValido = (email: string): boolean => EMAIL.test(email);

/** El código se pega a veces con espacios («123 456»): se los quita. */
export const normalizarCodigo = (texto: string): string => texto.replace(/\s/g, '');
export const codigoValido = (codigo: string): boolean => CODIGO.test(codigo);

/** Mensaje cuando verifyOtp falla. Solo se distingue lo que no es culpa del código: red y demasiados intentos. */
export function mensajeDeCodigo(error: unknown): string {
  const status = (error as { status?: number } | null | undefined)?.status;
  if (status === 429 || esErrorDeRed(error)) return mensajeError(error);
  return 'El código no es válido o venció. Pedí uno nuevo.';
}
