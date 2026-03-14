import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from './db.js';

const app = express();

app.use(cors());
app.use(express.json());

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const asyncHandler = (
  handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>,
) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};

const routeId = (request: Request) => String(request.params.id ?? '');

const personPayloadSchema = z.object({
  nombre: z.string().trim().min(3),
  correo: z.string().trim().email(),
  telefonos: z.array(z.string().trim().min(7)).default([]),
  direccion: z.object({
    ciudad: z.string().trim().optional(),
    colonia: z.string().trim().optional(),
    calle: z.string().trim().optional(),
  }).optional().default({}),
  fechaNacimiento: z.string().date().optional(),
  roles: z.object({
    cliente: z.boolean().default(true),
    entrenador: z.boolean().default(false),
  }),
  especialidad: z.string().trim().optional(),
  estadoLaboral: z.enum(['Activo', 'Inactivo', 'Vacaciones']).optional(),
});

const activityPayloadSchema = z.object({
  nombreActividad: z.string().trim().min(3),
  descripcion: z.string().trim().min(3),
  tipo: z.enum(['Clase grupal', 'Servicio']),
  sedeId: z.string().uuid(),
  entrenadorId: z.string().uuid().nullable().optional(),
  horario: z.string().datetime(),
  cupoMaximo: z.number().int().positive(),
  costo: z.number().min(0),
});

const reservationPayloadSchema = z.object({
  clienteId: z.string().uuid(),
  actividadId: z.string().uuid(),
  fechaReserva: z.string().datetime().optional(),
  estado: z.enum(['creada', 'confirmada', 'cancelada', 'completada']).default('creada'),
  precioAplicado: z.number().min(0).optional(),
  pago: z.object({
    fechaPago: z.string().datetime().optional(),
    metodoPago: z.enum(['efectivo', 'tarjeta', 'transferencia', 'deposito', 'otro']),
    referencia: z.string().trim().min(1).optional(),
  }).optional(),
});

const reservationReschedulePayloadSchema = z.object({
  actividadId: z.string().uuid(),
});

const trainerPayloadSchema = z.object({
  nombre: z.string().trim().min(3),
  correo: z.string().trim().email(),
  fechaNacimiento: z.string().date(),
  especialidad: z.string().trim().min(2),
  estadoLaboral: z.enum(['Activo', 'Inactivo', 'Vacaciones']).default('Activo'),
});

const paymentPayloadSchema = z.object({
  reservaId: z.string().uuid().optional(),
  membresiaId: z.string().uuid().optional(),
  monto: z.number().positive(),
  fechaPago: z.string().datetime().optional(),
  metodoPago: z.enum(['efectivo', 'tarjeta', 'transferencia', 'deposito', 'otro']),
  referencia: z.string().trim().min(1).optional(),
}).refine((payload) => Boolean(payload.reservaId) !== Boolean(payload.membresiaId), {
  message: 'El pago debe asociarse a una reserva o a una membresia, pero no a ambas.',
  path: ['reservaId'],
});

const membershipCheckoutPayloadSchema = z.object({
  clienteId: z.string().uuid(),
  tipoPlan: z.string().trim().min(3),
  fechaPago: z.string().datetime().optional(),
  metodoPago: z.enum(['efectivo', 'tarjeta', 'transferencia', 'deposito', 'otro']),
  referencia: z.string().trim().min(1),
});

const operationalSettingsPayloadSchema = z.object({
  ciudadBase: z.string().trim().min(2),
  horasAnticipacionReserva: z.number().int().min(0),
  umbralOcupacion: z.number().int().min(0).max(100),
  autoConfirmarPagos: z.boolean(),
  permitirEdicionEntrenador: z.boolean(),
  horaCierre: z.string().trim().regex(/^\d{2}:\d{2}$/),
});

type MembershipPlanConfig = {
  label: string;
  cost: number;
  durationMonths?: number;
  durationDays?: number;
};

const membershipPlanCatalog: MembershipPlanConfig[] = [
  { label: 'Semanal', cost: 12, durationDays: 7 },
  { label: 'Quincenal', cost: 22, durationDays: 15 },
  { label: 'Mensual', cost: 30, durationMonths: 1 },
  { label: 'Bimestral', cost: 56, durationMonths: 2 },
  { label: 'Trimestral', cost: 78, durationMonths: 3 },
  { label: 'Semestral', cost: 150, durationMonths: 6 },
  { label: 'Anual', cost: 280, durationMonths: 12 },
];

function normalizePlanName(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function getMembershipPlanConfig(planName: string) {
  const normalized = normalizePlanName(planName);
  return membershipPlanCatalog.find((plan) => {
    const candidate = normalizePlanName(plan.label);
    if (candidate === normalized) return true;
    if (candidate.includes(normalized) || normalized.includes(candidate)) return true;
    return false;
  }) ?? null;
}

function buildMembershipEndDate(startDate: Date, plan: MembershipPlanConfig) {
  const endDate = new Date(startDate);

  if (plan.durationDays) {
    endDate.setDate(endDate.getDate() + plan.durationDays);
    return endDate;
  }

  endDate.setMonth(endDate.getMonth() + (plan.durationMonths ?? 1));
  return endDate;
}

function formatPgError(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const pgError = error as { code?: string; detail?: string; message?: string };
    if (pgError.code === '23505') return new ApiError(409, pgError.detail ?? 'Registro duplicado.');
    if (pgError.code === '23503') return new ApiError(400, pgError.detail ?? 'Referencia invalida.');
    if (pgError.code === '23514') return new ApiError(400, pgError.detail ?? 'Violacion de regla de negocio.');
  }

  return error;
}

