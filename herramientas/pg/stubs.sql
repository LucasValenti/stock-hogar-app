-- Lo mínimo de Supabase para correr el esquema y las pruebas en PGlite (solo local, nunca en producción).
-- auth.jwt() lee request.jwt.claims, igual que Supabase: cada prueba elige la cuenta con set_config.

create role authenticated nologin noinherit;
create role anon nologin noinherit;
-- La clave de servicio de Supabase entra con este rol (la usan las Edge Functions).
create role service_role nologin noinherit;

create schema auth;
grant usage on schema auth to authenticated, anon;

create function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
grant execute on function auth.jwt() to authenticated, anon;

-- Permisos por defecto de Supabase: las dos cuentas ven el esquema y el RLS decide qué filas.
grant usage on schema public to authenticated, anon, service_role;
alter default privileges in schema public grant all on tables to authenticated, anon;
alter default privileges in schema public grant all on sequences to authenticated, anon;
alter default privileges in schema public grant execute on functions to authenticated, anon;

-- Tiempo real: en Supabase la publicación ya existe.
create publication supabase_realtime;
