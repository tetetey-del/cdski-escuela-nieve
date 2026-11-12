-- =====================================================================
-- CDSKI · 002 · Seguridad: roles, RLS y catálogo público
-- Regla: cada rol ve solo lo suyo; operaciones y administración ven todo;
-- liquidaciones y configuración solo las escribe administración.
-- =====================================================================

-- ---------- Funciones de ayuda (security definer: evitan recursión en RLS) ----------
create or replace function public.mi_rol() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid()
$$;

create or replace function public.es_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol in ('operaciones','administracion') from perfiles where id = auth.uid()), false)
$$;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'administracion' from perfiles where id = auth.uid()), false)
$$;

create or replace function public.mi_instructor_id() returns bigint
language sql stable security definer set search_path = public as $$
  select id from instructores where perfil_id = auth.uid()
$$;

create or replace function public.mi_proveedor_id() returns bigint
language sql stable security definer set search_path = public as $$
  select id from proveedores where perfil_id = auth.uid()
$$;

-- ¿El turno tiene una clase asignada al instructor que consulta?
create or replace function public.es_mi_turno(p_turno bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from clases c
                 where c.turno_id = p_turno and c.instructor_id = public.mi_instructor_id())
$$;

-- ¿La reserva es del cliente que consulta, o el instructor tiene esa clase?
create or replace function public.puede_ver_reserva(p_reserva bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from reservas r
    where r.id = p_reserva
      and (r.cliente_id = auth.uid() or public.es_mi_turno(r.turno_id))
  )
$$;

-- ---------- Alta de usuarios: siempre "cliente", el rol se asigna desde la base ----------
create or replace function public.crear_perfil_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, rol, nombre, telefono)
  values (new.id, 'cliente',
          coalesce(nullif(trim(new.raw_user_meta_data->>'nombre'), ''), split_part(new.email, '@', 1)),
          nullif(trim(new.raw_user_meta_data->>'telefono'), ''));
  return new;
end $$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo();

-- Nadie cambia su propio rol: solo administración (o la consola SQL, sin auth.uid())
create or replace function public.proteger_rol() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.rol is distinct from old.rol and auth.uid() is not null and not public.es_admin() then
    raise exception 'No tienes permiso para cambiar el rol de una cuenta';
  end if;
  return new;
end $$;

create trigger proteger_rol_perfil
  before update on perfiles
  for each row execute function public.proteger_rol();

-- ---------- Quincena pagada = bloqueada ----------
create or replace function public.bloquear_quincena_pagada() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_estado estado_quincena;
begin
  if tg_table_name = 'quincenas' then
    if old.estado = 'pagada' then
      raise exception 'La quincena % ya está pagada y no se puede modificar', old.id;
    end if;
    return coalesce(new, old);
  end if;

  select estado into v_estado from quincenas
   where id = coalesce(new.quincena_id, old.quincena_id);
  if v_estado = 'pagada' then
    raise exception 'La quincena ya está pagada: cualquier corrección entra como ajuste en la quincena abierta';
  end if;
  if tg_op = 'UPDATE' and old.quincena_id <> new.quincena_id then
    select estado into v_estado from quincenas where id = old.quincena_id;
    if v_estado = 'pagada' then
      raise exception 'No se puede mover un renglón de una quincena pagada';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger bloqueo_quincena
  before update or delete on quincenas
  for each row execute function public.bloquear_quincena_pagada();

create trigger bloqueo_renglones
  before insert or update or delete on renglones_liquidacion
  for each row execute function public.bloquear_quincena_pagada();

-- =====================================================================
-- Políticas RLS
-- =====================================================================

-- perfiles
create policy perfiles_ver on perfiles for select to authenticated
  using (id = auth.uid() or public.es_staff());
create policy perfiles_editar_propio on perfiles for update to authenticated
  using (id = auth.uid() or public.es_admin())
  with check (id = auth.uid() or public.es_admin());

-- configuración y tarifas: leen staff; escribe solo administración
create policy config_ver on configuracion for select to authenticated using (public.es_staff());
create policy config_admin on configuracion for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy tarifas_ver on tarifas_instructor for select to authenticated
  using (public.es_staff() or public.mi_instructor_id() is not null);
create policy tarifas_admin on tarifas_instructor for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- catálogo: lo leen los usuarios con sesión; escribe administración
create policy centros_ver on centros for select to authenticated using (true);
create policy centros_admin on centros for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy productos_ver on productos for select to authenticated using (true);
create policy productos_admin on productos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy extras_ver on extras for select to authenticated using (true);
create policy extras_admin on extras for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- proveedores e instructores: su propia ficha o staff
create policy proveedores_ver on proveedores for select to authenticated
  using (public.es_staff() or perfil_id = auth.uid());
create policy proveedores_admin on proveedores for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy instructores_ver on instructores for select to authenticated
  using (public.es_staff() or perfil_id = auth.uid());
create policy instructores_admin on instructores for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- turnos: staff, el instructor de la clase o el cliente con reserva en ese turno
create policy turnos_ver on turnos for select to authenticated
  using (
    public.es_staff()
    or public.es_mi_turno(id)
    or exists (select 1 from reservas r where r.turno_id = turnos.id and r.cliente_id = auth.uid())
  );

-- clases: staff o el instructor asignado
create policy clases_ver on clases for select to authenticated
  using (public.es_staff() or instructor_id = public.mi_instructor_id());

create policy justif_ver on justificaciones_asignacion for select to authenticated
  using (public.es_staff());

create policy cierres_ver on cierres_clima for select to authenticated using (true);

