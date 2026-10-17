-- Esquema de Stock del hogar. Correr una sola vez en el SQL Editor de Supabase.

create table integrantes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  sueldo bigint check (sueldo is null or sueldo >= 0),
  email text not null unique check (email = lower(email)),
  activo boolean not null default true,
  baja_desde text check (baja_desde ~ '^\d{4}-\d{2}$'),
  tipo text not null default 'integrante' check (tipo in ('integrante', 'pagador_externo')),
  creado timestamptz not null default now()
);

create table categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(trim(nombre)) > 0),
  tipo text not null check (tipo in ('producto', 'servicio')),
  -- Días sin movimiento después de los cuales la app pregunta si sigue habiendo.
  dias_sin_movimiento int not null default 20 check (dias_sin_movimiento between 1 and 365)
);

create table productos (
  id uuid primary key default gen_random_uuid(),
  codigo_barras text unique,
  nombre text not null check (length(trim(nombre)) > 0),
  marca text,
  categoria_id uuid not null references categorias,
  stock numeric not null default 0 check (stock >= 0),
  oculto boolean not null default false,
  unidad text not null default 'unidad' check (unidad in ('unidad', 'paquete', 'kg', 'litro')),
  -- Última vez que el stock se movió o que alguien confirmó que sigue habiendo.
  ultimo_movimiento timestamptz not null default now(),
  creado timestamptz not null default now()
);

create table gastos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  pagado_por uuid not null references integrantes,
  total bigint not null check (total > 0),
  modo text not null check (modo in ('productos', 'total')),
  categoria_id uuid references categorias,
  nota text,
  creado_por uuid references integrantes,
  creado timestamptz not null default now(),
  mp_operacion text unique,
  check ((modo = 'total' and categoria_id is not null) or (modo = 'productos' and categoria_id is null))
);
create index gastos_fecha on gastos (fecha);

create table gasto_items (
  id uuid primary key default gen_random_uuid(),
  gasto_id uuid not null references gastos on delete cascade,
  producto_id uuid not null references productos,
  cantidad numeric not null check (cantidad > 0),
  -- Null: producto tildado en una compra por total, sin precio propio.
  precio_unitario bigint check (precio_unitario >= 0)
);
create index gasto_items_gasto on gasto_items (gasto_id);
create index gasto_items_producto on gasto_items (producto_id);

create table cierres (
  mes text primary key check (mes ~ '^\d{4}-\d{2}$'),
  total bigint not null,
  detalle jsonb not null,
  cerrado_por uuid references integrantes,
  fecha timestamptz not null default now()
);

-- Acceso: solo las cuentas cuyo email está en integrantes y siguen vigentes.
create function es_de_la_casa() returns boolean
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

alter table integrantes enable row level security;
alter table categorias enable row level security;
alter table productos enable row level security;
alter table gastos enable row level security;
alter table gasto_items enable row level security;
alter table cierres enable row level security;

create policy ver on integrantes for select to authenticated using (es_de_la_casa());
create policy alta on integrantes for insert to authenticated with check (puede_editar_integrantes());
create policy cambio on integrantes for update to authenticated using (puede_editar_integrantes()) with check (puede_editar_integrantes());
create policy baja on integrantes for delete to authenticated using (puede_editar_integrantes());
create policy casa on categorias for all to authenticated using (es_de_la_casa()) with check (es_de_la_casa());
create policy casa on productos for all to authenticated using (es_de_la_casa()) with check (es_de_la_casa());
create policy casa on gastos for all to authenticated using (es_de_la_casa()) with check (es_de_la_casa());
create policy casa on gasto_items for all to authenticated using (es_de_la_casa()) with check (es_de_la_casa());
-- Los cierres solo se leen: se crean y se borran con cerrar_mes y reabrir_mes.
create policy ver on cierres for select to authenticated using (es_de_la_casa());

-- Categoría aprendida por destinatario de un comprobante de MP (nombre normalizado en la app).
create table destinos (
  nombre text primary key,
  categoria_id uuid not null references categorias on delete cascade
);
alter table destinos enable row level security;
create policy casa on destinos for all to authenticated using (es_de_la_casa()) with check (es_de_la_casa());

-- Anotaciones sueltas para la próxima compra («comprar pan»); se tildan al guardar el gasto.
create table anotaciones (
  id uuid primary key default gen_random_uuid(),
  texto text not null check (length(trim(texto)) between 1 and 120),
  creado_por uuid references integrantes default yo_integrante(),
  creado timestamptz not null default now()
);
alter table anotaciones enable row level security;
create policy casa on anotaciones for all to authenticated using (es_de_la_casa()) with check (es_de_la_casa());

