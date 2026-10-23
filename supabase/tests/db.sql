-- Pruebas de la base. Correr en el SQL Editor: todo se deshace al final.
-- Si algo falla, se corta con un error que empieza con FALLA. Si todo pasa, la última fila dice OK.
-- También corre sobre una casa en uso (producción): las pruebas miran solo lo suyo. Se prueba en local con
-- `npm run db:probar:con-datos` (supabase/tests/casa-existente.sql).
begin;

-- Sobre una casa en uso, su admin cede el lugar mientras duran las pruebas (el rollback del final se lo devuelve):
-- así Prueba A queda como admin igual que en una base vacía.
update integrantes set admin = false where admin;

insert into integrantes (id, nombre, email)
values ('00000000-0000-0000-0000-0000000000a1', 'Prueba A', 'prueba-a@example.com');
-- Elenco: A admin (primer integrante), B común, C con altas y bajas, D con sueldos, E pagador externo.
insert into integrantes (id, nombre, email, tipo) values
  ('00000000-0000-0000-0000-0000000000a2', 'Prueba B', 'prueba-b@example.com', 'integrante'),
  ('00000000-0000-0000-0000-0000000000a3', 'Prueba C', 'prueba-c@example.com', 'integrante'),
  ('00000000-0000-0000-0000-0000000000a4', 'Prueba D', 'prueba-d@example.com', 'integrante'),
  ('00000000-0000-0000-0000-0000000000a5', 'Prueba E', 'prueba-e@example.com', 'pagador_externo');
insert into permisos (integrante_id, permiso) values
  ('00000000-0000-0000-0000-0000000000a3', 'altas_bajas'),
  ('00000000-0000-0000-0000-0000000000a4', 'sueldos');
-- Los sueldos viven aparte (solo los lee quien tiene el permiso): sin fila, sin sueldo.
insert into sueldos (integrante_id, sueldo) values ('00000000-0000-0000-0000-0000000000a1', 150000000);
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
    'id', i.id, 'sueldo', s.sueldo, 'tipo', i.tipo, 'activo', i.activo, 'baja_desde', i.baja_desde))
    from integrantes i left join sueldos s on s.integrante_id = i.id));
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
  -- Ve a los integrantes pero no los cambia, y los sueldos ni los ve (se comprueba abajo que siguen igual).
  update sueldos set sueldo = 1 where integrante_id = '00000000-0000-0000-0000-0000000000a1';
  if exists (select 1 from sueldos) then raise exception 'FALLA: un pagador externo ve sueldos'; end if;
  begin
    insert into integrantes (nombre, email) values ('Alta del externo', 'alta-externo@example.com');
    raise exception 'FALLA: un pagador externo dio de alta a alguien';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$
begin
  if (select sueldo from sueldos where integrante_id = '00000000-0000-0000-0000-0000000000a1') is distinct from 150000000 then
    raise exception 'FALLA: un pagador externo cambió un sueldo';
  end if;
end $$;

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
    'id', i.id, 'sueldo', s.sueldo, 'tipo', i.tipo, 'activo', i.activo, 'baja_desde', i.baja_desde))
    from integrantes i left join sueldos s on s.integrante_id = i.id);
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
  -- Ni si el sueldo cambió en la tabla después de que la app lo leyó (uno cambiado, uno cargado de nuevo).
  update sueldos set sueldo = sueldo + 1 where integrante_id = '00000000-0000-0000-0000-0000000000a1';
  begin
    perform cerrar_mes('2000-03', 1400, '{}', jsonb_build_array(jsonb_build_object('id', v_gasto, 'total', 1400, 'pagado_por', '00000000-0000-0000-0000-0000000000a1')), v_integrantes);
    raise exception 'FALLA: cerró con un sueldo que cambió en la tabla';
  exception when others then
    if sqlerrm not like '%CIERRE_DESACTUALIZADO%' then raise; end if;
  end;
  update sueldos set sueldo = 150000000 where integrante_id = '00000000-0000-0000-0000-0000000000a1';
  insert into sueldos (integrante_id, sueldo) values ('00000000-0000-0000-0000-0000000000a4', 1);
  begin
    perform cerrar_mes('2000-03', 1400, '{}', jsonb_build_array(jsonb_build_object('id', v_gasto, 'total', 1400, 'pagado_por', '00000000-0000-0000-0000-0000000000a1')), v_integrantes);
    raise exception 'FALLA: cerró con un sueldo cargado después de leer';
  exception when others then
    if sqlerrm not like '%CIERRE_DESACTUALIZADO%' then raise; end if;
  end;
  delete from sueldos where integrante_id = '00000000-0000-0000-0000-0000000000a4';

  -- Con los mismos datos, cierra y queda a nombre de quien cerró.
  perform cerrar_mes('2000-03', 1400, '{"filas":[]}', jsonb_build_array(jsonb_build_object('id', v_gasto, 'total', 1400, 'pagado_por', '00000000-0000-0000-0000-0000000000a1')), v_integrantes);
  if (select cerrado_por from cierres where mes = '2000-03') is distinct from '00000000-0000-0000-0000-0000000000a1' then
    raise exception 'FALLA: el cierre no quedó guardado a nombre de quien cerró';
  end if;
  update cierres set total = 1 where mes = '2000-03';
  if (select total from cierres where mes = '2000-03') <> 1400 then raise exception 'FALLA: se editó un cierre'; end if;
  -- Reintento de un alta que ya estaba guardada, con el mes cerrado después: devuelve el mismo id sin MES_CERRADO.
  v_otro := guardar_gasto(v_alta, v_items);
  if v_otro <> v_gasto then raise exception 'FALLA: el reintento con el mes cerrado devolvió otro id'; end if;
  if (select count(*) from gastos where fecha = '2000-03-10') <> 1 then raise exception 'FALLA: el reintento con el mes cerrado duplicó el gasto'; end if;
  -- Un alta nueva en el mes cerrado sigue rechazada.
  begin
    perform guardar_gasto(v_alta || jsonb_build_object('nuevo_id', '00000000-0000-0000-0000-0000000000d9'), v_items);
    raise exception 'FALLA: se guardó un gasto nuevo en un mes cerrado';
  exception when others then
    if sqlerrm not like '%MES_CERRADO%' then raise; end if;
  end;
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

