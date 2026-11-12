-- =====================================================================
-- CDSKI · 004 · Operación: asignación de instructores, grupos paralelos,
-- cierre por clima, reprogramación/crédito, asistencia y órdenes
-- =====================================================================

alter table reservas add column estado_previo_clima estado_reserva;

-- Cadena de reprogramaciones: una reserva y todas sus antecesoras
create or replace function public.cadena_reserva(p_reserva bigint) returns setof bigint
language sql stable security definer set search_path = public as $$
  with recursive c(id, previa) as (
    select id, reprogramada_desde from reservas where id = p_reserva
    union all
    select r.id, r.reprogramada_desde from reservas r join c on r.id = c.previa
  )
  select id from c
$$;

-- Lo pagado de verdad (incluye lo pagado en la reserva original si fue reprogramada)
create or replace function public.monto_pagado(p_reserva bigint) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(monto), 0)::int from pagos
   where tipo = 'pago' and reserva_id in (select public.cadena_reserva(p_reserva))
$$;

create or replace function public.calcular_cancelacion(p_reserva bigint,
  out horas numeric, out pct int, out pagado int, out reintegro int)
language plpgsql stable security definer set search_path = public as $$
declare r reservas; c configuracion;
begin
  select * into r from reservas where id = p_reserva;
  select * into c from configuracion where id = 1;
  horas := round(extract(epoch from public.inicio_turno(r.turno_id) - public.ahora()) / 3600, 1);
  pagado := public.monto_pagado(r.id);
  if r.estado <> 'confirmada' then
    pct := 0;
  elsif horas > 72 then pct := c.reintegro_mas_72_pct;
  elsif horas >= 24 then pct := c.reintegro_24_72_pct;
  else pct := c.reintegro_menos_24_pct;
  end if;
  reintegro := round(pagado * pct / 100.0);
end $$;

-- =====================================================================
-- Asignación de instructores
-- =====================================================================
create or replace function public.instructores_para_clase(p_clase bigint)
returns table (instructor_id bigint, nombre text, categoria int, disciplina disciplina_tipo,
               apto_ninos boolean, ingles boolean, horas_dia numeric,
               habilitado boolean, motivos_habilitacion text[], motivos_limite text[], libre boolean)
language plpgsql stable security definer set search_path = public as $$
declare cl clases; t turnos;
begin
  if not public.es_staff() then raise exception 'PERMISO: Solo operaciones asigna instructores'; end if;
  select * into cl from clases where id = p_clase;
  select * into t from turnos where id = cl.turno_id;
  return query
  select i.id, i.nombre, i.categoria, i.disciplina, i.apto_ninos, i.ingles, e.horas_dia,
         e.habilitado, e.motivos_habilitacion, e.motivos_limite,
         e.habilitado and cardinality(e.motivos_limite) = 0
    from instructores i,
         lateral public.evaluar_instructor(i.id, t.producto_id, t.centro_id, t.fecha, t.hora_inicio, t.hora_fin,
                                           t.nivel, t.disciplina, cl.idioma, cl.id) e
   where i.activo
   order by (e.habilitado and cardinality(e.motivos_limite) = 0) desc, e.habilitado desc, e.horas_dia, i.nombre;
end $$;

