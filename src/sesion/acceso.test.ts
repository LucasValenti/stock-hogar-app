// Las llamadas de ingreso a Supabase Auth, con el cliente simulado.

const mockAuth = {
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
};
vi.mock('@/datos/cliente', () => ({ obtenerCliente: () => ({ auth: mockAuth }) }));

import { cerrarSesion, pedirCodigo, verificarCodigo } from './acceso';

beforeEach(() => {
  mockAuth.signInWithOtp.mockReset().mockResolvedValue({ error: null });
  mockAuth.verifyOtp.mockReset().mockResolvedValue({ error: null });
  mockAuth.signOut.mockReset().mockResolvedValue({ error: null });
});

describe('pedirCodigo', () => {
  test('manda el código sin crear cuentas nuevas', async () => {
    await pedirCodigo('ana@example.com');
    expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({ email: 'ana@example.com', options: { shouldCreateUser: false } });
  });

  test('si Supabase responde con error, lo lanza', async () => {
    const error = { status: 429, message: 'email rate limit exceeded' };
    mockAuth.signInWithOtp.mockResolvedValue({ error });
    await expect(pedirCodigo('ana@example.com')).rejects.toBe(error);
  });
});

describe('verificarCodigo', () => {
  test('verifica el código de un solo uso del email', async () => {
    await verificarCodigo('ana@example.com', '123456');
    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({ email: 'ana@example.com', token: '123456', type: 'email' });
  });

  test('si el código no sirve, lanza el error', async () => {
    const error = { status: 403, message: 'Token has expired or is invalid' };
    mockAuth.verifyOtp.mockResolvedValue({ error });
    await expect(verificarCodigo('ana@example.com', '000000')).rejects.toBe(error);
  });
});

describe('cerrarSesion', () => {
  test('cierra solo en este dispositivo, así anda también sin red', async () => {
    await cerrarSesion();
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  test('si falla, lanza el error', async () => {
    const error = new Error('no se pudo');
    mockAuth.signOut.mockResolvedValue({ error });
    await expect(cerrarSesion()).rejects.toBe(error);
  });
});
