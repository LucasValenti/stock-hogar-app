-- Una casa que ya está en uso, para probar que db.sql también corre sobre la base de producción
-- (herramientas/pg/correr.mjs --antes, script db:probar:con-datos). Todo inventado, con emails @example.com.
--
-- Se parece a producción: un admin y otro integrante con sueldo y un permiso, un pagador externo sin sueldo,
-- gastos de este mes, una anotación y el mes en curso ya cerrado. db.sql no tiene que depender de que la base esté vacía.
insert into integrantes (id, nombre, email, tipo, creado) values
  ('00000000-0000-0000-0000-000000000ca1', 'Admin Existente', 'admin-existente@example.com', 'integrante', '2025-01-01 12:00:00+00'),
  ('00000000-0000-0000-0000-000000000ca2', 'Otro Existente', 'otro-existente@example.com', 'integrante', '2025-02-01 12:00:00+00'),
  ('00000000-0000-0000-0000-000000000ca3', 'Externo Existente', 'externo-existente@example.com', 'pagador_externo', '2025-03-01 12:00:00+00');
insert into sueldos (integrante_id, sueldo) values
  ('00000000-0000-0000-0000-000000000ca1', 90000000),
  ('00000000-0000-0000-0000-000000000ca2', 60000000);
insert into permisos (integrante_id, permiso) values ('00000000-0000-0000-0000-000000000ca2', 'altas_bajas');
insert into categorias (id, nombre, tipo) values ('00000000-0000-0000-0000-000000000cac', 'Categoría existente', 'servicio');
insert into gastos (fecha, pagado_por, total, modo, categoria_id) values
  (current_date, '00000000-0000-0000-0000-000000000ca1', 2500000, 'total', '00000000-0000-0000-0000-000000000cac'),
  (current_date, '00000000-0000-0000-0000-000000000ca3', 1000000, 'total', '00000000-0000-0000-0000-000000000cac');
insert into anotaciones (texto) values ('Anotación existente');
insert into cierres (mes, total, detalle, cerrado_por)
values (to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM'), 3500000, '{}', '00000000-0000-0000-0000-000000000ca1');