create or replace function public.asignar_instructor(p_clase bigint, p_instructor bigint, p_justificacion text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare cl clases; t turnos; e record;
begin
  if not public.es_staff() then raise exception 'PERMISO: Solo operaciones asigna instructores'; end if;
  select * into cl from clases where id = p_clase for update;
  if not found then raise exception 'CLASE: La clase no existe'; end if;
  if cl.cancelada_clima then raise exception 'CERRADO: La clase fue cancelada por clima'; end if;
  if cl.instructor_id = p_instructor then
    return jsonb_build_object('clase_id', cl.id, 'instructor_id', p_instructor, 'repetida', true);
  end if;
  select * into t from turnos where id = cl.turno_id;
  if t.fecha < public.hoy_chile() then raise exception 'FECHA: La clase ya pasó'; end if;

  select * into e from public.evaluar_instructor(p_instructor, t.producto_id, t.centro_id, t.fecha,
                       t.hora_inicio, t.hora_fin, t.nivel, t.disciplina, cl.idioma, cl.id);
  if not e.habilitado then
    raise exception 'NO_HABILITADO: %', array_to_string(e.motivos_habilitacion, '. ');
  end if;
  if cardinality(e.motivos_limite) > 0 then
    if coalesce(length(trim(p_justificacion)), 0) < 10 then
      raise exception 'JUSTIFICAR: %. Para asignarlo igual escribe una justificación (mínimo 10 caracteres).',
        array_to_string(e.motivos_limite, '. ');
    end if;
    insert into justificaciones_asignacion (clase_id, instructor_id, motivos, justificacion, usuario_id)
    values (cl.id, p_instructor, e.motivos_limite, trim(p_justificacion), auth.uid());
  end if;

  update clases set instructor_id = p_instructor, asignada_en = public.ahora() where id = cl.id;
  return jsonb_build_object('clase_id', cl.id, 'instructor_id', p_instructor,
                            'justificada', cardinality(e.motivos_limite) > 0, 'repetida', false);
end $$;

create or replace function public.quitar_instructor(p_clase bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_staff() then raise exception 'PERMISO: Solo operaciones'; end if;
  update clases set instructor_id = null, asignada_en = null
   where id = p_clase and not cancelada_clima and not asistencia_cerrada;
end $$;

create or replace function public.cambiar_idioma_clase(p_clase bigint, p_idioma text) returns void
language plpgsql security definer set search_path = public as $$
declare cl clases; i instructores;
begin
  if not public.es_staff() then raise exception 'PERMISO: Solo operaciones'; end if;
  select * into cl from clases where id = p_clase for update;
  select * into i from instructores where id = cl.instructor_id;
  if p_idioma = 'en' and cl.instructor_id is not null and not i.ingles then
    raise exception 'NO_HABILITADO: % no da clases en inglés. Cambia primero el instructor.', i.nombre;
  end if;
  update clases set idioma = p_idioma where id = p_clase;
end $$;

-- Grupo paralelo: solo si hay un instructor libre. Pasa la lista de espera al grupo nuevo.
create or replace function public.abrir_grupo_paralelo(p_turno bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t turnos; p productos; nt turnos; v_libres int; v_grupo int; v_movidos int; v_ofertas int;
begin
  if not public.es_staff() then raise exception 'PERMISO: Solo operaciones abre grupos'; end if;
  select * into t from turnos where id = p_turno for update;
  select * into p from productos where id = t.producto_id;
  if p.tipo not in ('grupal','chicos') then raise exception 'TIPO: Solo las clases grupales y de chicos tienen grupos paralelos'; end if;
  if t.cerrado_clima then raise exception 'CERRADO: El centro está cerrado por clima ese día'; end if;

  select count(*) into v_libres
    from instructores i,
         lateral public.evaluar_instructor(i.id, t.producto_id, t.centro_id, t.fecha, t.hora_inicio, t.hora_fin,
                                           t.nivel, t.disciplina, 'es') e
   where i.activo and e.habilitado and cardinality(e.motivos_limite) = 0;
  if v_libres = 0 then
    raise exception 'SIN_INSTRUCTOR: No hay instructores habilitados y libres para abrir otro grupo en ese horario.';
  end if;

  select max(grupo) + 1 into v_grupo from turnos
   where producto_id = t.producto_id and centro_id = t.centro_id and fecha = t.fecha
     and hora_inicio = t.hora_inicio and nivel = t.nivel and disciplina = t.disciplina;
  insert into turnos (producto_id, centro_id, fecha, hora_inicio, hora_fin, nivel, disciplina, grupo, cupo_total)
  values (t.producto_id, t.centro_id, t.fecha, t.hora_inicio, t.hora_fin, t.nivel, t.disciplina, v_grupo, p.cupo)
  returning * into nt;
  insert into clases (turno_id, numero) values (nt.id, 1);

  update lista_espera set turno_id = nt.id where turno_id = t.id and estado = 'esperando';
  get diagnostics v_movidos = row_count;
  v_ofertas := public.ofrecer_lugares(nt.id);
  return jsonb_build_object('turno_id', nt.id, 'grupo', v_grupo, 'espera_movida', v_movidos, 'ofertas', v_ofertas);
end $$;

-- =====================================================================
-- Cierre por clima
-- =====================================================================
-- Vista previa: qué se afecta, sin cambiar nada
create or replace function public.vista_previa_cierre(p_centro bigint, p_fecha date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c configuracion; v_registro timestamp; v_minimo boolean; v jsonb;
begin
  if not public.es_staff() then raise exception 'PERMISO: Solo operaciones registra cierres'; end if;
  select * into c from configuracion where id = 1;
  v_registro := public.ahora_chile();
  v_minimo := v_registro::date = p_fecha and v_registro::time >= c.hora_limite_clima;

  select jsonb_build_object(
    'centro', (select nombre from centros where id = p_centro),
    'fecha', p_fecha,
    'registro', v_registro,
    'ya_cerrado', exists (select 1 from cierres_clima where centro_id = p_centro and fecha = p_fecha),
    'paga_minimo', v_minimo,
    'reservas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'codigo', r.codigo, 'cliente', pf.nombre, 'producto', pr.nombre,
               'hora', t.hora_inicio, 'estado', r.estado,
               'personas', (select count(*) from participantes pa where pa.reserva_id = r.id),
               'pagado', public.monto_pagado(r.id) + r.credito_aplicado)
             order by t.hora_inicio, r.codigo)
        from reservas r join turnos t on t.id = r.turno_id
        join perfiles pf on pf.id = r.cliente_id join productos pr on pr.id = r.producto_id
       where t.centro_id = p_centro and t.fecha = p_fecha
         and r.estado in ('solicitud','pendiente_pago','confirmada','en_curso')), '[]'),
    'clases', coalesce((
      select jsonb_agg(jsonb_build_object(
               'clase_id', cl.id, 'producto', pr.nombre, 'hora', t.hora_inicio, 'nivel', t.nivel,
               'grupo', t.grupo, 'instructor', i.nombre, 'categoria', i.categoria,
               'minimo', case when i.id is not null and v_minimo
                              then round(c.minimo_clima_horas * ti.tarifa_hora) else 0 end)
             order by t.hora_inicio)
        from clases cl join turnos t on t.id = cl.turno_id join productos pr on pr.id = t.producto_id
        left join instructores i on i.id = cl.instructor_id
        left join tarifas_instructor ti on ti.categoria = i.categoria
       where t.centro_id = p_centro and t.fecha = p_fecha and not cl.cancelada_clima
         and exists (select 1 from reservas r where r.turno_id = t.id
                      and r.estado in ('solicitud','pendiente_pago','confirmada','en_curso'))), '[]'),
    'ordenes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'proveedor', pv.nombre, 'tipo', o.tipo, 'cantidad', o.cantidad, 'total', o.total,
               'estado', o.estado,
               'horas', round(extract(epoch from ((o.fecha + coalesce(o.hora, '08:00')) at time zone 'America/Santiago') - public.ahora()) / 3600, 1),
               'cargo', case when extract(epoch from ((o.fecha + coalesce(o.hora, '08:00')) at time zone 'America/Santiago') - public.ahora()) / 3600
                                  > c.horas_sin_cargo_proveedor
                             then 0 else round(o.total * c.cargo_proveedor_pct / 100.0) end)
             order by o.tipo)
        from ordenes_servicio o join proveedores pv on pv.id = o.proveedor_id
       where o.centro_id = p_centro and o.fecha = p_fecha and o.estado in ('pedida','aceptada')), '[]')
  ) into v;

  return v || jsonb_build_object(
    'total_personas', (select coalesce(sum((x->>'personas')::int), 0) from jsonb_array_elements(v->'reservas') x),
    'total_cargos', (select coalesce(sum((x->>'cargo')::int), 0) from jsonb_array_elements(v->'ordenes') x),
    'total_minimos', (select coalesce(sum((x->>'minimo')::int), 0) from jsonb_array_elements(v->'clases') x));
