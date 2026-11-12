-- =====================================================================
-- CDSKI · 005 · Liquidaciones por quincena
-- Cada importe es un renglón con su origen (clase, orden, anticipo).
-- Una quincena pagada no se toca: las correcciones entran como renglón
-- de ajuste en la quincena abierta, con referencia al renglón original.
-- =====================================================================

alter table renglones_liquidacion add column concepto_original text;
alter table renglones_liquidacion add column quincena_ajustada_id bigint references quincenas(id);

-- Quincena que contiene una fecha (1–15 o 16–fin de mes); la crea si falta
create or replace function public.quincena_para(p_fecha date) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_ini date; v_fin date; v_id bigint;
begin
  if extract(day from p_fecha) <= 15 then
    v_ini := date_trunc('month', p_fecha)::date; v_fin := v_ini + 14;
  else
    v_ini := date_trunc('month', p_fecha)::date + 15;
    v_fin := (date_trunc('month', p_fecha) + interval '1 month - 1 day')::date;
  end if;
  insert into quincenas (inicio, fin) values (v_ini, v_fin) on conflict (inicio) do nothing;
  select id into v_id from quincenas where inicio = v_ini;
  return v_id;
end $$;

-- Lo que corresponde pagar en un período, calculado desde los registros
create or replace function public.calcular_renglones(p_inicio date, p_fin date)
returns table (instructor_id bigint, proveedor_id bigint, fecha date, concepto text, descripcion text,
               cantidad numeric, importe_unitario int, importe int, origen_tipo text, origen_id bigint)
