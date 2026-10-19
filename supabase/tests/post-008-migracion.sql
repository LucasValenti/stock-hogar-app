-- Comprobaciones justo después de la migración 008, sobre los datos de pre-008-datos.sql
-- (herramientas/pg/correr.mjs --despues). Corre sin sesión, igual que la migración.
-- Si algo no se cumple, corta con un error que empieza con FALLA.
do $$
begin
  -- Los sueldos pasaron enteros a la tabla nueva: los de los tres que tenían (el externo incluido), a nombre de su dueño.
  if (select count(*) from sueldos) <> 3 then
    raise exception 'FALLA: sueldos tiene % filas y tenían que ser 3', (select count(*) from sueldos);
  end if;
  if (select sum(sueldo) from sueldos) <> 400000000 then
    raise exception 'FALLA: la suma de sueldos cambió con la migración';
  end if;
  if (select s.sueldo from sueldos s join integrantes i on i.id = s.integrante_id where i.email = 'medio-pre@example.com') is distinct from 150000000
     or (select s.sueldo from sueldos s join integrantes i on i.id = s.integrante_id where i.email = 'viejo-pre@example.com') is distinct from 200000000
     or (select s.sueldo from sueldos s join integrantes i on i.id = s.integrante_id where i.email = 'externo-pre@example.com') is distinct from 50000000 then
    raise exception 'FALLA: algún sueldo quedó a nombre de otra persona';
  end if;
  if exists (select 1 from sueldos s join integrantes i on i.id = s.integrante_id where i.email = 'nuevo-pre@example.com') then
    raise exception 'FALLA: quien no tenía sueldo no puede tener fila en sueldos';
  end if;

  -- La columna vieja ya no está.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'integrantes' and column_name = 'sueldo') then
    raise exception 'FALLA: integrantes todavía tiene la columna sueldo';
  end if;

  -- Exactamente un admin: el integrante más antiguo (Viejo Pre), no el pagador externo que es aún más viejo.
  if (select count(*) from integrantes where admin) <> 1 then
    raise exception 'FALLA: tiene que haber exactamente un admin y hay %', (select count(*) from integrantes where admin);
  end if;
  if not exists (select 1 from integrantes where admin and email = 'viejo-pre@example.com' and tipo = 'integrante') then
    raise exception 'FALLA: el admin no es el integrante de tipo integrante más antiguo';
  end if;

  -- Nadie tiene permisos todavía ni color elegido: eso lo decide el admin desde la app.
  if exists (select 1 from permisos) then raise exception 'FALLA: la migración no debe dar permisos'; end if;
  if exists (select 1 from integrantes where color is not null) then raise exception 'FALLA: la migración no debe elegir colores'; end if;

  -- permisos y sueldos entraron al tiempo real.
  if (select count(*) from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('permisos', 'sueldos')) <> 2 then
    raise exception 'FALLA: permisos y sueldos tienen que estar en la publicación supabase_realtime';
  end if;
end $$;

-- Sin sesión (la migración, la consola) los disparadores de integrantes no frenan nada. Se prueba lo que haría
-- quien corrige el admin a mano, como dice el encabezado de 008, y que un alta sin sesión no se vuelve admin.
do $$
begin
  update integrantes set admin = false where admin;
  update integrantes set admin = true where email = 'medio-pre@example.com';
  if (select count(*) from integrantes where admin) <> 1
     or not exists (select 1 from integrantes where admin and email = 'medio-pre@example.com') then
    raise exception 'FALLA: sin sesión no se pudo pasar el admin a otro integrante';
  end if;

  update integrantes set email = 'cambiado-pre@example.com', tipo = 'pagador_externo', activo = false, baja_desde = '2026-01' where admin;
  update integrantes set email = 'medio-pre@example.com', tipo = 'integrante', activo = true, baja_desde = null where admin;
  if not exists (select 1 from integrantes where admin and email = 'medio-pre@example.com' and tipo = 'integrante' and activo and baja_desde is null) then
    raise exception 'FALLA: sin sesión no se pudieron cambiar el email, el tipo y la baja del admin';
  end if;

  update integrantes set admin = false where admin;
  update integrantes set admin = true where email = 'viejo-pre@example.com';

  insert into integrantes (id, nombre, email) values ('00000000-0000-0000-0000-0000000008f5', 'Alta Post', 'alta-post@example.com');
  if (select admin from integrantes where email = 'alta-post@example.com') then
    raise exception 'FALLA: un alta sin sesión no puede quedar como admin si ya hay uno';
  end if;
  delete from integrantes where email = 'alta-post@example.com';

  if (select count(*) from integrantes where admin) <> 1
     or not exists (select 1 from integrantes where admin and email = 'viejo-pre@example.com') then
    raise exception 'FALLA: el admin no volvió a ser Viejo Pre';
  end if;
end $$;

-- Se van los integrantes de la prueba (con sus sueldos, en cascada) para que db.sql corra igual que en una instalación limpia.
-- Entre ellos está el admin: borrarlo sin sesión tampoco lo frena el disparador.
delete from integrantes where id in (
  '00000000-0000-0000-0000-0000000008f1', '00000000-0000-0000-0000-0000000008f2',
  '00000000-0000-0000-0000-0000000008f3', '00000000-0000-0000-0000-0000000008f4');
do $$
begin
  if exists (select 1 from integrantes) or exists (select 1 from sueldos) or exists (select 1 from permisos) then
    raise exception 'FALLA: después de limpiar los datos de prueba quedaron filas';
  end if;
end $$;
