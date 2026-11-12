-- =====================================================================
-- CDSKI · 006 · Informes (operaciones y administración)
-- Todos filtran por rango de fechas (fecha de la clase o del servicio).
-- La pantalla y el CSV usan exactamente las mismas filas.
-- =====================================================================

create or replace function public.solo_staff() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_staff() then raise exception 'PERMISO: Los informes son para operaciones y administración'; end if;
end $$;

-- Ocupación: lugares vendidos sobre lugares ofrecidos (sin turnos cerrados por clima)
create or replace function public.informe_ocupacion(p_desde date, p_hasta date)
returns table (producto text, centro text, turnos int, ofrecidos int, vendidos int, ocupacion_pct numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.solo_staff();
  return query
  select pr.nombre, ce.nombre, count(distinct t.id)::int, sum(t.cupo_total)::int,
         coalesce(sum((select count(*) from participantes pa join reservas r on r.id = pa.reserva_id
                         where r.turno_id = t.id and r.estado in ('confirmada','en_curso','finalizada'))), 0)::int,
         round(100.0 * coalesce(sum((select count(*) from participantes pa join reservas r on r.id = pa.reserva_id
                                      where r.turno_id = t.id and r.estado in ('confirmada','en_curso','finalizada'))), 0)
               / nullif(sum(t.cupo_total), 0), 1)
    from turnos t join productos pr on pr.id = t.producto_id join centros ce on ce.id = t.centro_id
   where t.fecha between p_desde and p_hasta and not t.cerrado_clima
   group by pr.nombre, pr.orden, ce.nombre, ce.id
   order by pr.orden, ce.id;
end $$;

-- Ingresos por producto y centro: pagos menos reintegros (por fecha de la clase)
create or replace function public.informe_ingresos(p_desde date, p_hasta date)
returns table (producto text, centro text, reservas int, cobrado int, reintegrado int, neto int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.solo_staff();
  return query
  select pr.nombre, ce.nombre, count(distinct r.id)::int,
         coalesce(sum(pg.monto) filter (where pg.tipo = 'pago'), 0)::int,
         coalesce(sum(pg.monto) filter (where pg.tipo = 'reintegro'), 0)::int,
         (coalesce(sum(pg.monto) filter (where pg.tipo = 'pago'), 0)
          - coalesce(sum(pg.monto) filter (where pg.tipo = 'reintegro'), 0))::int
    from pagos pg
    join reservas r on r.id = pg.reserva_id
    join turnos t on t.id = r.turno_id
    join productos pr on pr.id = r.producto_id
    join centros ce on ce.id = t.centro_id
   where t.fecha between p_desde and p_hasta
   group by pr.nombre, pr.orden, ce.nombre, ce.id
   order by pr.orden, ce.id;
end $$;

-- Margen por producto: ingreso neto − costo de instructores − costo de proveedores.
-- Costo de proveedores: cada orden pagada (cumplida o cargo de cancelación) se reparte
-- entre los productos según las personas que usaron ese servicio ese día y centro.
create or replace function public.informe_margen(p_desde date, p_hasta date)
returns table (producto text, ingreso int, costo_instructores int, costo_proveedores int, margen int, margen_pct numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.solo_staff();
  return query
  with ingresos as (
    select r.producto_id,
           sum(case when pg.tipo = 'pago' then pg.monto else -pg.monto end) as monto
      from pagos pg join reservas r on r.id = pg.reserva_id join turnos t on t.id = r.turno_id
     where t.fecha between p_desde and p_hasta
     group by 1
  ),
  instr as (
    select t.producto_id, sum(c.importe) as monto
      from public.calcular_renglones(p_desde, p_hasta) c
      join clases cl on cl.id = c.origen_id and c.origen_tipo = 'clase'
      join turnos t on t.id = cl.turno_id
     where c.instructor_id is not null
     group by 1
  ),
  ordenes as (
    select o.*, case when o.estado = 'cumplida' then o.total else o.cargo end as costo
      from ordenes_servicio o
     where o.fecha between p_desde and p_hasta and o.estado in ('cumplida','cancelada_con_cargo')
  ),
  uso as (   -- personas por producto que usaron cada servicio ese día y centro
    select t.centro_id, t.fecha, r.producto_id, x.tipo, count(*) as personas
      from participantes pa join reservas r on r.id = pa.reserva_id join turnos t on t.id = r.turno_id
      cross join lateral (values ('traslado', pa.traslado), ('equipo', pa.equipo), ('ropa', pa.ropa)) x(tipo, usa)
     where x.usa and t.fecha between p_desde and p_hasta
       and (r.estado in ('confirmada','en_curso','finalizada') or r.cierre_clima_id is not null)
     group by 1, 2, 3, 4
  ),
  prov as (
    select x.producto_id, sum(x.monto) as monto
      from (select coalesce(r.producto_id, u.producto_id) as producto_id,
                   case when o.reserva_id is not null then o.costo::numeric
                        else o.costo::numeric * u.personas / nullif(sum(u.personas) over (partition by o.id), 0) end as monto
              from ordenes o
              left join reservas r on r.id = o.reserva_id
              left join uso u on o.reserva_id is null and u.centro_id = o.centro_id
                             and u.fecha = o.fecha and u.tipo = o.tipo) x
     where x.producto_id is not null
     group by 1
  )
  select pr.nombre,
         coalesce(i.monto, 0)::int,
         coalesce(ins.monto, 0)::int,
         round(coalesce(pv.monto, 0))::int,
         (coalesce(i.monto, 0) - coalesce(ins.monto, 0) - round(coalesce(pv.monto, 0)))::int,
         round(100.0 * (coalesce(i.monto, 0) - coalesce(ins.monto, 0) - coalesce(pv.monto, 0)) / nullif(i.monto, 0), 1)
    from productos pr
    left join ingresos i on i.producto_id = pr.id
    left join instr ins on ins.producto_id = pr.id
    left join prov pv on pv.producto_id = pr.id
   where i.monto is not null or ins.monto is not null or pv.monto is not null
   order by pr.orden;
end $$;

-- Tasa de cancelación (reservas) y de ausentes (participantes de clases dictadas)
create or replace function public.informe_cancelaciones(p_desde date, p_hasta date)
returns table (producto text, reservas int, canceladas int, vencidas int, tasa_cancelacion_pct numeric,
               participantes int, ausentes int, tasa_ausentes_pct numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.solo_staff();
  return query
  with base as (
    select r.*, pr.nombre as producto, pr.orden
      from reservas r join turnos t on t.id = r.turno_id join productos pr on pr.id = r.producto_id
     where t.fecha between p_desde and p_hasta and r.estado <> 'solicitud' and r.reprogramada_desde is null
  )
  select b.producto, count(*)::int,
         count(*) filter (where b.estado = 'cancelada')::int,
         count(*) filter (where b.estado = 'vencida')::int,
         round(100.0 * count(*) filter (where b.estado = 'cancelada') / nullif(count(*), 0), 1),
         coalesce(sum((select count(*) from participantes pa where pa.reserva_id = b.id and b.estado = 'finalizada')), 0)::int,
         coalesce(sum((select count(*) from participantes pa where pa.reserva_id = b.id and b.estado = 'finalizada'
                                                                and pa.asistencia = 'ausente')), 0)::int,
         round(100.0 * coalesce(sum((select count(*) from participantes pa where pa.reserva_id = b.id
                                      and b.estado = 'finalizada' and pa.asistencia = 'ausente')), 0)
               / nullif(sum((select count(*) from participantes pa where pa.reserva_id = b.id and b.estado = 'finalizada')), 0), 1)
    from base b
   group by b.producto, b.orden
   order by b.orden;
end $$;

-- Horas por instructor (clases dictadas y mínimos por clima)
create or replace function public.informe_horas_instructor(p_desde date, p_hasta date)
returns table (instructor text, categoria int, clases int, horas numeric, minimos_clima int, importe int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.solo_staff();
  return query
  select i.nombre, i.categoria,
         count(*) filter (where c.concepto = 'clase')::int,
         coalesce(sum(c.cantidad) filter (where c.concepto = 'clase'), 0),
         count(*) filter (where c.concepto = 'minimo_clima')::int,
         coalesce(sum(c.importe) filter (where c.concepto <> 'anticipo'), 0)::int
    from public.calcular_renglones(p_desde, p_hasta) c
    join instructores i on i.id = c.instructor_id
   group by i.nombre, i.categoria
   order by 4 desc, 1;
end $$;

-- Saldo de créditos sin usar (por fecha de la clase que generó el crédito)
create or replace function public.informe_creditos(p_desde date, p_hasta date)
returns table (cliente text, reserva_origen text, fecha_origen date, centro text, temporada int,
               monto int, usado int, saldo int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.solo_staff();
  return query
  select pf.nombre, r.codigo, t.fecha, ce.nombre, cr.temporada, cr.monto, cr.monto - cr.saldo, cr.saldo
    from creditos cr
    join perfiles pf on pf.id = cr.cliente_id
    join reservas r on r.id = cr.reserva_origen_id
    join turnos t on t.id = r.turno_id
    join centros ce on ce.id = t.centro_id
   where t.fecha between p_desde and p_hasta
   order by cr.saldo desc, pf.nombre;
end $$;

-- Gasto por proveedor (las órdenes canceladas a tiempo no suman)
create or replace function public.informe_proveedores(p_desde date, p_hasta date)
returns table (proveedor text, cumplidas int, monto_cumplidas int, canceladas_con_cargo int, cargos int,
               canceladas_sin_cargo int, gasto_total int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.solo_staff();
  return query
  select pv.nombre,
         count(*) filter (where o.estado = 'cumplida')::int,
         coalesce(sum(o.total) filter (where o.estado = 'cumplida'), 0)::int,
         count(*) filter (where o.estado = 'cancelada_con_cargo')::int,
         coalesce(sum(o.cargo) filter (where o.estado = 'cancelada_con_cargo'), 0)::int,
         count(*) filter (where o.estado = 'cancelada')::int,
         (coalesce(sum(o.total) filter (where o.estado = 'cumplida'), 0)
          + coalesce(sum(o.cargo) filter (where o.estado = 'cancelada_con_cargo'), 0))::int
    from proveedores pv
    left join ordenes_servicio o on o.proveedor_id = pv.id and o.fecha between p_desde and p_hasta
   group by pv.nombre, pv.id
   order by pv.id;
end $$;

revoke execute on function public.solo_staff(),
  public.informe_ocupacion(date, date), public.informe_ingresos(date, date), public.informe_margen(date, date),
  public.informe_cancelaciones(date, date), public.informe_horas_instructor(date, date),
  public.informe_creditos(date, date), public.informe_proveedores(date, date)
  from public, anon;
