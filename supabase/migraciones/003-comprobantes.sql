-- Comprobantes de MP: n.º de operación único y categoría aprendida por destinatario.
-- Correr una sola vez en el SQL Editor (o con la CLI de Supabase).

alter table gastos add column mp_operacion text unique;

-- nombre: el destinatario normalizado en la app (minúsculas, sin tildes).
create table destinos (
  nombre text primary key,
  categoria_id uuid not null references categorias on delete cascade
);
alter table destinos enable row level security;
create policy casa on destinos for all to authenticated using (es_de_la_casa()) with check (es_de_la_casa());

create or replace function guardar_gasto(p_gasto jsonb, p_items jsonb) returns uuid
language plpgsql as $$
declare
  v_id uuid := nullif(p_gasto ->> 'id', '')::uuid;
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
    insert into gastos (fecha, pagado_por, total, modo, categoria_id, nota, creado_por, mp_operacion)
    values (
      (p_gasto ->> 'fecha')::date,
      (p_gasto ->> 'pagado_por')::uuid,
      (p_gasto ->> 'total')::bigint,
      v_modo,
      nullif(p_gasto ->> 'categoria_id', '')::uuid,
      nullif(p_gasto ->> 'nota', ''),
      nullif(p_gasto ->> 'creado_por', '')::uuid,
      nullif(p_gasto ->> 'mp_operacion', '')
    )
    returning id into v_id;
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
