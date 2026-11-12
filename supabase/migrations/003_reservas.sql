-- =====================================================================
-- CDSKI · 003 · Reservas, cupos, lista de espera, pagos y cancelaciones
-- Cada acción que toca cupo, saldo o estado se resuelve en UNA función:
-- valida el estado actual, y si una regla falla no cambia nada.
-- =====================================================================

-- ---------- Ajustes al modelo ----------
alter table turnos add column disciplina disciplina_tipo not null default 'esqui';
alter table turnos drop constraint turnos_producto_id_centro_id_fecha_hora_inicio_nivel_grupo_key;
alter table turnos add constraint turnos_unicos unique (producto_id, centro_id, fecha, hora_inicio, nivel, disciplina, grupo);

-- Una jornada corporativa necesita varias clases (1 instructor cada 6) en el mismo turno
alter table clases drop constraint clases_turno_id_key;
alter table clases add column numero int not null default 1;
alter table clases add constraint clases_turno_numero unique (turno_id, numero);

alter table reservas add column clave text;                 -- evita duplicar si se repite el envío
create unique index reservas_clave on reservas (cliente_id, clave) where clave is not null;
alter table reservas add column clima_confirmado boolean;   -- heliesquí: se confirma el día anterior

alter table renglones_liquidacion add column automatico boolean not null default false;

alter table ordenes_servicio add column clave text;
create unique index ordenes_clave_activa on ordenes_servicio (clave)
  where clave is not null and estado in ('pedida','aceptada','cumplida');

-- ---------- Reloj de demostración ----------
-- Si administración fija una hora simulada, todo el sistema usa ese reloj
-- (avanza desde ese momento). Sirve para reproducir el sábado de tormenta.
alter table configuracion add column reloj_simulado timestamptz;
alter table configuracion add column reloj_fijado_en timestamptz;

create or replace function public.ahora() returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select reloj_simulado + (now() - reloj_fijado_en) from configuracion where id = 1 and reloj_simulado is not null),
    now())
$$;

-- ---------- Ayudas ----------
create or replace function public.inicio_turno(p_turno bigint) returns timestamptz
language sql stable security definer set search_path = public as $$
  select (fecha + hora_inicio) at time zone 'America/Santiago' from turnos where id = p_turno
$$;

create or replace function public.hoy_chile() returns date
language sql stable as $$ select (public.ahora() at time zone 'America/Santiago')::date $$;

create or replace function public.ahora_chile() returns timestamp
language sql stable as $$ select public.ahora() at time zone 'America/Santiago' $$;

create or replace function public.etiqueta_cupo(p_libres int) returns text
language sql immutable as $$
  select case when p_libres >= 3 then 'Disponible' when p_libres >= 1 then 'Últimos lugares' else 'Completo' end
$$;

-- Montos de una reserva: recargo de temporada alta solo sobre clases, nunca sobre extras
create or replace function public.calcular_montos(
  p_producto bigint, p_fecha date, p_personas jsonb,
  out monto_clases int, out recargo int, out monto_extras int, out alta boolean)
language plpgsql stable security definer set search_path = public as $$
declare p productos; c configuracion; n int; base int;
begin
  select * into p from productos where id = p_producto;
  select * into c from configuracion where id = 1;
  n := jsonb_array_length(p_personas);
  base := case p.precio_por when 'persona' then p.precio * n else p.precio end;
  alta := p_fecha between c.alta_inicio and c.alta_fin;
  recargo := case when alta then round(base * c.recargo_alta_pct / 100.0) else 0 end;
  monto_clases := base + recargo;
  select coalesce(sum(
      case when coalesce((x->>'equipo')::boolean, false)   then (select precio from extras where codigo = 'equipo')   else 0 end +
      case when coalesce((x->>'ropa')::boolean, false)     then (select precio from extras where codigo = 'ropa')     else 0 end +
      case when coalesce((x->>'traslado')::boolean, false) then (select precio from extras where codigo = 'traslado') else 0 end
    ), 0)
    into monto_extras
    from jsonb_array_elements(p_personas) x;
end $$;

-- Valida edades y niveles. Los errores empiezan con un código para que la pantalla
-- pueda reaccionar (por ejemplo, proponer dividir la reserva).
create or replace function public.validar_personas(p_producto bigint, p_nivel nivel_esqui, p_personas jsonb)
returns nivel_esqui
language plpgsql stable security definer set search_path = public as $$
declare p productos; c configuracion; x jsonb; n int; niveles text[];
begin
  select * into p from productos where id = p_producto;
  select * into c from configuracion where id = 1;
  n := coalesce(jsonb_array_length(p_personas), 0);
  if n = 0 then raise exception 'PERSONAS: Agrega al menos una persona'; end if;
  if n < p.min_personas then raise exception 'PERSONAS: % necesita al menos % personas', p.nombre, p.min_personas; end if;
  if n > p.cupo then raise exception 'PERSONAS: % admite hasta % personas por reserva', p.nombre, p.cupo; end if;

  for x in select * from jsonb_array_elements(p_personas) loop
    if coalesce(trim(x->>'nombre'), '') = '' then
      raise exception 'PERSONAS: Falta el nombre de una de las personas';
    end if;
    if (x->>'edad') is null or (x->>'edad')::int < c.edad_minima then
      raise exception 'EDAD_MINIMA: % tiene % años. La edad mínima para tomar clases en la escuela es % años.',
        x->>'nombre', coalesce(x->>'edad', '?'), c.edad_minima;
    end if;
    if (p.edad_min is not null and (x->>'edad')::int < p.edad_min)
       or (p.edad_max is not null and (x->>'edad')::int > p.edad_max) then
      raise exception 'EDAD_PRODUCTO: % es para personas de % a % años y % tiene %.',
        p.nombre, p.edad_min, p.edad_max, x->>'nombre', x->>'edad';
    end if;
    if not ((x->>'nivel')::nivel_esqui = any (p.niveles_permitidos)) then
      raise exception 'NIVEL_PRODUCTO: % no está disponible para nivel %.', p.nombre, initcap(x->>'nivel');
    end if;
  end loop;

  select array_agg(distinct j->>'nivel') into niveles from jsonb_array_elements(p_personas) j;
  if p.tipo <> 'corporativa' and array_length(niveles, 1) > 1 then
    raise exception 'NIVELES_MEZCLADOS: Todas las personas de una reserva tienen que tener el mismo nivel. Puedes dividirla en dos reservas.';
  end if;
  if p.tipo <> 'corporativa' and p_nivel is not null and niveles[1]::nivel_esqui <> p_nivel then
    raise exception 'NIVEL_TURNO: Este turno es de nivel % y las personas declararon %.', initcap(p_nivel::text), initcap(niveles[1]);
  end if;
  -- corporativa: se guarda el nivel más bajo del grupo
  return (select min(u::nivel_esqui) from unnest(niveles) u);