language sql stable security definer set search_path = public as $$
  with cfg as (select * from configuracion where id = 1),
  dictadas as (
    select cl.id as clase_id, cl.instructor_id, cl.idioma, t.fecha, t.hora_inicio, pr.nombre as producto,
           pr.tipo, pr.duracion_horas, ce.nombre as centro, ti.tarifa_hora,
           round(pr.duracion_horas * ti.tarifa_hora)::int as base
      from clases cl
      join turnos t on t.id = cl.turno_id
      join productos pr on pr.id = t.producto_id
      join centros ce on ce.id = t.centro_id
      join instructores i on i.id = cl.instructor_id
      join tarifas_instructor ti on ti.categoria = i.categoria
     where t.fecha between p_inicio and p_fin
       and (t.fecha + t.hora_fin) <= public.ahora_chile()   -- solo clases ya dictadas
       and not cl.cancelada_clima
       and exists (select 1 from reservas r where r.turno_id = t.id
                    and r.estado in ('confirmada','en_curso','finalizada'))
  ),
  clima as (
    select cl.id as clase_id, cl.instructor_id, t.fecha, pr.nombre as producto, ce.nombre as centro, ti.tarifa_hora
      from clases cl
      join turnos t on t.id = cl.turno_id
      join productos pr on pr.id = t.producto_id
      join centros ce on ce.id = t.centro_id
      join instructores i on i.id = cl.instructor_id
      join tarifas_instructor ti on ti.categoria = i.categoria
      join cierres_clima cc on cc.centro_id = t.centro_id and cc.fecha = t.fecha
      cross join cfg
     where t.fecha between p_inicio and p_fin
       and cl.cancelada_clima
       and (cc.registrado_en at time zone 'America/Santiago')::date = t.fecha
       and (cc.registrado_en at time zone 'America/Santiago')::time >= cfg.hora_limite_clima
       and exists (select 1 from reservas r where r.turno_id = t.id and r.cierre_clima_id = cc.id)
  )
  -- horas de clase por tarifa de la categoría
  select d.instructor_id, null::bigint, d.fecha, 'clase',
         format('%s · %s · %s (%s h × $%s)', d.producto, d.centro, to_char(d.fecha, 'DD/MM'),
                trim(to_char(d.duracion_horas, 'FM990.##')), to_char(d.tarifa_hora, 'FM999G999G999')),
         d.duracion_horas, d.tarifa_hora, d.base, 'clase', d.clase_id
    from dictadas d
  union all
  -- adicional 10% en clases de chicos
  select d.instructor_id, null, d.fecha, 'adicional_ninos',
         format('Adicional %s%% programa chicos · %s', cfg.adicional_ninos_pct, to_char(d.fecha, 'DD/MM')),
         1, round(d.base * cfg.adicional_ninos_pct / 100.0)::int, round(d.base * cfg.adicional_ninos_pct / 100.0)::int,
         'clase', d.clase_id
    from dictadas d, cfg where d.tipo = 'chicos'
  union all
  -- adicional 5% si la clase se dicta en inglés
  select d.instructor_id, null, d.fecha, 'adicional_ingles',
         format('Adicional %s%% clase en inglés · %s', cfg.adicional_ingles_pct, to_char(d.fecha, 'DD/MM')),
         1, round(d.base * cfg.adicional_ingles_pct / 100.0)::int, round(d.base * cfg.adicional_ingles_pct / 100.0)::int,
         'clase', d.clase_id
    from dictadas d, cfg where d.idioma = 'en'
  union all
  -- mínimo por cierre por clima: clase asignada y cierre registrado ese día después de las 6:00
  select k.instructor_id, null, k.fecha, 'minimo_clima',
         format('Mínimo por clima · %s · %s · %s (%s h × $%s)', k.producto, k.centro, to_char(k.fecha, 'DD/MM'),
                trim(to_char(cfg.minimo_clima_horas, 'FM990.##')), to_char(k.tarifa_hora, 'FM999G999G999')),
         cfg.minimo_clima_horas, k.tarifa_hora, round(cfg.minimo_clima_horas * k.tarifa_hora)::int, 'clase', k.clase_id
    from clima k, cfg
  union all
  -- anticipos: se descuentan en la quincena en que se cargan
  select a.instructor_id, null, a.fecha, 'anticipo',
         'Anticipo ' || to_char(a.fecha, 'DD/MM') || coalesce(' · ' || a.nota, ''),
         1, -a.monto, -a.monto, 'anticipo', a.id
    from anticipos a where a.fecha between p_inicio and p_fin
  union all
  -- proveedores: órdenes cumplidas
  select null, o.proveedor_id, o.fecha, 'orden',
         format('%s · %s · %s × $%s', initcap(o.tipo), to_char(o.fecha, 'DD/MM'), o.cantidad,
                to_char(o.costo_unitario, 'FM999G999G999')),
         o.cantidad, o.costo_unitario, o.total, 'orden', o.id
    from ordenes_servicio o where o.fecha between p_inicio and p_fin and o.estado = 'cumplida'
  union all
  -- proveedores: cancelación con menos de 24 horas (50%). Las canceladas a tiempo no se pagan.
  select null, o.proveedor_id, o.fecha, 'cargo_cancelacion',
         format('Cancelación con cargo · %s · %s (50%% de $%s)', initcap(o.tipo), to_char(o.fecha, 'DD/MM'),
                to_char(o.total, 'FM999G999G999')),
         1, o.cargo, o.cargo, 'orden', o.id
    from ordenes_servicio o where o.fecha between p_inicio and p_fin and o.estado = 'cancelada_con_cargo'
$$;

