-- Seed de ejemplo usando IDs generados automáticamente
-- Inserta personas, sedes, actividades, programaciones, clientes, entrenadores, reservas y pagos

-- NOTA: las columnas UUID usan DEFAULT gen_random_uuid() en el esquema. Aquí no fijamos IDs,
-- sino que enlazamos registros por campos únicos como `correo` o `nombre_sede`.

-- Personas (clientes y entrenadores)
INSERT INTO personas (nombre, correo, direccion_ciudad, fecha_nacimiento)
SELECT *
FROM (
  VALUES
    ('Juan Pérez'::text,'juan.perez@example.com'::text,'Tegucigalpa'::text,'1990-05-12'::date),
    ('María López','maria.lopez@example.com','San Pedro Sula','1988-08-03'::date),
    ('Carlos Ruiz','carlos.ruiz@example.com','La Ceiba','1992-11-21'::date),
    ('Ana Gómez','ana.gomez@example.com','Tegucigalpa','1985-02-10'::date),
    ('Luis Díaz','luis.diaz@example.com','San Pedro Sula','1995-07-17'::date)
) AS seed_rows (nombre, correo, direccion_ciudad, fecha_nacimiento)
WHERE NOT EXISTS (
  SELECT 1 FROM personas p WHERE lower(p.correo) = lower(seed_rows.correo)
);

UPDATE personas p
SET
  nombre = seed_rows.nombre,
  direccion_ciudad = seed_rows.direccion_ciudad,
  fecha_nacimiento = seed_rows.fecha_nacimiento
FROM (
  VALUES
    ('Juan Pérez'::text,'juan.perez@example.com'::text,'Tegucigalpa'::text,'1990-05-12'::date),
    ('María López','maria.lopez@example.com','San Pedro Sula','1988-08-03'::date),
    ('Carlos Ruiz','carlos.ruiz@example.com','La Ceiba','1992-11-21'::date),
    ('Ana Gómez','ana.gomez@example.com','Tegucigalpa','1985-02-10'::date),
    ('Luis Díaz','luis.diaz@example.com','San Pedro Sula','1995-07-17'::date)
) AS seed_rows (nombre, correo, direccion_ciudad, fecha_nacimiento)
WHERE lower(p.correo) = lower(seed_rows.correo);

-- Sedes
INSERT INTO sedes (nombre_sede, ubicacion)
SELECT *
FROM (
  VALUES
    ('Multiplaza'::text,'Multiplaza, Tegucigalpa'::text),
    ('City Mall','City Mall, San Pedro Sula')
) AS seed_rows (nombre_sede, ubicacion)
WHERE NOT EXISTS (
  SELECT 1 FROM sedes s WHERE s.nombre_sede = seed_rows.nombre_sede
);

UPDATE sedes s
SET ubicacion = seed_rows.ubicacion
FROM (
  VALUES
    ('Multiplaza'::text,'Multiplaza, Tegucigalpa'::text),
    ('City Mall','City Mall, San Pedro Sula')
) AS seed_rows (nombre_sede, ubicacion)
WHERE s.nombre_sede = seed_rows.nombre_sede;

-- Actividades
INSERT INTO actividades (nombre_actividad, descripcion, tipo)
SELECT *
FROM (
  VALUES
    ('Spinning'::text,'Clase de ciclismo indoor'::text,'Clase grupal'::text),
    ('Yoga','Clase de yoga nivel intermedio','Clase grupal'),
    ('Entrenamiento Personal','Sesión 1:1 con entrenador','Servicio')
) AS seed_rows (nombre_actividad, descripcion, tipo)
WHERE NOT EXISTS (
  SELECT 1 FROM actividades a WHERE a.nombre_actividad = seed_rows.nombre_actividad
);

UPDATE actividades a
SET
  descripcion = seed_rows.descripcion,
  tipo = seed_rows.tipo