end $$;

create or replace function public.aplicar_cierre_clima(p_centro bigint, p_fecha date, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cierre cierres_clima; v_res int; v_ord int; v_esp int; v_oid bigint;
begin
  if not public.es_staff() then raise exception 'PERMISO: Solo operaciones registra cierres'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'MOTIVO: Indica el motivo del cierre'; end if;

  -- Repetir el cierre no vuelve a cancelar ni cobrar nada
  select * into v_cierre from cierres_clima where centro_id = p_centro and fecha = p_fecha;
  if found then
    return jsonb_build_object('cierre_id', v_cierre.id, 'repetida', true);
  end if;

  insert into cierres_clima (centro_id, fecha, registrado_en, motivo, usuario_id)
  values (p_centro, p_fecha, public.ahora(), trim(p_motivo), auth.uid())
  returning * into v_cierre;

  update turnos set cerrado_clima = true where centro_id = p_centro and fecha = p_fecha;

  update reservas r set estado_previo_clima = r.estado, estado = 'afectada_clima',
                        cierre_clima_id = v_cierre.id, vence_en = null
    from turnos t
   where t.id = r.turno_id and t.centro_id = p_centro and t.fecha = p_fecha
     and r.estado in ('solicitud','pendiente_pago','confirmada','en_curso');
  get diagnostics v_res = row_count;

  update clases cl set cancelada_clima = true
    from turnos t
   where t.id = cl.turno_id and t.centro_id = p_centro and t.fecha = p_fecha;

  update lista_espera e set estado = 'cancelada'
    from turnos t
   where t.id = e.turno_id and t.centro_id = p_centro and t.fecha = p_fecha and e.estado = 'esperando';
  get diagnostics v_esp = row_count;

  v_ord := 0;
  for v_oid in select o.id from ordenes_servicio o
                where o.centro_id = p_centro and o.fecha = p_fecha and o.estado in ('pedida','aceptada') loop
    perform public.cancelar_orden_interna(v_oid, v_cierre.id);
    v_ord := v_ord + 1;
  end loop;

  return jsonb_build_object('cierre_id', v_cierre.id, 'reservas', v_res, 'ordenes', v_ord,
                            'espera_cancelada', v_esp, 'repetida', false);
end $$;

-- El cliente elige crédito del 100% (no puede elegir también reprogramar)
create or replace function public.elegir_credito_clima(p_reserva bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r reservas; t turnos; v_monto int; v_id bigint;
begin
  select * into r from reservas where id = p_reserva for update;
  if not found or (r.cliente_id <> auth.uid() and not public.es_staff()) then
    raise exception 'RESERVA: La reserva no existe';
  end if;
  if r.estado <> 'afectada_clima' then raise exception 'ESTADO: Esta reserva no está afectada por clima'; end if;
  if r.opcion_clima is not null then
    raise exception 'YA_ELEGIDA: Ya elegiste % para esta reserva.',
      case r.opcion_clima when 'credito' then 'crédito' else 'reprogramar' end;
  end if;
  v_monto := public.monto_pagado(r.id) + r.credito_aplicado;
  if v_monto <= 0 then
    raise exception 'SIN_PAGO: Esta reserva no tenía pagos: puedes reprogramarla sin costo.';
  end if;
  select * into t from turnos where id = r.turno_id;
  insert into creditos (cliente_id, reserva_origen_id, cierre_clima_id, temporada, monto, saldo)
  values (r.cliente_id, r.id, r.cierre_clima_id, extract(year from t.fecha)::int, v_monto, v_monto)
  returning id into v_id;
  update reservas set opcion_clima = 'credito' where id = r.id;
  return jsonb_build_object('credito_id', v_id, 'monto', v_monto);
end $$;

-- Reprogramar: vuelve a comprobar cupo e instructor, y conserva el vínculo al cierre
create or replace function public.reprogramar_reserva(
  p_reserva bigint, p_fecha date, p_centro bigint, p_hora time,
  p_disciplina disciplina_tipo default null, p_grupo int default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r reservas; p productos; c configuracion; t_old turnos; t turnos; nr reservas;
        n int; v_nivel nivel_esqui; v_disc disciplina_tipo; v_fin time; v_grupo int;
        v_estado estado_reserva; v_hay_instr boolean;
begin
  select * into r from reservas where id = p_reserva for update;
  if not found or (r.cliente_id <> auth.uid() and not public.es_staff()) then
    raise exception 'RESERVA: La reserva no existe';
  end if;
  if r.estado <> 'afectada_clima' then raise exception 'ESTADO: Esta reserva no está afectada por clima'; end if;
  if r.opcion_clima is not null then
    raise exception 'YA_ELEGIDA: Ya elegiste % para esta reserva.',
      case r.opcion_clima when 'credito' then 'crédito' else 'reprogramar' end;
  end if;

  select * into p from productos where id = r.producto_id;
  select * into c from configuracion where id = 1;
  select * into t_old from turnos where id = r.turno_id;
  if p_fecha not between c.temporada_inicio and c.temporada_fin
     or ((p_fecha + p_hora) at time zone 'America/Santiago') <= public.ahora() then
    raise exception 'FECHA: Elige una fecha futura dentro de la temporada';
  end if;
  if not (p_hora = any (p.horarios)) then raise exception 'HORARIO: Ese horario no existe para %', p.nombre; end if;
  if exists (select 1 from cierres_clima where centro_id = p_centro and fecha = p_fecha) then
    raise exception 'CERRADO: Ese centro está cerrado por clima ese día';
  end if;

  select count(*) into n from participantes where reserva_id = r.id;
  v_nivel := t_old.nivel;
  v_disc := coalesce(p_disciplina, t_old.disciplina);
  v_fin := (p_hora + p.hora_fin_offset)::time;

  if p.tipo in ('grupal','chicos') then
    insert into turnos (producto_id, centro_id, fecha, hora_inicio, hora_fin, nivel, disciplina, grupo, cupo_total)
    values (p.id, p_centro, p_fecha, p_hora, v_fin, v_nivel, v_disc, 1, p.cupo)
    on conflict on constraint turnos_unicos do nothing;
    select * into t from turnos
     where producto_id = p.id and centro_id = p_centro and fecha = p_fecha and hora_inicio = p_hora
       and nivel = v_nivel and disciplina = v_disc and (p_grupo is null or grupo = p_grupo)
       and cupo_total - cupo_ocupado >= n
     order by grupo limit 1 for update;
    if not found then
      raise exception 'COMPLETO: No hay % lugares en ese turno. Elige otro horario o fecha.', n;
    end if;
    insert into clases (turno_id, numero) values (t.id, 1) on conflict do nothing;
    -- instructor: el ya asignado al grupo, o alguno habilitado y libre
    select exists (select 1 from clases where turno_id = t.id and instructor_id is not null)
        or exists (select 1 from instructores i,
                     lateral public.evaluar_instructor(i.id, p.id, p_centro, p_fecha, p_hora, v_fin, v_nivel, v_disc, 'es') e
                    where i.activo and e.habilitado and cardinality(e.motivos_limite) = 0)
      into v_hay_instr;
    if not v_hay_instr then
      raise exception 'SIN_INSTRUCTOR: No hay instructor habilitado y libre para ese turno. Elige otro horario o fecha.';
    end if;
  else
    if p.tipo in ('particular','guiada') then
      if public.instructores_libres(p.id, p_centro, p_fecha, p_hora, v_fin, v_nivel, v_disc, r.idioma) < 1 then
        raise exception 'SIN_INSTRUCTOR: No quedan instructores disponibles para ese horario.';
      end if;
    elsif not exists (select 1 from instructores i,
                        lateral public.evaluar_instructor(i.id, p.id, p_centro, p_fecha, p_hora, v_fin, v_nivel, v_disc, r.idioma) e
                       where i.activo and e.habilitado and cardinality(e.motivos_limite) = 0) then
      raise exception 'SIN_INSTRUCTOR: No hay instructor habilitado y libre para esa fecha.';
    end if;
    select coalesce(max(grupo), 0) + 1 into v_grupo from turnos
     where producto_id = p.id and centro_id = p_centro and fecha = p_fecha and hora_inicio = p_hora
       and nivel = v_nivel and disciplina = v_disc;
    insert into turnos (producto_id, centro_id, fecha, hora_inicio, hora_fin, nivel, disciplina, grupo, cupo_total)
    values (p.id, p_centro, p_fecha, p_hora, v_fin, v_nivel, v_disc, v_grupo, greatest(p.cupo, n))
    returning * into t;
    insert into clases (turno_id, numero, idioma)
    select t.id, g, r.idioma
      from generate_series(1, case when p.instructores_cada is not null then ceil(n::numeric / p.instructores_cada)::int else 1 end) g;
  end if;

  v_estado := case r.estado_previo_clima
                when 'en_curso' then 'confirmada'
                when 'confirmada' then 'confirmada'
                when 'solicitud' then 'solicitud'
                else 'pendiente_pago' end;

  insert into reservas (cliente_id, producto_id, turno_id, estado, idioma, temporada_alta, monto_clases,
                        recargo_alta, monto_extras, credito_aplicado, total, cotizado_en, vence_en,
                        confirmada_en, reprogramada_desde, cierre_clima_id, notas)
  values (r.cliente_id, r.producto_id, t.id, v_estado, r.idioma, r.temporada_alta, r.monto_clases,
          r.recargo_alta, r.monto_extras, r.credito_aplicado, r.total, r.cotizado_en,
          case when v_estado = 'pendiente_pago' then public.ahora() + make_interval(hours => c.horas_pago) end,
          case when v_estado = 'confirmada' then public.ahora() end,
          r.id, r.cierre_clima_id, 'Reprogramada desde ' || r.codigo || ' por cierre por clima')
  returning * into nr;

  insert into participantes (reserva_id, nombre, edad, nivel, equipo, ropa, traslado)
  select nr.id, nombre, edad, nivel, equipo, ropa, traslado from participantes where reserva_id = r.id;

  update turnos set cupo_ocupado = cupo_ocupado + n where id = t.id;
  update movimientos_credito set reserva_id = nr.id where reserva_id = r.id;   -- el crédito usado viaja con la reserva
  update reservas set opcion_clima = 'reprogramar' where id = r.id;
  if v_estado = 'confirmada' then perform public.sincronizar_ordenes(t.centro_id, t.fecha); end if;

  return jsonb_build_object('reserva_id', nr.id, 'codigo', nr.codigo, 'estado', nr.estado,
                            'fecha', p_fecha, 'hora', p_hora, 'cierre_clima_id', nr.cierre_clima_id);
end $$;

-- =====================================================================
-- Asistencia (instructor) y órdenes (proveedor)
-- =====================================================================
create or replace function public.marcar_asistencia(p_participante bigint, p_asistencia asistencia_tipo) returns void
language plpgsql security definer set search_path = public as $$
declare v_clase bigint; v_cerrada boolean; v_fecha date;
begin
  select cl.id, cl.asistencia_cerrada, t.fecha into v_clase, v_cerrada, v_fecha
    from participantes pa join reservas r on r.id = pa.reserva_id
    join turnos t on t.id = r.turno_id join clases cl on cl.turno_id = t.id
   where pa.id = p_participante
     and (cl.instructor_id = public.mi_instructor_id() or public.es_staff())
   limit 1;
  if v_clase is null then raise exception 'PERMISO: No es una clase tuya'; end if;
  if v_cerrada then raise exception 'CERRADA: La asistencia de esta clase ya está cerrada'; end if;
  if v_fecha > public.hoy_chile() then raise exception 'FECHA: La asistencia se marca el día de la clase'; end if;
  update participantes set asistencia = p_asistencia where id = p_participante;
end $$;

-- Cerrar la clase: los que no se marcaron quedan presentes; los ausentes no tienen reintegro
-- y la clase se le paga igual al instructor.
create or replace function public.cerrar_clase(p_clase bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cl clases; t turnos; v_aus int;
begin
  select * into cl from clases where id = p_clase for update;
  if not found or not (cl.instructor_id = public.mi_instructor_id() or public.es_staff()) then
    raise exception 'PERMISO: No es una clase tuya';
  end if;
  if cl.asistencia_cerrada then return jsonb_build_object('repetida', true); end if;
  select * into t from turnos where id = cl.turno_id;
  if t.fecha > public.hoy_chile() then raise exception 'FECHA: La clase todavía no se dictó'; end if;
  update participantes pa set asistencia = 'presente'
    from reservas r where r.id = pa.reserva_id and r.turno_id = t.id and pa.asistencia = 'pendiente'
     and r.estado in ('confirmada','en_curso','finalizada');
  select count(*) into v_aus from participantes pa join reservas r on r.id = pa.reserva_id
   where r.turno_id = t.id and pa.asistencia = 'ausente';
  update clases set asistencia_cerrada = true where turno_id = t.id;
  update reservas set estado = 'finalizada' where turno_id = t.id and estado in ('confirmada','en_curso');
  return jsonb_build_object('ausentes', v_aus, 'repetida', false);
end $$;

create or replace function public.actualizar_orden(p_orden bigint, p_estado estado_orden) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o ordenes_servicio; v_nuevo estado_orden;
begin
  select * into o from ordenes_servicio where id = p_orden for update;
  if not found or not (o.proveedor_id = public.mi_proveedor_id() or public.es_staff()) then
    raise exception 'ORDEN: La orden no existe';
  end if;
  if o.estado = p_estado then return jsonb_build_object('estado', o.estado, 'repetida', true); end if;

  if p_estado = 'aceptada' and o.estado = 'pedida' then
    v_nuevo := 'aceptada';
  elsif p_estado = 'cumplida' and o.estado in ('pedida','aceptada') then
    if o.fecha > public.hoy_chile() then raise exception 'FECHA: Una orden se marca cumplida el día del servicio'; end if;
    v_nuevo := 'cumplida';
  elsif p_estado in ('cancelada','cancelada_con_cargo') then
    if not public.es_staff() then raise exception 'PERMISO: Solo operaciones cancela órdenes'; end if;
    return jsonb_build_object('estado', public.cancelar_orden_interna(o.id), 'repetida', false);
  else
    raise exception 'ESTADO: Una orden % no puede pasar a %', o.estado, p_estado;
  end if;
  update ordenes_servicio set estado = v_nuevo, actualizado_en = public.ahora() where id = o.id;
  return jsonb_build_object('estado', v_nuevo, 'repetida', false);
end $$;

create or replace function public.recalcular_ordenes_dia(p_fecha date) returns void
language plpgsql security definer set search_path = public as $$
declare ce record;
begin
  if not public.es_staff() then raise exception 'PERMISO: Solo operaciones'; end if;
  for ce in select id from centros where activo loop
    perform public.sincronizar_ordenes(ce.id, p_fecha);
  end loop;
end $$;

-- Reloj de demostración (solo administración)
create or replace function public.fijar_reloj(p_momento timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'PERMISO: Solo administración'; end if;
  update configuracion set reloj_simulado = p_momento,
                           reloj_fijado_en = case when p_momento is null then null else now() end,
                           actualizado_en = now()
   where id = 1;
end $$;

create or replace function public.estado_reloj() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('simulado', reloj_simulado is not null, 'ahora', public.ahora(),
                            'ahora_chile', public.ahora_chile())
    from configuracion where id = 1
$$;

revoke execute on function public.cadena_reserva(bigint), public.monto_pagado(bigint),
  public.calcular_cancelacion(bigint) from public, anon, authenticated;
revoke execute on function public.instructores_para_clase(bigint), public.asignar_instructor(bigint, bigint, text),
  public.quitar_instructor(bigint), public.cambiar_idioma_clase(bigint, text), public.abrir_grupo_paralelo(bigint),
  public.vista_previa_cierre(bigint, date), public.aplicar_cierre_clima(bigint, date, text),
  public.elegir_credito_clima(bigint),
  public.reprogramar_reserva(bigint, date, bigint, time, disciplina_tipo, int),
  public.marcar_asistencia(bigint, asistencia_tipo), public.cerrar_clase(bigint),
  public.actualizar_orden(bigint, estado_orden), public.recalcular_ordenes_dia(date),
  public.fijar_reloj(timestamptz) from public, anon;
grant execute on function public.estado_reloj() to anon, authenticated;