create or replace function public.generar_liquidacion(p_quincena bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q quincenas; qp quincenas; v_ins int; v_aj int := 0; d record;
begin
  if not public.es_admin() then raise exception 'PERMISO: Solo administración genera liquidaciones'; end if;
  select * into q from quincenas where id = p_quincena for update;
  if q.estado <> 'borrador' then
    raise exception 'ESTADO: La quincena está % y no se puede recalcular. Reábrela si está aprobada.', q.estado;
  end if;

  delete from renglones_liquidacion where quincena_id = q.id and (concepto <> 'ajuste' or automatico);

  insert into renglones_liquidacion (quincena_id, instructor_id, proveedor_id, fecha, concepto, descripcion,
                                     cantidad, importe_unitario, importe, origen_tipo, origen_id)
  select q.id, c.* from public.calcular_renglones(q.inicio, q.fin) c;
  get diagnostics v_ins = row_count;

  -- Correcciones de quincenas ya pagadas: diferencia entre lo que corresponde hoy y lo pagado
  for qp in select * from quincenas where estado = 'pagada' and inicio < q.inicio order by inicio loop
    for d in
      with esperado as (
        select coalesce('i' || instructor_id, 'p' || proveedor_id) as benef,
               max(instructor_id) as instructor_id, max(proveedor_id) as proveedor_id,
               concepto, origen_tipo, origen_id,
               sum(importe)::int as importe, max(descripcion) as descripcion, max(fecha) as fecha
          from public.calcular_renglones(qp.inicio, qp.fin)
         group by 1, concepto, origen_tipo, origen_id
      ),
      pagado as (
        select coalesce('i' || instructor_id, 'p' || proveedor_id) as benef,
               max(instructor_id) as instructor_id, max(proveedor_id) as proveedor_id,
               concepto, origen_tipo, origen_id,
               sum(importe)::int as importe, min(id) as renglon_id, max(fecha) as fecha
          from renglones_liquidacion where quincena_id = qp.id and concepto <> 'ajuste'
         group by 1, concepto, origen_tipo, origen_id
      ),
      ajustado as (
        select coalesce('i' || instructor_id, 'p' || proveedor_id) as benef,
               concepto_original as concepto, origen_tipo, origen_id, sum(importe)::int as importe
          from renglones_liquidacion
         where quincena_ajustada_id = qp.id and automatico and quincena_id <> q.id
         group by 1, 2, 3, 4
      )
      select coalesce(e.instructor_id, p.instructor_id) as instructor_id,
             coalesce(e.proveedor_id, p.proveedor_id) as proveedor_id,
             coalesce(e.concepto, p.concepto) as concepto,
             coalesce(e.origen_tipo, p.origen_tipo) as origen_tipo,
             coalesce(e.origen_id, p.origen_id) as origen_id,
             coalesce(e.importe, 0) - coalesce(p.importe, 0) - coalesce(a.importe, 0) as diferencia,
             coalesce(e.descripcion, 'Renglón que ya no corresponde') as descripcion,
             coalesce(e.fecha, p.fecha) as fecha, p.renglon_id
        from esperado e
        full join pagado p on p.benef = e.benef and p.concepto = e.concepto
                          and p.origen_tipo = e.origen_tipo and p.origen_id = e.origen_id
        left join ajustado a on a.benef = coalesce(e.benef, p.benef)
                            and a.concepto = coalesce(e.concepto, p.concepto)
                            and a.origen_tipo = coalesce(e.origen_tipo, p.origen_tipo)
                            and a.origen_id = coalesce(e.origen_id, p.origen_id)
    loop
      continue when d.diferencia = 0;
      insert into renglones_liquidacion (quincena_id, instructor_id, proveedor_id, fecha, concepto, descripcion,
                                         cantidad, importe_unitario, importe, origen_tipo, origen_id,
                                         ajusta_renglon_id, automatico, concepto_original, quincena_ajustada_id)
      values (q.id, d.instructor_id, d.proveedor_id, d.fecha, 'ajuste',
              format('Ajuste quincena %s–%s · %s', to_char(qp.inicio, 'DD/MM'), to_char(qp.fin, 'DD/MM'), d.descripcion),
              1, d.diferencia, d.diferencia, d.origen_tipo, d.origen_id,
              d.renglon_id, true, d.concepto, qp.id);
      v_aj := v_aj + 1;
    end loop;
  end loop;

  return jsonb_build_object('quincena_id', q.id, 'renglones', v_ins, 'ajustes', v_aj);
end $$;

-- Ajuste manual sobre un renglón de una quincena pagada: entra en la quincena abierta siguiente
create or replace function public.crear_ajuste(p_renglon bigint, p_importe int, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o renglones_liquidacion; qo quincenas; v_dest bigint; v_id bigint;
begin
  if not public.es_admin() then raise exception 'PERMISO: Solo administración carga ajustes'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'MOTIVO: Indica el motivo del ajuste'; end if;
  if coalesce(p_importe, 0) = 0 then raise exception 'IMPORTE: El ajuste no puede ser $0'; end if;
  select * into o from renglones_liquidacion where id = p_renglon;
  if not found then raise exception 'RENGLON: El renglón no existe'; end if;
  select * into qo from quincenas where id = o.quincena_id;
  if qo.estado <> 'pagada' then
    raise exception 'ESTADO: La quincena de ese renglón no está pagada: corrige el origen y recalculá.';
  end if;
  select id into v_dest from quincenas where estado <> 'pagada' and inicio > qo.inicio order by inicio limit 1;
  if v_dest is null then v_dest := public.quincena_para(qo.fin + 1); end if;
  insert into renglones_liquidacion (quincena_id, instructor_id, proveedor_id, fecha, concepto, descripcion,
                                     cantidad, importe_unitario, importe, origen_tipo, origen_id,
                                     ajusta_renglon_id, automatico, concepto_original, quincena_ajustada_id)
  values (v_dest, o.instructor_id, o.proveedor_id, public.hoy_chile(), 'ajuste',
          format('Ajuste manual de renglón #%s (quincena %s–%s): %s', o.id, to_char(qo.inicio, 'DD/MM'),
                 to_char(qo.fin, 'DD/MM'), trim(p_motivo)),
          1, p_importe, p_importe, 'ajuste', o.id, o.id, false, o.concepto, qo.id)
  returning id into v_id;
  return jsonb_build_object('renglon_id', v_id, 'quincena_id', v_dest);
end $$;

create or replace function public.aprobar_quincena(p_quincena bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q quincenas; v jsonb;
begin
  if not public.es_admin() then raise exception 'PERMISO: Solo administración aprueba liquidaciones'; end if;
  select * into q from quincenas where id = p_quincena for update;
  if q.estado = 'aprobada' then return jsonb_build_object('estado', 'aprobada', 'repetida', true); end if;
  if q.estado = 'pagada' then raise exception 'ESTADO: La quincena ya está pagada'; end if;
  if q.fin >= public.hoy_chile() then
    raise exception 'FECHA: La quincena termina el %: se aprueba cuando haya terminado.', to_char(q.fin, 'DD/MM');
  end if;
  v := public.generar_liquidacion(q.id);
  update quincenas set estado = 'aprobada', aprobada_en = public.ahora() where id = q.id;
  return v || jsonb_build_object('estado', 'aprobada', 'repetida', false);
end $$;

create or replace function public.reabrir_quincena(p_quincena bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'PERMISO: Solo administración'; end if;
  update quincenas set estado = 'borrador', aprobada_en = null where id = p_quincena and estado = 'aprobada';
  if not found then raise exception 'ESTADO: Solo se puede reabrir una quincena aprobada (no pagada)'; end if;
end $$;

create or replace function public.pagar_quincena(p_quincena bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q quincenas;
begin
  if not public.es_admin() then raise exception 'PERMISO: Solo administración marca quincenas pagadas'; end if;
  select * into q from quincenas where id = p_quincena for update;
  if q.estado = 'pagada' then return jsonb_build_object('estado', 'pagada', 'repetida', true); end if;
  if q.estado <> 'aprobada' then raise exception 'ESTADO: Primero aprueba la quincena'; end if;
  update quincenas set estado = 'pagada', pagada_en = public.ahora() where id = q.id;
  return jsonb_build_object('estado', 'pagada', 'repetida', false);
end $$;

-- Totales por beneficiario para la pantalla de liquidaciones
create or replace function public.resumen_quincena(p_quincena bigint)
returns table (tipo text, beneficiario_id bigint, nombre text, renglones int, bruto int, descuentos int, total int)
language sql stable security definer set search_path = public as $$
  select case when r.instructor_id is not null then 'instructor' else 'proveedor' end,
         coalesce(r.instructor_id, r.proveedor_id),
         coalesce(i.nombre, pv.nombre),
         count(*)::int,
         coalesce(sum(r.importe) filter (where r.importe > 0), 0)::int,
         coalesce(sum(r.importe) filter (where r.importe < 0), 0)::int,
         sum(r.importe)::int
    from renglones_liquidacion r
    left join instructores i on i.id = r.instructor_id
    left join proveedores pv on pv.id = r.proveedor_id
   where r.quincena_id = p_quincena
     and (public.es_staff() or r.instructor_id = public.mi_instructor_id() or r.proveedor_id = public.mi_proveedor_id())
   group by 1, 2, 3
   order by 1 desc, 3
$$;

revoke execute on function public.quincena_para(date), public.calcular_renglones(date, date)
  from public, anon, authenticated;
revoke execute on function public.generar_liquidacion(bigint), public.crear_ajuste(bigint, int, text),
  public.aprobar_quincena(bigint), public.reabrir_quincena(bigint), public.pagar_quincena(bigint),
  public.resumen_quincena(bigint) from public, anon;