async function getPersonById(id: string) {
  const result = await pool.query(
    `
      select
        p.id_persona as id,
        p.nombre,
        p.correo,
        p.direccion_ciudad as ciudad,
        p.direccion_colonia as colonia,
        p.direccion_calle as calle,
        p.fecha_nacimiento as "fechaNacimiento",
        coalesce(array_remove(array_agg(distinct pt.telefono), null), '{}') as telefonos,
        (c.id_persona is not null) as "esCliente",
        (e.id_persona is not null) as "esEntrenador",
        c.fecha_registro as "fechaRegistro",
        e.especialidad,
        e.estado_laboral as "estadoLaboral"
      from public.personas p
      left join public.persona_telefonos pt on pt.id_persona = p.id_persona
      left join public.clientes c on c.id_persona = p.id_persona
      left join public.entrenadores e on e.id_persona = p.id_persona
      where p.id_persona = $1
      group by p.id_persona, c.id_persona, c.fecha_registro, e.id_persona, e.especialidad, e.estado_laboral
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

async function getActivityById(id: string) {
  const result = await pool.query(
    `
      select
        pa.id_programacion as id,
        a.id_actividad as "catalogoId",
        a.nombre_actividad as "nombreActividad",
        a.descripcion,
        a.tipo,
        s.id_sede as "sedeId",
        s.nombre_sede as sede,
        e.id_persona as "entrenadorId",
        p.nombre as entrenador,
        pa.horario,
        pa.cupo_maximo as "cupoMaximo",
        pa.costo,
        count(r.id_reserva) filter (where r.estado <> 'cancelada')::int as inscritos
      from public.programacion_actividades pa
      join public.actividades a on a.id_actividad = pa.id_actividad
      left join public.sedes s on s.id_sede = pa.id_sede
      left join public.entrenadores e on e.id_persona = pa.id_entrenador
      left join public.personas p on p.id_persona = e.id_persona
      left join public.reservas r on r.id_programacion = pa.id_programacion
      where pa.id_programacion = $1
      group by pa.id_programacion, a.id_actividad, s.id_sede, e.id_persona, p.nombre
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

async function getReservationById(id: string) {
  const result = await pool.query(
    `
      select
        r.id_reserva as id,
        r.id_cliente as "clienteId",
        cliente.nombre as cliente,
        r.id_programacion as "actividadId",
        a.nombre_actividad as actividad,
        r.fecha_reserva as "fechaReserva",
        pa.horario,
        r.estado,
        r.precio_aplicado as "precioAplicado",
        s.nombre_sede as sede
      from public.reservas r
      left join public.personas cliente on cliente.id_persona = r.id_cliente
      left join public.programacion_actividades pa on pa.id_programacion = r.id_programacion
      left join public.actividades a on a.id_actividad = pa.id_actividad
      left join public.sedes s on s.id_sede = pa.id_sede
      where r.id_reserva = $1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

async function getPaymentById(id: string) {
  const result = await pool.query(
    `
      select
        pg.id_pago as id,
        pg.monto,
        pg.fecha_pago as "fechaPago",
        pg.metodo_pago as "metodoPago",
        pg.referencia,
        pg.id_reserva as "reservaId",
        pg.id_membresia as "membresiaId",
        persona.nombre as cliente,
        actividad.nombre_actividad as actividad,
        membresia.tipo_plan as "tipoPlan"
      from public.pagos pg
      left join public.reservas r on r.id_reserva = pg.id_reserva
      left join public.personas persona on persona.id_persona = r.id_cliente
      left join public.programacion_actividades pa on pa.id_programacion = r.id_programacion
      left join public.actividades actividad on actividad.id_actividad = pa.id_actividad
      left join public.membresias membresia on membresia.id_membresia = pg.id_membresia
      where pg.id_pago = $1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

async function ensureTrainerScheduleAvailability(trainerId: string | null | undefined, horario: string, excludeId?: string) {
  if (!trainerId) return;

  const result = await pool.query(
    `
      select count(*)::int as total
      from public.programacion_actividades
      where id_entrenador = $1
        and horario = $2
        and ($3::uuid is null or id_programacion <> $3::uuid)
    `,
    [trainerId, horario, excludeId ?? null],
  );

  if ((result.rows[0]?.total ?? 0) > 0) {
    throw new ApiError(409, 'El entrenador ya tiene una actividad asignada en ese horario.');
  }
}

async function ensureReservationRules(clienteId: string, actividadId: string, excludeId?: string) {
  const clientResult = await pool.query('select 1 from public.clientes where id_persona = $1', [clienteId]);
  if (clientResult.rowCount === 0) {
    throw new ApiError(400, 'La persona indicada no esta registrada como cliente.');
  }

  const activityResult = await pool.query(
    `
      select id_programacion, horario, cupo_maximo
      from public.programacion_actividades
      where id_programacion = $1
    `,
    [actividadId],
  );

  const activity = activityResult.rows[0];
  if (!activity) {
    throw new ApiError(404, 'La actividad programada no existe.');
  }

  if (new Date(activity.horario).getTime() < Date.now() && !excludeId) {
    throw new ApiError(400, 'No se puede reservar una actividad con horario en el pasado.');
  }

  if (!excludeId) {
    const configResult = await pool.query(
      'select horas_anticipacion_reserva from public.configuracion_operativa where id_config = $1 limit 1',
      ['default'],
    );

    const leadHours = Number(configResult.rows[0]?.horas_anticipacion_reserva ?? 0);
    const minimumAllowedTime = Date.now() + (leadHours * 60 * 60 * 1000);
    if (new Date(activity.horario).getTime() < minimumAllowedTime) {
      throw new ApiError(400, 'La actividad no cumple la anticipación mínima de reserva configurada.');
    }
  }

  const duplicateResult = await pool.query(
    `
      select count(*)::int as total
      from public.reservas
      where id_cliente = $1
        and id_programacion = $2
        and ($3::uuid is null or id_reserva <> $3::uuid)
    `,
    [clienteId, actividadId, excludeId ?? null],
  );

  if ((duplicateResult.rows[0]?.total ?? 0) > 0) {
    throw new ApiError(409, 'Ya existe una reserva para este cliente en la misma actividad y horario.');
  }

  const occupancyResult = await pool.query(
    `
      select count(*)::int as total
      from public.reservas
      where id_programacion = $1
        and estado <> 'cancelada'
        and ($2::uuid is null or id_reserva <> $2::uuid)
    `,
    [actividadId, excludeId ?? null],
  );

  if ((occupancyResult.rows[0]?.total ?? 0) >= activity.cupo_maximo) {
    throw new ApiError(409, 'No hay cupos disponibles para esta actividad.');
  }
}

async function ensurePaymentRules(payload: z.infer<typeof paymentPayloadSchema>, excludeId?: string) {
  if (payload.reservaId) {
    const reservationResult = await pool.query(
      'select id_reserva, precio_aplicado, estado from public.reservas where id_reserva = $1',
      [payload.reservaId],
    );

    const reservation = reservationResult.rows[0];
    if (!reservation) throw new ApiError(404, 'La reserva indicada no existe.');
    if (reservation.estado === 'cancelada') throw new ApiError(400, 'No se puede registrar un pago sobre una reserva cancelada.');

    const totalPaidResult = await pool.query(
      `
        select coalesce(sum(monto), 0)::numeric as total
        from public.pagos
        where id_reserva = $1
          and ($2::uuid is null or id_pago <> $2::uuid)
      `,
      [payload.reservaId, excludeId ?? null],
    );

    const totalPaid = Number(totalPaidResult.rows[0]?.total ?? 0);
    if (totalPaid + payload.monto > Number(reservation.precio_aplicado)) {
      throw new ApiError(400, 'El pago supera el saldo de la reserva.');
    }
  }

  if (payload.membresiaId) {
    const membershipResult = await pool.query(
      'select id_membresia, costo, estado from public.membresias where id_membresia = $1',
      [payload.membresiaId],
    );

    const membership = membershipResult.rows[0];
    if (!membership) throw new ApiError(404, 'La membresia indicada no existe.');
    if (membership.estado === 'cancelada') throw new ApiError(400, 'No se puede registrar un pago sobre una membresia cancelada.');

    const totalPaidResult = await pool.query(
      `
        select coalesce(sum(monto), 0)::numeric as total
        from public.pagos
        where id_membresia = $1
          and ($2::uuid is null or id_pago <> $2::uuid)
      `,
      [payload.membresiaId, excludeId ?? null],
    );

    const totalPaid = Number(totalPaidResult.rows[0]?.total ?? 0);
    if (totalPaid + payload.monto > Number(membership.costo)) {
      throw new ApiError(400, 'El pago supera el saldo de la membresia.');
    }
  }
}

async function ensureReservationRescheduleRules(reservationId: string, actividadId: string) {
  const reservationResult = await pool.query(
    'select id_reserva, id_cliente, id_programacion, estado from public.reservas where id_reserva = $1',
    [reservationId],
  );

  const reservation = reservationResult.rows[0];
  if (!reservation) throw new ApiError(404, 'Reserva no encontrada.');
  if (!reservation.id_cliente) throw new ApiError(400, 'La reserva no tiene un cliente asociado.');
  if (reservation.estado === 'cancelada') throw new ApiError(400, 'No se puede reprogramar una reserva cancelada.');
  if (reservation.id_programacion === actividadId) throw new ApiError(400, 'Selecciona una actividad distinta para reprogramar la reserva.');

  const activityResult = await pool.query(
    `
      select id_programacion, horario, cupo_maximo, costo
      from public.programacion_actividades
      where id_programacion = $1
    `,
    [actividadId],
  );

  const activity = activityResult.rows[0];
  if (!activity) throw new ApiError(404, 'La actividad programada no existe.');

  const configResult = await pool.query(
    'select horas_anticipacion_reserva from public.configuracion_operativa where id_config = $1 limit 1',
    ['default'],
  );
  const leadHours = Number(configResult.rows[0]?.horas_anticipacion_reserva ?? 0);
  const minimumAllowedTime = Date.now() + (leadHours * 60 * 60 * 1000);
  if (new Date(activity.horario).getTime() < minimumAllowedTime) {
    throw new ApiError(400, 'La nueva actividad no cumple la anticipación mínima de reserva configurada.');
  }

  const occupancyResult = await pool.query(
    `
      select count(*)::int as total
      from public.reservas
      where id_programacion = $1
        and estado <> 'cancelada'
        and id_reserva <> $2
    `,
    [actividadId, reservationId],
  );

  if ((occupancyResult.rows[0]?.total ?? 0) >= Number(activity.cupo_maximo)) {
    throw new ApiError(409, 'No hay cupos disponibles para la nueva actividad.');
  }

  const duplicateResult = await pool.query(
    `
      select count(*)::int as total
      from public.reservas
      where id_cliente = $1
        and id_programacion = $2
        and estado <> 'cancelada'
        and id_reserva <> $3
    `,
    [reservation.id_cliente, actividadId, reservationId],
  );

  if ((duplicateResult.rows[0]?.total ?? 0) > 0) {
    throw new ApiError(409, 'Ya existe una reserva activa para este cliente en la actividad seleccionada.');
  }

  const totalPaidResult = await pool.query(
    'select coalesce(sum(monto), 0)::numeric as total from public.pagos where id_reserva = $1',
    [reservationId],
  );
  const totalPaid = Number(totalPaidResult.rows[0]?.total ?? 0);
  if (totalPaid > Number(activity.costo)) {
    throw new ApiError(400, 'No se puede reprogramar a una actividad con costo menor porque la reserva ya tiene pagos asociados.');
  }

  return {
    reservation,
    activity,
  };
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'fithub-api' });
});

app.get('/api/bootstrap', asyncHandler(async (_request, response) => {
  const [sedes, clientes, entrenadores, membresias] = await Promise.all([
    pool.query('select id_sede as id, nombre_sede as nombre from public.sedes order by nombre_sede asc'),
    pool.query(`
      select c.id_persona as id, p.nombre
      from public.clientes c
      join public.personas p on p.id_persona = c.id_persona
      order by p.nombre asc
    `),
    pool.query(`
      select e.id_persona as id, p.nombre
      from public.entrenadores e
      join public.personas p on p.id_persona = e.id_persona
      order by p.nombre asc
    `),
    pool.query('select id_membresia as id, tipo_plan as nombre, id_cliente as "clienteId" from public.membresias order by created_at desc'),
  ]);

  response.json({
    sedes: sedes.rows,
    clientes: clientes.rows,
    entrenadores: entrenadores.rows,
    membresias: membresias.rows,
  });
}));

app.get('/api/operational-data', asyncHandler(async (_request, response) => {
  const [
    personas,
    telefonos,
    clientes,
    membresias,
    entrenadores,
    sedes,
    actividades,
    programaciones,
    reservas,
    pagos,
    configuracionOperativa,
  ] = await Promise.all([
    pool.query('select * from public.personas order by created_at asc'),
    pool.query('select * from public.persona_telefonos order by id_persona asc'),
    pool.query('select * from public.clientes order by fecha_registro asc nulls last, id_persona asc'),
    pool.query('select * from public.membresias order by fecha_vencimiento desc, created_at desc'),
    pool.query('select * from public.entrenadores order by id_persona asc'),
    pool.query('select * from public.sedes order by nombre_sede asc'),
    pool.query('select * from public.actividades order by nombre_actividad asc'),
    pool.query('select * from public.programacion_actividades order by horario asc'),
    pool.query('select * from public.reservas order by created_at desc'),
    pool.query('select * from public.pagos order by fecha_pago desc'),
    pool.query('select * from public.configuracion_operativa where id_config = $1 limit 1', ['default']),
  ]);

  response.json({
    personas: personas.rows,
    telefonos: telefonos.rows,
    clientes: clientes.rows,
    membresias: membresias.rows,
    entrenadores: entrenadores.rows,
    sedes: sedes.rows,
    actividades: actividades.rows,
    programaciones: programaciones.rows,
    reservas: reservas.rows,
    pagos: pagos.rows,
    configuracionOperativa: configuracionOperativa.rows,
  });
}));

app.put('/api/configuracion-operativa', asyncHandler(async (request, response) => {
  const payload = operationalSettingsPayloadSchema.parse(request.body);

  await pool.query(
    `
      insert into public.configuracion_operativa (
        id_config,
        ciudad_base,
        horas_anticipacion_reserva,
        umbral_ocupacion,
        auto_confirmar_pagos,
        permitir_edicion_entrenador,
        hora_cierre
      )
      values ('default', $1, $2, $3, $4, $5, $6)
      on conflict (id_config)
      do update set
        ciudad_base = excluded.ciudad_base,
        horas_anticipacion_reserva = excluded.horas_anticipacion_reserva,
        umbral_ocupacion = excluded.umbral_ocupacion,
        auto_confirmar_pagos = excluded.auto_confirmar_pagos,
        permitir_edicion_entrenador = excluded.permitir_edicion_entrenador,
        hora_cierre = excluded.hora_cierre
    `,
    [
      payload.ciudadBase,
      payload.horasAnticipacionReserva,
      payload.umbralOcupacion,
      payload.autoConfirmarPagos,
      payload.permitirEdicionEntrenador,
      payload.horaCierre,
    ],
  );

  response.json({ ok: true });
}));

app.get('/api/personas', asyncHandler(async (request, response) => {
  const role = typeof request.query.role === 'string' ? request.query.role : null;
  const search = typeof request.query.search === 'string' ? request.query.search.trim().toLowerCase() : '';

  const result = await pool.query(
    `
      select
        p.id_persona as id,
        p.nombre,
        p.correo,
        p.direccion_ciudad as ciudad,
        p.direccion_colonia as colonia,
        p.direccion_calle as calle,
        p.fecha_nacimiento as "fechaNacimiento",
        coalesce(array_remove(array_agg(distinct pt.telefono), null), '{}') as telefonos,
        (c.id_persona is not null) as "esCliente",
        (e.id_persona is not null) as "esEntrenador",
        c.fecha_registro as "fechaRegistro",
        e.especialidad,
        e.estado_laboral as "estadoLaboral"
      from public.personas p
      left join public.persona_telefonos pt on pt.id_persona = p.id_persona
      left join public.clientes c on c.id_persona = p.id_persona
      left join public.entrenadores e on e.id_persona = p.id_persona
      where (
        $1::text = ''
        or lower(p.nombre) like '%' || $1 || '%'
        or lower(p.correo) like '%' || $1 || '%'
      )
      group by p.id_persona, c.id_persona, c.fecha_registro, e.id_persona, e.especialidad, e.estado_laboral
      order by p.nombre asc
    `,
    [search],
  );

  const rows = result.rows.filter((row: { esCliente: boolean; esEntrenador: boolean }) => {
    if (role === 'cliente') return row.esCliente;
    if (role === 'entrenador') return row.esEntrenador;
    if (role === 'persona') return !row.esCliente && !row.esEntrenador;
    return true;
  });

  response.json(rows);
}));

app.get('/api/personas/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const row = await getPersonById(id);
  if (!row) throw new ApiError(404, 'Persona no encontrada.');
  response.json(row);
}));

