-- Usuarios, permisos y perfil: un admin, permisos por integrante, sueldos en una tabla aparte, color de perfil,
-- partes del mes y cierre de mes con permiso.
-- Correr una sola vez en el SQL Editor (o con la CLI de Supabase) y publicar enseguida la web que lo usa:
-- la anterior lee integrantes.sueldo, así que hasta entonces el reparto avisa «falta el sueldo» y guardar un
-- integrante falla.
--
-- Va en una sola transacción: si la copia de los sueldos no coincide, no cambia nada.
-- Corre sin sesión: los disparadores de integrantes solo frenan pedidos con sesión.
-- Lo último que muestra, ya confirmado, es nombre y admin de cada integrante (sin emails): el admin tiene que ser
-- el integrante más antiguo. Si no lo es, se corrige desde la consola, sin sesión, primero sacando el rol y
-- después poniéndolo en el otro:
--   update integrantes set admin = false where admin;
--   update integrantes set admin = true where nombre = '…';

begin;

-- Admin y color de perfil. El índice deja a lo sumo un admin.
alter table integrantes add column if not exists admin boolean not null default false;
alter table integrantes add column if not exists color text
  check (color in ('naranja', 'verde', 'azul', 'rosa', 'violeta', 'amarillo'));
create unique index if not exists integrantes_un_admin on integrantes (admin) where admin;

-- Permisos de cada integrante; el admin los tiene todos sin filas acá.
create table if not exists permisos (
  integrante_id uuid not null references integrantes on delete cascade,
  permiso text not null check (permiso in ('sueldos', 'altas_bajas')),
  primary key (integrante_id, permiso)
);

-- Sueldos aparte: solo los lee y los escribe quien tiene el permiso «sueldos». Sin fila, sin sueldo.
create table if not exists sueldos (
  integrante_id uuid primary key references integrantes on delete cascade,
  sueldo bigint not null check (sueldo >= 0)
);

-- Los sueldos pasan a la tabla nueva y recién entonces se borra la columna. Si la cantidad de filas o la suma
-- no coinciden, aborta y no cambia nada (el mensaje lleva cantidades de filas, nunca montos).
-- Si la columna ya no está porque la migración ya corrió, no hace nada.
do $$
declare
  v_filas bigint;
  v_suma numeric;
  v_copiadas bigint;
  v_suma_copiada numeric;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'integrantes' and column_name = 'sueldo') then
    select count(*), coalesce(sum(sueldo), 0) into v_filas, v_suma from public.integrantes where sueldo is not null;
    insert into public.sueldos (integrante_id, sueldo) select id, sueldo from public.integrantes where sueldo is not null;
    select count(*), coalesce(sum(sueldo), 0) into v_copiadas, v_suma_copiada from public.sueldos;
    if v_copiadas <> v_filas or v_suma_copiada <> v_suma then
      raise exception 'SUELDOS_NO_COINCIDEN: filas copiadas % de %, suma igual: %; no se cambió nada',
        v_copiadas, v_filas, case when v_suma_copiada = v_suma then 'sí' else 'no' end;
    end if;
    alter table public.integrantes drop column sueldo;
  end if;
end $$;

create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.integrantes where id = public.yo_integrante() and admin);
$$;

-- El admin pasa cualquier permiso; un pagador externo, ninguno.
create or replace function tiene_permiso(p text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.integrantes i
    where i.id = public.yo_integrante() and i.tipo = 'integrante'
      and (i.admin or exists (select 1 from public.permisos where integrante_id = i.id and permiso = p))
  );
$$;

-- {"admin": bool, "permisos": [...]} de quien llama (solo sus filas: el admin vuelve con la lista vacía).
create or replace function mi_acceso() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'admin', public.es_admin(),
    'permisos', coalesce((select jsonb_agg(permiso order by permiso) from public.permisos
                          where integrante_id = public.yo_integrante()), '[]'::jsonb)
  );
$$;

revoke execute on function es_admin(), tiene_permiso(text), mi_acceso() from public, anon;
grant execute on function es_admin(), tiene_permiso(text), mi_acceso() to authenticated;

-- Altas, bajas y emails: quien tiene «altas y bajas» (o el admin).
create or replace function puede_editar_integrantes() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.tiene_permiso('altas_bajas');
$$;

alter table permisos enable row level security;
alter table sueldos enable row level security;

drop policy if exists ver on permisos;
drop policy if exists dar on permisos;
drop policy if exists quitar on permisos;
drop policy if exists sueldos on sueldos;
create policy ver on permisos for select to authenticated using (es_de_la_casa());
create policy dar on permisos for insert to authenticated with check (es_admin());
create policy quitar on permisos for delete to authenticated using (es_admin());
create policy sueldos on sueldos for all to authenticated using (tiene_permiso('sueldos')) with check (tiene_permiso('sueldos'));

