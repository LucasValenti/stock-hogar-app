-- Robustez: cierre de mes en el servidor, permisos de escritura y gastos sin duplicar.
-- Correr una sola vez en el SQL Editor (o con la CLI de Supabase), antes de publicar la app que lo usa.

-- El mes de la baja se cuenta en hora argentina, no en UTC.
create or replace function es_de_la_casa() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.integrantes
    where email = lower(auth.jwt() ->> 'email')
      and (activo or baja_desde > to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM'))
  );
$$;

-- Integrante vigente de la cuenta actual, o null.
create function yo_integrante() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.integrantes
  where email = lower(auth.jwt() ->> 'email')
    and (activo or baja_desde > to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM'));
$$;

-- Un pagador externo ve a los integrantes pero no los cambia (sueldos, emails, altas y bajas).
create function puede_editar_integrantes() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.integrantes where id = public.yo_integrante() and tipo = 'integrante');
$$;

drop policy casa on integrantes;
create policy ver on integrantes for select to authenticated using (es_de_la_casa());
create policy alta on integrantes for insert to authenticated with check (puede_editar_integrantes());
create policy cambio on integrantes for update to authenticated using (puede_editar_integrantes()) with check (puede_editar_integrantes());
create policy baja on integrantes for delete to authenticated using (puede_editar_integrantes());

-- Los cierres solo se leen: se crean y se borran con cerrar_mes y reabrir_mes.
drop policy casa on cierres;
create policy ver on cierres for select to authenticated using (es_de_la_casa());

-- Cierra el mes solo si los gastos y los integrantes son los mismos con los que la app calculó el reparto.
-- p_gastos: [{id, total, pagado_por}] · p_integrantes: [{id, sueldo, tipo, activo, baja_desde}].
create function cerrar_mes(p_mes text, p_total bigint, p_detalle jsonb, p_gastos jsonb, p_integrantes jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_yo uuid := public.yo_integrante();
  v_desde date := (p_mes || '-01')::date;
begin
  if v_yo is null then raise exception 'SIN_PERMISO' using errcode = '42501'; end if;
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
    (select id, sueldo, tipo, activo, baja_desde from public.integrantes)
    except
    (select (e ->> 'id')::uuid, (e ->> 'sueldo')::bigint, e ->> 'tipo', (e ->> 'activo')::boolean, e ->> 'baja_desde'
     from jsonb_array_elements(p_integrantes) e)
  ) or exists (
    (select (e ->> 'id')::uuid, (e ->> 'sueldo')::bigint, e ->> 'tipo', (e ->> 'activo')::boolean, e ->> 'baja_desde'
     from jsonb_array_elements(p_integrantes) e)
    except
    (select id, sueldo, tipo, activo, baja_desde from public.integrantes)
  ) then
    raise exception 'CIERRE_DESACTUALIZADO';
  end if;

  insert into public.cierres (mes, total, detalle, cerrado_por) values (p_mes, p_total, p_detalle, v_yo);
end $$;

create function reabrir_mes(p_mes text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.yo_integrante() is null then raise exception 'SIN_PERMISO' using errcode = '42501'; end if;
  delete from public.cierres where mes = p_mes;
end $$;

revoke execute on function cerrar_mes(text, bigint, jsonb, jsonb, jsonb), reabrir_mes(text) from public, anon;
grant execute on function cerrar_mes(text, bigint, jsonb, jsonb, jsonb), reabrir_mes(text) to authenticated;

-- Alta con id elegido por la app (nuevo_id): si se reintenta tras un corte, no se duplica.
-- creado_por sale de la cuenta que guarda, no de lo que manda la app.
create or replace function guardar_gasto(p_gasto jsonb, p_items jsonb) returns uuid
language plpgsql as $$
declare
  v_id uuid := nullif(p_gasto ->> 'id', '')::uuid;
  v_nuevo uuid := coalesce(nullif(p_gasto ->> 'nuevo_id', '')::uuid, gen_random_uuid());
  v_modo text := p_gasto ->> 'modo';
  v_destino text := nullif(p_gasto ->> 'destino', '');
begin
  if v_id is not null then
    delete from gasto_items where gasto_id = v_id;
    update gastos set
      fecha = (p_gasto ->> 'fecha')::date,
      pagado_por = (p_gasto ->> 'pagado_por')::uuid,
      total = (p_gasto ->> 'total')::bigint,
      modo = v_modo,
      categoria_id = nullif(p_gasto ->> 'categoria_id', '')::uuid,
      nota = nullif(p_gasto ->> 'nota', '')
    where id = v_id;
    if not found then raise exception 'GASTO_INEXISTENTE'; end if;
  else
    insert into gastos (id, fecha, pagado_por, total, modo, categoria_id, nota, creado_por, mp_operacion)
    values (
      v_nuevo,
      (p_gasto ->> 'fecha')::date,
      (p_gasto ->> 'pagado_por')::uuid,
      (p_gasto ->> 'total')::bigint,
      v_modo,
      nullif(p_gasto ->> 'categoria_id', '')::uuid,
      nullif(p_gasto ->> 'nota', ''),
      yo_integrante(),
      nullif(p_gasto ->> 'mp_operacion', '')
    )
    on conflict (id) do nothing;
    -- Ya estaba guardado (la respuesta anterior se perdió): no se repiten los ítems.
    if not found then return v_nuevo; end if;
    v_id := v_nuevo;
  end if;

  if v_modo = 'productos' then
    insert into gasto_items (gasto_id, producto_id, cantidad, precio_unitario)
    select v_id, (i ->> 'producto_id')::uuid, (i ->> 'cantidad')::numeric, (i ->> 'precio_unitario')::bigint
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i;
    if not found then raise exception 'SIN_ITEMS'; end if;
    update gastos
    set total = (select sum(round(cantidad * precio_unitario))::bigint from gasto_items where gasto_id = v_id)
    where id = v_id;
  elsif v_destino is not null then
    -- La categoría elegida para este destinatario se sugiere la próxima vez.
    insert into destinos (nombre, categoria_id)
    values (v_destino, nullif(p_gasto ->> 'categoria_id', '')::uuid)
    on conflict (nombre) do update set categoria_id = excluded.categoria_id;
  end if;

  return v_id;
end $$;