app.post('/api/personas', asyncHandler(async (request, response) => {
  const payload = personPayloadSchema.parse(request.body);

  const person = await withTransaction(async (client) => {
    const personaResult = await client.query(
      `
        insert into public.personas (
          nombre,
          correo,
          direccion_ciudad,
          direccion_colonia,
          direccion_calle,
          fecha_nacimiento
        )
        values ($1, $2, $3, $4, $5, $6)
        returning id_persona
      `,
      [
        payload.nombre,
        payload.correo,
        payload.direccion.ciudad ?? null,
        payload.direccion.colonia ?? null,
        payload.direccion.calle ?? null,
        payload.fechaNacimiento ?? null,
      ],
    );

    const personId = personaResult.rows[0].id_persona as string;

    for (const phone of payload.telefonos) {
      await client.query(
        'insert into public.persona_telefonos (id_persona, telefono) values ($1, $2)',
        [personId, phone],
      );
    }

    if (payload.roles.cliente) {
      await client.query('insert into public.clientes (id_persona) values ($1)', [personId]);
    }

    if (payload.roles.entrenador) {
      await client.query(
        'insert into public.entrenadores (id_persona, especialidad, estado_laboral) values ($1, $2, $3)',
        [personId, payload.especialidad ?? null, payload.estadoLaboral ?? 'Activo'],
      );
    }

    return personId;
  });

  const created = await getPersonById(person);
  response.status(201).json(created);
}));