-- Mes cerrado: no se crean, editan ni borran gastos ni ítems de ese mes.
create function mes_cerrado(f date) returns boolean
language sql stable as $$
  select exists (select 1 from cierres where mes = to_char(f, 'YYYY-MM'));
$$;

create function bloquear_gasto_mes_cerrado() returns trigger
language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and mes_cerrado(old.fecha) then raise exception 'MES_CERRADO'; end if;
  if tg_op in ('INSERT', 'UPDATE') and mes_cerrado(new.fecha) then raise exception 'MES_CERRADO'; end if;
  return coalesce(new, old);
end $$;

create trigger gastos_mes_cerrado before insert or update or delete on gastos
for each row execute function bloquear_gasto_mes_cerrado();

create function bloquear_item_mes_cerrado() returns trigger
language plpgsql as $$
declare
  f date;
begin
  select fecha into f from gastos where id = coalesce(new.gasto_id, old.gasto_id);
  if f is not null and mes_cerrado(f) then raise exception 'MES_CERRADO'; end if;
  return coalesce(new, old);
end $$;

create trigger items_mes_cerrado before insert or update or delete on gasto_items
for each row execute function bloquear_item_mes_cerrado();

-- Stock: comprar suma; borrar o editar una compra resta, sin bajar de 0.
create function ajustar_stock() returns trigger
language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update productos set stock = greatest(stock - old.cantidad, 0) where id = old.producto_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update productos set stock = stock + new.cantidad where id = new.producto_id;
  end if;
  return coalesce(new, old);
end $$;

create trigger items_stock after insert or update or delete on gasto_items
for each row execute function ajustar_stock();

-- Cuando cambia el stock se renueva la fecha del último movimiento.
create function marcar_movimiento() returns trigger
language plpgsql as $$
begin
  new.ultimo_movimiento := now();
  return new;
end $$;

create trigger productos_movimiento before update of stock on productos
for each row when (new.stock is distinct from old.stock) execute function marcar_movimiento();

-- Alta o edición de un gasto con sus ítems, todo junto o nada.
-- Alta con id elegido por la app (nuevo_id): si se reintenta tras un corte, no se duplica.
-- creado_por sale de la cuenta que guarda, no de lo que manda la app.
-- Por total, p_gasto.tildados = [{producto_id, cantidad}] suma stock sin precio; sin esa clave (web vieja),
-- al editar se conservan los tildados que ya tenía. p_gasto.anotaciones = [uuid] se borran en la misma transacción.
create function guardar_gasto(p_gasto jsonb, p_items jsonb) returns uuid
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

-- Último precio pagado por producto (precio propuesto al cargar). Los tildados sin precio no cuentan.
create view ultimo_precio with (security_invoker = true) as
select distinct on (gi.producto_id) gi.producto_id, gi.precio_unitario, g.fecha
from gasto_items gi
join gastos g on g.id = gi.gasto_id
where gi.precio_unitario is not null
order by gi.producto_id, g.fecha desc, g.creado desc;

-- Tiempo real.
alter publication supabase_realtime add table integrantes, categorias, productos, gastos, gasto_items, cierres, anotaciones;

-- Categorías iniciales (editables desde Ajustes).
insert into categorias (nombre, tipo) values
  ('Almacén', 'producto'), ('Lácteos', 'producto'), ('Carnes', 'producto'), ('Verdulería', 'producto'),
  ('Bebidas', 'producto'), ('Limpieza', 'producto'), ('Higiene', 'producto'), ('Otros', 'producto'),
  ('Servicios', 'servicio');

-- Stock a mano (bloque 2).
create function ajustar_stock_producto(p_producto uuid, p_delta numeric) returns numeric
language plpgsql as $$
declare
  v_stock numeric;
begin
  if p_delta is null or p_delta = 0 or abs(p_delta) > 1000 then raise exception 'DELTA_INVALIDO'; end if;
  update productos set stock = greatest(stock + p_delta, 0)
  where id = p_producto
  returning stock into v_stock;
  if not found then raise exception 'PRODUCTO_INEXISTENTE'; end if;
  return v_stock;
end $$;

revoke execute on function ajustar_stock_producto(uuid, numeric) from public, anon;
grant execute on function ajustar_stock_producto(uuid, numeric) to authenticated;

-- «Sigue habiendo»: renueva la fecha del último movimiento sin tocar el stock.
create function confirmar_hay(p_producto uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.es_de_la_casa() then raise exception 'SIN_PERMISO' using errcode = '42501'; end if;
  update public.productos set ultimo_movimiento = now() where id = p_producto;
  if not found then raise exception 'PRODUCTO_INEXISTENTE'; end if;
end $$;

revoke execute on function confirmar_hay(uuid) from public, anon;
grant execute on function confirmar_hay(uuid) to authenticated;
