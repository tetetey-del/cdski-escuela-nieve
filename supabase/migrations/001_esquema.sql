-- =====================================================================
-- CDSKI · 001 · Esquema base
-- Producto -> Turno -> Reserva -> Participante -> Clase
-- Orden de servicio -> Renglón de liquidación (cada importe con su origen)
-- =====================================================================

-- ---------- Tipos ----------
create type rol_usuario      as enum ('cliente','instructor','proveedor','operaciones','administracion');
create type nivel_esqui      as enum ('principiante','intermedio','avanzado','experto');
create type disciplina_tipo  as enum ('esqui','snowboard','ambas');
create type tipo_producto    as enum ('grupal','particular','chicos','guiada','heliesqui','corporativa');
create type precio_modo      as enum ('persona','clase','grupo');
create type estado_reserva   as enum ('solicitud','pendiente_pago','confirmada','en_curso','finalizada','cancelada','vencida','afectada_clima');
create type estado_orden     as enum ('pedida','aceptada','cumplida','cancelada','cancelada_con_cargo');
create type estado_quincena  as enum ('borrador','aprobada','pagada');
create type estado_espera    as enum ('esperando','ofrecida','convertida','expirada','cancelada');
create type asistencia_tipo  as enum ('pendiente','presente','ausente');
create type opcion_clima     as enum ('reprogramar','credito');

-- ---------- Usuarios ----------
create table perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  rol        rol_usuario not null default 'cliente',
  nombre     text not null,
  telefono   text,
  creado_en  timestamptz not null default now()
);

-- ---------- Configuración (una sola fila) ----------
create table configuracion (
  id                    int primary key default 1 check (id = 1),
  temporada_inicio      date not null,
  temporada_fin         date not null,
  alta_inicio           date not null,
  alta_fin              date not null,
  recargo_alta_pct      int  not null default 20,
  reintegro_mas_72_pct  int  not null default 100,
  reintegro_24_72_pct   int  not null default 50,
  reintegro_menos_24_pct int not null default 0,
  horas_pago            int  not null default 24,   -- vencimiento de pendientes
  horas_espera          int  not null default 12,   -- plazo para lista de espera
  edad_minima           int  not null default 7,
  max_horas_dia         numeric not null default 6,
  minutos_entre_centros int  not null default 45,
  max_dias_seguidos     int  not null default 6,    -- 1 día libre cada 7
  adicional_ninos_pct   int  not null default 10,
  adicional_ingles_pct  int  not null default 5,
  minimo_clima_horas    numeric not null default 1,
  hora_limite_clima     time not null default '06:00',
  cargo_proveedor_pct   int  not null default 50,
  horas_sin_cargo_proveedor int not null default 24,
  plazas_camioneta      int  not null default 12,
  actualizado_en        timestamptz not null default now()
);

create table tarifas_instructor (
  categoria   int primary key check (categoria between 1 and 3),
  tarifa_hora int not null
);

-- ---------- Catálogo ----------
create table centros (
  id              bigint generated always as identity primary key,
  nombre          text not null unique,
  punto_encuentro text not null,
  activo          boolean not null default true
);

create table productos (
  id                  bigint generated always as identity primary key,
  codigo              text not null unique,
  nombre              text not null,
  descripcion         text not null,
  tipo                tipo_producto not null,
  disciplina          disciplina_tipo not null default 'ambas',
  duracion_horas      numeric not null,
  horarios            time[] not null,           -- horas de inicio posibles
  hora_fin_offset     interval not null,         -- fin = inicio + offset (incluye almuerzo)
  cupo                int not null,              -- personas por grupo
  min_personas        int not null default 1,
  precio              int not null,
  precio_por          precio_modo not null default 'persona',
  a_pedido            boolean not null default false,
  niveles_permitidos  nivel_esqui[] not null default '{principiante,intermedio,avanzado,experto}',
  edad_min            int,
  edad_max            int,
  requiere_apto_ninos boolean not null default false,
  categoria_minima    int not null default 1,
  instructores_cada   int,                       -- corporativa: 1 cada 6
  orden               int not null default 0,
  activo              boolean not null default true
);

create table proveedores (
  id         bigint generated always as identity primary key,
  perfil_id  uuid unique references perfiles(id) on delete set null,
  nombre     text not null,
  servicio   text not null,
  telefono   text
);