app.put('/api/personas/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const payload = personPayloadSchema.parse(request.body);
  const existing = await getPersonById(id);
  if (!existing) throw new ApiError(404, 'Persona no encontrada.');

  await withTransaction(async (client) => {
    await client.query(
      `
        update public.personas
        set nombre = $2,
            correo = $3,
            direccion_ciudad = $4,
            direccion_colonia = $5,
            direccion_calle = $6,
            fecha_nacimiento = $7
        where id_persona = $1
      `,
      [
        id,
        payload.nombre,
        payload.correo,
        payload.direccion.ciudad ?? null,
        payload.direccion.colonia ?? null,
        payload.direccion.calle ?? null,
        payload.fechaNacimiento ?? null,
      ],
    );

    await client.query('delete from public.persona_telefonos where id_persona = $1', [id]);
    for (const phone of payload.telefonos) {
      await client.query(
        'insert into public.persona_telefonos (id_persona, telefono) values ($1, $2)',
        [id, phone],
      );
    }

    if (payload.roles.cliente) {
      await client.query(
        'insert into public.clientes (id_persona) values ($1) on conflict (id_persona) do nothing',
          [id],
      );
    } else {
      await client.query('delete from public.clientes where id_persona = $1', [id]);
    }

    if (payload.roles.entrenador) {
      const trainerExists = await client.query('select 1 from public.entrenadores where id_persona = $1', [id]);
      if (trainerExists.rowCount === 0) {
        await client.query(
          'insert into public.entrenadores (id_persona, especialidad, estado_laboral) values ($1, $2, $3)',
          [id, payload.especialidad ?? null, payload.estadoLaboral ?? 'Activo'],
        );
      } else {
        await client.query(
          'update public.entrenadores set especialidad = $2, estado_laboral = $3 where id_persona = $1',
          [id, payload.especialidad ?? null, payload.estadoLaboral ?? 'Activo'],
        );
      }
    } else {
      await client.query('delete from public.entrenadores where id_persona = $1', [id]);
    }
  });

  const updated = await getPersonById(id);
  response.json(updated);
}));

