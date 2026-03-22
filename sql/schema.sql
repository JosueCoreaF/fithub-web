create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at = now();
	return new;
end;
$$;

create table if not exists public.personas (
	id_persona uuid primary key default gen_random_uuid(),
	nombre text not null,
	correo text not null,
	direccion_ciudad text,
	direccion_colonia text,
	direccion_calle text,
	fecha_nacimiento date,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint personas_correo_unique unique (correo),
	constraint personas_correo_format_check check (position('@' in correo) > 1)
);

create table if not exists public.persona_telefonos (
	id_persona uuid primary key references public.personas(id_persona) on delete cascade,
	telefono text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint persona_telefonos_phone_check check (length(trim(telefono)) >= 7)
);

create table if not exists public.clientes (
	id_persona uuid primary key references public.personas(id_persona) on delete cascade,
	fecha_registro date not null default current_date,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists public.entrenadores (
	id_persona uuid primary key references public.personas(id_persona) on delete cascade,
	especialidad text,
	estado_laboral text not null default 'Activo',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint entrenadores_estado_check check (estado_laboral in ('Activo', 'Inactivo', 'Vacaciones'))
);

create table if not exists public.sedes (
	id_sede uuid primary key default gen_random_uuid(),
	nombre_sede text not null,
	ubicacion text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint sedes_nombre_unique unique (nombre_sede)
);

create table if not exists public.actividades (
	id_actividad uuid primary key default gen_random_uuid(),
	nombre_actividad text not null,
	descripcion text,
	tipo text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint actividades_nombre_unique unique (nombre_actividad),
	constraint actividades_tipo_check check (tipo in ('Clase grupal', 'Servicio'))
);

create table if not exists public.programacion_actividades (
	id_programacion uuid primary key default gen_random_uuid(),
	id_sede uuid references public.sedes(id_sede) on delete set null,
	id_actividad uuid references public.actividades(id_actividad) on delete set null,
	id_entrenador uuid references public.entrenadores(id_persona) on delete set null,
	horario timestamptz not null,
	cupo_maximo integer not null default 1,
	costo numeric(10, 2) not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint programacion_cupo_check check (cupo_maximo > 0),
	constraint programacion_costo_check check (costo >= 0)
);

create table if not exists public.reservas (
	id_reserva uuid primary key default gen_random_uuid(),
	id_cliente uuid references public.clientes(id_persona) on delete set null,
	id_programacion uuid references public.programacion_actividades(id_programacion) on delete cascade,
	fecha_reserva timestamptz default now(),
	precio_aplicado numeric(10, 2) not null default 0,
	estado text not null default 'creada',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint reservas_estado_check check (estado in ('creada', 'confirmada', 'cancelada', 'completada')),
	constraint reservas_precio_check check (precio_aplicado >= 0),
	constraint reservas_cliente_programacion_unique unique (id_cliente, id_programacion)
);

create table if not exists public.pagos (
	id_pago uuid primary key default gen_random_uuid(),
	monto numeric(10, 2) not null,
	fecha_pago timestamptz not null default now(),
	metodo_pago text,
	referencia text,
	id_reserva uuid references public.reservas(id_reserva) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint pagos_monto_check check (monto > 0),
	constraint pagos_metodo_check check (metodo_pago is null or metodo_pago in ('efectivo', 'tarjeta', 'transferencia', 'deposito', 'otro')),
	constraint pagos_origen_check check (id_reserva is not null)
);

create table if not exists public.configuracion_operativa (
	id_config text primary key default 'default',
	ciudad_base text not null default 'Tegucigalpa',
	horas_anticipacion_reserva integer not null default 12,
	umbral_ocupacion integer not null default 85,
	auto_confirmar_pagos boolean not null default true,
	permitir_edicion_entrenador boolean not null default true,
	hora_cierre text not null default '21:00',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint configuracion_operativa_singleton_check check (id_config = 'default'),
	constraint configuracion_operativa_horas_check check (horas_anticipacion_reserva >= 0),
	constraint configuracion_operativa_umbral_check check (umbral_ocupacion between 1 and 100)
);

create table if not exists public.hoteles (
	id_hotel uuid primary key default gen_random_uuid(),
	nombre_hotel text not null,
	ciudad text not null,
	direccion text not null,
	estrellas integer not null default 3,
	estado text not null default 'activo',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint hoteles_nombre_unique unique (nombre_hotel),
	constraint hoteles_estrellas_check check (estrellas between 1 and 5),
	constraint hoteles_estado_check check (estado in ('activo', 'inactivo', 'mantenimiento'))
);

create table if not exists public.habitaciones (
	id_habitacion uuid primary key default gen_random_uuid(),
	id_hotel uuid not null references public.hoteles(id_hotel) on delete cascade,
	codigo_habitacion text not null,
	nombre_habitacion text not null,
	categoria text not null,
	descripcion text,
	capacidad integer not null default 1,
	tarifa_base numeric(10, 2) not null default 0,
	estado text not null default 'disponible',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint habitaciones_hotel_codigo_unique unique (id_hotel, codigo_habitacion),
	constraint habitaciones_capacidad_check check (capacidad > 0),
	constraint habitaciones_tarifa_check check (tarifa_base >= 0),
	constraint habitaciones_estado_check check (estado in ('disponible', 'ocupada', 'mantenimiento', 'bloqueada'))
);

create table if not exists public.reservas_hotel (
	id_reserva_hotel uuid primary key default gen_random_uuid(),
	id_huesped uuid references public.clientes(id_persona) on delete set null,
	id_habitacion uuid not null references public.habitaciones(id_habitacion) on delete cascade,
	check_in timestamptz not null,
	check_out timestamptz not null,
	adultos integer not null default 1,
	ninos integer not null default 0,
	estado text not null default 'pendiente',
	total numeric(10, 2) not null default 0,
	observaciones text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint reservas_hotel_fechas_check check (check_out > check_in),
	constraint reservas_hotel_total_check check (total >= 0),
	constraint reservas_hotel_adultos_check check (adultos > 0),
	constraint reservas_hotel_ninos_check check (ninos >= 0),
	constraint reservas_hotel_estado_check check (estado in ('pendiente', 'confirmada', 'cancelada', 'check_in', 'check_out'))
);

alter table public.personas
	add column if not exists created_at timestamptz not null default now(),
	add column if not exists updated_at timestamptz not null default now();

alter table public.persona_telefonos
	add column if not exists created_at timestamptz not null default now(),
	add column if not exists updated_at timestamptz not null default now();

alter table public.clientes
	add column if not exists created_at timestamptz not null default now(),
	add column if not exists updated_at timestamptz not null default now();

alter table public.entrenadores
	add column if not exists created_at timestamptz not null default now(),
	add column if not exists updated_at timestamptz not null default now();

alter table public.sedes
	add column if not exists created_at timestamptz not null default now(),
	add column if not exists updated_at timestamptz not null default now();

alter table public.actividades
	add column if not exists created_at timestamptz not null default now(),
	add column if not exists updated_at timestamptz not null default now();

alter table public.programacion_actividades
	add column if not exists created_at timestamptz not null default now(),
	add column if not exists updated_at timestamptz not null default now();

alter table public.reservas
	add column if not exists created_at timestamptz not null default now(),
	add column if not exists updated_at timestamptz not null default now();

alter table public.pagos
	add column if not exists created_at timestamptz not null default now(),
	add column if not exists updated_at timestamptz not null default now();

alter table public.configuracion_operativa
	add column if not exists ciudad_base text not null default 'Tegucigalpa',
	add column if not exists horas_anticipacion_reserva integer not null default 12,
	add column if not exists umbral_ocupacion integer not null default 85,
	add column if not exists auto_confirmar_pagos boolean not null default true,
	add column if not exists permitir_edicion_entrenador boolean not null default true,
	add column if not exists hora_cierre text not null default '21:00',
	add column if not exists created_at timestamptz not null default now(),
	add column if not exists updated_at timestamptz not null default now();

alter table public.hoteles
	add column if not exists created_at timestamptz not null default now(),
	add column if not exists updated_at timestamptz not null default now(),
	add column if not exists ciudad text not null default 'Tegucigalpa',
	add column if not exists direccion text not null default 'Pendiente',
	add column if not exists estrellas integer not null default 3,
	add column if not exists estado text not null default 'activo';

alter table public.habitaciones
	add column if not exists created_at timestamptz not null default now(),
	add column if not exists updated_at timestamptz not null default now(),
	add column if not exists codigo_habitacion text not null default 'TEMP',
	add column if not exists nombre_habitacion text not null default 'Habitacion temporal',
	add column if not exists categoria text not null default 'estandar',
	add column if not exists descripcion text,
	add column if not exists capacidad integer not null default 1,
	add column if not exists tarifa_base numeric(10, 2) not null default 0,
	add column if not exists estado text not null default 'disponible';

alter table public.reservas_hotel
	add column if not exists created_at timestamptz not null default now(),
	add column if not exists updated_at timestamptz not null default now(),
	add column if not exists adultos integer not null default 1,
	add column if not exists ninos integer not null default 0,
	add column if not exists estado text not null default 'pendiente',
	add column if not exists total numeric(10, 2) not null default 0,
	add column if not exists observaciones text;

create index if not exists idx_personas_correo_lower on public.personas (lower(correo));
create index if not exists idx_entrenadores_estado on public.entrenadores (estado_laboral);
create index if not exists idx_programacion_horario on public.programacion_actividades (horario);
create index if not exists idx_programacion_entrenador on public.programacion_actividades (id_entrenador, horario);
create index if not exists idx_reservas_programacion on public.reservas (id_programacion, estado);
create index if not exists idx_reservas_cliente on public.reservas (id_cliente, fecha_reserva desc);
create index if not exists idx_pagos_reserva on public.pagos (id_reserva);
create index if not exists idx_pagos_fecha on public.pagos (fecha_pago desc);
create index if not exists idx_hoteles_ciudad on public.hoteles (ciudad);
create index if not exists idx_habitaciones_hotel on public.habitaciones (id_hotel, estado);
create index if not exists idx_reservas_hotel_habitacion on public.reservas_hotel (id_habitacion, check_in, check_out);
create index if not exists idx_reservas_hotel_huesped on public.reservas_hotel (id_huesped, created_at desc);

drop trigger if exists personas_set_updated_at on public.personas;
create trigger personas_set_updated_at
before update on public.personas
for each row execute function public.set_updated_at();

drop trigger if exists persona_telefonos_set_updated_at on public.persona_telefonos;
create trigger persona_telefonos_set_updated_at
before update on public.persona_telefonos
for each row execute function public.set_updated_at();

drop trigger if exists clientes_set_updated_at on public.clientes;
create trigger clientes_set_updated_at
before update on public.clientes
for each row execute function public.set_updated_at();

drop trigger if exists entrenadores_set_updated_at on public.entrenadores;
create trigger entrenadores_set_updated_at
before update on public.entrenadores
for each row execute function public.set_updated_at();

drop trigger if exists sedes_set_updated_at on public.sedes;
create trigger sedes_set_updated_at
before update on public.sedes
for each row execute function public.set_updated_at();

drop trigger if exists actividades_set_updated_at on public.actividades;
create trigger actividades_set_updated_at
before update on public.actividades
for each row execute function public.set_updated_at();

drop trigger if exists programacion_actividades_set_updated_at on public.programacion_actividades;
create trigger programacion_actividades_set_updated_at
before update on public.programacion_actividades
for each row execute function public.set_updated_at();

drop trigger if exists reservas_set_updated_at on public.reservas;
create trigger reservas_set_updated_at
before update on public.reservas
for each row execute function public.set_updated_at();

drop trigger if exists pagos_set_updated_at on public.pagos;
create trigger pagos_set_updated_at
before update on public.pagos
for each row execute function public.set_updated_at();

drop trigger if exists configuracion_operativa_set_updated_at on public.configuracion_operativa;
create trigger configuracion_operativa_set_updated_at
before update on public.configuracion_operativa
for each row execute function public.set_updated_at();

drop trigger if exists hoteles_set_updated_at on public.hoteles;
create trigger hoteles_set_updated_at
before update on public.hoteles
for each row execute function public.set_updated_at();

drop trigger if exists habitaciones_set_updated_at on public.habitaciones;
create trigger habitaciones_set_updated_at
before update on public.habitaciones
for each row execute function public.set_updated_at();

drop trigger if exists reservas_hotel_set_updated_at on public.reservas_hotel;
create trigger reservas_hotel_set_updated_at
before update on public.reservas_hotel
for each row execute function public.set_updated_at();