create table extras (
  id             bigint generated always as identity primary key,
  codigo         text not null unique,       -- equipo | ropa | traslado
  nombre         text not null,
  precio         int not null,               -- precio al cliente por persona y día
  proveedor_id   bigint references proveedores(id),
  costo_unitario int not null default 0      -- costo de la escuela por persona (traslado se calcula por camioneta)
);

create table instructores (
  id          bigint generated always as identity primary key,
  perfil_id   uuid unique references perfiles(id) on delete set null,
  nombre      text not null,
  categoria   int not null references tarifas_instructor(categoria),
  disciplina  disciplina_tipo not null,
  apto_ninos  boolean not null default false,
  ingles      boolean not null default false,
  activo      boolean not null default true
);

-- ---------- Turnos y clases ----------
create table turnos (
  id           bigint generated always as identity primary key,
  producto_id  bigint not null references productos(id),
  centro_id    bigint not null references centros(id),
  fecha        date not null,
  hora_inicio  time not null,
  hora_fin     time not null,
  nivel        nivel_esqui not null,
  grupo        int not null default 1,                -- 2, 3… = grupo paralelo
  cupo_total   int not null,
  cupo_ocupado int not null default 0 check (cupo_ocupado >= 0),
  cerrado_clima boolean not null default false,
  creado_en    timestamptz not null default now(),
  constraint cupo_valido check (cupo_ocupado <= cupo_total),
  unique (producto_id, centro_id, fecha, hora_inicio, nivel, grupo)
);
create index on turnos (fecha, centro_id);

create table clases (
  id             bigint generated always as identity primary key,
  turno_id       bigint not null unique references turnos(id) on delete cascade,
  instructor_id  bigint references instructores(id),
  idioma         text not null default 'es' check (idioma in ('es','en')),
  asignada_en    timestamptz,
  asistencia_cerrada boolean not null default false,
  cancelada_clima boolean not null default false
);
create index on clases (instructor_id);

create table justificaciones_asignacion (
  id            bigint generated always as identity primary key,
  clase_id      bigint not null references clases(id) on delete cascade,
  instructor_id bigint not null references instructores(id),
  motivos       text[] not null,
  justificacion text not null check (length(trim(justificacion)) >= 10),
  usuario_id    uuid references perfiles(id),
  creado_en     timestamptz not null default now()
);

-- ---------- Clima ----------
create table cierres_clima (
  id            bigint generated always as identity primary key,
  centro_id     bigint not null references centros(id),
  fecha         date not null,
  registrado_en timestamptz not null default now(),
  motivo        text not null,
  usuario_id    uuid references perfiles(id),
  unique (centro_id, fecha)
);

-- ---------- Reservas ----------
create table reservas (
  id               bigint generated always as identity primary key,
  codigo           text not null unique default ('R-' || upper(substr(md5(random()::text), 1, 6))),
  cliente_id       uuid not null references perfiles(id),
  producto_id      bigint not null references productos(id),
  turno_id         bigint references turnos(id),
  estado           estado_reserva not null,
  idioma           text not null default 'es' check (idioma in ('es','en')),
  temporada_alta   boolean not null default false,
  monto_clases     int not null default 0,     -- incluye recargo de alta
  recargo_alta     int not null default 0,
  monto_extras     int not null default 0,
  credito_aplicado int not null default 0,
  total            int not null default 0,     -- a pagar = clases + extras - crédito
  cotizado_en      timestamptz,
  vence_en         timestamptz,
  confirmada_en    timestamptz,
  cancelada_en     timestamptz,
  reintegro_pct    int,
  reintegro_monto  int,
  cierre_clima_id  bigint references cierres_clima(id),
  opcion_clima     opcion_clima,
  reprogramada_desde bigint references reservas(id),
  desde_espera_id  bigint,
  notas            text,
  creada_en        timestamptz not null default now()
);
create index on reservas (cliente_id);
create index on reservas (turno_id);
create index on reservas (estado);

create table participantes (
  id          bigint generated always as identity primary key,
  reserva_id  bigint not null references reservas(id) on delete cascade,
  nombre      text not null,
  edad        int not null check (edad > 0 and edad < 100),
  nivel       nivel_esqui not null,
  equipo      boolean not null default false,
  ropa        boolean not null default false,
  traslado    boolean not null default false,
  asistencia  asistencia_tipo not null default 'pendiente'
);
create index on participantes (reserva_id);