-- Admin inicial: el integrante de tipo integrante más antiguo por creado (un pagador externo no puede serlo).
-- Va antes de instalar los disparadores de integrantes, así que no depende de que dejen pasar a la migración.
-- Si ya hay admin (la migración ya corrió), no toca nada.
update integrantes set admin = true
where id = (select id from integrantes where tipo = 'integrante' order by creado, id limit 1)
  and not exists (select 1 from integrantes where admin);

-- Reglas de integrantes para los pedidos con sesión (la app). Sin sesión (consola, migraciones) quedan
-- libres, salvo el admin inicial y que un pagador externo no conserva permisos.
-- · Alta: admin solo si todavía no hay ninguno (base nueva) y es de tipo integrante.
-- · La columna admin cambia solo dentro de ceder_admin.
-- · Quien no es admin no cambia email, tipo ni baja, ni borra, a quien es admin o tiene permisos.
-- · Al admin no se lo borra, ni se lo da de baja, ni se lo pasa a externo: primero cede el rol.
create or replace function proteger_integrante() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sesion boolean := auth.jwt() ->> 'email' is not null;
begin
  if tg_op = 'INSERT' then
    if v_sesion then new.admin := false; end if;
    if new.tipo = 'integrante' and not exists (select 1 from public.integrantes where admin) then new.admin := true; end if;
    return new;
  end if;

  if v_sesion then
    if not public.es_admin()
       and (old.admin or exists (select 1 from public.permisos where integrante_id = old.id)) then
      if tg_op = 'DELETE'
         or (new.email, new.tipo, new.activo, new.baja_desde) is distinct from (old.email, old.tipo, old.activo, old.baja_desde) then
        raise exception 'SIN_PERMISO' using errcode = '42501';
      end if;
    end if;
    if old.admin and (tg_op = 'DELETE' or new.tipo <> 'integrante' or (old.activo and not new.activo)
                      or (new.baja_desde is not null and new.baja_desde is distinct from old.baja_desde)) then
      raise exception 'ES_ADMIN' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.admin is distinct from old.admin
       and current_setting('app.ceder_admin', true) is distinct from 'si' then
      raise exception 'SIN_PERMISO' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  if new.tipo <> 'integrante' then delete from public.permisos where integrante_id = old.id; end if;
  return new;
end $$;

create or replace trigger integrantes_proteger before insert or update or delete on integrantes
for each row execute function proteger_integrante();

-- Solo un integrante de tipo integrante tiene permisos (un pagador externo, no).
create or replace function proteger_permiso() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.integrantes where id = new.integrante_id and tipo = 'integrante') then
    raise exception 'SOLO_INTEGRANTES' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace trigger permisos_proteger before insert on permisos
for each row execute function proteger_permiso();