FROM (
  VALUES
    ('Spinning'::text,'Clase de ciclismo indoor'::text,'Clase grupal'::text),
    ('Yoga','Clase de yoga nivel intermedio','Clase grupal'),
    ('Entrenamiento Personal','Sesión 1:1 con entrenador','Servicio')
) AS seed_rows (nombre_actividad, descripcion, tipo)
WHERE a.nombre_actividad = seed_rows.nombre_actividad;

-- Entrenadores (referencian personas por correo)
INSERT INTO entrenadores (id_persona, especialidad, estado_laboral)
SELECT id_persona, 'Spinning', 'Activo' FROM personas WHERE correo = 'ana.gomez@example.com'
UNION ALL
SELECT id_persona, 'Yoga', 'Activo' FROM personas WHERE correo = 'luis.diaz@example.com'
EXCEPT
SELECT id_persona, especialidad, estado_laboral FROM entrenadores;

UPDATE entrenadores e
SET
  especialidad = seed_rows.especialidad,
  estado_laboral = seed_rows.estado_laboral
FROM (
  SELECT id_persona, 'Spinning'::text AS especialidad, 'Activo'::text AS estado_laboral FROM personas WHERE correo = 'ana.gomez@example.com'
  UNION ALL
  SELECT id_persona, 'Yoga', 'Activo' FROM personas WHERE correo = 'luis.diaz@example.com'
) AS seed_rows
WHERE e.id_persona = seed_rows.id_persona;

-- Clientes (referencian personas)
INSERT INTO clientes (id_persona, fecha_registro)
SELECT id_persona, CURRENT_DATE - INTERVAL '120 days' FROM personas WHERE correo = 'juan.perez@example.com'
UNION ALL
SELECT id_persona, CURRENT_DATE - INTERVAL '90 days' FROM personas WHERE correo = 'maria.lopez@example.com'
UNION ALL
SELECT id_persona, CURRENT_DATE - INTERVAL '30 days' FROM personas WHERE correo = 'carlos.ruiz@example.com'
EXCEPT
SELECT id_persona, fecha_registro::timestamp without time zone FROM clientes;

UPDATE clientes c
SET fecha_registro = seed_rows.fecha_registro
FROM (
  SELECT id_persona, (CURRENT_DATE - INTERVAL '120 days')::date AS fecha_registro FROM personas WHERE correo = 'juan.perez@example.com'
  UNION ALL
  SELECT id_persona, (CURRENT_DATE - INTERVAL '90 days')::date FROM personas WHERE correo = 'maria.lopez@example.com'
  UNION ALL
  SELECT id_persona, (CURRENT_DATE - INTERVAL '30 days')::date FROM personas WHERE correo = 'carlos.ruiz@example.com'
) AS seed_rows
WHERE c.id_persona = seed_rows.id_persona;

-- Programación de actividades (usando subselects para obtener los IDs generados)
INSERT INTO programacion_actividades (id_sede, id_actividad, id_entrenador, horario, cupo_maximo, costo)
SELECT *
FROM (
  VALUES
    (
      (SELECT id_sede FROM sedes WHERE nombre_sede = 'Multiplaza'),
      (SELECT id_actividad FROM actividades WHERE nombre_actividad = 'Spinning'),
      (SELECT id_persona FROM personas WHERE correo = 'ana.gomez@example.com'),
      '2026-03-15 08:00:00'::timestamptz, 20, 5.00
    ),
    (
      (SELECT id_sede FROM sedes WHERE nombre_sede = 'City Mall'),
      (SELECT id_actividad FROM actividades WHERE nombre_actividad = 'Yoga'),
      (SELECT id_persona FROM personas WHERE correo = 'luis.diaz@example.com'),
      '2026-03-15 09:00:00'::timestamptz, 25, 4.00
    ),
    (
      (SELECT id_sede FROM sedes WHERE nombre_sede = 'Multiplaza'),
      (SELECT id_actividad FROM actividades WHERE nombre_actividad = 'Entrenamiento Personal'),
      (SELECT id_persona FROM personas WHERE correo = 'ana.gomez@example.com'),
      '2026-03-15 18:30:00'::timestamptz, 5, 20.00
    )
) AS seed_rows (id_sede, id_actividad, id_entrenador, horario, cupo_maximo, costo)
WHERE NOT EXISTS (
  SELECT 1
  FROM programacion_actividades programacion
  WHERE programacion.id_sede = seed_rows.id_sede
    AND programacion.id_actividad = seed_rows.id_actividad
    AND programacion.id_entrenador is not distinct from seed_rows.id_entrenador
    AND programacion.horario = seed_rows.horario
);