end $$;

-- ---------- Créditos ----------
create or replace function public.aplicar_credito(p_reserva bigint) returns int
language plpgsql security definer set search_path = public as $$
declare r reservas; cr creditos; v_temporada int; v_usar int; v_total_usado int := 0;
begin
  select * into r from reservas where id = p_reserva for update;
  select extract(year from t.fecha)::int into v_temporada from turnos t where t.id = r.turno_id;
  for cr in select * from creditos
             where cliente_id = r.cliente_id and temporada = v_temporada and saldo > 0
             order by creado_en for update loop
    exit when r.total - v_total_usado <= 0;
    v_usar := least(cr.saldo, r.total - v_total_usado);
    update creditos set saldo = saldo - v_usar where id = cr.id;
    insert into movimientos_credito (credito_id, reserva_id, monto) values (cr.id, r.id, -v_usar);
    v_total_usado := v_total_usado + v_usar;
  end loop;
  if v_total_usado > 0 then
    update reservas set credito_aplicado = credito_aplicado + v_total_usado,
                        total = total - v_total_usado
     where id = r.id;
  end if;
  return v_total_usado;
end $$;

-- Devuelve al saldo el porcentaje indicado del crédito usado en una reserva
create or replace function public.devolver_credito(p_reserva bigint, p_pct int) returns int
language plpgsql security definer set search_path = public as $$
declare m record; v_dev int; v_total int := 0;
begin
  for m in select credito_id, -sum(monto)::int as usado from movimientos_credito
            where reserva_id = p_reserva group by credito_id having -sum(monto) > 0 loop
    v_dev := round(m.usado * p_pct / 100.0);
    if v_dev > 0 then
      update creditos set saldo = saldo + v_dev where id = m.credito_id;
      insert into movimientos_credito (credito_id, reserva_id, monto) values (m.credito_id, p_reserva, v_dev);
      v_total := v_total + v_dev;
    end if;
  end loop;
  return v_total;
end $$;

-- ---------- Órdenes a proveedores ----------
create or replace function public.cancelar_orden_interna(p_orden bigint, p_cierre bigint default null)
returns estado_orden
language plpgsql security definer set search_path = public as $$
declare o ordenes_servicio; c configuracion; v_horas numeric;
begin
  select * into o from ordenes_servicio where id = p_orden for update;
  if o.estado not in ('pedida','aceptada') then return o.estado; end if;
  select * into c from configuracion where id = 1;
  v_horas := extract(epoch from ((o.fecha + coalesce(o.hora, '08:00')) at time zone 'America/Santiago') - public.ahora()) / 3600;
  if v_horas > c.horas_sin_cargo_proveedor then
    update ordenes_servicio set estado = 'cancelada', cargo = 0, cierre_clima_id = p_cierre, actualizado_en = public.ahora()
     where id = o.id;
    return 'cancelada';
  else
    update ordenes_servicio set estado = 'cancelada_con_cargo',
           cargo = round(o.total * c.cargo_proveedor_pct / 100.0),
           cierre_clima_id = p_cierre, actualizado_en = public.ahora()
     where id = o.id;
    return 'cancelada_con_cargo';
  end if;
end $$;

-- Recalcula los pedidos de camionetas, equipos y ropa de un centro y fecha
-- según las reservas confirmadas. Camionetas: una cada 12 pasajeros.
create or replace function public.sincronizar_ordenes(p_centro bigint, p_fecha date) returns void
language plpgsql security definer set search_path = public as $$
declare c configuracion; v_tipo text; v_cant int; v_pers int; v_prov bigint; v_costo int;
        o ordenes_servicio; v_clave text; v_hora time;
begin
  if p_fecha < public.hoy_chile() then return; end if;
  if exists (select 1 from cierres_clima where centro_id = p_centro and fecha = p_fecha) then return; end if;
  select * into c from configuracion where id = 1;

  foreach v_tipo in array array['traslado','equipo','ropa'] loop
    select count(*) filter (where (v_tipo = 'traslado' and pa.traslado)
                               or (v_tipo = 'equipo' and pa.equipo)
                               or (v_tipo = 'ropa' and pa.ropa))
      into v_pers
      from participantes pa
      join reservas r on r.id = pa.reserva_id
      join turnos t on t.id = r.turno_id
     where t.centro_id = p_centro and t.fecha = p_fecha
       and r.estado in ('confirmada','en_curso');

    v_cant := case when v_tipo = 'traslado' then ceil(v_pers::numeric / c.plazas_camioneta)::int else v_pers end;
    select proveedor_id, costo_unitario into v_prov, v_costo from extras where codigo = v_tipo;
    v_clave := v_tipo || ':' || p_centro || ':' || p_fecha;
    v_hora := case when v_tipo = 'traslado' then time '07:00' else time '08:30' end;

    select * into o from ordenes_servicio
     where clave = v_clave and estado in ('pedida','aceptada','cumplida') for update;

    if found then
      if o.estado = 'cumplida' then continue; end if;
      if v_cant = 0 then
        perform public.cancelar_orden_interna(o.id);
      elsif v_cant <> o.cantidad then
        update ordenes_servicio
           set cantidad = v_cant, total = v_cant * v_costo,
               detalle = case when v_tipo = 'traslado' then v_pers || ' pasajeros desde Lo Barnechea'
                              else v_cant || ' personas' end,
               actualizado_en = public.ahora()
         where id = o.id;
      end if;
    elsif v_cant > 0 then
      insert into ordenes_servicio (proveedor_id, centro_id, fecha, hora, tipo, cantidad, costo_unitario, total, clave, detalle)
      values (v_prov, p_centro, p_fecha, v_hora, v_tipo, v_cant, v_costo, v_cant * v_costo, v_clave,
              case when v_tipo = 'traslado' then v_pers || ' pasajeros desde Lo Barnechea' else v_cant || ' personas' end);
    end if;
  end loop;
