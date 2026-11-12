-- =====================================================================
-- CDSKI · Datos de ejemplo (sintéticos)
-- Temporada 2027 · Reloj de demostración: sábado 10/07/2027 06:30 (Chile)
-- Ese sábado cae la tormenta: Centro Quebrada Alta tiene 41 alumnos en
-- 9 grupos, 2 camionetas pedidas y 6 equipos de arriendo preparados.
--
-- Se puede volver a correr: borra los datos del negocio y los recarga.
-- Las cuentas de prueba conservan su id, así que las sesiones no se pierden.
-- Desde la app: Administración → Configuración → "Reiniciar datos de ejemplo".
-- =====================================================================

create schema if not exists demo;
revoke all on schema demo from public, anon, authenticated;

-- ---------- Cuentas de prueba (Supabase Auth, sin confirmación por correo) ----------
create or replace function demo.usuario(p_n int, p_email text, p_nombre text, p_rol rol_usuario) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := ('00000000-0000-4000-a000-' || lpad(p_n::text, 12, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
          extensions.crypt('Nieve2027', extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('nombre', p_nombre),
          now(), now(), '', '', '', '')
  on conflict (id) do update set email = excluded.email, encrypted_password = excluded.encrypted_password,
                                 email_confirmed_at = now(), raw_user_meta_data = excluded.raw_user_meta_data;
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true),
          'email', now(), now(), now())
  on conflict (provider_id, provider) do nothing;
  begin   -- columnas que GoTrue espera vacías y no nulas (según versión)
    execute 'update auth.users set email_change_token_current = coalesce(email_change_token_current, ''''),
               phone_change = coalesce(phone_change, ''''), phone_change_token = coalesce(phone_change_token, ''''),
               reauthentication_token = coalesce(reauthentication_token, '''') where id = $1' using v_id;
  exception when undefined_column then null;
  end;
  -- el trigger crea el perfil como cliente; acá se fija el rol desde la base
  insert into perfiles (id, rol, nombre) values (v_id, p_rol, p_nombre)
  on conflict (id) do update set rol = excluded.rol, nombre = excluded.nombre;
  return v_id;
end $$;

create or replace function demo.cliente(p_n int) returns uuid
language sql immutable set search_path = public as $$ select ('00000000-0000-4000-a000-' || lpad((100 + p_n)::text, 12, '0'))::uuid $$;

-- Personas sintéticas para una reserva
create or replace function demo.personas(p_apellido text, p_n int, p_nivel nivel_esqui, p_ninos boolean,
                                         p_equipo int, p_ropa int, p_traslado int) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_agg(jsonb_build_object(
           'nombre', (case when p_ninos
                        then (array['Amanda','Benja','Colomba','Dante','Elisa','Facundo','Gala','Ian'])[1 + (g + length(p_apellido)) % 8]
                        else (array['Carolina','Andrés','Paula','Nicolás','Javiera','Matías','Daniela','Pablo'])[1 + (g + length(p_apellido)) % 8]
                      end) || ' ' || p_apellido,
           'edad', case when p_ninos then 7 + (g * 2) % 6 else 24 + (g * 7) % 30 end,
           'nivel', p_nivel,
           'equipo', g <= p_equipo, 'ropa', g <= p_ropa, 'traslado', g <= p_traslado))
    from generate_series(1, p_n) g
$$;