-- Reservas (referenciando clientes y programaciones por campos únicos)
INSERT INTO reservas (id_cliente, id_programacion, fecha_reserva, precio_aplicado, estado)
VALUES
  (
    (SELECT id_persona FROM clientes JOIN personas USING (id_persona) WHERE personas.correo = 'juan.perez@example.com'),
    (SELECT id_programacion FROM programacion_actividades WHERE horario = '2026-03-15 08:00:00' LIMIT 1),
    '2026-03-10 10:00:00', 5.00, 'confirmada'
  ),
  (
    (SELECT id_persona FROM clientes JOIN personas USING (id_persona) WHERE personas.correo = 'maria.lopez@example.com'),
    (SELECT id_programacion FROM programacion_actividades WHERE horario = '2026-03-15 09:00:00' LIMIT 1),
    '2026-03-11 12:00:00', 4.00, 'confirmada'
  ),
  (
    (SELECT id_persona FROM clientes JOIN personas USING (id_persona) WHERE personas.correo = 'carlos.ruiz@example.com'),
    (SELECT id_programacion FROM programacion_actividades WHERE horario = '2026-03-15 18:30:00' LIMIT 1),
    '2026-03-12 16:30:00', 20.00, 'cancelada'
  );

UPDATE reservas r
SET
  fecha_reserva = seed_rows.fecha_reserva,
  precio_aplicado = seed_rows.precio_aplicado,
  estado = seed_rows.estado
FROM (
  VALUES
    (
      (SELECT id_persona FROM clientes JOIN personas USING (id_persona) WHERE personas.correo = 'juan.perez@example.com'),
      (SELECT id_programacion FROM programacion_actividades WHERE horario = '2026-03-15 08:00:00' LIMIT 1),
      '2026-03-10 10:00:00'::timestamptz, 5.00::numeric, 'confirmada'::text
    ),
    (
      (SELECT id_persona FROM clientes JOIN personas USING (id_persona) WHERE personas.correo = 'maria.lopez@example.com'),
      (SELECT id_programacion FROM programacion_actividades WHERE horario = '2026-03-15 09:00:00' LIMIT 1),
      '2026-03-11 12:00:00'::timestamptz, 4.00::numeric, 'confirmada'::text
    ),
    (
      (SELECT id_persona FROM clientes JOIN personas USING (id_persona) WHERE personas.correo = 'carlos.ruiz@example.com'),
      (SELECT id_programacion FROM programacion_actividades WHERE horario = '2026-03-15 18:30:00' LIMIT 1),
      '2026-03-12 16:30:00'::timestamptz, 20.00::numeric, 'cancelada'::text
    )
) AS seed_rows (id_cliente, id_programacion, fecha_reserva, precio_aplicado, estado)
WHERE r.id_cliente = seed_rows.id_cliente
  AND r.id_programacion = seed_rows.id_programacion;