end $$;

-- ---------- Lista de espera ----------
-- Cuando hay lugar, el primero en espera recibe una reserva pendiente con 12 horas para confirmar.
create or replace function public.ofrecer_lugares(p_turno bigint) returns int
language plpgsql security definer set search_path = public as $$
declare t turnos; e lista_espera; c configuracion; m record; r reservas; v_ofertas int := 0;
begin
  select * into c from configuracion where id = 1;
  loop
    select * into t from turnos where id = p_turno for update;
    exit when t.cerrado_clima or public.inicio_turno(t.id) <= public.ahora();
    select * into e from lista_espera
     where turno_id = p_turno and estado = 'esperando'
     order by creado_en, id limit 1 for update;
    exit when not found;
    exit when t.cupo_total - t.cupo_ocupado < e.cantidad;   -- respeta el orden de llegada

    select * into m from public.calcular_montos(t.producto_id, t.fecha, e.personas);
    insert into reservas (cliente_id, producto_id, turno_id, estado, temporada_alta, monto_clases,
                          recargo_alta, monto_extras, total, vence_en, desde_espera_id, notas)
    values (e.cliente_id, t.producto_id, t.id, 'pendiente_pago', m.alta, m.monto_clases, m.recargo,
            m.monto_extras, m.monto_clases + m.monto_extras,
            public.ahora() + make_interval(hours => c.horas_espera), e.id,
            'Lugar liberado desde la lista de espera')
    returning * into r;

    insert into participantes (reserva_id, nombre, edad, nivel, equipo, ropa, traslado)
    select r.id, trim(x->>'nombre'), (x->>'edad')::int, (x->>'nivel')::nivel_esqui,
           coalesce((x->>'equipo')::boolean, false), coalesce((x->>'ropa')::boolean, false),
           coalesce((x->>'traslado')::boolean, false)
      from jsonb_array_elements(e.personas) x;

    update turnos set cupo_ocupado = cupo_ocupado + e.cantidad where id = t.id;
    update lista_espera set estado = 'ofrecida', ofrecida_en = public.ahora(), vence_en = r.vence_en, reserva_id = r.id
     where id = e.id;
    v_ofertas := v_ofertas + 1;
  end loop;
  return v_ofertas;
end $$;

-- ---------- Mantenimiento: se llama al abrir el tablero del día y Mi cuenta ----------
-- Vence pendientes sin pago, libera su cupo, ofrece el lugar al siguiente en espera
-- y actualiza En curso / Finalizada. Sin tareas programadas.
create or replace function public.mantenimiento() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r reservas; n int; v_vencidas int := 0; v_ofertas int := 0;
begin
  for r in select * from reservas
            where estado = 'pendiente_pago' and vence_en < public.ahora()
            order by vence_en for update skip locked loop
    select count(*) into n from participantes where reserva_id = r.id;
    update reservas set estado = 'vencida' where id = r.id;
    update turnos set cupo_ocupado = greatest(cupo_ocupado - n, 0) where id = r.turno_id;
    perform public.devolver_credito(r.id, 100);
    if r.desde_espera_id is not null then
      update lista_espera set estado = 'expirada' where id = r.desde_espera_id;
    end if;
    v_ofertas := v_ofertas + public.ofrecer_lugares(r.turno_id);
    v_vencidas := v_vencidas + 1;
  end loop;

  update reservas rv set estado = 'en_curso'
    from turnos t
   where t.id = rv.turno_id and rv.estado = 'confirmada'
     and (t.fecha + t.hora_inicio) <= public.ahora_chile()
     and (t.fecha + t.hora_fin) > public.ahora_chile();

  update reservas rv set estado = 'finalizada'
    from turnos t
   where t.id = rv.turno_id and rv.estado in ('confirmada','en_curso')
     and (t.fecha + t.hora_fin) <= public.ahora_chile();

  update lista_espera e set estado = 'expirada'
    from turnos t
   where t.id = e.turno_id and e.estado = 'esperando' and t.fecha < public.hoy_chile();

  return jsonb_build_object('vencidas', v_vencidas, 'ofertas', v_ofertas);
end $$;

-- =====================================================================
-- Instructores: habilitación y límites (se usa al reservar particulares y al asignar)
-- =====================================================================
create or replace function public.evaluar_instructor(
  p_instructor bigint, p_producto bigint, p_centro bigint, p_fecha date,
  p_inicio time, p_fin time, p_nivel nivel_esqui, p_disciplina disciplina_tipo,
  p_idioma text, p_excluir_clase bigint default null,
  out habilitado boolean, out motivos_habilitacion text[], out motivos_limite text[], out horas_dia numeric)
