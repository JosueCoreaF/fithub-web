insert into public.hoteles (
	nombre_hotel,
	ciudad,
	direccion,
	telefono,
	correo_contacto,
	estrellas,
	estado
)
select *
from (
	values
		('Hotel FitHub Centro'::text, 'Tegucigalpa'::text, 'Boulevard Morazan, Tegucigalpa'::text, '+504-2200-1100'::text, 'centro@fithubhotel.com'::text, 4, 'activo'::text),
		('Hotel FitHub Costa', 'La Ceiba', 'Avenida del Mar, La Ceiba', '+504-2200-2200', 'costa@fithubhotel.com', 5, 'activo')
) as seed_rows (nombre_hotel, ciudad, direccion, telefono, correo_contacto, estrellas, estado)
where not exists (
	select 1 from public.hoteles hotel where hotel.nombre_hotel = seed_rows.nombre_hotel
);

insert into public.tipos_habitacion (
	nombre_tipo,
	descripcion,
	capacidad_base,
	tarifa_base
)
select *
from (
	values
		('Estandar'::text, 'Habitacion comoda para una estancia corta'::text, 2, 65.00::numeric),
		('Deluxe', 'Habitacion amplia con amenidades superiores', 3, 95.00::numeric),
		('Suite', 'Suite con sala privada y vista premium', 4, 150.00::numeric)
) as seed_rows (nombre_tipo, descripcion, capacidad_base, tarifa_base)
where not exists (
	select 1 from public.tipos_habitacion tipo where tipo.nombre_tipo = seed_rows.nombre_tipo
);

insert into public.huespedes (
	nombre_completo,
	correo,
	telefono,
	documento_identidad,
	ciudad,
	direccion
)
select *
from (
	values
		('Juan Perez'::text, 'juan.perez@example.com'::text, '+504-9999-1111'::text, '0801-1990-00001'::text, 'Tegucigalpa'::text, 'Colonia Palmira'::text),
		('Maria Lopez', 'maria.lopez@example.com', '+504-9999-2222', '0801-1988-00002', 'San Pedro Sula', 'Barrio Rio de Piedras'),
		('Carlos Ruiz', 'carlos.ruiz@example.com', '+504-9999-3333', '0801-1992-00003', 'La Ceiba', 'Zona Viva')
) as seed_rows (nombre_completo, correo, telefono, documento_identidad, ciudad, direccion)
where not exists (
	select 1 from public.huespedes huesped where lower(huesped.correo) = lower(seed_rows.correo)
);

insert into public.personal_hotel (
	id_hotel,
	nombre_completo,
	correo,
	telefono,
	rol,
	estado
)
select *
from (
	values
		((select id_hotel from public.hoteles where nombre_hotel = 'Hotel FitHub Centro'), 'Ana Gomez'::text, 'ana.gomez@fithubhotel.com'::text, '+504-8888-1100'::text, 'recepcion'::text, 'activo'::text),
		((select id_hotel from public.hoteles where nombre_hotel = 'Hotel FitHub Centro'), 'Luis Diaz', 'luis.diaz@fithubhotel.com', '+504-8888-2200', 'gerencia', 'activo'),
		((select id_hotel from public.hoteles where nombre_hotel = 'Hotel FitHub Costa'), 'Elena Rivera', 'elena.rivera@fithubhotel.com', '+504-8888-3300', 'recepcion', 'activo')
) as seed_rows (id_hotel, nombre_completo, correo, telefono, rol, estado)
where not exists (
	select 1 from public.personal_hotel personal where lower(personal.correo) = lower(seed_rows.correo)
);

insert into public.habitaciones (
	id_hotel,
	id_tipo_habitacion,
	codigo_habitacion,
	nombre_habitacion,
	piso,
	capacidad,
	tarifa_noche,
	estado
)
select *
from (
	values
		(
			(select id_hotel from public.hoteles where nombre_hotel = 'Hotel FitHub Centro'),
			(select id_tipo_habitacion from public.tipos_habitacion where nombre_tipo = 'Estandar'),
			'101'::text,
			'Habitacion 101'::text,
			1,
			2,
			65.00::numeric,
			'disponible'::text
		),
		(
			(select id_hotel from public.hoteles where nombre_hotel = 'Hotel FitHub Centro'),
			(select id_tipo_habitacion from public.tipos_habitacion where nombre_tipo = 'Deluxe'),
			'205',
			'Habitacion 205',
			2,
			3,
			95.00::numeric,
			'disponible'
		),
		(
			(select id_hotel from public.hoteles where nombre_hotel = 'Hotel FitHub Costa'),
			(select id_tipo_habitacion from public.tipos_habitacion where nombre_tipo = 'Suite'),
			'12A',
			'Suite Vista Mar 12A',
			1,
			4,
			150.00::numeric,
			'disponible'
		)
) as seed_rows (id_hotel, id_tipo_habitacion, codigo_habitacion, nombre_habitacion, piso, capacidad, tarifa_noche, estado)
where not exists (
	select 1
	from public.habitaciones habitacion
	where habitacion.id_hotel = seed_rows.id_hotel
	  and habitacion.codigo_habitacion = seed_rows.codigo_habitacion
);

