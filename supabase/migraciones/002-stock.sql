-- Bloque 2: sumar o restar stock a mano. Correr una sola vez en el SQL Editor.
-- Un solo UPDATE: dos toques seguidos o dos personas a la vez no pierden cambios.
-- Sin security definer: las reglas RLS de productos se aplican igual.
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
