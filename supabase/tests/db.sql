-- Pruebas de la base. Correr en el SQL Editor: todo se deshace al final.
-- Si algo falla, se corta con un error que empieza con FALLA. Si todo pasa, la última fila dice OK.
begin;

insert into integrantes (id, nombre, email, sueldo)
values ('00000000-0000-0000-0000-0000000000a1', 'Prueba A', 'prueba-a@example.com', 150000000);
insert into categorias (id, nombre, tipo)
values ('00000000-0000-0000-0000-0000000000c1', 'Categoría de prueba', 'producto');
insert into productos (id, nombre, categoria_id)
values ('00000000-0000-0000-0000-0000000000b1', 'Leche de prueba', '00000000-0000-0000-0000-0000000000c1');

-- 1. Una cuenta ajena no ve ni escribe nada.
select set_config('request.jwt.claims', '{"email":"intruso@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from integrantes) then raise exception 'FALLA: un intruso ve integrantes'; end if;
  if exists (select 1 from productos) or exists (select 1 from gastos) then raise exception 'FALLA: un intruso ve datos'; end if;
  if exists (select 1 from destinos) then raise exception 'FALLA: un intruso ve destinos'; end if;
  begin
    insert into categorias (nombre, tipo) values ('intrusa', 'producto');
    raise exception 'FALLA: un intruso pudo insertar';
  exception when insufficient_privilege then null;
  end;
  begin
    perform ajustar_stock_producto('00000000-0000-0000-0000-0000000000b1', 1);
    raise exception 'FALLA: un intruso ajustó stock';
  exception when others then
    if sqlerrm not like '%PRODUCTO_INEXISTENTE%' then raise; end if;
  end;
end $$;
reset role;

-- 2. Un integrante sí opera, y las reglas de negocio se cumplen.
select set_config('request.jwt.claims', '{"email":"prueba-a@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_gasto uuid;
  v_stock numeric;
begin
  v_gasto := guardar_gasto(
    jsonb_build_object('fecha', '2000-01-10', 'pagado_por', '00000000-0000-0000-0000-0000000000a1', 'modo', 'productos', 'total', 1),
    jsonb_build_array(jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b1', 'cantidad', 3, 'precio_unitario', 1000))
  );
  select stock into v_stock from productos where id = '00000000-0000-0000-0000-0000000000b1';
  if v_stock <> 3 then raise exception 'FALLA: stock esperado 3, dio %', v_stock; end if;
  if (select total from gastos where id = v_gasto) <> 3000 then raise exception 'FALLA: el total no se recalculó desde los ítems'; end if;
  if (select precio_unitario from ultimo_precio where producto_id = '00000000-0000-0000-0000-0000000000b1') <> 1000 then
    raise exception 'FALLA: ultimo_precio';
  end if;

  -- Se consumieron 2 y después se borra la compra: el stock queda en 0, no en -2.
  update productos set stock = 1 where id = '00000000-0000-0000-0000-0000000000b1';
  delete from gastos where id = v_gasto;
  select stock into v_stock from productos where id = '00000000-0000-0000-0000-0000000000b1';
  if v_stock <> 0 then raise exception 'FALLA: stock esperado 0 tras borrar, dio %', v_stock; end if;

  -- Compra por productos sin ítems.
  begin
    perform guardar_gasto(
      jsonb_build_object('fecha', '2000-01-11', 'pagado_por', '00000000-0000-0000-0000-0000000000a1', 'modo', 'productos', 'total', 1),
      '[]'::jsonb
    );
    raise exception 'FALLA: se aceptó una compra sin ítems';
  exception when others then
    if sqlerrm not like '%SIN_ITEMS%' then raise; end if;
  end;

  -- Mes cerrado.
  perform cerrar_mes('2000-02', 0, '{}', '[]', (select jsonb_agg(jsonb_build_object(
    'id', id, 'sueldo', sueldo, 'tipo', tipo, 'activo', activo, 'baja_desde', baja_desde)) from integrantes));
  begin
    perform guardar_gasto(
      jsonb_build_object('fecha', '2000-02-05', 'pagado_por', '00000000-0000-0000-0000-0000000000a1', 'modo', 'total',
                         'total', 500, 'categoria_id', '00000000-0000-0000-0000-0000000000c1'),
      null
    );
    raise exception 'FALLA: se cargó un gasto en un mes cerrado';
  exception when others then
    if sqlerrm not like '%MES_CERRADO%' then raise; end if;
  end;
end $$;

-- 3. Stock a mano: suma y resta en un solo paso, nunca negativo.
do $$
declare
  v numeric;
begin
  update productos set stock = 0 where id = '00000000-0000-0000-0000-0000000000b1';
  v := ajustar_stock_producto('00000000-0000-0000-0000-0000000000b1', 2);
  if v <> 2 then raise exception 'FALLA: ajustar +2 dio %', v; end if;
  v := ajustar_stock_producto('00000000-0000-0000-0000-0000000000b1', -0.5);
  if v <> 1.5 then raise exception 'FALLA: ajustar -0,5 dio %', v; end if;
  v := ajustar_stock_producto('00000000-0000-0000-0000-0000000000b1', -5);
  if v <> 0 then raise exception 'FALLA: ajustar -5 dio %', v; end if;
  begin
    perform ajustar_stock_producto('00000000-0000-0000-0000-0000000000b1', 0);
    raise exception 'FALLA: se aceptó un ajuste de 0';
  exception when others then
    if sqlerrm not like '%DELTA_INVALIDO%' then raise; end if;
  end;
  begin
    perform ajustar_stock_producto('00000000-0000-0000-0000-0000000000ff', 1);
    raise exception 'FALLA: se ajustó un producto inexistente';
  exception when others then
    if sqlerrm not like '%PRODUCTO_INEXISTENTE%' then raise; end if;
  end;
end $$;
-- 4. Comprobantes de MP: el n.º de operación no se repite, editar no lo cambia y la categoría se aprende por destinatario.
do $$
declare
  v_gasto uuid;
  v_comprobante jsonb := jsonb_build_object('fecha', '2000-01-12', 'pagado_por', '00000000-0000-0000-0000-0000000000a1', 'modo', 'total',
    'total', 4860000, 'categoria_id', '00000000-0000-0000-0000-0000000000c1', 'mp_operacion', '999000111222', 'destino', 'destinatario de prueba');
begin
  v_gasto := guardar_gasto(v_comprobante, null);
  if (select mp_operacion from gastos where id = v_gasto) is distinct from '999000111222' then raise exception 'FALLA: no se guardó mp_operacion'; end if;
  if (select categoria_id from destinos where nombre = 'destinatario de prueba') is distinct from '00000000-0000-0000-0000-0000000000c1' then
    raise exception 'FALLA: no se aprendió la categoría del destinatario';
  end if;
  begin
    perform guardar_gasto(v_comprobante, null);
    raise exception 'FALLA: se cargó dos veces el mismo comprobante';
  exception when unique_violation then null;
  end;
  perform guardar_gasto(v_comprobante || jsonb_build_object('id', v_gasto, 'mp_operacion', '111'), null);
  if (select mp_operacion from gastos where id = v_gasto) is distinct from '999000111222' then raise exception 'FALLA: editar cambió mp_operacion'; end if;
end $$;
reset role;

-- 5. Pagador externo: el tipo por defecto es integrante, no acepta tipos inventados y el externo entra a la casa.
do $$
begin
  if (select tipo from integrantes where id = '00000000-0000-0000-0000-0000000000a1') is distinct from 'integrante' then
    raise exception 'FALLA: el tipo por defecto no es integrante';
  end if;
  begin
    insert into integrantes (nombre, email, tipo) values ('Mal tipo', 'mal-tipo@example.com', 'invitado');
    raise exception 'FALLA: se aceptó un tipo inválido';
  exception when check_violation then null;
  end;
  insert into integrantes (nombre, email, tipo) values ('Externo de prueba', 'externo-prueba@example.com', 'pagador_externo');
end $$;
select set_config('request.jwt.claims', '{"email":"externo-prueba@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if not exists (select 1 from integrantes where email = 'prueba-a@example.com') then
    raise exception 'FALLA: un pagador externo no entra a la casa';
  end if;
  -- Ve a los integrantes pero no los cambia.
  update integrantes set sueldo = 1 where id = '00000000-0000-0000-0000-0000000000a1';
  if (select sueldo from integrantes where id = '00000000-0000-0000-0000-0000000000a1') = 1 then
    raise exception 'FALLA: un pagador externo cambió un sueldo';
  end if;
  begin
    insert into integrantes (nombre, email) values ('Alta del externo', 'alta-externo@example.com');
    raise exception 'FALLA: un pagador externo dio de alta a alguien';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 6. Productos ocultos: por defecto se ven, y uno con compras no se puede borrar (se oculta).
do $$
declare
  v_gasto uuid;
begin
  if (select oculto from productos where id = '00000000-0000-0000-0000-0000000000b1') is distinct from false then
    raise exception 'FALLA: un producto nuevo nace oculto';
  end if;
  insert into productos (id, nombre, categoria_id) values ('00000000-0000-0000-0000-0000000000b2', 'Producto comprado de prueba', '00000000-0000-0000-0000-0000000000c1');
  insert into gastos (fecha, pagado_por, total, modo) values ('2000-01-20', '00000000-0000-0000-0000-0000000000a1', 500, 'productos') returning id into v_gasto;
  insert into gasto_items (gasto_id, producto_id, cantidad, precio_unitario) values (v_gasto, '00000000-0000-0000-0000-0000000000b2', 1, 500);
  begin
    delete from productos where id = '00000000-0000-0000-0000-0000000000b2';
    raise exception 'FALLA: se borró un producto con compras';
  exception when foreign_key_violation then null;
  end;
  update productos set oculto = true where id = '00000000-0000-0000-0000-0000000000b2';
  if (select oculto from productos where id = '00000000-0000-0000-0000-0000000000b2') is distinct from true then
    raise exception 'FALLA: no se pudo ocultar el producto';
  end if;
end $$;

-- 7. Cierre en el servidor y gastos sin duplicar.
select set_config('request.jwt.claims', '{"email":"prueba-a@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_gasto uuid;
  v_otro uuid;
  v_stock numeric;
  v_integrantes jsonb := (select jsonb_agg(jsonb_build_object(
    'id', id, 'sueldo', sueldo, 'tipo', tipo, 'activo', activo, 'baja_desde', baja_desde)) from integrantes);
  v_alta jsonb := jsonb_build_object('nuevo_id', '00000000-0000-0000-0000-0000000000d1', 'fecha', '2000-03-10',
    'pagado_por', '00000000-0000-0000-0000-0000000000a1', 'modo', 'productos', 'total', 1,
    'creado_por', '00000000-0000-0000-0000-0000000000ff');
  v_items jsonb := jsonb_build_array(jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b1', 'cantidad', 2, 'precio_unitario', 700));
begin
  -- Reintento con el mismo nuevo_id: un solo gasto y el stock suma una vez.
  update productos set stock = 0 where id = '00000000-0000-0000-0000-0000000000b1';
  v_gasto := guardar_gasto(v_alta, v_items);
  v_otro := guardar_gasto(v_alta, v_items);
  if v_gasto <> '00000000-0000-0000-0000-0000000000d1' or v_otro <> v_gasto then raise exception 'FALLA: el reintento devolvió otro id'; end if;
  if (select count(*) from gastos where fecha = '2000-03-10') <> 1 then raise exception 'FALLA: el reintento duplicó el gasto'; end if;
  select stock into v_stock from productos where id = '00000000-0000-0000-0000-0000000000b1';
  if v_stock <> 2 then raise exception 'FALLA: el reintento sumó stock dos veces (%)', v_stock; end if;
  if (select creado_por from gastos where id = v_gasto) is distinct from '00000000-0000-0000-0000-0000000000a1' then
    raise exception 'FALLA: creado_por no salió de la cuenta que guarda';
  end if;

  -- Los cierres no se escriben a mano.
  begin
    insert into cierres (mes, total, detalle) values ('2000-03', 0, '{}');
    raise exception 'FALLA: se insertó un cierre a mano';
  exception when insufficient_privilege then null;
  end;

  -- Con un gasto que la app no vio, no cierra.
  begin
    perform cerrar_mes('2000-03', 0, '{}', '[]', v_integrantes);
    raise exception 'FALLA: cerró con datos viejos';
  exception when others then
    if sqlerrm not like '%CIERRE_DESACTUALIZADO%' then raise; end if;
  end;
  -- Con un sueldo distinto del que vio la app, tampoco.
  begin
    perform cerrar_mes('2000-03', 1400, '{}', jsonb_build_array(jsonb_build_object('id', v_gasto, 'total', 1400, 'pagado_por', '00000000-0000-0000-0000-0000000000a1')),
      (select jsonb_agg(e || jsonb_build_object('sueldo', 5)) from jsonb_array_elements(v_integrantes) e));
    raise exception 'FALLA: cerró con sueldos viejos';
  exception when others then
    if sqlerrm not like '%CIERRE_DESACTUALIZADO%' then raise; end if;
  end;

  -- Con los mismos datos, cierra y queda a nombre de quien cerró.
  perform cerrar_mes('2000-03', 1400, '{"filas":[]}', jsonb_build_array(jsonb_build_object('id', v_gasto, 'total', 1400, 'pagado_por', '00000000-0000-0000-0000-0000000000a1')), v_integrantes);
  if (select cerrado_por from cierres where mes = '2000-03') is distinct from '00000000-0000-0000-0000-0000000000a1' then
    raise exception 'FALLA: el cierre no quedó guardado a nombre de quien cerró';
  end if;
  update cierres set total = 1 where mes = '2000-03';
  if (select total from cierres where mes = '2000-03') <> 1400 then raise exception 'FALLA: se editó un cierre'; end if;
  begin
    perform cerrar_mes('2000-03', 1400, '{}', '[]', v_integrantes);
    raise exception 'FALLA: se cerró dos veces el mismo mes';
  exception when others then
    if sqlerrm not like '%MES_CERRADO%' then raise; end if;
  end;

  perform reabrir_mes('2000-03');
  if exists (select 1 from cierres where mes = '2000-03') then raise exception 'FALLA: reabrir_mes no borró el cierre'; end if;
end $$;
reset role;

rollback;
select 'OK: todas las pruebas de la base pasaron' as resultado;
