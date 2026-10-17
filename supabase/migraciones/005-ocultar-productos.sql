-- Productos ocultos: los que tienen compras viejas pero ya no se usan salen de Stock sin perder su historial.
-- Correr una sola vez en el SQL Editor (o con la CLI de Supabase).

alter table productos add column oculto boolean not null default false;