-- Pagos (ejemplos) — enlazamos por fecha_reserva/cliente para obtener la reserva correspondiente
INSERT INTO pagos (monto, fecha_pago, metodo_pago, referencia, id_reserva)
SELECT *
FROM (
  VALUES
    (
      5.00::numeric, '2026-03-10 10:05:00'::timestamptz, 'tarjeta'::text, 'TX-1001'::text,
      (SELECT id_reserva FROM reservas r JOIN personas p ON r.id_cliente = p.id_persona WHERE p.correo = 'juan.perez@example.com' LIMIT 1)
    ),
    (
      4.00::numeric, '2026-03-11 12:05:00'::timestamptz, 'efectivo'::text, 'TX-1002'::text,
      (SELECT id_reserva FROM reservas r JOIN personas p ON r.id_cliente = p.id_persona WHERE p.correo = 'maria.lopez@example.com' LIMIT 1)
    )
) AS seed_rows (monto, fecha_pago, metodo_pago, referencia, id_reserva)
WHERE NOT EXISTS (
  SELECT 1
  FROM pagos pago
  WHERE pago.referencia = seed_rows.referencia
);

-- Telefonos de personas
INSERT INTO persona_telefonos (id_persona, telefono)
SELECT id_persona, '+504-9999-1111' FROM personas WHERE correo = 'juan.perez@example.com'
UNION ALL
SELECT id_persona, '+504-9999-2222' FROM personas WHERE correo = 'maria.lopez@example.com'
EXCEPT
SELECT id_persona, telefono FROM persona_telefonos;

UPDATE persona_telefonos pt
SET telefono = seed_rows.telefono
FROM (
  SELECT id_persona, '+504-9999-1111'::text AS telefono FROM personas WHERE correo = 'juan.perez@example.com'
  UNION ALL
  SELECT id_persona, '+504-9999-2222' FROM personas WHERE correo = 'maria.lopez@example.com'
) AS seed_rows
WHERE pt.id_persona = seed_rows.id_persona;

-- Configuracion operativa por defecto
INSERT INTO configuracion_operativa (
  id_config,
  ciudad_base,
  horas_anticipacion_reserva,
  umbral_ocupacion,
  auto_confirmar_pagos,
  permitir_edicion_entrenador,
  hora_cierre
)
SELECT *
FROM (
  VALUES
    ('default'::text, 'Tegucigalpa'::text, 12, 85, true, true, '21:00'::text)
) AS seed_rows (
  id_config,
  ciudad_base,
  horas_anticipacion_reserva,
  umbral_ocupacion,
  auto_confirmar_pagos,
  permitir_edicion_entrenador,
  hora_cierre
)
WHERE NOT EXISTS (
  SELECT 1
  FROM configuracion_operativa configuracion
  WHERE configuracion.id_config = seed_rows.id_config
);

UPDATE configuracion_operativa configuracion
SET
  ciudad_base = seed_rows.ciudad_base,
  horas_anticipacion_reserva = seed_rows.horas_anticipacion_reserva,
  umbral_ocupacion = seed_rows.umbral_ocupacion,
  auto_confirmar_pagos = seed_rows.auto_confirmar_pagos,
  permitir_edicion_entrenador = seed_rows.permitir_edicion_entrenador,
  hora_cierre = seed_rows.hora_cierre
FROM (
  VALUES
    ('default'::text, 'Tegucigalpa'::text, 12, 85, true, true, '21:00'::text)
) AS seed_rows (
  id_config,
  ciudad_base,
  horas_anticipacion_reserva,
  umbral_ocupacion,
  auto_confirmar_pagos,
  permitir_edicion_entrenador,
  hora_cierre
)
WHERE configuracion.id_config = seed_rows.id_config;

-- Hoteles
INSERT INTO hoteles (nombre_hotel, ciudad, direccion, estrellas, estado)
SELECT *
FROM (
  VALUES
    ('FitHub Downtown Suites'::text, 'Tegucigalpa'::text, 'Boulevard Centro, Tegucigalpa'::text, 4, 'activo'::text),
    ('FitHub Coast Hotel', 'La Ceiba', 'Avenida del Mar, La Ceiba', 5, 'activo')
) AS seed_rows (nombre_hotel, ciudad, direccion, estrellas, estado)
WHERE NOT EXISTS (
  SELECT 1 FROM hoteles hotel WHERE hotel.nombre_hotel = seed_rows.nombre_hotel
);