language plpgsql stable security definer set search_path = public as $$
declare i instructores; p productos; c configuracion; v_cat_req int; v_atras int := 0; v_adelante int := 0; d date;
begin
  select * into i from instructores where id = p_instructor;
  select * into p from productos where id = p_producto;
  select * into c from configuracion where id = 1;
  motivos_habilitacion := '{}'; motivos_limite := '{}';

  -- Habilitación (no se puede saltear)
  v_cat_req := greatest(p.categoria_minima,
                        case p_nivel when 'avanzado' then 2 when 'experto' then 3 else 1 end);
  if not i.activo then motivos_habilitacion := motivos_habilitacion || 'Instructor inactivo'::text; end if;
  if i.categoria < v_cat_req then
    motivos_habilitacion := motivos_habilitacion ||
      format('Requiere Nivel %s (tiene Nivel %s)', v_cat_req, i.categoria);
  end if;
  if i.disciplina <> 'ambas' and p_disciplina <> 'ambas' and i.disciplina <> p_disciplina then
    motivos_habilitacion := motivos_habilitacion ||
      format('No enseña %s', case p_disciplina when 'esqui' then 'esquí' else 'snowboard' end);
  end if;
  if p.requiere_apto_ninos and not i.apto_ninos then
    motivos_habilitacion := motivos_habilitacion || 'No tiene la marca Apto niños'::text;
  end if;
  if p_idioma = 'en' and not i.ingles then
    motivos_habilitacion := motivos_habilitacion || 'No da clases en inglés'::text;
  end if;

  -- Límites (se pueden saltear con justificación escrita)
  if exists (select 1 from clases cl join turnos t on t.id = cl.turno_id
              where cl.instructor_id = i.id and not cl.cancelada_clima
                and t.fecha = p_fecha and cl.id is distinct from p_excluir_clase
                and t.hora_inicio < p_fin and p_inicio < t.hora_fin) then
    motivos_limite := motivos_limite || 'Tiene otra clase superpuesta'::text;
  elsif exists (select 1 from clases cl join turnos t on t.id = cl.turno_id
                 where cl.instructor_id = i.id and not cl.cancelada_clima
                   and t.fecha = p_fecha and cl.id is distinct from p_excluir_clase
                   and t.centro_id <> p_centro
                   and t.hora_inicio < p_fin + make_interval(mins => c.minutos_entre_centros)
                   and p_inicio - make_interval(mins => c.minutos_entre_centros) < t.hora_fin) then
    motivos_limite := motivos_limite ||
      format('Menos de %s minutos para cambiar de centro', c.minutos_entre_centros);
  end if;

  select coalesce(sum(pr.duracion_horas), 0) into horas_dia
    from clases cl join turnos t on t.id = cl.turno_id join productos pr on pr.id = t.producto_id
   where cl.instructor_id = i.id and not cl.cancelada_clima and t.fecha = p_fecha
     and cl.id is distinct from p_excluir_clase;
  if horas_dia + p.duracion_horas > c.max_horas_dia then
    motivos_limite := motivos_limite ||
      format('Superaría %s horas de clase en el día (ya tiene %s)', c.max_horas_dia, horas_dia);
  end if;

  d := p_fecha - 1;
  while exists (select 1 from clases cl join turnos t on t.id = cl.turno_id
                 where cl.instructor_id = i.id and not cl.cancelada_clima and t.fecha = d) loop
    v_atras := v_atras + 1; d := d - 1;
  end loop;
  d := p_fecha + 1;
  while exists (select 1 from clases cl join turnos t on t.id = cl.turno_id
                 where cl.instructor_id = i.id and not cl.cancelada_clima and t.fecha = d) loop
    v_adelante := v_adelante + 1; d := d + 1;
  end loop;
  if not exists (select 1 from clases cl join turnos t on t.id = cl.turno_id
                  where cl.instructor_id = i.id and not cl.cancelada_clima and t.fecha = p_fecha
                    and cl.id is distinct from p_excluir_clase)
     and v_atras + v_adelante + 1 > c.max_dias_seguidos then
    motivos_limite := motivos_limite ||
      format('Trabajaría %s días seguidos sin su día libre', v_atras + v_adelante + 1);
  end if;

  habilitado := cardinality(motivos_habilitacion) = 0;
end $$;

-- Cuántos instructores libres hay para un particular o salida guiada en ese horario
create or replace function public.instructores_libres(
  p_producto bigint, p_centro bigint, p_fecha date, p_inicio time, p_fin time,
  p_nivel nivel_esqui, p_disciplina disciplina_tipo, p_idioma text) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0,
    (select count(*) from instructores i,
            lateral public.evaluar_instructor(i.id, p_producto, p_centro, p_fecha, p_inicio, p_fin,
                                              p_nivel, p_disciplina, p_idioma) e
      where i.activo and e.habilitado and cardinality(e.motivos_limite) = 0)
    -
    (select count(*) from clases cl join turnos t on t.id = cl.turno_id join productos p on p.id = t.producto_id
      where cl.instructor_id is null and not cl.cancelada_clima and t.fecha = p_fecha
        and p.tipo in ('particular','guiada')
        and t.hora_inicio < p_fin and p_inicio < t.hora_fin
        and exists (select 1 from reservas r where r.turno_id = t.id
                     and r.estado in ('pendiente_pago','confirmada','en_curso')))
  )::int
$$;

-- =====================================================================
-- Disponibilidad pública (sin datos de personas)
-- =====================================================================
create or replace function public.disponibilidad(p_producto bigint, p_fecha date)
returns table (centro_id bigint, centro text, hora_inicio time, hora_fin time, nivel nivel_esqui,
               disciplina disciplina_tipo, grupo int, turno_id bigint, cupo_total int, libres int,
               etiqueta text, cerrado_clima boolean)
