-- Avisos de los domingos (F9): suscripciones de web push de cada cuenta, los datos del resumen para el servidor
-- y el trabajo programado que los dispara. Correr una sola vez en el SQL Editor (o con la CLI de Supabase).
--
-- Antes de correrla, en Vault tiene que estar resumen_semanal_url (la URL de la Edge Function; no es secreta):
--   select vault.create_secret('https://<proyecto>.supabase.co/functions/v1/resumen-semanal', 'resumen_semanal_url');
-- El secreto del cron lo genera esta migración y el par VAPID lo genera la función: nadie escribe claves.
--
-- Va en una sola transacción. Sin pg_cron o pg_net (por ejemplo, en las pruebas locales) crea todo menos el
-- trabajo programado y lo avisa.

begin;

create table if not exists suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  integrante_id uuid not null references integrantes on delete cascade,
  -- Solo los servicios de push de los navegadores (Google, Mozilla, Apple, Microsoft): la Edge Function le hace
  -- un POST a cada endpoint y no tiene que poder apuntarse a cualquier sitio.
  endpoint text not null unique check (
    length(endpoint) <= 1000
    and endpoint ~ '^https://(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
  ),
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
  -- clock_timestamp y no now(): el orden por creado vale también dentro de una misma transacción.
  insert into public.suscripciones_push (integrante_id, endpoint, p256dh, auth, creado)
  values (public.yo_integrante(), p_endpoint, p_p256dh, p_auth, clock_timestamp())
  on conflict (endpoint) do update
    set integrante_id = excluded.integrante_id, p256dh = excluded.p256dh, auth = excluded.auth, creado = clock_timestamp();
  -- A lo sumo 10 por cuenta: se van las más viejas (celulares que ya no se usan).
  delete from public.suscripciones_push
  where integrante_id = public.yo_integrante()
    and id not in (select id from public.suscripciones_push where integrante_id = public.yo_integrante()
                   order by creado desc, id limit 10);
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

-- Secretos de los avisos, guardados en Vault y generados por la base o por la Edge Function: nadie los escribe.
--   resumen_semanal_secreto                      lo crea esta migración (al azar); lo manda el cron y lo valida la función
--   avisos_vapid_publica / avisos_vapid_privada  los crea la Edge Function la primera vez que corre
-- Sin Vault (las pruebas locales) estas funciones no encuentran nada y no fallan.

-- Para la Edge Function (clave de servicio): los tres secretos que conoce.
create or replace function secretos_avisos() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v jsonb;
begin
  if to_regclass('vault.decrypted_secrets') is null then return '{}'::jsonb; end if;
  execute $q$
    select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb) from vault.decrypted_secrets
    where name in ('resumen_semanal_secreto', 'avisos_vapid_publica', 'avisos_vapid_privada')
  $q$ into v;
  return v;
end $$;

revoke execute on function secretos_avisos() from public, anon, authenticated;
grant execute on function secretos_avisos() to service_role;

-- Para la Edge Function: guarda el par VAPID solo si todavía no hay (las suscripciones dependen de la pública).
create or replace function guardar_claves_vapid(p_publica text, p_privada text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hay int;
begin
  if to_regclass('vault.secrets') is null then raise exception 'SIN_VAULT'; end if;
  execute $q$select count(*) from vault.secrets where name in ('avisos_vapid_publica', 'avisos_vapid_privada')$q$ into v_hay;
  if v_hay = 0 then
    execute $q$select vault.create_secret($1, 'avisos_vapid_publica', 'Clave pública VAPID de los avisos de los domingos')$q$ using p_publica;
    execute $q$select vault.create_secret($1, 'avisos_vapid_privada', 'Clave privada VAPID de los avisos de los domingos')$q$ using p_privada;
  end if;
end $$;

revoke execute on function guardar_claves_vapid(text, text) from public, anon, authenticated;
grant execute on function guardar_claves_vapid(text, text) to service_role;

-- Para la app: la clave pública VAPID (no es secreta), o null si la función todavía no la generó.
create or replace function clave_publica_avisos() returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v text;
begin
  if to_regclass('vault.decrypted_secrets') is null then return null; end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'avisos_vapid_publica'$q$ into v;
  return v;
end $$;

revoke execute on function clave_publica_avisos() from public, anon;
grant execute on function clave_publica_avisos() to authenticated;

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
  -- El secreto del cron lo genera la base (nadie lo escribe ni lo ve); la función lo lee con secretos_avisos().
  if not exists (select 1 from vault.secrets where name = 'resumen_semanal_secreto') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'resumen_semanal_secreto',
                                'Secreto del cron de los avisos de los domingos');
  end if;
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
  -- Sin la URL de la función, el trabajo falla cada domingo y solo se ve en cron.job_run_details: se avisa ahora.
  if not exists (select 1 from vault.secrets where name = 'resumen_semanal_url') then
    raise warning 'Falta en Vault resumen_semanal_url (la URL de la Edge Function): el resumen de los domingos no va a salir hasta cargarla';
  end if;
end $$;

commit;