app.delete('/api/personas/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const existing = await getPersonById(id);
  if (!existing) throw new ApiError(404, 'Persona no encontrada.');

  await pool.query('delete from public.personas where id_persona = $1', [id]);
  response.status(204).send();
}));

app.post('/api/entrenadores', asyncHandler(async (request, response) => {
  const payload = trainerPayloadSchema.parse(request.body);

  const trainerId = await withTransaction(async (client) => {
    const personResult = await client.query(
      `
        insert into public.personas (nombre, correo, fecha_nacimiento)
        values ($1, $2, $3)
        returning id_persona
      `,
      [payload.nombre, payload.correo, payload.fechaNacimiento],
    );

    const personId = personResult.rows[0].id_persona as string;
    await client.query(
      `
        insert into public.entrenadores (id_persona, especialidad, estado_laboral)
        values ($1, $2, $3)
      `,
      [personId, payload.especialidad, payload.estadoLaboral],
    );

    return personId;
  });

  const trainer = await getPersonById(trainerId);
  response.status(201).json(trainer);
}));

app.put('/api/entrenadores/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const payload = trainerPayloadSchema.parse(request.body);
  const existing = await pool.query('select 1 from public.entrenadores where id_persona = $1', [id]);
  if (existing.rowCount === 0) throw new ApiError(404, 'Entrenador no encontrado.');

  await withTransaction(async (client) => {
    await client.query(
      `
        update public.personas
        set nombre = $2,
            correo = $3,
            fecha_nacimiento = $4
        where id_persona = $1
      `,
      [id, payload.nombre, payload.correo, payload.fechaNacimiento],
    );

    await client.query(
      `
        update public.entrenadores
        set especialidad = $2,
            estado_laboral = $3
        where id_persona = $1
      `,
      [id, payload.especialidad, payload.estadoLaboral],
    );
  });

  const trainer = await getPersonById(id);
  response.json(trainer);
}));