language plpgsql stable security definer set search_path = public as $$
declare p productos; c configuracion;
begin
  select * into p from productos where id = p_producto;
  select * into c from configuracion where id = 1;
  if p.a_pedido or p_fecha not between c.temporada_inicio and c.temporada_fin then return; end if;

  if p.tipo in ('grupal','chicos') then
    return query
    with combos as (
      select ce.id as c_id, ce.nombre as c_nombre, h as h_ini, (h + p.hora_fin_offset)::time as h_fin,
             n as niv, d as disc
        from centros ce, unnest(p.horarios) h, unnest(p.niveles_permitidos) n,
             unnest(array['esqui','snowboard']::disciplina_tipo[]) d
       where ce.activo
    )
    select co.c_id, co.c_nombre, co.h_ini, co.h_fin, co.niv, co.disc,
           coalesce(t.grupo, 1), t.id, coalesce(t.cupo_total, p.cupo),
           coalesce(t.cupo_total - t.cupo_ocupado, p.cupo),
           case when exists (select 1 from cierres_clima cc where cc.centro_id = co.c_id and cc.fecha = p_fecha)
                then 'Cerrado por clima'
                else public.etiqueta_cupo(coalesce(t.cupo_total - t.cupo_ocupado, p.cupo)) end,
           exists (select 1 from cierres_clima cc where cc.centro_id = co.c_id and cc.fecha = p_fecha)
      from combos co
      left join turnos t on t.producto_id = p.id and t.centro_id = co.c_id and t.fecha = p_fecha
                        and t.hora_inicio = co.h_ini and t.nivel = co.niv and t.disciplina = co.disc
     order by co.c_id, co.h_ini, co.disc, co.niv, coalesce(t.grupo, 1);
  else
    -- particulares y salidas guiadas: un grupo por instructor libre (se muestra por centro y horario)
    return query
    select ce.id, ce.nombre, h, (h + p.hora_fin_offset)::time, null::nivel_esqui,
           case when p.disciplina = 'ambas' then 'esqui'::disciplina_tipo else p.disciplina end,
           null::int, null::bigint, p.cupo,
           public.instructores_libres(p.id, ce.id, p_fecha, h, (h + p.hora_fin_offset)::time,
                                      p.niveles_permitidos[1],
                                      case when p.disciplina = 'ambas' then 'esqui'::disciplina_tipo else p.disciplina end, 'es'),
           case when exists (select 1 from cierres_clima cc where cc.centro_id = ce.id and cc.fecha = p_fecha)
                then 'Cerrado por clima'
                when public.instructores_libres(p.id, ce.id, p_fecha, h, (h + p.hora_fin_offset)::time,
                        p.niveles_permitidos[1],
                        case when p.disciplina = 'ambas' then 'esqui'::disciplina_tipo else p.disciplina end, 'es') > 0
                then 'Disponible' else 'Completo' end,
           exists (select 1 from cierres_clima cc where cc.centro_id = ce.id and cc.fecha = p_fecha)
      from centros ce, unnest(p.horarios) h
     where ce.activo
     order by ce.id, h;
  end if;
end $$;