create table lista_espera (
  id          bigint generated always as identity primary key,
  turno_id    bigint not null references turnos(id),
  cliente_id  uuid not null references perfiles(id),
  personas    jsonb not null,     -- [{nombre, edad, nivel, equipo, ropa, traslado}]
  cantidad    int not null,
  estado      estado_espera not null default 'esperando',
  ofrecida_en timestamptz,
  vence_en    timestamptz,
  reserva_id  bigint references reservas(id),
  creado_en   timestamptz not null default now()
);
create index on lista_espera (turno_id, estado, creado_en);

alter table reservas add constraint reservas_espera_fk foreign key (desde_espera_id) references lista_espera(id);

-- ---------- Pagos y créditos ----------
create table pagos (
  id            bigint generated always as identity primary key,
  reserva_id    bigint not null references reservas(id),
  tipo          text not null check (tipo in ('pago','reintegro')),
  monto         int not null check (monto > 0),
  medio         text not null check (medio in ('transferencia','efectivo','tarjeta','credito')),
  fecha         date not null default current_date,
  referencia    text not null,
  registrado_por uuid references perfiles(id),
  creado_en     timestamptz not null default now()
);
create unique index pagos_un_pago_por_reserva on pagos (reserva_id) where tipo = 'pago';
create unique index pagos_un_reintegro_por_reserva on pagos (reserva_id) where tipo = 'reintegro';

create table creditos (
  id                bigint generated always as identity primary key,
  cliente_id        uuid not null references perfiles(id),
  reserva_origen_id bigint not null unique references reservas(id),  -- un crédito por reserva
  cierre_clima_id   bigint references cierres_clima(id),
  temporada         int not null,
  monto             int not null check (monto > 0),
  saldo             int not null check (saldo >= 0),
  creado_en         timestamptz not null default now()
);

create table movimientos_credito (
  id         bigint generated always as identity primary key,
  credito_id bigint not null references creditos(id),
  reserva_id bigint not null references reservas(id),
  monto      int not null,
  creado_en  timestamptz not null default now()
);

-- ---------- Proveedores ----------
create table ordenes_servicio (
  id             bigint generated always as identity primary key,
  proveedor_id   bigint not null references proveedores(id),
  centro_id      bigint references centros(id),
  fecha          date not null,
  hora           time,
  tipo           text not null check (tipo in ('traslado','equipo','ropa','heliesqui')),
  cantidad       int not null check (cantidad > 0),
  costo_unitario int not null,
  total          int not null,
  cargo          int not null default 0,       -- lo que se paga si se cancela con cargo
  estado         estado_orden not null default 'pedida',
  reserva_id     bigint references reservas(id),
  cierre_clima_id bigint references cierres_clima(id),
  detalle        text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index on ordenes_servicio (proveedor_id, fecha);

-- ---------- Liquidaciones ----------
create table quincenas (
  id         bigint generated always as identity primary key,
  inicio     date not null unique,
  fin        date not null,
  estado     estado_quincena not null default 'borrador',
  aprobada_en timestamptz,
  pagada_en  timestamptz,
  check (fin >= inicio)
);

create table anticipos (
  id            bigint generated always as identity primary key,
  instructor_id bigint not null references instructores(id),
  monto         int not null check (monto > 0),
  fecha         date not null,
  nota          text,
  creado_en     timestamptz not null default now()
);

create table renglones_liquidacion (
  id               bigint generated always as identity primary key,
  quincena_id      bigint not null references quincenas(id),
  instructor_id    bigint references instructores(id),
  proveedor_id     bigint references proveedores(id),
  fecha            date not null,
  concepto         text not null check (concepto in
                    ('clase','adicional_ninos','adicional_ingles','minimo_clima','anticipo',
                     'orden','cargo_cancelacion','ajuste')),
  descripcion      text not null,
  cantidad         numeric not null default 1,
  importe_unitario int not null default 0,
  importe          int not null,                 -- negativo para anticipos
  origen_tipo      text not null,                -- clase | orden | anticipo | cierre_clima | ajuste
  origen_id        bigint not null,
  ajusta_renglon_id bigint references renglones_liquidacion(id),
  creado_en        timestamptz not null default now(),
  check ((instructor_id is null) <> (proveedor_id is null))
);
create index on renglones_liquidacion (quincena_id);
create unique index renglon_origen_unico on renglones_liquidacion (quincena_id, concepto, origen_tipo, origen_id)
  where concepto <> 'ajuste';

-- RLS activado en todas las tablas desde el inicio (las políticas van en 002)
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