-- El admin pasa el rol a otro integrante activo. Quien cede se queda con los dos permisos como filas
-- (no pierde de golpe los sueldos); al nuevo admin se le borran las suyas porque ya lo puede todo.
create or replace function ceder_admin(p_a uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_yo uuid := public.yo_integrante();
begin
  if not public.es_admin() then raise exception 'SIN_PERMISO' using errcode = '42501'; end if;
  if p_a is null or p_a = v_yo
     or not exists (select 1 from public.integrantes where id = p_a and tipo = 'integrante' and activo) then
    raise exception 'DESTINO_INVALIDO' using errcode = '22023';
  end if;
  -- Primero se saca y después se pone: el índice único no admite dos admins ni por un instante.
  perform set_config('app.ceder_admin', 'si', true);
  update public.integrantes set admin = false where id = v_yo;
  update public.integrantes set admin = true where id = p_a;
  perform set_config('app.ceder_admin', '', true);
  insert into public.permisos (integrante_id, permiso) values (v_yo, 'sueldos'), (v_yo, 'altas_bajas')
  on conflict do nothing;
  delete from public.permisos where integrante_id = p_a;
end $$;

-- Perfil propio: solo nombre y color de quien llama.
create or replace function editar_perfil(p_nombre text, p_color text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_yo uuid := public.yo_integrante();
begin
  if v_yo is null then raise exception 'SIN_PERMISO' using errcode = '42501'; end if;
  update public.integrantes set nombre = p_nombre, color = p_color where id = v_yo;
end $$;

revoke execute on function ceder_admin(uuid), editar_perfil(text, text) from public, anon;
grant execute on function ceder_admin(uuid), editar_perfil(text, text) to authenticated;

-- Cuánto le toca a cada participante del mes, sin mostrar sueldos: su sueldo en partes por 10^12 de la suma
-- de los sueldos de los participantes (sin sueldo, 0; si nadie tiene, todos 0). Participan los integrantes
-- (no los pagadores externos) activos o dados de baja desde un mes posterior. La pide cualquiera de la casa.
create or replace function partes_del_mes(p_mes text) returns table (integrante_id uuid, peso bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.es_de_la_casa() then raise exception 'SIN_PERMISO' using errcode = '42501'; end if;
  if p_mes is null or p_mes !~ '^\d{4}-\d{2}$' then raise exception 'MES_INVALIDO' using errcode = '22023'; end if;
  return query
  with participantes as (
    select i.id, coalesce(s.sueldo, 0) as sueldo
    from public.integrantes i
    left join public.sueldos s on s.integrante_id = i.id
    where i.tipo = 'integrante' and (i.activo or i.baja_desde > p_mes)
  ), total as (
    select sum(p.sueldo) as suma from participantes p
  )
  select p.id,
         case when t.suma > 0 then round(p.sueldo::numeric * 1000000000000 / t.suma)::bigint else 0::bigint end
  from participantes p cross join total t;
end $$;

revoke execute on function partes_del_mes(text) from public, anon;
grant execute on function partes_del_mes(text) to authenticated;

-- Cierra el mes solo si los gastos y los integrantes son los mismos con los que la app calculó el reparto.
-- p_gastos: [{id, total, pagado_por}] · p_integrantes: [{id, sueldo, tipo, activo, baja_desde}] (los sueldos, de la tabla sueldos).
-- Solo quien tiene el permiso «sueldos»: es quien conoce los sueldos con que se calculó.
create or replace function cerrar_mes(p_mes text, p_total bigint, p_detalle jsonb, p_gastos jsonb, p_integrantes jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_yo uuid := public.yo_integrante();
  v_desde date;
begin
  if not public.tiene_permiso('sueldos') then raise exception 'SIN_PERMISO' using errcode = '42501'; end if;
  v_desde := (p_mes || '-01')::date;
  -- Nadie guarda un gasto de este mes mientras se compara y se cierra.
  lock table public.gastos in share row exclusive mode;
  if exists (select 1 from public.cierres where mes = p_mes) then raise exception 'MES_CERRADO'; end if;

  if exists (
    (select id, total, pagado_por from public.gastos where fecha >= v_desde and fecha < v_desde + interval '1 month')
    except
    (select (e ->> 'id')::uuid, (e ->> 'total')::bigint, (e ->> 'pagado_por')::uuid from jsonb_array_elements(p_gastos) e)
  ) or exists (
    (select (e ->> 'id')::uuid, (e ->> 'total')::bigint, (e ->> 'pagado_por')::uuid from jsonb_array_elements(p_gastos) e)
    except
    (select id, total, pagado_por from public.gastos where fecha >= v_desde and fecha < v_desde + interval '1 month')
  ) or exists (
    (select i.id, s.sueldo, i.tipo, i.activo, i.baja_desde
     from public.integrantes i left join public.sueldos s on s.integrante_id = i.id)
    except
    (select (e ->> 'id')::uuid, (e ->> 'sueldo')::bigint, e ->> 'tipo', (e ->> 'activo')::boolean, e ->> 'baja_desde'
     from jsonb_array_elements(p_integrantes) e)
  ) or exists (
    (select (e ->> 'id')::uuid, (e ->> 'sueldo')::bigint, e ->> 'tipo', (e ->> 'activo')::boolean, e ->> 'baja_desde'
     from jsonb_array_elements(p_integrantes) e)
    except
    (select i.id, s.sueldo, i.tipo, i.activo, i.baja_desde
     from public.integrantes i left join public.sueldos s on s.integrante_id = i.id)
  ) then
    raise exception 'CIERRE_DESACTUALIZADO';
  end if;

  insert into public.cierres (mes, total, detalle, cerrado_por) values (p_mes, p_total, p_detalle, v_yo);
end $$;

create or replace function reabrir_mes(p_mes text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.tiene_permiso('sueldos') then raise exception 'SIN_PERMISO' using errcode = '42501'; end if;
  delete from public.cierres where mes = p_mes;
end $$;

revoke execute on function cerrar_mes(text, bigint, jsonb, jsonb, jsonb), reabrir_mes(text) from public, anon;
grant execute on function cerrar_mes(text, bigint, jsonb, jsonb, jsonb), reabrir_mes(text) to authenticated;

-- Tiempo real: permisos y sueldos entran a la publicación.
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['permisos', 'sueldos'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabla) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabla);
    end if;
  end loop;
end $$;

commit;

-- Para revisar: el admin tiene que ser el integrante más antiguo (sin emails).
select nombre, admin from integrantes order by creado;