-- 8. App nativa (migración 007): columnas nuevas, último movimiento y anotaciones.
select set_config('request.jwt.claims', '{"email":"prueba-a@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_mov timestamptz;
begin
  insert into productos (id, nombre, categoria_id) values
    ('00000000-0000-0000-0000-0000000000b3', 'Yerba de prueba', '00000000-0000-0000-0000-0000000000c1'),
    ('00000000-0000-0000-0000-0000000000b4', 'Fideos de prueba', '00000000-0000-0000-0000-0000000000c1');

  -- Columnas nuevas con su valor por defecto y sus límites.
  if (select unidad from productos where id = '00000000-0000-0000-0000-0000000000b3') is distinct from 'unidad' then
    raise exception 'FALLA: la unidad por defecto no es unidad';
  end if;
  if (select ultimo_movimiento from productos where id = '00000000-0000-0000-0000-0000000000b3') is distinct from now() then
    raise exception 'FALLA: ultimo_movimiento no arranca en now()';
  end if;
  begin
    update productos set unidad = 'docena' where id = '00000000-0000-0000-0000-0000000000b3';
    raise exception 'FALLA: se aceptó una unidad inventada';
  exception when check_violation then null;
  end;
  update productos set unidad = 'kg' where id = '00000000-0000-0000-0000-0000000000b3';
  if (select dias_sin_movimiento from categorias where id = '00000000-0000-0000-0000-0000000000c1') is distinct from 20 then
    raise exception 'FALLA: dias_sin_movimiento por defecto no es 20';
  end if;
  begin
    update categorias set dias_sin_movimiento = 0 where id = '00000000-0000-0000-0000-0000000000c1';
    raise exception 'FALLA: se aceptaron 0 días sin movimiento';
  exception when check_violation then null;
  end;
  begin
    update categorias set dias_sin_movimiento = 366 where id = '00000000-0000-0000-0000-0000000000c1';
    raise exception 'FALLA: se aceptaron 366 días sin movimiento';
  exception when check_violation then null;
  end;

  -- ultimo_movimiento cambia cuando cambia el stock, y solo entonces.
  update productos set ultimo_movimiento = '2000-01-01' where id = '00000000-0000-0000-0000-0000000000b3';
  update productos set stock = 2 where id = '00000000-0000-0000-0000-0000000000b3';
  select ultimo_movimiento into v_mov from productos where id = '00000000-0000-0000-0000-0000000000b3';
  if v_mov is distinct from now() then raise exception 'FALLA: cambiar el stock no movió ultimo_movimiento (%)', v_mov; end if;
  update productos set ultimo_movimiento = '2000-01-01' where id = '00000000-0000-0000-0000-0000000000b3';
  update productos set nombre = 'Yerba de prueba 2' where id = '00000000-0000-0000-0000-0000000000b3';
  update productos set stock = 2 where id = '00000000-0000-0000-0000-0000000000b3';
  select ultimo_movimiento into v_mov from productos where id = '00000000-0000-0000-0000-0000000000b3';
  if v_mov <> '2000-01-01'::timestamptz then raise exception 'FALLA: ultimo_movimiento cambió sin cambiar el stock (%)', v_mov; end if;

  -- Anotaciones: las escribe la casa, a nombre de quien la escribe, con texto de 1 a 120 caracteres.
  insert into anotaciones (id, texto) values
    ('00000000-0000-0000-0000-0000000000e1', 'Comprar pan'),
    ('00000000-0000-0000-0000-0000000000e2', 'Llamar al plomero');
  if (select creado_por from anotaciones where id = '00000000-0000-0000-0000-0000000000e1') is distinct from '00000000-0000-0000-0000-0000000000a1' then
    raise exception 'FALLA: la anotación no quedó a nombre de quien la escribió';
  end if;
  begin
    insert into anotaciones (texto) values ('   ');
    raise exception 'FALLA: se aceptó una anotación vacía';
  exception when check_violation then null;
  end;
  begin
    insert into anotaciones (texto) values (repeat('x', 121));
    raise exception 'FALLA: se aceptó una anotación de 121 caracteres';
  exception when check_violation then null;
  end;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'anotaciones') then
    raise exception 'FALLA: anotaciones no está en tiempo real';
  end if;
end $$;