app.delete('/api/entrenadores/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const existing = await pool.query('select 1 from public.entrenadores where id_persona = $1', [id]);
  if (existing.rowCount === 0) throw new ApiError(404, 'Entrenador no encontrado.');

  await withTransaction(async (client) => {
    await client.query('update public.programacion_actividades set id_entrenador = null where id_entrenador = $1', [id]);
    await client.query('delete from public.entrenadores where id_persona = $1', [id]);
  });

  response.status(204).send();
}));

app.get('/api/actividades', asyncHandler(async (_request, response) => {
  const result = await pool.query(
    `
      select
        pa.id_programacion as id,
        a.id_actividad as "catalogoId",
        a.nombre_actividad as "nombreActividad",
        a.descripcion,
        a.tipo,
        s.id_sede as "sedeId",
        s.nombre_sede as sede,
        e.id_persona as "entrenadorId",
        p.nombre as entrenador,
        pa.horario,
        pa.cupo_maximo as "cupoMaximo",
        pa.costo,
        count(r.id_reserva) filter (where r.estado <> 'cancelada')::int as inscritos
      from public.programacion_actividades pa
      join public.actividades a on a.id_actividad = pa.id_actividad
      left join public.sedes s on s.id_sede = pa.id_sede
      left join public.entrenadores e on e.id_persona = pa.id_entrenador
      left join public.personas p on p.id_persona = e.id_persona
      left join public.reservas r on r.id_programacion = pa.id_programacion
      group by pa.id_programacion, a.id_actividad, s.id_sede, e.id_persona, p.nombre
      order by pa.horario asc
    `,
  );

  response.json(result.rows);
}));

app.get('/api/actividades/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const row = await getActivityById(id);
  if (!row) throw new ApiError(404, 'Actividad no encontrada.');
  response.json(row);
}));

app.post('/api/actividades', asyncHandler(async (request, response) => {
  const payload = activityPayloadSchema.parse(request.body);
  if (new Date(payload.horario).getTime() < Date.now()) {
    throw new ApiError(400, 'No se puede crear una actividad en un horario pasado.');
  }

  const createdId = await withTransaction(async (client) => {
    const sede = await client.query('select 1 from public.sedes where id_sede = $1', [payload.sedeId]);
    if (sede.rowCount === 0) throw new ApiError(404, 'La sede indicada no existe.');

    if (payload.entrenadorId) {
      const trainer = await client.query('select 1 from public.entrenadores where id_persona = $1', [payload.entrenadorId]);
      if (trainer.rowCount === 0) throw new ApiError(404, 'El entrenador indicado no existe.');
    }

    await ensureTrainerScheduleAvailability(payload.entrenadorId ?? null, payload.horario);

    const existingActivity = await client.query(
      'select id_actividad from public.actividades where lower(nombre_actividad) = lower($1) limit 1',
      [payload.nombreActividad],
    );

    const activityId = existingActivity.rows[0]?.id_actividad
      ?? (await client.query(
        `
          insert into public.actividades (nombre_actividad, descripcion, tipo)
          values ($1, $2, $3)
          returning id_actividad
        `,
        [payload.nombreActividad, payload.descripcion, payload.tipo],
      )).rows[0].id_actividad;

    const created = await client.query(
      `
        insert into public.programacion_actividades (
          id_sede,
          id_actividad,
          id_entrenador,
          horario,
          cupo_maximo,
          costo
        )
        values ($1, $2, $3, $4, $5, $6)
        returning id_programacion
      `,
      [payload.sedeId, activityId, payload.entrenadorId ?? null, payload.horario, payload.cupoMaximo, payload.costo],
    );

    return created.rows[0].id_programacion as string;
  });

  const activity = await getActivityById(createdId);
  response.status(201).json(activity);
}));

app.put('/api/actividades/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const payload = activityPayloadSchema.parse(request.body);
  const existing = await getActivityById(id);
  if (!existing) throw new ApiError(404, 'Actividad no encontrada.');

  await withTransaction(async (client) => {
    const sede = await client.query('select 1 from public.sedes where id_sede = $1', [payload.sedeId]);
    if (sede.rowCount === 0) throw new ApiError(404, 'La sede indicada no existe.');

    if (payload.entrenadorId) {
      const trainer = await client.query('select 1 from public.entrenadores where id_persona = $1', [payload.entrenadorId]);
      if (trainer.rowCount === 0) throw new ApiError(404, 'El entrenador indicado no existe.');
    }

    await ensureTrainerScheduleAvailability(payload.entrenadorId ?? null, payload.horario, id);

    await client.query(
      'update public.actividades set nombre_actividad = $2, descripcion = $3, tipo = $4 where id_actividad = $1',
      [existing.catalogoId, payload.nombreActividad, payload.descripcion, payload.tipo],
    );

    await client.query(
      `
        update public.programacion_actividades
        set id_sede = $2,
            id_entrenador = $3,
            horario = $4,
            cupo_maximo = $5,
            costo = $6
        where id_programacion = $1
      `,
      [id, payload.sedeId, payload.entrenadorId ?? null, payload.horario, payload.cupoMaximo, payload.costo],
    );
  });

  const activity = await getActivityById(id);
  response.json(activity);
}));

