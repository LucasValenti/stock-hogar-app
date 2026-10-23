-- Avisos de los domingos (F9): suscripciones de web push de cada cuenta, los datos del resumen para el servidor
-- y el trabajo programado que los dispara. Correr una sola vez en el SQL Editor (o con la CLI de Supabase).
--
-- Antes de correrla, en Vault (Project Settings → Vault, o con vault.create_secret) tienen que existir:
--   resumen_semanal_url      la URL de la Edge Function resumen-semanal
--   resumen_semanal_secreto  el mismo valor que el secreto CRON_SECRET de la función
-- La migración no los escribe: el trabajo los lee de Vault cada domingo.
--
-- Va en una sola transacción. Sin pg_cron o pg_net (por ejemplo, en las pruebas locales) crea todo menos el
-- trabajo programado y lo avisa.

begin;

create table if not exists suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  integrante_id uuid not null references integrantes on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 80 and 100),
  auth text not null check (length(auth) between 16 and 40),
  creado timestamptz not null default now()
);
alter table suscripciones_push enable row level security;

-- Cada cuenta de la casa ve y borra solo las suyas. Se crean y se renuevan por guardar_suscripcion (sin insert ni update directos).
drop policy if exists ver on suscripciones_push;
drop policy if exists borrar on suscripciones_push;
create policy ver on suscripciones_push for select to authenticated
  using (public.es_de_la_casa() and integrante_id = public.yo_integrante());
create policy borrar on suscripciones_push for delete to authenticated
  using (public.es_de_la_casa() and integrante_id = public.yo_integrante());

-- Activar los avisos en este navegador. Si el navegador ya estaba suscripto a nombre de otra cuenta (un
-- dispositivo compartido), la suscripción pasa a quien la activa ahora.
create or replace function guardar_suscripcion(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.es_de_la_casa() then raise exception 'SIN_PERMISO' using errcode = '42501'; end if;
  insert into public.suscripciones_push (integrante_id, endpoint, p256dh, auth)
  values (public.yo_integrante(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set integrante_id = excluded.integrante_id, p256dh = excluded.p256dh, auth = excluded.auth, creado = now();
end $$;

revoke execute on function guardar_suscripcion(text, text, text) from public, anon;
grant execute on function guardar_suscripcion(text, text, text) to authenticated;

-- Lo que necesita el aviso de una semana (p_desde y p_hasta inclusive, en fechas de Argentina): el total de cada
-- gasto, los productos visibles sin stock (por nombre, como Inicio), las anotaciones (con su fecha) y las
-- suscripciones de quienes siguen siendo de la casa. Solo para el servidor: la pide la Edge Function con la clave de servicio.
create or replace function datos_resumen_semanal(p_desde date, p_hasta date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'gastos', coalesce((select jsonb_agg(g.total order by g.fecha, g.creado)
                        from public.gastos g where g.fecha between p_desde and p_hasta), '[]'::jsonb),
    'productos', coalesce((select jsonb_agg(p.nombre order by p.nombre)
                           from public.productos p where not p.oculto and p.stock <= 0), '[]'::jsonb),
    'anotaciones', coalesce((select jsonb_agg(jsonb_build_object('texto', a.texto, 'creado', a.creado) order by a.creado)
                             from public.anotaciones a), '[]'::jsonb),
    'suscripciones', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                               from public.suscripciones_push s
                               join public.integrantes i on i.id = s.integrante_id
                               where i.activo
                                  or i.baja_desde > to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM')), '[]'::jsonb)
  );
$$;

revoke execute on function datos_resumen_semanal(date, date) from public, anon, authenticated;
grant execute on function datos_resumen_semanal(date, date) to service_role;

-- Domingos 20:00 de Argentina = 23:00 UTC (pg_cron usa UTC; Argentina no tiene horario de verano).
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'Sin pg_cron o pg_net: no se programó el resumen de los domingos';
    return;
  end if;
  create extension if not exists pg_cron;
  create extension if not exists pg_net with schema extensions;
  if exists (select 1 from cron.job where jobname = 'resumen-semanal') then
    perform cron.unschedule('resumen-semanal');
  end if;
  perform cron.schedule('resumen-semanal', '0 23 * * 0', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'resumen_semanal_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'resumen_semanal_secreto')),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000)
  $cron$);
  -- Sin los dos secretos, el trabajo falla cada domingo y solo se ve en cron.job_run_details: se avisa ahora.
  if (select count(*) from vault.decrypted_secrets where name in ('resumen_semanal_url', 'resumen_semanal_secreto')) < 2 then
    raise warning 'Faltan en Vault resumen_semanal_url o resumen_semanal_secreto: el resumen de los domingos no va a salir hasta cargarlos';
  end if;
end $$;

commit;
