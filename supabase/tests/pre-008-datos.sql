-- Datos de antes de la migración 008, solo para probarla en local (herramientas/pg/correr.mjs --antes).
-- Esquema de partida: schema-pre-008.sql, donde el sueldo todavía vive en integrantes.sueldo.
-- Todo inventado, con emails @example.com: nunca datos reales.
--
-- El pagador externo es el más viejo de todos y el integrante más antiguo se carga último y no tiene el
-- id más bajo: así el admin inicial solo sale bien si la migración mira el tipo y la columna creado.
insert into integrantes (id, nombre, email, tipo, sueldo, creado) values
  ('00000000-0000-0000-0000-0000000008f1', 'Medio Pre', 'medio-pre@example.com', 'integrante', 150000000, '2025-02-01 12:00:00+00'),
  ('00000000-0000-0000-0000-0000000008f2', 'Nuevo Pre', 'nuevo-pre@example.com', 'integrante', null, '2025-09-01 12:00:00+00'),
  ('00000000-0000-0000-0000-0000000008f4', 'Externo Pre', 'externo-pre@example.com', 'pagador_externo', 50000000, '2024-01-01 12:00:00+00'),
  ('00000000-0000-0000-0000-0000000008f3', 'Viejo Pre', 'viejo-pre@example.com', 'integrante', 200000000, '2024-06-01 12:00:00+00');