app.delete('/api/actividades/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const existing = await getActivityById(id);
  if (!existing) throw new ApiError(404, 'Actividad no encontrada.');

  await pool.query('delete from public.programacion_actividades where id_programacion = $1', [id]);
  response.status(204).send();
}));

app.get('/api/reservas', asyncHandler(async (_request, response) => {
  const result = await pool.query(
    `
      select
        r.id_reserva as id,
        r.id_cliente as "clienteId",
        cliente.nombre as cliente,
        r.id_programacion as "actividadId",
        a.nombre_actividad as actividad,
        r.fecha_reserva as "fechaReserva",
        pa.horario,
        r.estado,
        r.precio_aplicado as "precioAplicado",
        s.nombre_sede as sede
      from public.reservas r
      left join public.personas cliente on cliente.id_persona = r.id_cliente
      left join public.programacion_actividades pa on pa.id_programacion = r.id_programacion
      left join public.actividades a on a.id_actividad = pa.id_actividad
      left join public.sedes s on s.id_sede = pa.id_sede
      order by pa.horario asc nulls last, r.fecha_reserva desc nulls last
    `,
  );

  response.json(result.rows);
}));

app.get('/api/reservas/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const row = await getReservationById(id);
  if (!row) throw new ApiError(404, 'Reserva no encontrada.');
  response.json(row);
}));

app.post('/api/reservas', asyncHandler(async (request, response) => {
  const payload = reservationPayloadSchema.parse(request.body);
  await ensureReservationRules(payload.clienteId, payload.actividadId);

  const programacionResult = await pool.query(
    'select costo from public.programacion_actividades where id_programacion = $1',
    [payload.actividadId],
  );

  const programacion = programacionResult.rows[0];
  if (!programacion) throw new ApiError(404, 'La actividad programada no existe.');

  const reservationId = await withTransaction(async (client) => {
    const finalPrice = payload.precioAplicado ?? Number(programacion.costo);
    const finalStatus = payload.pago ? 'confirmada' : payload.estado;

    const created = await client.query(
      `
        insert into public.reservas (
          id_cliente,
          id_programacion,
          fecha_reserva,
          precio_aplicado,
          estado
        )
        values ($1, $2, $3, $4, $5)
        returning id_reserva
      `,
      [
        payload.clienteId,
        payload.actividadId,
        payload.fechaReserva ?? new Date().toISOString(),
        finalPrice,
        finalStatus,
      ],
    );

    const createdReservationId = created.rows[0].id_reserva as string;

    if (payload.pago) {
      await client.query(
        `
          insert into public.pagos (
            monto,
            fecha_pago,
            metodo_pago,
            referencia,
            id_reserva,
            id_membresia
          )
          values ($1, $2, $3, $4, $5, null)
        `,
        [
          finalPrice,
          payload.pago.fechaPago ?? new Date().toISOString(),
          payload.pago.metodoPago,
          payload.pago.referencia ?? null,
          createdReservationId,
        ],
      );
    }

    return createdReservationId;
  });

  const reservation = await getReservationById(reservationId);
  response.status(201).json(reservation);
}));

app.put('/api/reservas/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const payload = reservationPayloadSchema.parse(request.body);
  const existing = await getReservationById(id);
  if (!existing) throw new ApiError(404, 'Reserva no encontrada.');

  await ensureReservationRules(payload.clienteId, payload.actividadId, id);

  await pool.query(
    `
      update public.reservas
      set id_cliente = $2,
          id_programacion = $3,
          fecha_reserva = $4,
          precio_aplicado = $5,
          estado = $6
      where id_reserva = $1
    `,
    [
      id,
      payload.clienteId,
      payload.actividadId,
      payload.fechaReserva ?? existing.fechaReserva,
      payload.precioAplicado ?? Number(existing.precioAplicado),
      payload.estado,
    ],
  );

  const reservation = await getReservationById(id);
  response.json(reservation);
}));

app.delete('/api/reservas/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const existing = await getReservationById(id);
  if (!existing) throw new ApiError(404, 'Reserva no encontrada.');

  await pool.query('delete from public.reservas where id_reserva = $1', [id]);
  response.status(204).send();
}));

app.patch('/api/reservas/:id/cancelar', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const existing = await getReservationById(id);
  if (!existing) throw new ApiError(404, 'Reserva no encontrada.');

  await pool.query(
    `
      update public.reservas
      set estado = 'cancelada'
      where id_reserva = $1
    `,
    [id],
  );

  const reservation = await getReservationById(id);
  response.json(reservation);
}));

app.patch('/api/reservas/:id/reprogramar', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const payload = reservationReschedulePayloadSchema.parse(request.body);
  const { activity } = await ensureReservationRescheduleRules(id, payload.actividadId);

  await pool.query(
    `
      update public.reservas
      set id_programacion = $2,
          precio_aplicado = $3,
          estado = 'confirmada'
      where id_reserva = $1
    `,
    [id, payload.actividadId, Number(activity.costo)],
  );

  const reservation = await getReservationById(id);
  response.json(reservation);
}));