-- 9. Sin sesión de la casa, las anotaciones no se leen ni se escriben y no se confirma stock.
select set_config('request.jwt.claims', '{"email":"intruso@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from anotaciones) then raise exception 'FALLA: un intruso ve anotaciones'; end if;
  begin
    insert into anotaciones (texto) values ('intrusa');
    raise exception 'FALLA: un intruso escribió una anotación';
  exception when insufficient_privilege then null;
  end;
  delete from anotaciones;
  begin
    perform confirmar_hay('00000000-0000-0000-0000-0000000000b3');
    raise exception 'FALLA: un intruso confirmó stock';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
begin
  if exists (select 1 from anotaciones) then raise exception 'FALLA: anon ve anotaciones'; end if;
  begin
    insert into anotaciones (texto) values ('anónima');
    raise exception 'FALLA: anon escribió una anotación';
  exception when insufficient_privilege then null;
  end;
  begin
    perform confirmar_hay('00000000-0000-0000-0000-0000000000b3');
    raise exception 'FALLA: anon confirmó stock';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$
begin
  if (select count(*) from anotaciones
      where id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2')) <> 2 then
    raise exception 'FALLA: las anotaciones cambiaron sin sesión de la casa';
  end if;
end $$;

-- 10. guardar_gasto: lo que manda la web vieja da lo mismo; tildados y anotaciones de la app nativa.
select set_config('request.jwt.claims', '{"email":"prueba-a@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_gasto uuid;
  v_otro uuid;
  v_mov timestamptz;
  v_web jsonb := jsonb_build_object('id', null, 'fecha', '2000-04-10', 'pagado_por', '00000000-0000-0000-0000-0000000000a1',
    'nota', null, 'mp_operacion', null, 'destino', null);
  v_total jsonb := v_web || jsonb_build_object('modo', 'total', 'total', 5000, 'categoria_id', '00000000-0000-0000-0000-0000000000c1');
  v_tildados jsonb := jsonb_build_array(
    jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b1', 'cantidad', 1),
    jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b3', 'cantidad', 2));
begin
  update productos set stock = 0
  where id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b4');

  -- Web vieja, por productos con precios: total desde los ítems, suma stock y propone el precio.
  v_gasto := guardar_gasto(
    v_web || jsonb_build_object('nuevo_id', '00000000-0000-0000-0000-0000000000d2', 'modo', 'productos', 'total', 1, 'categoria_id', null),
    jsonb_build_array(jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b4', 'cantidad', 2, 'precio_unitario', 850)));
  if (select total from gastos where id = v_gasto) <> 1700 then raise exception 'FALLA: web vieja, el total no salió de los ítems'; end if;
  if (select stock from productos where id = '00000000-0000-0000-0000-0000000000b4') <> 2 then raise exception 'FALLA: web vieja, no sumó stock'; end if;
  if (select precio_unitario from ultimo_precio where producto_id = '00000000-0000-0000-0000-0000000000b4') is distinct from 850::bigint then
    raise exception 'FALLA: web vieja, ultimo_precio';
  end if;
  -- Un ítem por productos sin precio se sigue rechazando.
  begin
    perform guardar_gasto(
      v_web || jsonb_build_object('modo', 'productos', 'total', 1, 'categoria_id', null),
      jsonb_build_array(jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b4', 'cantidad', 1, 'precio_unitario', null)));
    raise exception 'FALLA: se aceptó un ítem por productos sin precio';
  exception when not_null_violation then null;
  end;
  delete from gastos where id = v_gasto;

  -- Web vieja, por total sin tildados: sin ítems y con el total que mandó.
  v_gasto := guardar_gasto(v_total || jsonb_build_object('nuevo_id', '00000000-0000-0000-0000-0000000000d3'), '[]'::jsonb);
  if (select total from gastos where id = v_gasto) <> 5000 then raise exception 'FALLA: web vieja, cambió el total'; end if;
  if exists (select 1 from gasto_items where gasto_id = v_gasto) then raise exception 'FALLA: web vieja, un gasto por total con ítems'; end if;
  delete from gastos where id = v_gasto;

  -- App nativa, por total con tildados: suma stock, precio null y el total no cambia.
  v_gasto := guardar_gasto(v_total || jsonb_build_object('nuevo_id', '00000000-0000-0000-0000-0000000000d4', 'tildados', v_tildados), '[]'::jsonb);
  if (select total from gastos where id = v_gasto) <> 5000 then raise exception 'FALLA: los tildados cambiaron el total'; end if;
  if (select count(*) from gasto_items where gasto_id = v_gasto and precio_unitario is null) <> 2 then
    raise exception 'FALLA: los tildados no quedaron como ítems sin precio';
  end if;
  if (select stock from productos where id = '00000000-0000-0000-0000-0000000000b1') <> 1
     or (select stock from productos where id = '00000000-0000-0000-0000-0000000000b3') <> 2 then
    raise exception 'FALLA: los tildados no sumaron stock';
  end if;
  -- Mismo nuevo_id otra vez: no se repite nada.
  v_otro := guardar_gasto(v_total || jsonb_build_object('nuevo_id', '00000000-0000-0000-0000-0000000000d4', 'tildados', v_tildados), '[]'::jsonb);
  if v_otro <> v_gasto then raise exception 'FALLA: el reintento con tildados devolvió otro id'; end if;
  if (select stock from productos where id = '00000000-0000-0000-0000-0000000000b3') <> 2 then
    raise exception 'FALLA: el reintento con tildados sumó stock dos veces';
  end if;
  -- El último precio ignora los tildados.
  if (select precio_unitario from ultimo_precio where producto_id = '00000000-0000-0000-0000-0000000000b1') is distinct from 700::bigint then
    raise exception 'FALLA: ultimo_precio tomó un tildado sin precio';
  end if;
  if exists (select 1 from ultimo_precio where precio_unitario is null) then raise exception 'FALLA: ultimo_precio devuelve null'; end if;

  -- Editar con otros tildados: el stock queda como si se hubiera cargado así desde el principio.
  perform guardar_gasto(v_total || jsonb_build_object('id', v_gasto, 'tildados', jsonb_build_array(
    jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b3', 'cantidad', 1),
    jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b4', 'cantidad', 3))), '[]'::jsonb);
  if (select stock from productos where id = '00000000-0000-0000-0000-0000000000b1') <> 0
     or (select stock from productos where id = '00000000-0000-0000-0000-0000000000b3') <> 1
     or (select stock from productos where id = '00000000-0000-0000-0000-0000000000b4') <> 3 then
    raise exception 'FALLA: editar los tildados dejó mal el stock';
  end if;
  -- La web vieja edita ese gasto (no conoce los tildados): quedan como estaban.
  perform guardar_gasto(v_total || jsonb_build_object('id', v_gasto, 'nota', 'editado en la web'), '[]'::jsonb);
  if (select count(*) from gasto_items where gasto_id = v_gasto) <> 2
     or (select stock from productos where id = '00000000-0000-0000-0000-0000000000b4') <> 3 then
    raise exception 'FALLA: la web vieja borró los tildados al editar';
  end if;
  -- Editar con tildados vacíos los saca y descuenta el stock.
  perform guardar_gasto(v_total || jsonb_build_object('id', v_gasto, 'tildados', '[]'::jsonb), '[]'::jsonb);
  if exists (select 1 from gasto_items where gasto_id = v_gasto)
     or (select stock from productos where id = '00000000-0000-0000-0000-0000000000b4') <> 0 then
    raise exception 'FALLA: sacar los tildados no descontó el stock';
  end if;

  -- Las anotaciones tildadas se borran al guardar; las otras quedan.
  perform guardar_gasto(v_total || jsonb_build_object('nuevo_id', '00000000-0000-0000-0000-0000000000d5',
    'anotaciones', jsonb_build_array('00000000-0000-0000-0000-0000000000e1')), '[]'::jsonb);
  if exists (select 1 from anotaciones where id = '00000000-0000-0000-0000-0000000000e1') then raise exception 'FALLA: la anotación tildada no se borró'; end if;
  if not exists (select 1 from anotaciones where id = '00000000-0000-0000-0000-0000000000e2') then raise exception 'FALLA: se borró una anotación no tildada'; end if;

  -- confirmar_hay («sigue habiendo»): renueva la fecha sin tocar el stock.
  update productos set ultimo_movimiento = '2000-01-01' where id = '00000000-0000-0000-0000-0000000000b3';
  perform confirmar_hay('00000000-0000-0000-0000-0000000000b3');
  select ultimo_movimiento into v_mov from productos where id = '00000000-0000-0000-0000-0000000000b3';
  if v_mov is distinct from now() then raise exception 'FALLA: confirmar_hay no renovó la fecha (%)', v_mov; end if;
  if (select stock from productos where id = '00000000-0000-0000-0000-0000000000b3') <> 0 then raise exception 'FALLA: confirmar_hay tocó el stock'; end if;
  begin
    perform confirmar_hay('00000000-0000-0000-0000-0000000000ff');
    raise exception 'FALLA: se confirmó un producto inexistente';
  exception when others then
    if sqlerrm not like '%PRODUCTO_INEXISTENTE%' then raise; end if;
  end;
end $$;
reset role;

-- 11. Editar un gasto por total aplica solo la diferencia de los tildados; un alta repetida con otros datos
--     avisa (GASTO_YA_GUARDADO) en vez de esconder el cambio; creado_por de una anotación lo pone la base.
select set_config('request.jwt.claims', '{"email":"prueba-a@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_gasto uuid;
  v_item uuid;
  v_otra_cat uuid := (select id from categorias where id <> '00000000-0000-0000-0000-0000000000c1' and tipo = 'producto' limit 1);
  v_externo uuid := (select id from integrantes where email = 'externo-prueba@example.com');
  v_base jsonb := jsonb_build_object('fecha', '2000-04-10', 'pagado_por', '00000000-0000-0000-0000-0000000000a1', 'modo', 'total',
    'total', 5000, 'categoria_id', '00000000-0000-0000-0000-0000000000c1', 'nota', null, 'mp_operacion', null, 'destino', null);
  v_dos jsonb := jsonb_build_array(
    jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b3', 'cantidad', 2),
    jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b4', 'cantidad', 1));
  v_cambio jsonb;
begin
  if v_otra_cat is null or v_externo is null then raise exception 'FALLA: faltan datos para la prueba 11'; end if;
  update productos set stock = 0
  where id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b4');
  v_gasto := guardar_gasto(v_base || jsonb_build_object('nuevo_id', '00000000-0000-0000-0000-0000000000d6', 'tildados', v_dos), '[]'::jsonb);
  select id into v_item from gasto_items where gasto_id = v_gasto and producto_id = '00000000-0000-0000-0000-0000000000b3';

  -- Lo comprado se consumió (stock en 0): editar la nota con los mismos tildados no lo devuelve ni lo «mueve».
  update productos set stock = 0 where id = '00000000-0000-0000-0000-0000000000b3';
  update productos set ultimo_movimiento = '2000-01-01'
  where id in ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b4');
  perform guardar_gasto(v_base || jsonb_build_object('id', v_gasto, 'nota', 'Otra nota', 'tildados', v_dos), '[]'::jsonb);
  if (select stock from productos where id = '00000000-0000-0000-0000-0000000000b3') <> 0 then
    raise exception 'FALLA: editar la nota devolvió el stock ya consumido';
  end if;
  if (select ultimo_movimiento from productos where id = '00000000-0000-0000-0000-0000000000b3') <> '2000-01-01'::timestamptz then
    raise exception 'FALLA: editar la nota movió ultimo_movimiento';
  end if;
  if not exists (select 1 from gasto_items where id = v_item) then raise exception 'FALLA: editar la nota rehízo los tildados'; end if;
  if (select nota from gastos where id = v_gasto) is distinct from 'Otra nota' then raise exception 'FALLA: no se guardó la nota'; end if;

  -- Cantidad 2 → 3: suma 1 (la diferencia), aunque lo anterior se haya consumido; el otro tildado no se toca.
  perform guardar_gasto(v_base || jsonb_build_object('id', v_gasto, 'tildados', jsonb_build_array(
    jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b3', 'cantidad', 3),
    jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b4', 'cantidad', 1))), '[]'::jsonb);
  if (select stock from productos where id = '00000000-0000-0000-0000-0000000000b3') <> 1 then
    raise exception 'FALLA: pasar de 2 a 3 no sumó 1 (%)', (select stock from productos where id = '00000000-0000-0000-0000-0000000000b3');
  end if;
  if (select cantidad from gasto_items where id = v_item) is distinct from 3::numeric then raise exception 'FALLA: no se actualizó la cantidad'; end if;
  if (select stock from productos where id = '00000000-0000-0000-0000-0000000000b4') <> 1
     or (select ultimo_movimiento from productos where id = '00000000-0000-0000-0000-0000000000b4') <> '2000-01-01'::timestamptz then
    raise exception 'FALLA: se tocó un tildado que no cambió';
  end if;

  -- Sacar un tildado resta lo suyo, sin bajar de 0.
  update productos set stock = 1 where id = '00000000-0000-0000-0000-0000000000b3';
  perform guardar_gasto(v_base || jsonb_build_object('id', v_gasto, 'tildados', jsonb_build_array(
    jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b4', 'cantidad', 1))), '[]'::jsonb);
  if (select stock from productos where id = '00000000-0000-0000-0000-0000000000b3') <> 0 then
    raise exception 'FALLA: sacar un tildado no restó o bajó de 0';
  end if;
  if exists (select 1 from gasto_items where gasto_id = v_gasto and producto_id = '00000000-0000-0000-0000-0000000000b3') then
    raise exception 'FALLA: el tildado sacado sigue en el gasto';
  end if;
  if (select stock from productos where id = '00000000-0000-0000-0000-0000000000b4') <> 1 then raise exception 'FALLA: sacar uno tocó al otro'; end if;

  -- Un producto repetido en los tildados cuenta una vez, con la suma.
  perform guardar_gasto(v_base || jsonb_build_object('id', v_gasto, 'tildados', jsonb_build_array(
    jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b4', 'cantidad', 1),
    jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b1', 'cantidad', 1),
    jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b1', 'cantidad', 2))), '[]'::jsonb);
  if (select stock from productos where id = '00000000-0000-0000-0000-0000000000b1') <> 3
     or (select count(*) from gasto_items where gasto_id = v_gasto and producto_id = '00000000-0000-0000-0000-0000000000b1') <> 1 then
    raise exception 'FALLA: un tildado repetido no se sumó en un solo ítem';
  end if;

  -- Alta repetida con los mismos datos (reintento tras un corte): devuelve el id sin tocar nada.
  v_gasto := guardar_gasto(v_base || jsonb_build_object('nuevo_id', '00000000-0000-0000-0000-0000000000d7', 'nota', 'Hola'), '[]'::jsonb);
  if guardar_gasto(v_base || jsonb_build_object('nuevo_id', '00000000-0000-0000-0000-0000000000d7', 'nota', 'Hola'), '[]'::jsonb) <> v_gasto then
    raise exception 'FALLA: el reintento idéntico devolvió otro id';
  end if;
  -- Alta repetida con otro total, fecha, pagador, categoría o nota: avisa en vez de esconder el cambio.
  for v_cambio in select * from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('total', 6000),
    jsonb_build_object('fecha', '2000-04-11'),
    jsonb_build_object('pagado_por', v_externo),
    jsonb_build_object('categoria_id', v_otra_cat),
    jsonb_build_object('nota', 'Chau'),
    jsonb_build_object('nota', null)))
  loop
    begin
      perform guardar_gasto(v_base || jsonb_build_object('nuevo_id', '00000000-0000-0000-0000-0000000000d7', 'nota', 'Hola') || v_cambio, '[]'::jsonb);
      raise exception 'FALLA: el alta repetida con otro dato (%) no avisó', v_cambio;
    exception when raise_exception then
      if sqlerrm not like '%GASTO_YA_GUARDADO%' then raise; end if;
    end;
  end loop;
  if (select total from gastos where id = v_gasto) <> 5000 or (select nota from gastos where id = v_gasto) <> 'Hola' then
    raise exception 'FALLA: el alta repetida cambió el gasto guardado';
  end if;
  -- Por productos el total sale de los ítems: el mismo pedido otra vez no avisa; con otro precio, sí.
  v_gasto := guardar_gasto(v_base || jsonb_build_object('nuevo_id', '00000000-0000-0000-0000-0000000000d8', 'modo', 'productos', 'total', 1, 'categoria_id', null),
    jsonb_build_array(jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b4', 'cantidad', 2, 'precio_unitario', 850)));
  perform guardar_gasto(v_base || jsonb_build_object('nuevo_id', '00000000-0000-0000-0000-0000000000d8', 'modo', 'productos', 'total', 1, 'categoria_id', null),
    jsonb_build_array(jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b4', 'cantidad', 2, 'precio_unitario', 850)));
  begin
    perform guardar_gasto(v_base || jsonb_build_object('nuevo_id', '00000000-0000-0000-0000-0000000000d8', 'modo', 'productos', 'total', 1, 'categoria_id', null),
      jsonb_build_array(jsonb_build_object('producto_id', '00000000-0000-0000-0000-0000000000b4', 'cantidad', 2, 'precio_unitario', 900)));
    raise exception 'FALLA: el alta por productos repetida con otro precio no avisó';
  exception when raise_exception then
    if sqlerrm not like '%GASTO_YA_GUARDADO%' then raise; end if;
  end;

  -- creado_por de una anotación es siempre quien la escribe, mande lo que mande la app.
  insert into anotaciones (id, texto, creado_por) values
    ('00000000-0000-0000-0000-0000000000e3', 'A nombre de otro', v_externo),
    ('00000000-0000-0000-0000-0000000000e4', 'Sin nombre', null);
  if exists (select 1 from anotaciones where id in ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e4')
             and creado_por is distinct from '00000000-0000-0000-0000-0000000000a1') then
    raise exception 'FALLA: la anotación quedó a nombre de otro';
  end if;
end $$;
reset role;

-- 12. Admin y permisos (migración 008): el primer integrante es admin y hay uno solo.
do $$
begin
  if (select array_agg(id) from integrantes where admin) is distinct from array['00000000-0000-0000-0000-0000000000a1'::uuid] then
    raise exception 'FALLA: el primer integrante no quedó como único admin';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'permisos') then
    raise exception 'FALLA: permisos no está en tiempo real';
  end if;
end $$;

-- 13. B (común): no toca integrantes ni permisos, lee los permisos y edita solo su perfil.
select set_config('request.jwt.claims', '{"email":"prueba-b@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into integrantes (nombre, email) values ('Alta de B', 'alta-b@example.com');
    raise exception 'FALLA: B dio de alta a alguien';
  exception when insufficient_privilege then null;
  end;
  update integrantes set email = 'cambiado-b@example.com' where id = '00000000-0000-0000-0000-0000000000a5';
  update integrantes set nombre = 'Cambiado por B' where id = '00000000-0000-0000-0000-0000000000a2';
  delete from integrantes where id = '00000000-0000-0000-0000-0000000000a5';
  if (select email from integrantes where id = '00000000-0000-0000-0000-0000000000a5') is distinct from 'prueba-e@example.com'
     or (select nombre from integrantes where id = '00000000-0000-0000-0000-0000000000a2') is distinct from 'Prueba B' then
    raise exception 'FALLA: B cambió o borró integrantes';
  end if;

  if tiene_permiso('sueldos') or tiene_permiso('altas_bajas') or es_admin() then raise exception 'FALLA: B tiene permisos'; end if;
  if mi_acceso() is distinct from '{"admin": false, "permisos": []}'::jsonb then raise exception 'FALLA: mi_acceso de B dio %', mi_acceso(); end if;
  if (select count(*) from permisos where integrante_id::text like '00000000-0000-0000-0000-0000000000a%') <> 2 then raise exception 'FALLA: B no lee los permisos de la casa'; end if;
  begin
    insert into permisos (integrante_id, permiso) values ('00000000-0000-0000-0000-0000000000a2', 'sueldos');
    raise exception 'FALLA: B se dio un permiso';
  exception when insufficient_privilege then null;
  end;
  delete from permisos;
  if (select count(*) from permisos where integrante_id::text like '00000000-0000-0000-0000-0000000000a%') <> 2 then raise exception 'FALLA: B borró permisos'; end if;
  begin
    perform ceder_admin('00000000-0000-0000-0000-0000000000a2');
    raise exception 'FALLA: B cedió el admin';
  exception when insufficient_privilege then null;
  end;

  -- Perfil: cambia solo nombre y color de quien llama.
  perform editar_perfil('Prueba B2', 'verde');
  if (select (nombre, color, email, tipo, activo, admin) from integrantes where id = '00000000-0000-0000-0000-0000000000a2')
     is distinct from ('Prueba B2'::text, 'verde'::text, 'prueba-b@example.com'::text, 'integrante'::text, true, false) then
    raise exception 'FALLA: editar_perfil no cambió solo nombre y color';
  end if;
  if exists (select 1 from integrantes where id <> '00000000-0000-0000-0000-0000000000a2' and (color is not null or nombre = 'Prueba B2')) then
    raise exception 'FALLA: editar_perfil tocó a otro integrante';
  end if;
  begin
    perform editar_perfil('Prueba B3', 'fucsia');
    raise exception 'FALLA: editar_perfil aceptó un color inventado';
  exception when check_violation then null;
  end;
  begin
    perform editar_perfil('   ', 'azul');
    raise exception 'FALLA: editar_perfil aceptó un nombre vacío';
  exception when check_violation then null;
  end;
  perform editar_perfil('Prueba B', null);
end $$;
reset role;

-- 14. C (altas y bajas): da altas y cambia a los comunes, pero no al admin ni a quien tiene permisos.
select set_config('request.jwt.claims', '{"email":"prueba-c@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_id uuid;
begin
  if not tiene_permiso('altas_bajas') or tiene_permiso('sueldos') or es_admin() then raise exception 'FALLA: permisos de C'; end if;
  if mi_acceso() is distinct from '{"admin": false, "permisos": ["altas_bajas"]}'::jsonb then raise exception 'FALLA: mi_acceso de C dio %', mi_acceso(); end if;

  -- Alta: el nuevo nace sin admin aunque lo pida.
  insert into integrantes (id, nombre, email, admin) values ('00000000-0000-0000-0000-0000000000a6', 'Nuevo de prueba', 'nuevo@example.com', true);
  if (select admin from integrantes where id = '00000000-0000-0000-0000-0000000000a6') then raise exception 'FALLA: un alta nació admin'; end if;
  update integrantes set email = 'nuevo-2@example.com' where id = '00000000-0000-0000-0000-0000000000a6';
  if (select email from integrantes where id = '00000000-0000-0000-0000-0000000000a6') is distinct from 'nuevo-2@example.com' then
    raise exception 'FALLA: C no cambió el email de un alta suya';
  end if;
  begin
    update integrantes set admin = true where id = '00000000-0000-0000-0000-0000000000a6';
    raise exception 'FALLA: C puso admin por update';
  exception when insufficient_privilege then null;
  end;
  delete from integrantes where id = '00000000-0000-0000-0000-0000000000a6';
  if exists (select 1 from integrantes where id = '00000000-0000-0000-0000-0000000000a6') then raise exception 'FALLA: C no borró un alta suya'; end if;

  -- Con A (admin) y D (con permisos): ni email, ni tipo, ni baja, ni borrar.
  foreach v_id in array array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4']::uuid[] loop
    begin
      update integrantes set email = 'robado@example.com' where id = v_id;
      raise exception 'FALLA: C cambió el email de %', v_id;
    exception when insufficient_privilege then
      if sqlerrm not like '%SIN_PERMISO%' then raise; end if;
    end;
    begin
      update integrantes set tipo = 'pagador_externo' where id = v_id;
      raise exception 'FALLA: C cambió el tipo de %', v_id;
    exception when insufficient_privilege then
      if sqlerrm not like '%SIN_PERMISO%' then raise; end if;
    end;
    begin
      update integrantes set activo = false, baja_desde = '2000-01' where id = v_id;
      raise exception 'FALLA: C dio de baja a %', v_id;
    exception when insufficient_privilege then
      if sqlerrm not like '%SIN_PERMISO%' then raise; end if;
    end;
    begin
      delete from integrantes where id = v_id;
      raise exception 'FALLA: C borró a %', v_id;
    exception when insufficient_privilege then
      if sqlerrm not like '%SIN_PERMISO%' then raise; end if;
    end;
  end loop;

  -- Con B (común) sí.
  update integrantes set email = 'prueba-b2@example.com', tipo = 'pagador_externo', activo = false, baja_desde = '2000-01'
  where id = '00000000-0000-0000-0000-0000000000a2';
  if (select (email, tipo, activo, baja_desde) from integrantes where id = '00000000-0000-0000-0000-0000000000a2')
     is distinct from ('prueba-b2@example.com'::text, 'pagador_externo'::text, false, '2000-01'::text) then
    raise exception 'FALLA: C no pudo cambiar a B';
  end if;
  update integrantes set email = 'prueba-b@example.com', tipo = 'integrante', activo = true, baja_desde = null
  where id = '00000000-0000-0000-0000-0000000000a2';

  begin
    insert into permisos (integrante_id, permiso) values ('00000000-0000-0000-0000-0000000000a3', 'sueldos');
    raise exception 'FALLA: C se dio un permiso';
  exception when insufficient_privilege then null;
  end;
  delete from permisos where integrante_id = '00000000-0000-0000-0000-0000000000a3';
  if (select count(*) from permisos where integrante_id::text like '00000000-0000-0000-0000-0000000000a%') <> 2 then raise exception 'FALLA: C borró permisos'; end if;
  begin
    perform ceder_admin('00000000-0000-0000-0000-0000000000a3');
    raise exception 'FALLA: C cedió el admin';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 15. D (sueldos) y E (pagador externo).
select set_config('request.jwt.claims', '{"email":"prueba-d@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if not tiene_permiso('sueldos') or tiene_permiso('altas_bajas') or es_admin() then raise exception 'FALLA: permisos de D'; end if;
  if mi_acceso() is distinct from '{"admin": false, "permisos": ["sueldos"]}'::jsonb then raise exception 'FALLA: mi_acceso de D dio %', mi_acceso(); end if;
  begin
    perform ceder_admin('00000000-0000-0000-0000-0000000000a4');
    raise exception 'FALLA: D cedió el admin';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"email":"prueba-e@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if tiene_permiso('sueldos') or tiene_permiso('altas_bajas') or es_admin() then raise exception 'FALLA: E tiene permisos'; end if;
  if (select count(*) from permisos where integrante_id::text like '00000000-0000-0000-0000-0000000000a%') <> 2 then raise exception 'FALLA: E no lee los permisos de la casa'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '{"email":"intruso@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from permisos) then raise exception 'FALLA: un intruso ve permisos'; end if;
  if tiene_permiso('sueldos') or es_admin() then raise exception 'FALLA: un intruso tiene permisos'; end if;
  if mi_acceso() is distinct from '{"admin": false, "permisos": []}'::jsonb then raise exception 'FALLA: mi_acceso de un intruso dio %', mi_acceso(); end if;
end $$;
reset role;

-- 16. A (admin): puede todo, maneja los permisos y cede el rol; no se borra ni se da de baja.
select set_config('request.jwt.claims', '{"email":"prueba-a@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if not (es_admin() and tiene_permiso('sueldos') and tiene_permiso('altas_bajas')) then raise exception 'FALLA: el admin no pasa los permisos'; end if;
  if mi_acceso() is distinct from '{"admin": true, "permisos": []}'::jsonb then raise exception 'FALLA: mi_acceso de A dio %', mi_acceso(); end if;

  -- La columna admin no se toca por update, ni siquiera el admin.
  begin
    update integrantes set admin = true where id = '00000000-0000-0000-0000-0000000000a2';
    raise exception 'FALLA: A puso admin por update';
  exception when insufficient_privilege then null;
  end;
  begin
    update integrantes set admin = false where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FALLA: A se sacó el admin por update';
  exception when insufficient_privilege then null;
  end;
  -- Al admin no se lo borra, ni se lo da de baja, ni se lo pasa a externo.
  begin
    delete from integrantes where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FALLA: se borró al admin';
  exception when insufficient_privilege then null;
  end;
  begin
    update integrantes set activo = false, baja_desde = '2000-01' where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FALLA: se dio de baja al admin';
  exception when insufficient_privilege then null;
  end;
  begin
    update integrantes set tipo = 'pagador_externo' where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FALLA: se pasó a externo al admin';
  exception when insufficient_privilege then null;
  end;
  -- El admin sí cambia a quien tiene permisos.
  update integrantes set email = 'prueba-d2@example.com' where id = '00000000-0000-0000-0000-0000000000a4';
  update integrantes set email = 'prueba-d@example.com' where id = '00000000-0000-0000-0000-0000000000a4';

  -- Permisos: el admin los da y los saca; un pagador externo no los recibe.
  begin
    insert into permisos (integrante_id, permiso) values ('00000000-0000-0000-0000-0000000000a5', 'sueldos');
    raise exception 'FALLA: un pagador externo recibió un permiso';
  exception when check_violation then null;
  end;
  begin
    insert into permisos (integrante_id, permiso) values ('00000000-0000-0000-0000-0000000000a2', 'admin');
    raise exception 'FALLA: se aceptó un permiso inventado';
  exception when check_violation then null;
  end;
  insert into permisos (integrante_id, permiso) values ('00000000-0000-0000-0000-0000000000a2', 'sueldos');
  delete from permisos where integrante_id = '00000000-0000-0000-0000-0000000000a2';
  if exists (select 1 from permisos where integrante_id = '00000000-0000-0000-0000-0000000000a2') then raise exception 'FALLA: A no sacó un permiso'; end if;
  -- Pasar a externo a alguien con permisos le borra los permisos.
  insert into permisos (integrante_id, permiso) values ('00000000-0000-0000-0000-0000000000a2', 'sueldos');
  update integrantes set tipo = 'pagador_externo' where id = '00000000-0000-0000-0000-0000000000a2';
  if exists (select 1 from permisos where integrante_id = '00000000-0000-0000-0000-0000000000a2') then
    raise exception 'FALLA: pasar a externo no borró los permisos';
  end if;
  update integrantes set tipo = 'integrante' where id = '00000000-0000-0000-0000-0000000000a2';

  -- Ceder: no a un externo, ni a alguien dado de baja, ni a sí mismo.
  insert into integrantes (id, nombre, email, activo, baja_desde)
  values ('00000000-0000-0000-0000-0000000000a6', 'Baja de prueba', 'baja@example.com', false, '2000-01');
  begin
    perform ceder_admin('00000000-0000-0000-0000-0000000000a5');
    raise exception 'FALLA: se cedió el admin a un pagador externo';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform ceder_admin('00000000-0000-0000-0000-0000000000a6');
    raise exception 'FALLA: se cedió el admin a alguien dado de baja';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform ceder_admin('00000000-0000-0000-0000-0000000000a1');
    raise exception 'FALLA: el admin se cedió el rol a sí mismo';
  exception when invalid_parameter_value then null;
  end;
  delete from integrantes where id = '00000000-0000-0000-0000-0000000000a6';

  -- A cede a B (que tenía un permiso): un solo admin, A conserva los dos permisos y B queda sin filas.
  insert into permisos (integrante_id, permiso) values ('00000000-0000-0000-0000-0000000000a2', 'altas_bajas');
  perform ceder_admin('00000000-0000-0000-0000-0000000000a2');
  if (select array_agg(id) from integrantes where admin) is distinct from array['00000000-0000-0000-0000-0000000000a2'::uuid] then
    raise exception 'FALLA: ceder no dejó a B como único admin';
  end if;
  if (select array_agg(permiso order by permiso) from permisos where integrante_id = '00000000-0000-0000-0000-0000000000a1')
     is distinct from array['altas_bajas', 'sueldos'] then
    raise exception 'FALLA: quien cedió no conservó los dos permisos';
  end if;
  if exists (select 1 from permisos where integrante_id = '00000000-0000-0000-0000-0000000000a2') then
    raise exception 'FALLA: el nuevo admin quedó con filas de permisos';
  end if;
  if es_admin() then raise exception 'FALLA: A sigue siendo admin después de ceder'; end if;
  -- Después de ceder, la columna admin vuelve a estar cerrada.
  begin
    update integrantes set admin = false where id = '00000000-0000-0000-0000-0000000000a2';
    raise exception 'FALLA: se cambió admin por update después de ceder';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 17. B (ahora admin) le devuelve el rol a A.
select set_config('request.jwt.claims', '{"email":"prueba-b@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if mi_acceso() is distinct from '{"admin": true, "permisos": []}'::jsonb then raise exception 'FALLA: mi_acceso del nuevo admin dio %', mi_acceso(); end if;
  perform ceder_admin('00000000-0000-0000-0000-0000000000a1');
  if (select array_agg(id) from integrantes where admin) is distinct from array['00000000-0000-0000-0000-0000000000a1'::uuid] then
    raise exception 'FALLA: B no le devolvió el admin a A';
  end if;
  if exists (select 1 from permisos where integrante_id = '00000000-0000-0000-0000-0000000000a1') then
    raise exception 'FALLA: A volvió a ser admin con filas de permisos';
  end if;
end $$;
reset role;

-- 18. Sin sesión (consola, migraciones) la columna admin se pone a mano; sigue habiendo uno solo.
select set_config('request.jwt.claims', '', true);
do $$
begin
  begin
    update integrantes set admin = true where id = '00000000-0000-0000-0000-0000000000a2';
    raise exception 'FALLA: quedaron dos admins';
  exception when unique_violation then null;
  end;
  update integrantes set admin = false where id = '00000000-0000-0000-0000-0000000000a1';
  update integrantes set admin = true where id = '00000000-0000-0000-0000-0000000000a2';
  if (select array_agg(id) from integrantes where admin) is distinct from array['00000000-0000-0000-0000-0000000000a2'::uuid] then
    raise exception 'FALLA: sin sesión no se pudo poner admin a mano';
  end if;
  update integrantes set admin = false where id = '00000000-0000-0000-0000-0000000000a2';
  update integrantes set admin = true where id = '00000000-0000-0000-0000-0000000000a1';
  delete from permisos where integrante_id = '00000000-0000-0000-0000-0000000000a2';
end $$;

-- 19. Sueldos aparte (migración 008): sin la columna vieja, RLS por permiso, partes del mes y cierre con permiso.
-- Siembra: A=100, B=200, C=300, D sin sueldo, E (pagador externo) con un sueldo suelto y F, dado de baja desde 2026-10, con 400.
select set_config('request.jwt.claims', '', true);
do $$
begin
  if exists (select 1 from pg_attribute where attrelid = 'public.integrantes'::regclass and attname = 'sueldo' and not attisdropped) then
    raise exception 'FALLA: integrantes todavía tiene la columna sueldo';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sueldos') then
    raise exception 'FALLA: sueldos no está en tiempo real';
  end if;

  insert into integrantes (id, nombre, email, activo, baja_desde)
  values ('00000000-0000-0000-0000-0000000000a7', 'Baja de octubre', 'baja-octubre@example.com', false, '2026-10');
  delete from sueldos;
  insert into sueldos (integrante_id, sueldo) values
    ('00000000-0000-0000-0000-0000000000a1', 100), ('00000000-0000-0000-0000-0000000000a2', 200),
    ('00000000-0000-0000-0000-0000000000a3', 300), ('00000000-0000-0000-0000-0000000000a5', 999),
    ('00000000-0000-0000-0000-0000000000a7', 400);
  -- Lo que mandaría la app al cerrar, guardado para quienes no pueden leer los sueldos.
  perform set_config('prueba.integrantes', (select jsonb_agg(jsonb_build_object(
    'id', i.id, 'sueldo', s.sueldo, 'tipo', i.tipo, 'activo', i.activo, 'baja_desde', i.baja_desde))
    from integrantes i left join sueldos s on s.integrante_id = i.id)::text, true);
end $$;

-- B (común), C (altas y bajas) y E (pagador externo): ni leen ni escriben sueldos, ni cierran ni reabren;
-- las partes del mes sí las piden, sin ver un solo sueldo.
set local role authenticated;
do $$
declare
  v_email text;
  v_filas int;
  v_integrantes jsonb := current_setting('prueba.integrantes')::jsonb;
begin
  foreach v_email in array array['prueba-b@example.com', 'prueba-c@example.com', 'prueba-e@example.com'] loop
    perform set_config('request.jwt.claims', jsonb_build_object('email', v_email, 'role', 'authenticated')::text, true);
    if exists (select 1 from sueldos) then raise exception 'FALLA: % lee sueldos', v_email; end if;
    begin
      insert into sueldos (integrante_id, sueldo) values ('00000000-0000-0000-0000-0000000000a4', 400);
      raise exception 'FALLA: % cargó un sueldo', v_email;
    exception when insufficient_privilege then
      if sqlerrm not like '%row-level security%' then raise; end if;
    end;
    update sueldos set sueldo = 1;
    get diagnostics v_filas = row_count;
    if v_filas <> 0 then raise exception 'FALLA: % cambió sueldos', v_email; end if;
    delete from sueldos;
    get diagnostics v_filas = row_count;
    if v_filas <> 0 then raise exception 'FALLA: % borró sueldos', v_email; end if;

    begin
      perform cerrar_mes('2000-05', 0, '{}', '[]', v_integrantes);
      raise exception 'FALLA: % cerró un mes', v_email;
    exception when insufficient_privilege then
      if sqlerrm not like '%SIN_PERMISO%' then raise; end if;
    end;
    begin
      perform reabrir_mes('2000-02');
      raise exception 'FALLA: % reabrió un mes', v_email;
    exception when insufficient_privilege then
      if sqlerrm not like '%SIN_PERMISO%' then raise; end if;
    end;

    if (select peso from partes_del_mes('2026-10') where integrante_id = '00000000-0000-0000-0000-0000000000a1')
       is distinct from 166666666667 then
      raise exception 'FALLA: % no recibió las partes del mes', v_email;
    end if;
  end loop;
end $$;
reset role;
do $$
begin
  if not exists (select 1 from cierres where mes = '2000-02') then raise exception 'FALLA: se reabrió un mes sin permiso'; end if;
  if exists (select 1 from cierres where mes = '2000-05') then raise exception 'FALLA: se cerró un mes sin permiso'; end if;
  if (select count(*) from sueldos) <> 5 or (select sum(sueldo) from sueldos) <> 1999 then
    raise exception 'FALLA: sin permiso cambió la tabla de sueldos';
  end if;
end $$;

-- Una cuenta ajena y anon: nada de sueldos, ni partes del mes, ni cierres.
select set_config('request.jwt.claims', '{"email":"intruso@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_integrantes jsonb := current_setting('prueba.integrantes')::jsonb;
begin
  if exists (select 1 from sueldos) then raise exception 'FALLA: un intruso lee sueldos'; end if;
  begin
    insert into sueldos (integrante_id, sueldo) values ('00000000-0000-0000-0000-0000000000a4', 400);
    raise exception 'FALLA: un intruso cargó un sueldo';
  exception when insufficient_privilege then null;
  end;
  begin
    perform partes_del_mes('2026-10');
    raise exception 'FALLA: un intruso pidió las partes del mes';
  exception when insufficient_privilege then
    if sqlerrm not like '%SIN_PERMISO%' then raise; end if;
  end;
  begin
    perform cerrar_mes('2000-05', 0, '{}', '[]', v_integrantes);
    raise exception 'FALLA: un intruso cerró un mes';
  exception when insufficient_privilege then
    if sqlerrm not like '%SIN_PERMISO%' then raise; end if;
  end;
  begin
    perform reabrir_mes('2000-02');
    raise exception 'FALLA: un intruso reabrió un mes';
  exception when insufficient_privilege then
    if sqlerrm not like '%SIN_PERMISO%' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
begin
  if exists (select 1 from sueldos) then raise exception 'FALLA: anon lee sueldos'; end if;
  begin
    insert into sueldos (integrante_id, sueldo) values ('00000000-0000-0000-0000-0000000000a4', 400);
    raise exception 'FALLA: anon cargó un sueldo';
  exception when insufficient_privilege then null;
  end;
  begin
    perform partes_del_mes('2026-10');
    raise exception 'FALLA: anon pidió las partes del mes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform cerrar_mes('2000-05', 0, '{}', '[]', '[]');
    raise exception 'FALLA: anon cerró un mes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform reabrir_mes('2000-02');
    raise exception 'FALLA: anon reabrió un mes';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A (admin) y D («sueldos»): leen y escriben sueldos, cierran y reabren.
set local role authenticated;
do $$
declare
  v_email text;
  v_yo uuid;
  v_integrantes jsonb := current_setting('prueba.integrantes')::jsonb;
begin
  foreach v_email in array array['prueba-a@example.com', 'prueba-d@example.com'] loop
    perform set_config('request.jwt.claims', jsonb_build_object('email', v_email, 'role', 'authenticated')::text, true);
    v_yo := yo_integrante();
    if (select count(*) from sueldos) <> 5 then raise exception 'FALLA: % no lee los sueldos', v_email; end if;
    begin
      insert into sueldos (integrante_id, sueldo) values ('00000000-0000-0000-0000-0000000000a4', -1);
      raise exception 'FALLA: % cargó un sueldo negativo', v_email;
    exception when check_violation then null;
    end;
    insert into sueldos (integrante_id, sueldo) values ('00000000-0000-0000-0000-0000000000a4', 400);
    update sueldos set sueldo = 450 where integrante_id = '00000000-0000-0000-0000-0000000000a4';
    if (select sueldo from sueldos where integrante_id = '00000000-0000-0000-0000-0000000000a4') is distinct from 450 then
      raise exception 'FALLA: % no cambió un sueldo', v_email;
    end if;
    delete from sueldos where integrante_id = '00000000-0000-0000-0000-0000000000a4';
    if (select count(*) from sueldos) <> 5 then raise exception 'FALLA: % no borró un sueldo', v_email; end if;

    perform cerrar_mes('2000-05', 0, '{"filas":[]}', '[]', v_integrantes);
    if (select cerrado_por from cierres where mes = '2000-05') is distinct from v_yo then
      raise exception 'FALLA: el cierre de % no quedó a su nombre', v_email;
    end if;
    perform reabrir_mes('2000-05');
    if exists (select 1 from cierres where mes = '2000-05') then raise exception 'FALLA: % no reabrió el mes', v_email; end if;
  end loop;
end $$;
reset role;

-- partes_del_mes: peso = sueldo × 10^12 / suma de sueldos de los participantes (sin sueldo, 0). Lo pide D, que escribe los sueldos.
select set_config('request.jwt.claims', '{"email":"prueba-d@example.com","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_a constant text := '00000000-0000-0000-0000-0000000000a1';
  v_b constant text := '00000000-0000-0000-0000-0000000000a2';
  v_c constant text := '00000000-0000-0000-0000-0000000000a3';
  v_d constant text := '00000000-0000-0000-0000-0000000000a4';
  v_f constant text := '00000000-0000-0000-0000-0000000000a7';
  v_mes text;
  v_partes jsonb;
begin
  -- Sueldos 100, 200 y 300 y D sin sueldo: D pesa 0 y no estorba. E (externo, con un sueldo suelto) y F (baja desde este mes) no figuran.
  v_partes := (select jsonb_object_agg(integrante_id, peso) from partes_del_mes('2026-10') where integrante_id::text like '00000000-0000-0000-0000-0000000000a%');
  if v_partes is distinct from jsonb_build_object(v_a, 166666666667, v_b, 333333333333, v_c, 500000000000, v_d, 0) then
    raise exception 'FALLA: partes de 2026-10 dieron %', v_partes;
  end if;
  -- F sí participa en el mes anterior a su baja.
  v_partes := (select jsonb_object_agg(integrante_id, peso) from partes_del_mes('2026-09') where integrante_id::text like '00000000-0000-0000-0000-0000000000a%');
  if v_partes is distinct from jsonb_build_object(v_a, 100000000000, v_b, 200000000000, v_c, 300000000000, v_d, 0, v_f, 400000000000) then
    raise exception 'FALLA: partes de 2026-09 dieron %', v_partes;
  end if;
  -- Devuelve solo integrante_id y peso: nada con que leer un sueldo exacto.
  if pg_get_function_result('partes_del_mes(text)'::regprocedure) is distinct from 'TABLE(integrante_id uuid, peso bigint)'
     or (select array_agg(k order by k) from (select distinct jsonb_object_keys(to_jsonb(p)) as k from partes_del_mes('2026-10') p) x)
        is distinct from array['integrante_id', 'peso'] then
    raise exception 'FALLA: partes_del_mes devuelve algo más que integrante_id y peso';
  end if;

  -- Sin el sueldo de B: A y C se reparten entre sí; B pesa 0.
  delete from sueldos where integrante_id = v_b::uuid;
  v_partes := (select jsonb_object_agg(integrante_id, peso) from partes_del_mes('2026-10') where integrante_id::text like '00000000-0000-0000-0000-0000000000a%');
  if v_partes is distinct from jsonb_build_object(v_a, 250000000000, v_b, 0, v_c, 750000000000, v_d, 0) then
    raise exception 'FALLA: partes sin el sueldo de B dieron %', v_partes;
  end if;
  -- Con un solo sueldo cargado, esa persona se lleva todo.
  delete from sueldos where integrante_id = v_c::uuid;
  v_partes := (select jsonb_object_agg(integrante_id, peso) from partes_del_mes('2026-10') where integrante_id::text like '00000000-0000-0000-0000-0000000000a%');
  if v_partes is distinct from jsonb_build_object(v_a, 1000000000000, v_b, 0, v_c, 0, v_d, 0) then
    raise exception 'FALLA: partes con un solo sueldo dieron %', v_partes;
  end if;
  -- Suma 0 (sueldos en 0): todos pesan 0 y no hay error de división.
  update sueldos set sueldo = 0;
  v_partes := (select jsonb_object_agg(integrante_id, peso) from partes_del_mes('2026-10') where integrante_id::text like '00000000-0000-0000-0000-0000000000a%');
  if v_partes is distinct from jsonb_build_object(v_a, 0, v_b, 0, v_c, 0, v_d, 0) then
    raise exception 'FALLA: partes con sueldos en 0 dieron %', v_partes;
  end if;
  -- Ningún sueldo cargado: igual.
  delete from sueldos;
  v_partes := (select jsonb_object_agg(integrante_id, peso) from partes_del_mes('2026-10') where integrante_id::text like '00000000-0000-0000-0000-0000000000a%');
  if v_partes is distinct from jsonb_build_object(v_a, 0, v_b, 0, v_c, 0, v_d, 0) then
    raise exception 'FALLA: partes sin ningún sueldo dieron %', v_partes;
  end if;
  v_partes := (select jsonb_object_agg(integrante_id, peso) from partes_del_mes('2026-09') where integrante_id::text like '00000000-0000-0000-0000-0000000000a%');
  if v_partes is distinct from jsonb_build_object(v_a, 0, v_b, 0, v_c, 0, v_d, 0, v_f, 0) then
    raise exception 'FALLA: partes de 2026-09 sin ningún sueldo dieron %', v_partes;
  end if;

  -- El mes tiene que ser AAAA-MM.
  foreach v_mes in array array['2026-1', '2026-10-01', 'octubre', '', null] loop
    begin
      perform integrante_id from partes_del_mes(v_mes);
      raise exception 'FALLA: partes_del_mes aceptó el mes %', coalesce(v_mes, 'null');
    exception when invalid_parameter_value then
      if sqlerrm not like '%MES_INVALIDO%' then raise; end if;
    end;
  end loop;
end $$;
reset role;

-- Quien tiene «altas y bajas» borra a alguien con sueldo: el sueldo se va con la persona.
select set_config('request.jwt.claims', '', true);
insert into sueldos (integrante_id, sueldo) values ('00000000-0000-0000-0000-0000000000a7', 400);
select set_config('request.jwt.claims', '{"email":"prueba-c@example.com","role":"authenticated"}', true);
set local role authenticated;
delete from integrantes where id = '00000000-0000-0000-0000-0000000000a7';
reset role;
do $$
begin
  if exists (select 1 from integrantes where id = '00000000-0000-0000-0000-0000000000a7') then raise exception 'FALLA: C no borró a F'; end if;
  if exists (select 1 from sueldos) then raise exception 'FALLA: borrar a alguien no borró su sueldo'; end if;
end $$;

rollback;
select 'OK: todas las pruebas de la base pasaron' as resultado;