-- reservas: cliente dueño, instructor de esa clase o staff
create policy reservas_ver on reservas for select to authenticated
  using (cliente_id = auth.uid() or public.es_staff() or public.es_mi_turno(turno_id));

create policy participantes_ver on participantes for select to authenticated
  using (public.es_staff() or public.puede_ver_reserva(reserva_id));

create policy espera_ver on lista_espera for select to authenticated
  using (cliente_id = auth.uid() or public.es_staff());

create policy pagos_ver on pagos for select to authenticated
  using (public.es_staff() or exists (select 1 from reservas r where r.id = pagos.reserva_id and r.cliente_id = auth.uid()));

create policy creditos_ver on creditos for select to authenticated
  using (cliente_id = auth.uid() or public.es_staff());

create policy mov_credito_ver on movimientos_credito for select to authenticated
  using (public.es_staff() or exists (select 1 from creditos c where c.id = movimientos_credito.credito_id and c.cliente_id = auth.uid()));

-- órdenes: proveedor ve solo las suyas
create policy ordenes_ver on ordenes_servicio for select to authenticated
  using (public.es_staff() or proveedor_id = public.mi_proveedor_id());

-- liquidaciones: leen staff y el beneficiario; escribe administración (vía funciones)
create policy quincenas_ver on quincenas for select to authenticated
  using (public.es_staff() or public.mi_instructor_id() is not null or public.mi_proveedor_id() is not null);

create policy anticipos_ver on anticipos for select to authenticated
  using (public.es_staff() or instructor_id = public.mi_instructor_id());
create policy anticipos_admin on anticipos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy renglones_ver on renglones_liquidacion for select to authenticated
  using (public.es_staff()
         or instructor_id = public.mi_instructor_id()
         or proveedor_id = public.mi_proveedor_id());

-- Todas las escrituras de reservas, cupos, órdenes, clima y liquidaciones pasan
-- por funciones (003) que validan el rol y el estado actual en una sola transacción.

-- =====================================================================
-- Catálogo público (sin sesión): solo campos autorizados, vía funciones
-- =====================================================================
create or replace function public.catalogo_productos()
returns table (id bigint, codigo text, nombre text, descripcion text, tipo tipo_producto,
               disciplina disciplina_tipo, duracion_horas numeric, horarios time[], cupo int,
               min_personas int, precio int, precio_por precio_modo, a_pedido boolean,
               niveles_permitidos nivel_esqui[], edad_min int, edad_max int, orden int)
language sql stable security definer set search_path = public as $$
  select id, codigo, nombre, descripcion, tipo, disciplina, duracion_horas, horarios, cupo,
         min_personas, precio, precio_por, a_pedido, niveles_permitidos, edad_min, edad_max, orden
  from productos where activo order by orden
$$;

create or replace function public.catalogo_centros()
returns table (id bigint, nombre text, punto_encuentro text)
language sql stable security definer set search_path = public as $$
  select id, nombre, punto_encuentro from centros where activo order by id
$$;

create or replace function public.catalogo_extras()
returns table (id bigint, codigo text, nombre text, precio int)
language sql stable security definer set search_path = public as $$
  select id, codigo, nombre, precio from extras order by id
$$;

create or replace function public.temporada_publica()
returns table (temporada_inicio date, temporada_fin date, alta_inicio date, alta_fin date,
               recargo_alta_pct int, edad_minima int, reintegro_mas_72_pct int,
               reintegro_24_72_pct int, reintegro_menos_24_pct int, horas_pago int)
language sql stable security definer set search_path = public as $$
  select temporada_inicio, temporada_fin, alta_inicio, alta_fin, recargo_alta_pct, edad_minima,
         reintegro_mas_72_pct, reintegro_24_72_pct, reintegro_menos_24_pct, horas_pago
  from configuracion where id = 1
$$;

-- Disponibilidad de turnos: sin datos de clientes ni instructores
create or replace function public.turnos_disponibles(p_producto bigint, p_desde date, p_hasta date)
returns table (id bigint, centro_id bigint, centro text, fecha date, hora_inicio time, hora_fin time,
               nivel nivel_esqui, grupo int, cupo_total int, libres int, etiqueta text, cerrado_clima boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.centro_id, c.nombre, t.fecha, t.hora_inicio, t.hora_fin, t.nivel, t.grupo,
         t.cupo_total, t.cupo_total - t.cupo_ocupado,
         case when t.cerrado_clima then 'Cerrado por clima'
              when t.cupo_total - t.cupo_ocupado >= 3 then 'Disponible'
              when t.cupo_total - t.cupo_ocupado >= 1 then 'Últimos lugares'
              else 'Completo' end,
         t.cerrado_clima
  from turnos t join centros c on c.id = t.centro_id
  where t.producto_id = p_producto and t.fecha between p_desde and p_hasta
  order by t.fecha, t.hora_inicio, c.id, t.nivel, t.grupo
$$;

-- Funciones de ayuda: no se exponen a anónimos
revoke execute on function public.mi_rol(), public.es_staff(), public.es_admin(),
  public.mi_instructor_id(), public.mi_proveedor_id(), public.es_mi_turno(bigint),
  public.puede_ver_reserva(bigint), public.crear_perfil_nuevo(), public.proteger_rol(),
  public.bloquear_quincena_pagada() from public, anon;

grant execute on function public.catalogo_productos(), public.catalogo_centros(),
  public.catalogo_extras(), public.temporada_publica(),
  public.turnos_disponibles(bigint, date, date) to anon, authenticated;