-- =====================================================================
-- Crear reserva (grupales, chicos, particulares y salidas guiadas)
-- =====================================================================
create or replace function public.crear_reserva(
  p_producto bigint, p_centro bigint, p_fecha date, p_hora time, p_disciplina disciplina_tipo,
  p_personas jsonb, p_idioma text default 'es', p_usar_credito boolean default false,
  p_notas text default null, p_clave text default null, p_grupo int default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p productos; c configuracion; t turnos; r reservas; m record;
        v_nivel nivel_esqui; n int; v_disc disciplina_tipo; v_fin time; v_grupo int;
begin
  if auth.uid() is null then raise exception 'SESION: Tienes que iniciar sesión para reservar'; end if;

  -- Repetir el mismo envío devuelve la misma reserva, sin descontar cupo otra vez
  if p_clave is not null then
    select * into r from reservas where cliente_id = auth.uid() and clave = p_clave;
    if found then
      return jsonb_build_object('reserva_id', r.id, 'codigo', r.codigo, 'estado', r.estado,
                                'total', r.total, 'repetida', true);
    end if;
  end if;

  perform public.mantenimiento();
  select * into p from productos where id = p_producto and activo;
  if not found then raise exception 'PRODUCTO: El producto no existe'; end if;
  select * into c from configuracion where id = 1;
  if p.a_pedido then raise exception 'A_PEDIDO: % se pide como solicitud y operaciones lo cotiza', p.nombre; end if;
  if p_fecha not between c.temporada_inicio and c.temporada_fin then
    raise exception 'FECHA: Esa fecha está fuera de la temporada';
  end if;
  if not (p_hora = any (p.horarios)) then raise exception 'HORARIO: Ese horario no existe para %', p.nombre; end if;
  if exists (select 1 from cierres_clima where centro_id = p_centro and fecha = p_fecha) then
    raise exception 'CERRADO: El centro está cerrado por clima ese día';
  end if;
  if ((p_fecha + p_hora) at time zone 'America/Santiago') <= public.ahora() then
    raise exception 'FECHA: Ese turno ya comenzó';
  end if;

  v_nivel := public.validar_personas(p.id, null, p_personas);
  n := jsonb_array_length(p_personas);
  v_disc := case when p.disciplina = 'ambas' then coalesce(p_disciplina, 'esqui') else p.disciplina end;
  v_fin := (p_hora + p.hora_fin_offset)::time;

  if p.tipo in ('grupal','chicos') then
    -- se asegura el grupo 1 (los turnos nacen la primera vez que alguien reserva)
    insert into turnos (producto_id, centro_id, fecha, hora_inicio, hora_fin, nivel, disciplina, grupo, cupo_total)
    values (p.id, p_centro, p_fecha, p_hora, v_fin, v_nivel, v_disc, 1, p.cupo)
    on conflict on constraint turnos_unicos do nothing;

    select * into t from turnos
     where producto_id = p.id and centro_id = p_centro and fecha = p_fecha and hora_inicio = p_hora
       and nivel = v_nivel and disciplina = v_disc
       and (p_grupo is null or grupo = p_grupo)
       and cupo_total - cupo_ocupado >= n
     order by grupo limit 1 for update;

    if not found then
      select * into t from turnos
       where producto_id = p.id and centro_id = p_centro and fecha = p_fecha and hora_inicio = p_hora
         and nivel = v_nivel and disciplina = v_disc and grupo = coalesce(p_grupo, 1);
      raise exception 'COMPLETO: Quedan % lugares en este turno y la reserva es para %. Puedes anotarte en la lista de espera.|%',
        t.cupo_total - t.cupo_ocupado, n, t.id;
    end if;
    insert into clases (turno_id, numero) values (t.id, 1) on conflict do nothing;
  else
    -- particular o salida guiada: un grupo nuevo por reserva, si hay instructor libre
    if public.instructores_libres(p.id, p_centro, p_fecha, p_hora, v_fin, v_nivel, v_disc, p_idioma) < 1 then
      raise exception 'SIN_INSTRUCTOR: No quedan instructores disponibles para ese horario. Prueba otro horario o centro.';
    end if;
    select coalesce(max(grupo), 0) + 1 into v_grupo from turnos
     where producto_id = p.id and centro_id = p_centro and fecha = p_fecha and hora_inicio = p_hora
       and nivel = v_nivel and disciplina = v_disc;
    insert into turnos (producto_id, centro_id, fecha, hora_inicio, hora_fin, nivel, disciplina, grupo, cupo_total)
    values (p.id, p_centro, p_fecha, p_hora, v_fin, v_nivel, v_disc, v_grupo, p.cupo)
    returning * into t;
    insert into clases (turno_id, numero, idioma) values (t.id, 1, coalesce(p_idioma, 'es'));
  end if;

  select * into m from public.calcular_montos(p.id, p_fecha, p_personas);
  insert into reservas (cliente_id, producto_id, turno_id, estado, idioma, temporada_alta, monto_clases,
                        recargo_alta, monto_extras, total, vence_en, notas, clave)
  values (auth.uid(), p.id, t.id, 'pendiente_pago', coalesce(p_idioma, 'es'), m.alta, m.monto_clases,
          m.recargo, m.monto_extras, m.monto_clases + m.monto_extras,
          public.ahora() + make_interval(hours => c.horas_pago), nullif(trim(p_notas), ''), p_clave)
  returning * into r;

  insert into participantes (reserva_id, nombre, edad, nivel, equipo, ropa, traslado)
  select r.id, trim(x->>'nombre'), (x->>'edad')::int, (x->>'nivel')::nivel_esqui,
         coalesce((x->>'equipo')::boolean, false), coalesce((x->>'ropa')::boolean, false),
         coalesce((x->>'traslado')::boolean, false)
    from jsonb_array_elements(p_personas) x;

  update turnos set cupo_ocupado = cupo_ocupado + n where id = t.id;

  if p_usar_credito then
    perform public.aplicar_credito(r.id);
    select * into r from reservas where id = r.id;
    if r.total = 0 then
      update reservas set estado = 'confirmada', confirmada_en = public.ahora(), vence_en = null where id = r.id;
      perform public.sincronizar_ordenes(t.centro_id, t.fecha);
      select * into r from reservas where id = r.id;
    end if;
  end if;

  return jsonb_build_object('reserva_id', r.id, 'codigo', r.codigo, 'estado', r.estado,
                            'total', r.total, 'credito_aplicado', r.credito_aplicado,
                            'vence_en', r.vence_en, 'repetida', false);
end $$;

-- ---------- Lista de espera ----------
create or replace function public.unirse_lista_espera(p_turno bigint, p_personas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare t turnos; n int; v_id bigint; v_pos int;
begin
  if auth.uid() is null then raise exception 'SESION: Tienes que iniciar sesión'; end if;
  select * into t from turnos where id = p_turno for update;
  if not found then raise exception 'TURNO: El turno no existe'; end if;
  if t.cerrado_clima then raise exception 'CERRADO: El centro está cerrado por clima ese día'; end if;
  perform public.validar_personas(t.producto_id, t.nivel, p_personas);
  n := jsonb_array_length(p_personas);
  if t.cupo_total - t.cupo_ocupado >= n then
    raise exception 'HAY_LUGAR: Todavía hay lugar en este turno: puedes reservar directamente.';
  end if;
  if exists (select 1 from lista_espera where turno_id = t.id and cliente_id = auth.uid()
              and estado in ('esperando','ofrecida')) then
    raise exception 'YA_EN_ESPERA: Ya estás en la lista de espera de este turno.';
  end if;
  insert into lista_espera (turno_id, cliente_id, personas, cantidad)
  values (t.id, auth.uid(), p_personas, n) returning id into v_id;
  select count(*) into v_pos from lista_espera
   where turno_id = t.id and estado = 'esperando' and (creado_en, id) <= (select creado_en, id from lista_espera where id = v_id);
  return jsonb_build_object('espera_id', v_id, 'posicion', v_pos);
end $$;

create or replace function public.salir_lista_espera(p_espera bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update lista_espera set estado = 'cancelada'
   where id = p_espera and estado = 'esperando'
     and (cliente_id = auth.uid() or public.es_staff());
end $$;

-- ---------- Pago manual (operaciones o administración) ----------
create or replace function public.registrar_pago(p_reserva bigint, p_medio text, p_fecha date, p_referencia text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r reservas; t turnos; p productos;
begin
  if not public.es_staff() then raise exception 'PERMISO: Solo operaciones o administración registran pagos'; end if;
  if coalesce(trim(p_referencia), '') = '' then raise exception 'REFERENCIA: Indica la referencia del pago'; end if;
  select * into r from reservas where id = p_reserva for update;
  if not found then raise exception 'RESERVA: La reserva no existe'; end if;
  if r.estado = 'confirmada' then
    raise exception 'YA_CONFIRMADA: La reserva % ya estaba pagada y confirmada. No se registró otro pago.', r.codigo;
  end if;
  if r.estado <> 'pendiente_pago' then
    raise exception 'ESTADO: La reserva % está en estado % y no admite pagos.', r.codigo, r.estado;
  end if;
  if r.vence_en is not null and r.vence_en < public.ahora() then
    raise exception 'VENCIDA: La reserva % venció antes de registrar el pago. Actualiza la pantalla.', r.codigo;
  end if;

  if r.total > 0 then
    insert into pagos (reserva_id, tipo, monto, medio, fecha, referencia, registrado_por)
    values (r.id, 'pago', r.total, p_medio, coalesce(p_fecha, public.hoy_chile()), trim(p_referencia), auth.uid());
  end if;
  update reservas set estado = 'confirmada', confirmada_en = public.ahora(), vence_en = null where id = r.id;
  if r.desde_espera_id is not null then
    update lista_espera set estado = 'convertida' where id = r.desde_espera_id;
  end if;

  select * into t from turnos where id = r.turno_id;
  select * into p from productos where id = r.producto_id;
  if p.tipo = 'heliesqui' then
    insert into ordenes_servicio (proveedor_id, centro_id, fecha, hora, tipo, cantidad, costo_unitario, total, reserva_id, clave, detalle)
    select pr.id, t.centro_id, t.fecha, t.hora_inicio, 'heliesqui', t.cupo_ocupado, 900000, t.cupo_ocupado * 900000,
           r.id, 'heli:' || r.id, 'Heliesquí reserva ' || r.codigo
      from proveedores pr where pr.servicio = 'heliesqui' limit 1
    on conflict do nothing;
  end if;
  perform public.sincronizar_ordenes(t.centro_id, t.fecha);
  return jsonb_build_object('reserva_id', r.id, 'codigo', r.codigo, 'estado', 'confirmada', 'monto', r.total);
end $$;

-- ---------- Cancelación del cliente ----------
create or replace function public.calcular_cancelacion(p_reserva bigint,
  out horas numeric, out pct int, out pagado int, out reintegro int)
language plpgsql stable security definer set search_path = public as $$
declare r reservas; c configuracion;
begin
  select * into r from reservas where id = p_reserva;
  select * into c from configuracion where id = 1;
  horas := round(extract(epoch from public.inicio_turno(r.turno_id) - public.ahora()) / 3600, 1);
  select coalesce(sum(monto), 0) into pagado from pagos where reserva_id = r.id and tipo = 'pago';
  if r.estado <> 'confirmada' then
    pct := 0;   -- no hay pago que devolver
  elsif horas > 72 then pct := c.reintegro_mas_72_pct;
  elsif horas >= 24 then pct := c.reintegro_24_72_pct;
  else pct := c.reintegro_menos_24_pct;
  end if;
  reintegro := round(pagado * pct / 100.0);
end $$;

create or replace function public.vista_cancelacion(p_reserva bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r reservas; x record;
begin
  select * into r from reservas where id = p_reserva;
  if not found or (r.cliente_id <> auth.uid() and not public.es_staff()) then
    raise exception 'RESERVA: La reserva no existe';
  end if;
  select * into x from public.calcular_cancelacion(p_reserva);
  return jsonb_build_object('horas', x.horas, 'pct', x.pct, 'pagado', x.pagado, 'reintegro', x.reintegro,
                            'credito_aplicado', r.credito_aplicado, 'estado', r.estado);
end $$;

create or replace function public.cancelar_reserva(p_reserva bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r reservas; t turnos; x record; n int; v_medio text; v_cred int := 0;
begin
  select * into r from reservas where id = p_reserva for update;
  if not found or (r.cliente_id <> auth.uid() and not public.es_staff()) then
    raise exception 'RESERVA: La reserva no existe';
  end if;
  if r.estado = 'cancelada' then   -- repetir la cancelación no devuelve dos veces
    return jsonb_build_object('estado', 'cancelada', 'pct', r.reintegro_pct, 'reintegro', r.reintegro_monto, 'repetida', true);
  end if;
  if r.estado not in ('solicitud','pendiente_pago','confirmada') then
    raise exception 'ESTADO: Una reserva en estado % no se puede cancelar', r.estado;
  end if;

  select * into x from public.calcular_cancelacion(r.id);
  if x.reintegro > 0 then
    select medio into v_medio from pagos where reserva_id = r.id and tipo = 'pago';
    insert into pagos (reserva_id, tipo, monto, medio, fecha, referencia, registrado_por)
    values (r.id, 'reintegro', x.reintegro, coalesce(v_medio, 'transferencia'), public.hoy_chile(),
            'Reintegro ' || x.pct || '% de ' || r.codigo, auth.uid());
  end if;
  v_cred := public.devolver_credito(r.id, case when r.estado = 'confirmada' then x.pct else 100 end);

  update reservas set estado = 'cancelada', cancelada_en = public.ahora(), reintegro_pct = x.pct,
                      reintegro_monto = x.reintegro, vence_en = null
   where id = r.id;

  if r.turno_id is not null then
    select count(*) into n from participantes where reserva_id = r.id;
    update turnos set cupo_ocupado = greatest(cupo_ocupado - n, 0) where id = r.turno_id returning * into t;
    if r.desde_espera_id is not null then
      update lista_espera set estado = 'cancelada' where id = r.desde_espera_id;
    end if;
    perform public.ofrecer_lugares(r.turno_id);
    perform public.sincronizar_ordenes(t.centro_id, t.fecha);
    -- órdenes de heliesquí de esta reserva
    perform public.cancelar_orden_interna(o.id) from ordenes_servicio o
      where o.reserva_id = r.id and o.estado in ('pedida','aceptada');
  end if;

  return jsonb_build_object('estado', 'cancelada', 'horas', x.horas, 'pct', x.pct,
                            'reintegro', x.reintegro, 'credito_devuelto', v_cred, 'repetida', false);
end $$;

-- ---------- Productos a pedido: heliesquí y jornada corporativa ----------
create or replace function public.crear_solicitud(p_producto bigint, p_centro bigint, p_fecha date,
                                                  p_personas jsonb, p_notas text default null, p_clave text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p productos; c configuracion; t turnos; r reservas; v_nivel nivel_esqui; n int; v_grupo int; v_clases int;
begin
  if auth.uid() is null then raise exception 'SESION: Tienes que iniciar sesión'; end if;
  if p_clave is not null then
    select * into r from reservas where cliente_id = auth.uid() and clave = p_clave;
    if found then return jsonb_build_object('reserva_id', r.id, 'codigo', r.codigo, 'estado', r.estado, 'repetida', true); end if;
  end if;
  select * into p from productos where id = p_producto and activo;
  select * into c from configuracion where id = 1;
  if not p.a_pedido then raise exception 'A_PEDIDO: Este producto se reserva directamente'; end if;
  if p_fecha not between c.temporada_inicio and c.temporada_fin or p_fecha <= public.hoy_chile() then
    raise exception 'FECHA: Elige una fecha futura dentro de la temporada';
  end if;
  v_nivel := public.validar_personas(p.id, null, p_personas);
  n := jsonb_array_length(p_personas);

  select coalesce(max(grupo), 0) + 1 into v_grupo from turnos
   where producto_id = p.id and centro_id = p_centro and fecha = p_fecha;
  insert into turnos (producto_id, centro_id, fecha, hora_inicio, hora_fin, nivel, disciplina, grupo, cupo_total, cupo_ocupado)
  values (p.id, p_centro, p_fecha, p.horarios[1], (p.horarios[1] + p.hora_fin_offset)::time, v_nivel, 'esqui', v_grupo, n, n)
  returning * into t;

  v_clases := case when p.instructores_cada is not null then ceil(n::numeric / p.instructores_cada)::int else 1 end;
  insert into clases (turno_id, numero) select t.id, g from generate_series(1, v_clases) g;

  insert into reservas (cliente_id, producto_id, turno_id, estado, notas, clave, temporada_alta)
  values (auth.uid(), p.id, t.id, 'solicitud', nullif(trim(p_notas), ''), p_clave,
          p_fecha between c.alta_inicio and c.alta_fin)
  returning * into r;

  insert into participantes (reserva_id, nombre, edad, nivel, equipo, ropa, traslado)
  select r.id, trim(x->>'nombre'), (x->>'edad')::int, (x->>'nivel')::nivel_esqui,
         coalesce((x->>'equipo')::boolean, false), coalesce((x->>'ropa')::boolean, false),
         coalesce((x->>'traslado')::boolean, false)
    from jsonb_array_elements(p_personas) x;

  return jsonb_build_object('reserva_id', r.id, 'codigo', r.codigo, 'estado', 'solicitud', 'repetida', false);
end $$;

-- Operaciones cotiza: monto de clases total (sin extras); pasa a Pendiente de pago (24 h)
create or replace function public.cotizar_solicitud(p_reserva bigint, p_monto_clases int, p_nota text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r reservas; c configuracion; p productos; v_min int; v_extras int; n int;
begin
  if not public.es_staff() then raise exception 'PERMISO: Solo operaciones cotiza solicitudes'; end if;
  select * into r from reservas where id = p_reserva for update;
  if r.estado <> 'solicitud' then
    raise exception 'ESTADO: La reserva % ya no es una solicitud (está %)', r.codigo, r.estado;
  end if;
  select * into p from productos where id = r.producto_id;
  select * into c from configuracion where id = 1;
  select count(*) into n from participantes where reserva_id = r.id;
  v_min := p.precio * n;
  if p_monto_clases < v_min then
    raise exception 'MONTO: El precio mínimo es $% (desde $% por persona)', v_min, p.precio;
  end if;
  select coalesce(sum(case when equipo then (select precio from extras where codigo='equipo') else 0 end
                    + case when ropa then (select precio from extras where codigo='ropa') else 0 end
                    + case when traslado then (select precio from extras where codigo='traslado') else 0 end), 0)
    into v_extras from participantes where reserva_id = r.id;
  update reservas set estado = 'pendiente_pago', monto_clases = p_monto_clases, monto_extras = v_extras,
                      total = p_monto_clases + v_extras, cotizado_en = public.ahora(),
                      vence_en = public.ahora() + make_interval(hours => c.horas_pago),
                      notas = coalesce(nullif(trim(p_nota), ''), notas),
                      clima_confirmado = case when p.tipo = 'heliesqui' then false else null end
   where id = r.id;
  return jsonb_build_object('reserva_id', r.id, 'estado', 'pendiente_pago', 'total', p_monto_clases + v_extras);
end $$;

-- Heliesquí: operaciones confirma el clima el día anterior
create or replace function public.confirmar_clima_heli(p_reserva bigint, p_confirmado boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_staff() then raise exception 'PERMISO: Solo operaciones'; end if;
  update reservas set clima_confirmado = p_confirmado
   where id = p_reserva and producto_id in (select id from productos where tipo = 'heliesqui');
end $$;

-- Permisos de ejecución
revoke execute on all functions in schema public from public, anon;
grant execute on function public.catalogo_productos(), public.catalogo_centros(), public.catalogo_extras(),
  public.temporada_publica(), public.turnos_disponibles(bigint, date, date),
  public.disponibilidad(bigint, date), public.etiqueta_cupo(int), public.hoy_chile(), public.ahora_chile(), public.ahora()
  to anon, authenticated;
revoke execute on function public.aplicar_credito(bigint), public.devolver_credito(bigint, int),
  public.cancelar_orden_interna(bigint, bigint), public.sincronizar_ordenes(bigint, date),
  public.ofrecer_lugares(bigint), public.crear_perfil_nuevo(), public.proteger_rol(),
  public.bloquear_quincena_pagada()
  from authenticated;
revoke execute on function public.evaluar_instructor(bigint, bigint, bigint, date, time, time, nivel_esqui, disciplina_tipo, text, bigint),
  public.instructores_libres(bigint, bigint, date, time, time, nivel_esqui, disciplina_tipo, text),
  public.calcular_cancelacion(bigint), public.inicio_turno(bigint)
  from authenticated;
