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

create table if not exists public.huespedes (
	id_huesped uuid primary key default gen_random_uuid(),
	nombre_completo text not null,
	correo text not null,
	telefono text,
	documento_identidad text,
	ciudad text,
	direccion text,
	fecha_registro timestamptz not null default now(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint huespedes_correo_unique unique (correo),
	constraint huespedes_correo_format_check check (position('@' in correo) > 1)
);

create table if not exists public.hoteles (
	id_hotel uuid primary key default gen_random_uuid(),
	nombre_hotel text not null,
	ciudad text not null,
	direccion text not null,
	telefono text,
	correo_contacto text,
	estrellas integer not null default 3,
	estado text not null default 'activo',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint hoteles_nombre_unique unique (nombre_hotel),
	constraint hoteles_estrellas_check check (estrellas between 1 and 5),
	constraint hoteles_estado_check check (estado in ('activo', 'inactivo', 'mantenimiento'))
);

create table if not exists public.personal_hotel (
	id_personal uuid primary key default gen_random_uuid(),
	id_hotel uuid not null references public.hoteles(id_hotel) on delete cascade,
	nombre_completo text not null,
	correo text not null,
	telefono text,
	rol text not null,
	estado text not null default 'activo',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint personal_hotel_correo_unique unique (correo),
	constraint personal_hotel_estado_check check (estado in ('activo', 'inactivo', 'vacaciones')),
	constraint personal_hotel_rol_check check (rol in ('recepcion', 'gerencia', 'limpieza', 'soporte', 'administracion'))
);

create table if not exists public.tipos_habitacion (
	id_tipo_habitacion uuid primary key default gen_random_uuid(),
	nombre_tipo text not null,
	descripcion text,
	capacidad_base integer not null default 1,
	tarifa_base numeric(10, 2) not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint tipos_habitacion_nombre_unique unique (nombre_tipo),
	constraint tipos_habitacion_capacidad_check check (capacidad_base > 0),
	constraint tipos_habitacion_tarifa_check check (tarifa_base >= 0)
);

create table if not exists public.habitaciones (
	id_habitacion uuid primary key default gen_random_uuid(),
	id_hotel uuid not null references public.hoteles(id_hotel) on delete cascade,
	id_tipo_habitacion uuid not null references public.tipos_habitacion(id_tipo_habitacion) on delete restrict,
	codigo_habitacion text not null,
	nombre_habitacion text not null,
	piso integer,
	capacidad integer not null default 1,
	tarifa_noche numeric(10, 2) not null default 0,
	estado text not null default 'disponible',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint habitaciones_hotel_codigo_unique unique (id_hotel, codigo_habitacion),
	constraint habitaciones_capacidad_check check (capacidad > 0),
	constraint habitaciones_tarifa_check check (tarifa_noche >= 0),
	constraint habitaciones_estado_check check (estado in ('disponible', 'ocupada', 'mantenimiento', 'bloqueada', 'limpieza'))
);

create table if not exists public.reservas_hotel (
	id_reserva_hotel uuid primary key default gen_random_uuid(),
	id_huesped uuid not null references public.huespedes(id_huesped) on delete restrict,
	id_hotel uuid not null references public.hoteles(id_hotel) on delete restrict,
	id_habitacion uuid not null references public.habitaciones(id_habitacion) on delete restrict,
	check_in timestamptz not null,
	check_out timestamptz not null,
	adultos integer not null default 1,
	ninos integer not null default 0,
	estado text not null default 'pendiente',
	origen_reserva text not null default 'web',
	total_reserva numeric(10, 2) not null default 0,
	anticipo numeric(10, 2) not null default 0,
	observaciones text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint reservas_hotel_fechas_check check (check_out > check_in),
	constraint reservas_hotel_adultos_check check (adultos > 0),
	constraint reservas_hotel_ninos_check check (ninos >= 0),
	constraint reservas_hotel_total_check check (total_reserva >= 0),
	constraint reservas_hotel_anticipo_check check (anticipo >= 0 and anticipo <= total_reserva),
	constraint reservas_hotel_estado_check check (estado in ('pendiente', 'confirmada', 'cancelada', 'check_in', 'check_out', 'no_show')),
	constraint reservas_hotel_origen_check check (origen_reserva in ('web', 'recepcion', 'telefono', 'agencia'))
);

create table if not exists public.pagos_hotel (
	id_pago_hotel uuid primary key default gen_random_uuid(),
	id_reserva_hotel uuid not null references public.reservas_hotel(id_reserva_hotel) on delete cascade,
	monto numeric(10, 2) not null,
	metodo_pago text not null,
	referencia text,
	fecha_pago timestamptz not null default now(),
	estado text not null default 'registrado',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint pagos_hotel_monto_check check (monto > 0),
	constraint pagos_hotel_metodo_check check (metodo_pago in ('efectivo', 'tarjeta', 'transferencia', 'deposito', 'otro')),
	constraint pagos_hotel_estado_check check (estado in ('registrado', 'aplicado', 'anulado'))
);

create table if not exists public.bloqueos_habitacion (
	id_bloqueo uuid primary key default gen_random_uuid(),
	id_habitacion uuid not null references public.habitaciones(id_habitacion) on delete cascade,
	fecha_inicio timestamptz not null,
	fecha_fin timestamptz not null,
	motivo text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint bloqueos_habitacion_fechas_check check (fecha_fin > fecha_inicio)
);

create table if not exists public.configuracion_hotelera (
	id_config text primary key default 'default',
	hora_check_in time not null default '15:00',
	hora_check_out time not null default '12:00',
	moneda text not null default 'USD',
	porcentaje_impuesto numeric(5, 2) not null default 0,
	permite_sobreventa boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint configuracion_hotelera_singleton_check check (id_config = 'default'),
	constraint configuracion_hotelera_impuesto_check check (porcentaje_impuesto >= 0)
);

create index if not exists idx_huespedes_correo_lower on public.huespedes (lower(correo));
create index if not exists idx_hoteles_ciudad on public.hoteles (ciudad);
create index if not exists idx_personal_hotel_hotel on public.personal_hotel (id_hotel, rol);
create index if not exists idx_habitaciones_hotel on public.habitaciones (id_hotel, estado);
create index if not exists idx_habitaciones_tipo on public.habitaciones (id_tipo_habitacion);
create index if not exists idx_reservas_hotel_huesped on public.reservas_hotel (id_huesped, created_at desc);
create index if not exists idx_reservas_hotel_habitacion on public.reservas_hotel (id_habitacion, check_in, check_out);
create index if not exists idx_reservas_hotel_hotel on public.reservas_hotel (id_hotel, estado, check_in);
create index if not exists idx_pagos_hotel_reserva on public.pagos_hotel (id_reserva_hotel, fecha_pago desc);
create index if not exists idx_bloqueos_habitacion_habitacion on public.bloqueos_habitacion (id_habitacion, fecha_inicio, fecha_fin);

drop trigger if exists huespedes_set_updated_at on public.huespedes;
create trigger huespedes_set_updated_at
before update on public.huespedes
for each row execute function public.set_updated_at();

drop trigger if exists hoteles_set_updated_at on public.hoteles;
create trigger hoteles_set_updated_at
before update on public.hoteles
for each row execute function public.set_updated_at();

drop trigger if exists personal_hotel_set_updated_at on public.personal_hotel;
create trigger personal_hotel_set_updated_at
before update on public.personal_hotel
for each row execute function public.set_updated_at();

drop trigger if exists tipos_habitacion_set_updated_at on public.tipos_habitacion;
create trigger tipos_habitacion_set_updated_at
before update on public.tipos_habitacion
for each row execute function public.set_updated_at();

drop trigger if exists habitaciones_set_updated_at on public.habitaciones;
create trigger habitaciones_set_updated_at
before update on public.habitaciones
for each row execute function public.set_updated_at();

drop trigger if exists reservas_hotel_set_updated_at on public.reservas_hotel;
create trigger reservas_hotel_set_updated_at
before update on public.reservas_hotel
for each row execute function public.set_updated_at();

drop trigger if exists pagos_hotel_set_updated_at on public.pagos_hotel;
create trigger pagos_hotel_set_updated_at
before update on public.pagos_hotel
for each row execute function public.set_updated_at();

drop trigger if exists bloqueos_habitacion_set_updated_at on public.bloqueos_habitacion;
create trigger bloqueos_habitacion_set_updated_at
before update on public.bloqueos_habitacion
for each row execute function public.set_updated_at();

drop trigger if exists configuracion_hotelera_set_updated_at on public.configuracion_hotelera;
create trigger configuracion_hotelera_set_updated_at
before update on public.configuracion_hotelera
for each row execute function public.set_updated_at();

insert into public.configuracion_hotelera (
	id_config,
	hora_check_in,
	hora_check_out,
	moneda,
	porcentaje_impuesto,
	permite_sobreventa
)
values (
	'default',
	'15:00',
	'12:00',
	'USD',
	0,
	false
)
on conflict (id_config) do nothing;