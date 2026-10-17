import { mensajeError } from './errores';

test('sin conexión se avisa que lo cargado no se perdió', () => {
  expect(mensajeError(new TypeError('Failed to fetch'), true)).toMatch(/Sin conexión/);
  expect(mensajeError({ message: 'cualquier cosa' }, false)).toMatch(/Sin conexión/);
});

test('errores de negocio de la base', () => {
  expect(mensajeError({ message: 'MES_CERRADO' })).toMatch(/mes está cerrado/);
  expect(mensajeError({ message: 'SIN_ITEMS' })).toMatch(/al menos un producto/);
  expect(mensajeError({ message: 'PRODUCTO_INEXISTENTE' })).toMatch(/ya no existe/);
  expect(mensajeError({ message: 'CIERRE_DESACTUALIZADO' })).toMatch(/cerrá otra vez/);
});

test('demasiados códigos pedidos seguidos', () => {
  expect(mensajeError({ status: 429, message: 'email rate limit exceeded' })).toMatch(/Esperá unos minutos/);
});

test('email sin cuenta: el login no crea usuarios nuevos', () => {
  expect(mensajeError({ status: 422, code: 'otp_disabled', message: 'Signups not allowed for otp' })).toMatch(/no está habilitado/);
  expect(mensajeError({ message: 'Signups not allowed for this instance' })).toMatch(/no está habilitado/);
});

test('códigos de Postgres frecuentes', () => {
  expect(mensajeError({ code: '23505' })).toMatch(/Ya existe/);
  expect(mensajeError({ code: '23503' })).toMatch(/en uso/);
  expect(mensajeError({ code: '42501' })).toMatch(/permiso/);
});

test('cualquier otro error da un mensaje genérico', () => {
  expect(mensajeError({ message: 'raro' })).toBe('Algo salió mal. Probá de nuevo.');
});

test('comprobante repetido: el n.º de operación ya está en otro gasto', () => {
  const e = { code: '23505', message: 'duplicate key value violates unique constraint "gastos_mp_operacion_key"' };
  expect(mensajeError(e)).toBe('Este comprobante ya se cargó.');
  expect(mensajeError({ code: '23505', message: 'duplicate key value violates unique constraint "productos_nombre_key"' })).toMatch(/Ya existe uno/);
});

test('borrar un producto que ya tiene compras sugiere ocultarlo', () => {
  const e = { code: '23503', message: 'update or delete on table "productos" violates foreign key constraint "gasto_items_producto_id_fkey" on table "gasto_items"' };
  expect(mensajeError(e)).toMatch(/ya tiene compras: ocultalo/);
});

test('los errores de la capa de datos ya traen un mensaje para la persona', () => {
  const sinConfig = Object.assign(new Error('Falta configurar la conexión: completá .env.'), { code: 'SIN_CONFIG' });
  const sinConexion = Object.assign(new Error('Sin conexión: no se guardó el cambio de stock. Probá de nuevo.'), { code: 'SIN_CONEXION' });
  expect(mensajeError(sinConfig)).toBe('Falta configurar la conexión: completá .env.');
  // Aunque el navegador diga que no hay red: lo que falta es la configuración.
  expect(mensajeError(sinConfig, false)).toBe('Falta configurar la conexión: completá .env.');
  expect(mensajeError(sinConexion)).toBe('Sin conexión: no se guardó el cambio de stock. Probá de nuevo.');
});