insert into public.reservas_hotel (
	id_huesped,
	id_hotel,
	id_habitacion,
	check_in,
	check_out,
	adultos,
	ninos,
	estado,
	origen_reserva,
	total_reserva,
	anticipo,
	observaciones
)
select *
from (
	values
		(
			(select id_huesped from public.huespedes where correo = 'juan.perez@example.com'),
			(select id_hotel from public.hoteles where nombre_hotel = 'Hotel FitHub Centro'),
			(select id_habitacion from public.habitaciones where codigo_habitacion = '101' and id_hotel = (select id_hotel from public.hoteles where nombre_hotel = 'Hotel FitHub Centro')),
			'2026-04-10 15:00:00'::timestamptz,
			'2026-04-12 12:00:00'::timestamptz,
			2,
			0,
			'confirmada'::text,
			'web'::text,
			130.00::numeric,
			65.00::numeric,
			'Late check-in solicitado'::text
		),
		(
			(select id_huesped from public.huespedes where correo = 'maria.lopez@example.com'),
			(select id_hotel from public.hoteles where nombre_hotel = 'Hotel FitHub Costa'),
			(select id_habitacion from public.habitaciones where codigo_habitacion = '12A' and id_hotel = (select id_hotel from public.hoteles where nombre_hotel = 'Hotel FitHub Costa')),
			'2026-04-18 15:00:00'::timestamptz,
			'2026-04-20 12:00:00'::timestamptz,
			2,
			1,
			'pendiente'::text,
			'web'::text,
			300.00::numeric,
			100.00::numeric,
			'Requiere cuna adicional'::text
		)
) as seed_rows (id_huesped, id_hotel, id_habitacion, check_in, check_out, adultos, ninos, estado, origen_reserva, total_reserva, anticipo, observaciones)
where not exists (
	select 1
	from public.reservas_hotel reserva
	where reserva.id_huesped = seed_rows.id_huesped
	  and reserva.id_habitacion = seed_rows.id_habitacion
	  and reserva.check_in = seed_rows.check_in
);

insert into public.pagos_hotel (
	id_reserva_hotel,
	monto,
	metodo_pago,
	referencia,
	fecha_pago,
	estado
)
select *
from (
	values
		(
			(select id_reserva_hotel from public.reservas_hotel where observaciones = 'Late check-in solicitado' limit 1),
			65.00::numeric,
			'tarjeta'::text,
			'FH-RES-1001'::text,
			'2026-04-01 09:30:00'::timestamptz,
			'aplicado'::text
		),
		(
			(select id_reserva_hotel from public.reservas_hotel where observaciones = 'Requiere cuna adicional' limit 1),
			100.00::numeric,
			'transferencia'::text,
			'FH-RES-1002'::text,
			'2026-04-05 13:00:00'::timestamptz,
			'aplicado'::text
		)
) as seed_rows (id_reserva_hotel, monto, metodo_pago, referencia, fecha_pago, estado)
where not exists (
	select 1 from public.pagos_hotel pago where pago.referencia = seed_rows.referencia
);

insert into public.bloqueos_habitacion (
	id_habitacion,
	fecha_inicio,
	fecha_fin,
	motivo
)
select *
from (
	values
		(
			(select id_habitacion from public.habitaciones where codigo_habitacion = '205' limit 1),
			'2026-04-25 08:00:00'::timestamptz,
			'2026-04-26 18:00:00'::timestamptz,
			'Mantenimiento preventivo'::text
		)
) as seed_rows (id_habitacion, fecha_inicio, fecha_fin, motivo)
where not exists (
	select 1
	from public.bloqueos_habitacion bloqueo
	where bloqueo.id_habitacion = seed_rows.id_habitacion
	  and bloqueo.fecha_inicio = seed_rows.fecha_inicio
);