UPDATE hoteles hotel
SET
  ciudad = seed_rows.ciudad,
  direccion = seed_rows.direccion,
  estrellas = seed_rows.estrellas,
  estado = seed_rows.estado
FROM (
  VALUES
    ('FitHub Downtown Suites'::text, 'Tegucigalpa'::text, 'Boulevard Centro, Tegucigalpa'::text, 4, 'activo'::text),
    ('FitHub Coast Hotel', 'La Ceiba', 'Avenida del Mar, La Ceiba', 5, 'activo')
) AS seed_rows (nombre_hotel, ciudad, direccion, estrellas, estado)
WHERE hotel.nombre_hotel = seed_rows.nombre_hotel;

-- Habitaciones
INSERT INTO habitaciones (id_hotel, codigo_habitacion, nombre_habitacion, categoria, descripcion, capacidad, tarifa_base, estado)
SELECT *
FROM (
  VALUES
    ((SELECT id_hotel FROM hoteles WHERE nombre_hotel = 'FitHub Downtown Suites'), 'D-101'::text, 'Suite Ejecutiva 101'::text, 'suite'::text, 'Suite con vista urbana'::text, 2, 85.00::numeric, 'disponible'::text),
    ((SELECT id_hotel FROM hoteles WHERE nombre_hotel = 'FitHub Downtown Suites'), 'D-205', 'Habitación Deluxe 205', 'deluxe', 'Habitación con desayuno incluido', 3, 110.00::numeric, 'disponible'),
    ((SELECT id_hotel FROM hoteles WHERE nombre_hotel = 'FitHub Coast Hotel'), 'C-12', 'Suite Vista Mar 12', 'suite', 'Suite con vista al mar y balcón', 2, 150.00::numeric, 'disponible')
) AS seed_rows (id_hotel, codigo_habitacion, nombre_habitacion, categoria, descripcion, capacidad, tarifa_base, estado)
WHERE NOT EXISTS (
  SELECT 1
  FROM habitaciones habitacion
  WHERE habitacion.id_hotel = seed_rows.id_hotel
    AND habitacion.codigo_habitacion = seed_rows.codigo_habitacion
);

-- Reservas hotel de ejemplo
INSERT INTO reservas_hotel (id_huesped, id_habitacion, check_in, check_out, adultos, ninos, estado, total, observaciones)
SELECT *
FROM (
  VALUES
    (
      (SELECT id_persona FROM clientes JOIN personas USING (id_persona) WHERE personas.correo = 'juan.perez@example.com'),
      (SELECT id_habitacion FROM habitaciones WHERE codigo_habitacion = 'D-101' LIMIT 1),
      '2026-04-10 15:00:00'::timestamptz,
      '2026-04-12 12:00:00'::timestamptz,
      2,
      0,
      'confirmada'::text,
      170.00::numeric,
      'Llegada tardía confirmada'::text
    ),
    (
      (SELECT id_persona FROM clientes JOIN personas USING (id_persona) WHERE personas.correo = 'maria.lopez@example.com'),
      (SELECT id_habitacion FROM habitaciones WHERE codigo_habitacion = 'C-12' LIMIT 1),
      '2026-04-18 15:00:00'::timestamptz,
      '2026-04-20 12:00:00'::timestamptz,
      2,
      1,
      'pendiente'::text,
      300.00::numeric,
      'Solicita cuna adicional'::text
    )
) AS seed_rows (id_huesped, id_habitacion, check_in, check_out, adultos, ninos, estado, total, observaciones)
WHERE NOT EXISTS (
  SELECT 1
  FROM reservas_hotel reserva
  WHERE reserva.id_huesped = seed_rows.id_huesped
    AND reserva.id_habitacion = seed_rows.id_habitacion
    AND reserva.check_in = seed_rows.check_in
);

-- FIN seed (IDs generados automáticamente)
