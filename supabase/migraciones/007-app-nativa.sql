-- App nativa: unidades, último movimiento del stock, anotaciones y compras por total con productos tildados.
-- Correr una sola vez en el SQL Editor (o con la CLI de Supabase), antes de publicar la app que lo usa.
-- La web vieja sigue andando igual: lo nuevo llega por claves nuevas de p_gasto (tildados, anotaciones).

-- Cómo se cuenta cada producto.
alter table productos add column if not exists unidad text not null default 'unidad'
  check (unidad in ('unidad', 'paquete', 'kg', 'litro'));

-- Última vez que el stock se movió o que alguien confirmó que sigue habiendo.
alter table productos add column if not exists ultimo_movimiento timestamptz not null default now();

-- Días sin movimiento después de los cuales la app pregunta si sigue habiendo.
alter table categorias add column if not exists dias_sin_movimiento int not null default 20
  check (dias_sin_movimiento between 1 and 365);

-- Un producto tildado en una compra por total no tiene precio propio.
alter table gasto_items alter column precio_unitario drop not null;

create or replace function marcar_movimiento() returns trigger
language plpgsql as $$
begin
  new.ultimo_movimiento := now();
  return new;
end $$;

create or replace trigger productos_movimiento before update of stock on productos
for each row when (new.stock is distinct from old.stock) execute function marcar_movimiento();

-- Anotaciones sueltas para la próxima compra («comprar pan»); se tildan al guardar el gasto.
create table if not exists anotaciones (
  id uuid primary key default gen_random_uuid(),
  texto text not null check (length(trim(texto)) between 1 and 120),
  creado_por uuid references integrantes default yo_integrante(),
  creado timestamptz not null default now()
);
alter table anotaciones enable row level security;
drop policy if exists casa on anotaciones;
create policy casa on anotaciones for all to authenticated using (es_de_la_casa()) with check (es_de_la_casa());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'anotaciones') then
    alter publication supabase_realtime add table anotaciones;
  end if;
end $$;

-- Alta o edición de un gasto con sus ítems, todo junto o nada.
-- Alta con id elegido por la app (nuevo_id): si se reintenta tras un corte, no se duplica.
-- creado_por sale de la cuenta que guarda, no de lo que manda la app.
-- Por total, p_gasto.tildados = [{producto_id, cantidad}] suma stock sin precio; sin esa clave (web vieja),
-- al editar se conservan los tildados que ya tenía. p_gasto.anotaciones = [uuid] se borran en la misma transacción.
create or replace function guardar_gasto(p_gasto jsonb, p_items jsonb) returns uuid
language plpgsql as $$
declare
  v_id uuid := nullif(p_gasto ->> 'id', '')::uuid;
  v_nuevo uuid := coalesce(nullif(p_gasto ->> 'nuevo_id', '')::uuid, gen_random_uuid());
  v_modo text := p_gasto ->> 'modo';
  v_destino text := nullif(p_gasto ->> 'destino', '');
  v_tildados jsonb := case when jsonb_typeof(p_gasto -> 'tildados') = 'array' then p_gasto -> 'tildados' end;
begin
  if v_id is not null then
    -- Se borran y se vuelven a insertar: el trigger de stock descuenta lo viejo y suma lo nuevo.
    delete from gasto_items
    where gasto_id = v_id
      and (v_modo <> 'total' or v_tildados is not null or precio_unitario is not null);
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
    -- Ya estaba guardado (la respuesta anterior se perdió): se devuelve antes del insert, así un
    -- reintento no choca con el trigger de mes cerrado si el mes se cerró después.
    if exists (select 1 from gastos where id = v_nuevo) then return v_nuevo; end if;
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
    -- Dos reintentos a la vez: el que llega segundo no repite los ítems.
    if not found then return v_nuevo; end if;
    v_id := v_nuevo;
  end if;

  if v_modo = 'productos' then
    -- Por productos, cada ítem lleva precio (como antes, cuando la columna no admitía null).
    if exists (select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i where i ->> 'precio_unitario' is null) then
      raise exception 'SIN_PRECIO' using errcode = '23502';
    end if;
    insert into gasto_items (gasto_id, producto_id, cantidad, precio_unitario)
    select v_id, (i ->> 'producto_id')::uuid, (i ->> 'cantidad')::numeric, (i ->> 'precio_unitario')::bigint
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as i;
    if not found then raise exception 'SIN_ITEMS'; end if;
    update gastos
    set total = (select sum(round(cantidad * precio_unitario))::bigint from gasto_items where gasto_id = v_id)
    where id = v_id;
  else
    if v_tildados is not null then
      insert into gasto_items (gasto_id, producto_id, cantidad, precio_unitario)
      select v_id, (t ->> 'producto_id')::uuid, (t ->> 'cantidad')::numeric, null
      from jsonb_array_elements(v_tildados) as t;
    end if;
    if v_destino is not null then
      -- La categoría elegida para este destinatario se sugiere la próxima vez.
      insert into destinos (nombre, categoria_id)
      values (v_destino, nullif(p_gasto ->> 'categoria_id', '')::uuid)
      on conflict (nombre) do update set categoria_id = excluded.categoria_id;
    end if;
  end if;

  if jsonb_typeof(p_gasto -> 'anotaciones') = 'array' then
    delete from anotaciones
    where id in (select a::uuid from jsonb_array_elements_text(p_gasto -> 'anotaciones') as a);
  end if;

  return v_id;
end $$;

revoke execute on function guardar_gasto(jsonb, jsonb) from public, anon;
grant execute on function guardar_gasto(jsonb, jsonb) to authenticated;

-- «Sigue habiendo»: renueva la fecha del último movimiento sin tocar el stock.
create or replace function confirmar_hay(p_producto uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.es_de_la_casa() then raise exception 'SIN_PERMISO' using errcode = '42501'; end if;
  update public.productos set ultimo_movimiento = now() where id = p_producto;
  if not found then raise exception 'PRODUCTO_INEXISTENTE'; end if;
end $$;

revoke execute on function confirmar_hay(uuid) from public, anon;
grant execute on function confirmar_hay(uuid) to authenticated;

-- Último precio pagado por producto (precio propuesto al cargar). Los tildados sin precio no cuentan.
create or replace view ultimo_precio with (security_invoker = true) as
select distinct on (gi.producto_id) gi.producto_id, gi.precio_unitario, g.fecha
from gasto_items gi
join gastos g on g.id = gi.gasto_id
where gi.precio_unitario is not null
order by gi.producto_id, g.fecha desc, g.creado desc;