app.post('/api/membresias/checkout', asyncHandler(async (request, response) => {
  const payload = membershipCheckoutPayloadSchema.parse(request.body);
  const plan = getMembershipPlanConfig(payload.tipoPlan);

  if (!plan) {
    throw new ApiError(400, 'El plan de membresia indicado no es valido.');
  }

  const clientResult = await pool.query(
    'select id_persona from public.clientes where id_persona = $1',
    [payload.clienteId],
  );

  if (clientResult.rowCount === 0) {
    throw new ApiError(404, 'El cliente indicado no existe o no tiene perfil de miembro.');
  }

  const paymentId = await withTransaction(async (client) => {
    await client.query(
      `
        update public.membresias
        set estado = 'cancelada'
        where id_cliente = $1
          and estado = 'activa'
      `,
      [payload.clienteId],
    );

    const startDate = new Date();
    const endDate = buildMembershipEndDate(startDate, plan);

    const membershipResult = await client.query(
      `
        insert into public.membresias (
          id_cliente,
          tipo_plan,
          fecha_inicio,
          fecha_vencimiento,
          costo,
          estado
        )
        values ($1, $2, $3, $4, $5, 'activa')
        returning id_membresia
      `,
      [
        payload.clienteId,
        plan.label,
        startDate.toISOString().slice(0, 10),
        endDate.toISOString().slice(0, 10),
        plan.cost,
      ],
    );

    const membershipId = membershipResult.rows[0]?.id_membresia as string | undefined;
    if (!membershipId) {
      throw new ApiError(500, 'No se pudo crear la membresia nueva.');
    }

    const paymentResult = await client.query(
      `
        insert into public.pagos (
          monto,
          fecha_pago,
          metodo_pago,
          referencia,
          id_reserva,
          id_membresia
        )
        values ($1, $2, $3, $4, null, $5)
        returning id_pago
      `,
      [
        plan.cost,
        payload.fechaPago ?? new Date().toISOString(),
        payload.metodoPago,
        payload.referencia,
        membershipId,
      ],
    );

    return paymentResult.rows[0]?.id_pago as string;
  });

  const payment = await getPaymentById(paymentId);
  response.status(201).json(payment);
}));

app.get('/api/pagos', asyncHandler(async (_request, response) => {
  const result = await pool.query(
    `
      select
        pg.id_pago as id,
        pg.monto,
        pg.fecha_pago as "fechaPago",
        pg.metodo_pago as "metodoPago",
        pg.referencia,
        pg.id_reserva as "reservaId",
        pg.id_membresia as "membresiaId",
        persona.nombre as cliente,
        actividad.nombre_actividad as actividad,
        membresia.tipo_plan as "tipoPlan"
      from public.pagos pg
      left join public.reservas r on r.id_reserva = pg.id_reserva
      left join public.personas persona on persona.id_persona = r.id_cliente
      left join public.programacion_actividades pa on pa.id_programacion = r.id_programacion
      left join public.actividades actividad on actividad.id_actividad = pa.id_actividad
      left join public.membresias membresia on membresia.id_membresia = pg.id_membresia
      order by pg.fecha_pago desc
    `,
  );

  response.json(result.rows);
}));

app.post('/api/pagos', asyncHandler(async (request, response) => {
  const payload = paymentPayloadSchema.parse(request.body);
  await ensurePaymentRules(payload);

  const paymentId = await withTransaction(async (client) => {
    const created = await client.query(
      `
        insert into public.pagos (
          monto,
          fecha_pago,
          metodo_pago,
          referencia,
          id_reserva,
          id_membresia
        )
        values ($1, $2, $3, $4, $5, $6)
        returning id_pago
      `,
      [
        payload.monto,
        payload.fechaPago ?? new Date().toISOString(),
        payload.metodoPago,
        payload.referencia ?? null,
        payload.reservaId ?? null,
        payload.membresiaId ?? null,
      ],
    );

    if (payload.reservaId) {
      await client.query(
        `
          update public.reservas
          set estado = 'confirmada'
          where id_reserva = $1
            and estado <> 'cancelada'
        `,
        [payload.reservaId],
      );
    }

    if (payload.membresiaId) {
      await client.query(
        `
          update public.membresias
          set estado = 'activa'
          where id_membresia = $1
            and estado <> 'cancelada'
        `,
        [payload.membresiaId],
      );
    }

    return created.rows[0].id_pago as string;
  });

  const payment = await getPaymentById(paymentId);
  response.status(201).json(payment);
}));

app.put('/api/pagos/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const payload = paymentPayloadSchema.parse(request.body);
  const existing = await getPaymentById(id);
  if (!existing) throw new ApiError(404, 'Pago no encontrado.');

  await ensurePaymentRules(payload, id);

  await pool.query(
    `
      update public.pagos
      set monto = $2,
          fecha_pago = $3,
          metodo_pago = $4,
          referencia = $5,
          id_reserva = $6,
          id_membresia = $7
      where id_pago = $1
    `,
    [
      id,
      payload.monto,
      payload.fechaPago ?? existing.fechaPago,
      payload.metodoPago,
      payload.referencia ?? existing.referencia ?? null,
      payload.reservaId ?? null,
      payload.membresiaId ?? null,
    ],
  );

  const payment = await getPaymentById(id);
  response.json(payment);
}));

app.delete('/api/pagos/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const existing = await getPaymentById(id);
  if (!existing) throw new ApiError(404, 'Pago no encontrado.');

  await pool.query('delete from public.pagos where id_pago = $1', [id]);
  response.status(204).send();
}));

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ message: 'Payload invalido.', issues: error.flatten() });
    return;
  }

  const mappedError = formatPgError(error);
  if (mappedError instanceof ApiError) {
    response.status(mappedError.status).json({ message: mappedError.message });
    return;
  }

  const message = mappedError instanceof Error ? mappedError.message : 'Error interno del servidor.';
  response.status(500).json({ message });
});

export default app;