-- Pagador externo: integrante que carga gastos pero no entra al reparto del mes.
-- Correr una sola vez en el SQL Editor (o con la CLI de Supabase).

alter table integrantes
  add column tipo text not null default 'integrante'
  check (tipo in ('integrante', 'pagador_externo'));