-- Reserva de ejemplo: crea turno/clase si hace falta, montos reales, pago e instructor
create or replace function demo.reserva(
  p_cliente int, p_prod text, p_centro text, p_fecha date, p_hora time, p_nivel nivel_esqui,
  p_disc disciplina_tipo, p_n int, p_estado estado_reserva, p_instr text default null,
  p_idioma text default 'es', p_equipo int default 0, p_ropa int default 0, p_traslado int default 0,
  p_creada timestamptz default null, p_vence timestamptz default null, p_medio text default 'transferencia',
  p_reintegro_pct int default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare p productos; ce centros; t turnos; r reservas; m record; v_pers jsonb; v_ap text; v_grupo int;
        v_ocupa boolean; v_creada timestamptz;
begin
  select * into p from productos where codigo = p_prod;
  select * into ce from centros where nombre = p_centro;
  select split_part(nombre, ' ', 2) into v_ap from perfiles where id = demo.cliente(p_cliente);
  v_pers := demo.personas(v_ap, p_n, p_nivel, p.tipo = 'chicos', p_equipo, p_ropa, p_traslado);
  v_ocupa := p_estado in ('pendiente_pago','confirmada','en_curso','finalizada','solicitud');
  v_creada := coalesce(p_creada, ((p_fecha - 6) + time '19:00') at time zone 'America/Santiago');

  if p.tipo in ('grupal','chicos') then
    select * into t from turnos
     where producto_id = p.id and centro_id = ce.id and fecha = p_fecha and hora_inicio = p_hora
       and nivel = p_nivel and disciplina = p_disc and (not v_ocupa or cupo_total - cupo_ocupado >= p_n)
     order by grupo limit 1;
  end if;
  if t.id is null then
    select coalesce(max(grupo), 0) + 1 into v_grupo from turnos
     where producto_id = p.id and centro_id = ce.id and fecha = p_fecha and hora_inicio = p_hora
       and nivel = p_nivel and disciplina = p_disc;
    insert into turnos (producto_id, centro_id, fecha, hora_inicio, hora_fin, nivel, disciplina, grupo, cupo_total,
                        creado_en)
    values (p.id, ce.id, p_fecha, p_hora, (p_hora + p.hora_fin_offset)::time, p_nivel, p_disc, v_grupo,
            case when p.a_pedido then p_n else greatest(p.cupo, p_n) end, v_creada)
    returning * into t;
    insert into clases (turno_id, numero, idioma)
    select t.id, g, p_idioma
      from generate_series(1, case when p.instructores_cada is not null then ceil(p_n::numeric / p.instructores_cada)::int else 1 end) g;
  end if;

  select * into m from public.calcular_montos(p.id, p_fecha, v_pers);
  insert into reservas (cliente_id, producto_id, turno_id, estado, idioma, temporada_alta, monto_clases, recargo_alta,
                        monto_extras, total, vence_en, confirmada_en, creada_en)
  values (demo.cliente(p_cliente), p.id, t.id, p_estado, p_idioma, m.alta,
          case when p_estado = 'solicitud' then 0 else m.monto_clases end,
          case when p_estado = 'solicitud' then 0 else m.recargo end,
          case when p_estado = 'solicitud' then 0 else m.monto_extras end,
          case when p_estado = 'solicitud' then 0 else m.monto_clases + m.monto_extras end,
          p_vence,
          case when p_estado in ('confirmada','en_curso','finalizada') or p_reintegro_pct is not null
               then v_creada + interval '3 hours' end,
          v_creada)
  returning * into r;

  insert into participantes (reserva_id, nombre, edad, nivel, equipo, ropa, traslado, asistencia)
  select r.id, x->>'nombre', (x->>'edad')::int, (x->>'nivel')::nivel_esqui, (x->>'equipo')::boolean,
         (x->>'ropa')::boolean, (x->>'traslado')::boolean,
         case when p_estado = 'finalizada' then 'presente'::asistencia_tipo else 'pendiente' end
    from jsonb_array_elements(v_pers) x;

  if v_ocupa then update turnos set cupo_ocupado = cupo_ocupado + p_n where id = t.id; end if;

  if p_estado in ('confirmada','en_curso','finalizada','afectada_clima') or p_reintegro_pct is not null then
    insert into pagos (reserva_id, tipo, monto, medio, fecha, referencia, registrado_por, creado_en)
    values (r.id, 'pago', r.total, p_medio, (v_creada at time zone 'America/Santiago')::date + 1,
            case p_medio when 'transferencia' then 'TRF-' else 'CAJA-' end || (40000 + r.id),
            '00000000-0000-4000-a000-000000000002', v_creada + interval '3 hours');
  end if;

  if p_reintegro_pct is not null then
    update reservas set estado = 'cancelada', reintegro_pct = p_reintegro_pct,
                        reintegro_monto = round(r.total * p_reintegro_pct / 100.0),
                        cancelada_en = ((p_fecha - case when p_reintegro_pct = 100 then 5 else 2 end) + time '10:00')
                                       at time zone 'America/Santiago'
     where id = r.id;
    if p_reintegro_pct > 0 then
      insert into pagos (reserva_id, tipo, monto, medio, fecha, referencia, registrado_por)
      values (r.id, 'reintegro', round(r.total * p_reintegro_pct / 100.0), p_medio,
              p_fecha - case when p_reintegro_pct = 100 then 5 else 2 end,
              'Reintegro ' || p_reintegro_pct || '% de ' || r.codigo, '00000000-0000-4000-a000-000000000002');
    end if;
  end if;

  if p_instr is not null then
    update clases set instructor_id = (select id from instructores where nombre = p_instr),
                      asignada_en = v_creada + interval '4 hours',
                      asistencia_cerrada = p_estado = 'finalizada'
     where turno_id = t.id and numero = 1;
  end if;
  return r.id;
end $$;

-- Órdenes a proveedores calculadas desde las reservas (igual que la app)
create or replace function demo.ordenes(p_centro text, p_fecha date, p_estado estado_orden) returns void
language plpgsql security definer set search_path = public as $$
declare v_tipo text; v_pers int; v_cant int; v_prov bigint; v_costo int; ce centros;
begin
  select * into ce from centros where nombre = p_centro;
  foreach v_tipo in array array['traslado','equipo','ropa'] loop
    select count(*) filter (where (v_tipo = 'traslado' and pa.traslado) or (v_tipo = 'equipo' and pa.equipo)
                               or (v_tipo = 'ropa' and pa.ropa))
      into v_pers
      from participantes pa join reservas r on r.id = pa.reserva_id join turnos t on t.id = r.turno_id
     where t.centro_id = ce.id and t.fecha = p_fecha
       and (r.estado in ('confirmada','en_curso','finalizada') or r.cierre_clima_id is not null);
    continue when v_pers = 0;
    v_cant := case when v_tipo = 'traslado' then ceil(v_pers / 12.0)::int else v_pers end;
    select proveedor_id, costo_unitario into v_prov, v_costo from extras where codigo = v_tipo;
    insert into ordenes_servicio (proveedor_id, centro_id, fecha, hora, tipo, cantidad, costo_unitario, total,
                                  estado, clave, detalle, creado_en)
    values (v_prov, ce.id, p_fecha, case when v_tipo = 'traslado' then time '07:00' else time '08:30' end,
            v_tipo, v_cant, v_costo, v_cant * v_costo, p_estado,
            v_tipo || ':' || ce.id || ':' || p_fecha,
            case when v_tipo = 'traslado' then v_pers || ' pasajeros desde Lo Barnechea' else v_cant || ' personas' end,
            ((p_fecha - 2) + time '18:00') at time zone 'America/Santiago');
  end loop;
end $$;

-- =====================================================================
create or replace function demo.cargar() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r1 bigint; r2 bigint; r3 bigint; v_cierre bigint; v_q1 bigint; v_q2 bigint; v_reloj timestamptz;
        v_cred bigint; v_ord bigint; v_clase bigint;
begin
  -- 0) Limpieza (los usuarios de Auth se conservan)
  truncate renglones_liquidacion, anticipos, quincenas, movimientos_credito, creditos, pagos, ordenes_servicio,
           participantes, lista_espera, reservas, justificaciones_asignacion, clases, turnos, cierres_clima,
           extras, instructores, proveedores, productos, centros, tarifas_instructor, configuracion
           restart identity cascade;

  -- 1) Configuración: temporada 2027 y reloj de demostración en el sábado de tormenta
  v_reloj := timestamp '2027-07-10 06:30' at time zone 'America/Santiago';
  insert into configuracion (id, temporada_inicio, temporada_fin, alta_inicio, alta_fin, reloj_simulado, reloj_fijado_en)
  values (1, '2027-06-20', '2027-09-27', '2027-07-04', '2027-07-26', v_reloj, now());
  insert into tarifas_instructor values (1, 14000), (2, 18000), (3, 24000);

  insert into centros (nombre, punto_encuentro) values
    ('Centro Portezuelo',     'Caseta de la escuela, al pie del andarivel principal (cartel azul CDSKI)'),
    ('Centro Quebrada Alta',  'Terraza del refugio de base, junto a la boletería de pases'),
    ('Centro Los Nevados',    'Explanada del estacionamiento 2, frente a la pista Escuela');

  insert into productos (codigo, nombre, descripcion, tipo, disciplina, duracion_horas, horarios, hora_fin_offset, cupo,
                         min_personas, precio, precio_por, a_pedido, niveles_permitidos, edad_min, edad_max,
                         requiere_apto_ninos, categoria_minima, instructores_cada, orden) values
    ('grupal_medio', 'Clase grupal medio día', 'Tres horas en grupo de hasta 6 personas del mismo nivel.',
     'grupal', 'ambas', 3, '{11:00}', '3 hours', 6, 1, 64000, 'persona', false,
     '{principiante,intermedio,avanzado,experto}', null, null, false, 1, null, 1),
    ('grupal_completo', 'Clase grupal día completo', 'Cinco horas de clase con pausa para almorzar: 10:00 a 13:00 y 14:00 a 16:00.',
     'grupal', 'ambas', 5, '{10:00}', '6 hours', 6, 1, 98000, 'persona', false,
     '{principiante,intermedio,avanzado,experto}', null, null, false, 1, null, 2),
    ('part_esqui', 'Particular de esquí', 'Dos horas con instructor para 1 a 3 personas del mismo nivel.',
     'particular', 'esqui', 2, '{09:00,11:00,14:00}', '2 hours', 3, 1, 135000, 'clase', false,
     '{principiante,intermedio,avanzado,experto}', null, null, false, 1, null, 3),
    ('part_snow', 'Particular de snowboard', 'Tres horas con instructor para 1 a 3 personas del mismo nivel.',
     'particular', 'snowboard', 3, '{09:00,13:00}', '3 hours', 3, 1, 180000, 'clase', false,
     '{principiante,intermedio,avanzado,experto}', null, null, false, 1, null, 4),
    ('chicos', 'Programa chicos (7 a 12 años)', 'Tres horas de clase en grupos de hasta 5 chicos con instructores aptos para niños.',
     'chicos', 'ambas', 3, '{11:00}', '3 hours', 5, 1, 68000, 'persona', false,
     '{principiante,intermedio,avanzado}', 7, 12, true, 1, null, 5),
    ('guiada', 'Salida guiada', 'Cinco horas fuera de pista con instructor Nivel 3, para 1 a 4 personas de nivel avanzado o experto.',
     'guiada', 'ambas', 5, '{10:00}', '5 hours', 4, 1, 260000, 'grupo', false,
     '{avanzado,experto}', null, null, false, 3, null, 6),
    ('heli', 'Heliesquí a pedido', 'Jornada completa en helicóptero para 1 a 4 esquiadores expertos. Se cotiza y se confirma el clima el día anterior.',
     'heliesqui', 'esqui', 8, '{08:00}', '9 hours', 4, 1, 1250000, 'persona', true,
     '{experto}', null, null, false, 3, null, 7),
    ('corporativa', 'Jornada corporativa a pedido', 'Cuatro horas para equipos de 8 a 24 personas, un instructor cada 6 participantes. Se cotiza.',
     'corporativa', 'ambas', 4, '{10:00}', '4 hours', 24, 8, 52000, 'persona', true,
     '{principiante,intermedio,avanzado,experto}', null, null, false, 1, 6, 8);

  -- 2) Cuentas de prueba (contraseña de todas: Nieve2027)
  perform demo.usuario(1, 'admin@cdski.test', 'Paula Riquelme', 'administracion');
  perform demo.usuario(2, 'operaciones@cdski.test', 'Cristóbal Vega', 'operaciones');
  perform demo.usuario(11, 'instructor@cdski.test', 'Tomás Pizarro', 'instructor');
  perform demo.usuario(12, 'instructor2@cdski.test', 'Sofía Valenzuela', 'instructor');
  perform demo.usuario(21, 'proveedor@cdski.test', 'Traslados Cordillera Uno', 'proveedor');
  perform demo.usuario(22, 'proveedor2@cdski.test', 'Arriendo Nieve Sur', 'proveedor');
  perform demo.usuario(23, 'proveedor3@cdski.test', 'Altura Vuelos', 'proveedor');
  perform demo.usuario(100 + n, case n when 1 then 'cliente@cdski.test' when 2 then 'cliente2@cdski.test'
                                      else 'cliente' || lpad(n::text, 2, '0') || '@cdski.test' end,
                       (array['Camila Soto','Diego Araya','Valentina Reyes','Felipe Castro','Antonia Flores',
                              'Joaquín Espinoza','Isidora Torres','Vicente Rojas','Martina Gutiérrez','Agustín Silva',
                              'Emilia Navarro','Lucas Fernández','Florencia Díaz','Sebastián Ortiz','Renata Molina',
                              'Gaspar Núñez'])[n], 'cliente')
    from generate_series(1, 16) n;

  -- 3) Proveedores, extras e instructores
  insert into proveedores (perfil_id, nombre, servicio, telefono) values
    ('00000000-0000-4000-a000-000000000021', 'Traslados Cordillera Uno', 'traslado', '+56 9 5550 1201'),
    ('00000000-0000-4000-a000-000000000022', 'Arriendo Nieve Sur', 'arriendo', '+56 9 5550 1202'),
    ('00000000-0000-4000-a000-000000000023', 'Altura Vuelos', 'heliesqui', '+56 9 5550 1203');
  insert into extras (codigo, nombre, precio, proveedor_id, costo_unitario) values
    ('equipo', 'Equipo completo', 38000, 2, 24000),
    ('ropa', 'Ropa de nieve', 18000, 2, 11000),
    ('traslado', 'Traslado ida y vuelta desde Lo Barnechea', 32000, 1, 190000);

  insert into instructores (perfil_id, nombre, categoria, disciplina, apto_ninos, ingles) values
    (null, 'Ignacio Pérez',     1, 'esqui',     false, false),
    (null, 'Fernanda Lagos',    1, 'esqui',     true,  false),
    (null, 'Benjamín Correa',   1, 'snowboard', false, false),
    ('00000000-0000-4000-a000-000000000011', 'Tomás Pizarro', 2, 'esqui', true, true),
    (null, 'Josefa Muñoz',      2, 'snowboard', false, false),
    (null, 'Rodrigo Vidal',     2, 'ambas',     true,  false),
    (null, 'Catalina Herrera',  2, 'esqui',     false, true),
    (null, 'Martín Contreras',  2, 'esqui',     false, false),
    ('00000000-0000-4000-a000-000000000012', 'Sofía Valenzuela', 3, 'ambas', true, true),
    (null, 'Andrés Morales',    3, 'ambas',     false, false);

  -- Para las funciones de la app que piden rol, la carga actúa como administración
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000001', true);

  -- =================================================================
  -- 4) Historia: quincena 16–30 de junio (ya pagada)
  -- =================================================================
  perform demo.reserva(3,  'grupal_medio', 'Centro Portezuelo', '2027-06-20', '11:00', 'principiante', 'esqui', 5, 'finalizada', 'Ignacio Pérez', p_equipo => 3, p_traslado => 5);
  perform demo.reserva(4,  'chicos', 'Centro Portezuelo', '2027-06-20', '11:00', 'principiante', 'esqui', 4, 'finalizada', 'Tomás Pizarro');
  perform demo.reserva(2,  'grupal_medio', 'Centro Los Nevados', '2027-06-24', '11:00', 'intermedio', 'esqui', 2, 'vencida',
                       p_creada => timestamp '2027-06-20 21:00' at time zone 'America/Santiago',
                       p_vence => timestamp '2027-06-21 21:00' at time zone 'America/Santiago');
  perform demo.reserva(16, 'grupal_medio', 'Centro Portezuelo', '2027-06-25', '11:00', 'intermedio', 'esqui', 2, 'cancelada', p_reintegro_pct => 100);
  perform demo.reserva(15, 'grupal_medio', 'Centro Quebrada Alta', '2027-06-29', '11:00', 'avanzado', 'esqui', 3, 'cancelada', p_reintegro_pct => 50);

  -- Sábado 26/06: Los Nevados cerró por viento a las 05:40 (antes de las 6:00: sin mínimo para instructores)
  r1 := demo.reserva(5, 'grupal_medio', 'Centro Los Nevados', '2027-06-26', '11:00', 'intermedio', 'esqui', 4, 'confirmada', 'Martín Contreras', p_traslado => 4);
  r2 := demo.reserva(6, 'grupal_completo', 'Centro Los Nevados', '2027-06-26', '10:00', 'avanzado', 'esqui', 2, 'confirmada', 'Rodrigo Vidal', p_traslado => 2);
  r3 := demo.reserva(7, 'grupal_completo', 'Centro Los Nevados', '2027-06-26', '10:00', 'avanzado', 'esqui', 2, 'confirmada', null, p_traslado => 2);
  perform demo.ordenes('Centro Los Nevados', '2027-06-26', 'aceptada');
  insert into cierres_clima (centro_id, fecha, registrado_en, motivo, usuario_id)
  values (3, '2027-06-26', timestamp '2027-06-26 05:40' at time zone 'America/Santiago',
          'Viento blanco: el centro no abre andariveles', '00000000-0000-4000-a000-000000000002')
  returning id into v_cierre;
  update turnos set cerrado_clima = true where centro_id = 3 and fecha = '2027-06-26';
  update clases set cancelada_clima = true where turno_id in (select id from turnos where centro_id = 3 and fecha = '2027-06-26');
  update reservas set estado_previo_clima = estado, estado = 'afectada_clima', cierre_clima_id = v_cierre
   where id in (r1, r2, r3);
  update ordenes_servicio set estado = 'cancelada_con_cargo', cargo = round(total * 0.5), cierre_clima_id = v_cierre,
                              actualizado_en = timestamp '2027-06-26 05:45' at time zone 'America/Santiago'
   where centro_id = 3 and fecha = '2027-06-26';
  -- dos clientes eligieron crédito, uno reprogramó al 03/07
  insert into creditos (cliente_id, reserva_origen_id, cierre_clima_id, temporada, monto, saldo, creado_en)
  select cliente_id, id, v_cierre, 2027, total, total, timestamp '2027-06-26 09:10' at time zone 'America/Santiago'
    from reservas where id in (r1, r2);
  update reservas set opcion_clima = 'credito' where id in (r1, r2);

  perform demo.reserva(8,  'grupal_medio', 'Centro Portezuelo', '2027-06-27', '11:00', 'intermedio', 'esqui', 4, 'finalizada', 'Tomás Pizarro', p_traslado => 2);
  r1 := demo.reserva(9,  'grupal_medio', 'Centro Portezuelo', '2027-06-27', '11:00', 'intermedio', 'esqui', 2, 'finalizada', 'Tomás Pizarro');
  update participantes set asistencia = 'ausente'
   where id = (select min(id) from participantes where reserva_id = r1);              -- no presentado: no hay reintegro
  perform demo.reserva(10, 'part_esqui', 'Centro Quebrada Alta', '2027-06-27', '11:00', 'avanzado', 'esqui', 2, 'finalizada', 'Catalina Herrera', 'en');
  perform demo.reserva(11, 'grupal_completo', 'Centro Quebrada Alta', '2027-06-28', '10:00', 'principiante', 'snowboard', 3, 'finalizada', 'Benjamín Correa', p_equipo => 3);
  perform demo.reserva(12, 'grupal_completo', 'Centro Quebrada Alta', '2027-06-28', '10:00', 'principiante', 'snowboard', 3, 'finalizada', 'Benjamín Correa', p_equipo => 3);
  perform demo.reserva(13, 'guiada', 'Centro Portezuelo', '2027-06-29', '10:00', 'avanzado', 'esqui', 3, 'finalizada', 'Sofía Valenzuela');
  perform demo.reserva(14, 'part_snow', 'Centro Portezuelo', '2027-06-30', '09:00', 'principiante', 'snowboard', 1, 'finalizada', 'Josefa Muñoz');

  perform demo.ordenes('Centro Portezuelo', '2027-06-20', 'cumplida');
  perform demo.ordenes('Centro Portezuelo', '2027-06-27', 'cumplida');
  perform demo.ordenes('Centro Quebrada Alta', '2027-06-28', 'aceptada');   -- el proveedor la marca cumplida tarde (ver ajuste)

  -- Liquidación de junio: se genera, aprueba y paga con el reloj a fines de junio
  update configuracion set reloj_simulado = timestamp '2027-07-01 10:00' at time zone 'America/Santiago', reloj_fijado_en = now() where id = 1;
  v_q1 := public.quincena_para('2027-06-20');
  perform public.aprobar_quincena(v_q1);
  perform public.pagar_quincena(v_q1);

  -- Correcciones que aparecen después de pagar junio (entran como ajuste en la quincena abierta):
  --  · la clase del 27/06 de Tomás se dictó en inglés (falta el 5%)
  --  · Arriendo Nieve Sur marca cumplida la orden del 28/06
  update clases set idioma = 'en'
   where turno_id = (select t.id from turnos t join productos p on p.id = t.producto_id
                      where p.codigo = 'grupal_medio' and t.centro_id = 1 and t.fecha = '2027-06-27');
  update ordenes_servicio set estado = 'cumplida' where fecha = '2027-06-28' and tipo = 'equipo';

  -- =================================================================
  -- 5) Quincena 1–15 de julio (abierta)
  -- =================================================================
  -- reprogramación del 26/06 → 03/07 (conserva el vínculo al cierre)
  r1 := demo.reserva(7, 'grupal_completo', 'Centro Portezuelo', '2027-07-03', '10:00', 'avanzado', 'esqui', 2, 'finalizada', 'Martín Contreras', p_traslado => 2,
                     p_creada => timestamp '2027-06-26 09:30' at time zone 'America/Santiago');
  delete from pagos where reserva_id = r1;   -- lo pagado quedó en la reserva original
  update reservas set reprogramada_desde = r3, cierre_clima_id = v_cierre,
                      notas = 'Reprogramada desde ' || (select codigo from reservas where id = r3) || ' por cierre por clima'
   where id = r1;
  update reservas set opcion_clima = 'reprogramar' where id = r3;

  perform demo.reserva(3,  'grupal_medio', 'Centro Portezuelo', '2027-07-03', '11:00', 'intermedio', 'esqui', 4, 'finalizada', 'Tomás Pizarro');
  update participantes set asistencia = 'ausente'
   where id = (select max(pa.id) from participantes pa join reservas r on r.id = pa.reserva_id
                where r.cliente_id = demo.cliente(3) and r.estado = 'finalizada');
  perform demo.reserva(4,  'chicos', 'Centro Portezuelo', '2027-07-04', '11:00', 'principiante', 'esqui', 5, 'finalizada', 'Tomás Pizarro');
  perform demo.reserva(12, 'part_esqui', 'Centro Los Nevados', '2027-07-07', '11:00', 'intermedio', 'esqui', 2, 'finalizada', 'Tomás Pizarro', 'en');
  perform demo.reserva(13, 'chicos', 'Centro Quebrada Alta', '2027-07-08', '11:00', 'intermedio', 'esqui', 4, 'finalizada', 'Tomás Pizarro', 'en');
  perform demo.reserva(11, 'grupal_completo', 'Centro Quebrada Alta', '2027-07-06', '10:00', 'intermedio', 'snowboard', 5, 'finalizada', 'Josefa Muñoz', p_equipo => 2);
  perform demo.reserva(10, 'guiada', 'Centro Portezuelo', '2027-07-09', '10:00', 'experto', 'esqui', 2, 'finalizada', 'Sofía Valenzuela');
  perform demo.ordenes('Centro Quebrada Alta', '2027-07-06', 'cumplida');
  perform demo.ordenes('Centro Portezuelo', '2027-07-03', 'cumplida');

  insert into anticipos (instructor_id, monto, fecha, nota) values
    (4, 50000, '2027-07-05', 'Transferencia a cuenta'),
    (3, 30000, '2027-07-08', 'Efectivo en base');

  -- =================================================================
  -- 6) SÁBADO 10/07 — Centro Quebrada Alta: 41 alumnos, 9 grupos (todavía sin cierre)
  -- =================================================================
  perform demo.reserva(1,  'grupal_medio', 'Centro Quebrada Alta', '2027-07-10', '11:00', 'principiante', 'esqui', 4, 'confirmada', 'Ignacio Pérez', p_traslado => 4);
  perform demo.reserva(14, 'grupal_medio', 'Centro Quebrada Alta', '2027-07-10', '11:00', 'principiante', 'esqui', 2, 'confirmada', 'Ignacio Pérez');
  perform demo.reserva(3,  'grupal_medio', 'Centro Quebrada Alta', '2027-07-10', '11:00', 'intermedio', 'esqui', 3, 'confirmada', 'Fernanda Lagos', p_traslado => 3);
  perform demo.reserva(5,  'grupal_medio', 'Centro Quebrada Alta', '2027-07-10', '11:00', 'intermedio', 'esqui', 2, 'confirmada', 'Fernanda Lagos');
  perform demo.reserva(6,  'grupal_completo', 'Centro Quebrada Alta', '2027-07-10', '10:00', 'avanzado', 'esqui', 4, 'confirmada', 'Martín Contreras', p_traslado => 4);
  perform demo.reserva(11, 'grupal_completo', 'Centro Quebrada Alta', '2027-07-10', '10:00', 'principiante', 'snowboard', 3, 'confirmada', 'Benjamín Correa', p_equipo => 3, p_traslado => 3);
  perform demo.reserva(12, 'grupal_completo', 'Centro Quebrada Alta', '2027-07-10', '10:00', 'principiante', 'snowboard', 3, 'confirmada', 'Benjamín Correa', p_equipo => 3);
  perform demo.reserva(8,  'grupal_medio', 'Centro Quebrada Alta', '2027-07-10', '11:00', 'intermedio', 'snowboard', 4, 'confirmada', 'Josefa Muñoz', p_traslado => 2);
  perform demo.reserva(1,  'chicos', 'Centro Quebrada Alta', '2027-07-10', '11:00', 'principiante', 'esqui', 2, 'confirmada', 'Tomás Pizarro', p_traslado => 2);
  perform demo.reserva(9,  'chicos', 'Centro Quebrada Alta', '2027-07-10', '11:00', 'principiante', 'esqui', 3, 'confirmada', 'Tomás Pizarro', p_ropa => 3);
  perform demo.reserva(10, 'chicos', 'Centro Quebrada Alta', '2027-07-10', '11:00', 'intermedio', 'esqui', 4, 'confirmada', 'Rodrigo Vidal');
  perform demo.reserva(13, 'part_esqui', 'Centro Quebrada Alta', '2027-07-10', '09:00', 'intermedio', 'esqui', 3, 'confirmada', 'Catalina Herrera', 'en');
  perform demo.reserva(15, 'guiada', 'Centro Quebrada Alta', '2027-07-10', '10:00', 'avanzado', 'esqui', 4, 'confirmada', 'Sofía Valenzuela');
  perform demo.ordenes('Centro Quebrada Alta', '2027-07-10', 'aceptada');
  -- el grupo de principiantes de las 11:00 está completo y tiene lista de espera
  insert into lista_espera (turno_id, cliente_id, personas, cantidad, creado_en)
  select t.id, demo.cliente(16), demo.personas('Núñez', 1, 'principiante', false, 0, 0, 0), 1,
         timestamp '2027-07-08 20:15' at time zone 'America/Santiago'
    from turnos t join productos p on p.id = t.producto_id
   where p.codigo = 'grupal_medio' and t.centro_id = 2 and t.fecha = '2027-07-10' and t.nivel = 'principiante' and t.disciplina = 'esqui';
  -- mismo día en Portezuelo (no se afecta)
  perform demo.reserva(2, 'part_snow', 'Centro Portezuelo', '2027-07-10', '09:00', 'principiante', 'snowboard', 2, 'confirmada', 'Andrés Morales');
  perform demo.ordenes('Centro Portezuelo', '2027-07-10', 'aceptada');

  -- =================================================================
  -- 7) Próximos días
  -- =================================================================
  update configuracion set reloj_simulado = v_reloj, reloj_fijado_en = now() where id = 1;

  -- 11/07 Portezuelo, grupal principiantes: completo, con una reserva pendiente que vence en 2 horas
  perform demo.reserva(7,  'grupal_medio', 'Centro Portezuelo', '2027-07-11', '11:00', 'principiante', 'esqui', 4, 'confirmada');
  perform demo.reserva(16, 'grupal_medio', 'Centro Portezuelo', '2027-07-11', '11:00', 'principiante', 'esqui', 2, 'pendiente_pago',
                       p_creada => v_reloj - interval '22 hours', p_vence => v_reloj + interval '2 hours');
  insert into lista_espera (turno_id, cliente_id, personas, cantidad, creado_en)
  select t.id, demo.cliente(x.c), demo.personas(x.ap, x.n, 'principiante', false, 0, 0, 0), x.n, v_reloj - x.h
    from turnos t join productos p on p.id = t.producto_id,
         (values (2, 'Araya', 2, interval '20 hours'), (10, 'Silva', 1, interval '15 hours')) x(c, ap, n, h)
   where p.codigo = 'grupal_medio' and t.centro_id = 1 and t.fecha = '2027-07-11' and t.nivel = 'principiante' and t.disciplina = 'esqui';

  -- 13/07: Antonia usa parte de su crédito del 26/06
  r1 := demo.reserva(5, 'grupal_medio', 'Centro Portezuelo', '2027-07-13', '11:00', 'intermedio', 'esqui', 2, 'pendiente_pago',
                     p_creada => v_reloj - interval '30 hours', p_vence => v_reloj + interval '20 hours');
  select id into v_cred from creditos where cliente_id = demo.cliente(5);
  update creditos set saldo = saldo - (select total from reservas where id = r1) where id = v_cred;
  insert into movimientos_credito (credito_id, reserva_id, monto) select v_cred, r1, -total from reservas where id = r1;
  update reservas set credito_aplicado = total, total = 0, estado = 'confirmada', vence_en = null,
                      confirmada_en = v_reloj - interval '30 hours'
   where id = r1;

  -- sin instructor asignado (para probar la pantalla de asignación)
  perform demo.reserva(14, 'part_esqui', 'Centro Portezuelo', '2027-07-14', '11:00', 'avanzado', 'esqui', 1, 'confirmada');
  perform demo.reserva(4,  'chicos', 'Centro Los Nevados', '2027-07-18', '11:00', 'intermedio', 'esqui', 3, 'confirmada');
  perform demo.reserva(3,  'grupal_completo', 'Centro Los Nevados', '2027-07-17', '10:00', 'intermedio', 'esqui', 3, 'pendiente_pago',
                       p_creada => v_reloj - interval '4 hours', p_vence => v_reloj + interval '20 hours');

  -- Camila (cliente@): una reserva a más de 72 h (100%) y otra a menos de 72 h (50%)
  perform demo.reserva(1, 'part_esqui', 'Centro Portezuelo', '2027-07-12', '14:00', 'intermedio', 'esqui', 2, 'confirmada', 'Catalina Herrera');
  perform demo.reserva(1, 'grupal_completo', 'Centro Los Nevados', '2027-07-21', '10:00', 'principiante', 'snowboard', 2, 'confirmada', p_equipo => 2);

  -- Solicitudes a pedido
  perform demo.reserva(2,  'heli', 'Centro Los Nevados', '2027-07-24', '08:00', 'experto', 'esqui', 2, 'solicitud',
                       p_creada => v_reloj - interval '2 days');
  perform demo.reserva(15, 'corporativa', 'Centro Portezuelo', '2027-07-31', '10:00', 'intermedio', 'esqui', 12, 'solicitud',
                       p_creada => v_reloj - interval '1 day');

  -- Liquidación de julio en borrador (incluye los ajustes de junio)
  v_q2 := public.quincena_para('2027-07-01');
  perform public.generar_liquidacion(v_q2);
  perform public.quincena_para(d::date) from generate_series('2027-07-16'::date, '2027-09-27'::date, interval '15 days') d;

  perform set_config('request.jwt.claim.sub', '', true);
  return jsonb_build_object('reservas', (select count(*) from reservas), 'reloj', v_reloj);
end $$;

-- Botón "Reiniciar datos de ejemplo" (solo administración)
create or replace function public.reiniciar_datos_demo() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.es_admin() then
    raise exception 'PERMISO: Solo administración reinicia los datos de ejemplo';
  end if;
  return demo.cargar();
end $$;
revoke execute on function public.reiniciar_datos_demo() from public, anon;

select demo.cargar();
