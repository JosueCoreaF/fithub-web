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

type Queryable = Pick<typeof pool, 'query'>;

async function tableExists(qualifiedName: string) {
  const result = await pool.query('select to_regclass($1) as regclass', [qualifiedName]);
  return Boolean(result.rows[0]?.regclass);
}

async function hasFreshHotelSchema() {
  const [huespedes, hoteles, habitaciones, reservasHotel] = await Promise.all([
    tableExists('public.huespedes'),
    tableExists('public.hoteles'),
    tableExists('public.habitaciones'),
    tableExists('public.reservas_hotel'),
  ]);

  return huespedes && hoteles && habitaciones && reservasHotel;
}

const mapHotelStatusToLegacy = (status: string) => {
  if (status === 'pendiente') return 'creada';
  if (status === 'confirmada' || status === 'check_in') return 'confirmada';
  if (status === 'check_out') return 'completada';
  return 'cancelada';
};

const mapLegacyStatusToHotel = (status: string) => {
  if (status === 'creada') return 'pendiente';
  if (status === 'confirmada') return 'confirmada';
  if (status === 'completada') return 'check_out';
  return 'cancelada';
};

const supportedCurrencies = ['USD', 'HNL'] as const;
type SupportedCurrency = (typeof supportedCurrencies)[number];

const normalizeSupportedCurrency = (value: unknown, fallback: SupportedCurrency): SupportedCurrency => (
  typeof value === 'string' && (supportedCurrencies as readonly string[]).includes(value.toUpperCase())
    ? value.toUpperCase() as SupportedCurrency
    : fallback
);

const DEFAULT_USD_HNL_RATE = 24.5;

const getPairExchangeRate = (baseCurrency: SupportedCurrency, secondaryCurrency: SupportedCurrency, usdHnlRate: number) => {
  if (baseCurrency === secondaryCurrency) return 1;
  if (baseCurrency === 'USD' && secondaryCurrency === 'HNL') return usdHnlRate;
  if (baseCurrency === 'HNL' && secondaryCurrency === 'USD') return 1 / usdHnlRate;
  return 1;
};

async function fetchUsdHnlRate() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD', { signal: controller.signal });
    if (!response.ok) throw new Error('Tipo de cambio no disponible.');
    const payload = await response.json() as { rates?: Record<string, number> };
    const rate = Number(payload.rates?.HNL ?? 0);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Tipo de cambio inválido.');
    return rate;
  } finally {
    clearTimeout(timeoutId);
  }
}

type HotelPricingConfig = {
  baseCurrency: SupportedCurrency;
  secondaryCurrency: SupportedCurrency;
  exchangeRate: number;
  exchangeUpdatedAt: string;
  seniorDiscountPercent: number;
  seniorAge: number;
  taxPercent: number;
};

async function getHotelPricingConfig(db: Queryable = pool, forceRefresh = false): Promise<HotelPricingConfig> {
  const result = await db.query(
    `
      select
        moneda,
        moneda_alterna,
        tipo_cambio_base,
        tipo_cambio_actualizado_en,
        descuento_tercera_edad,
        edad_tercera_edad,
        porcentaje_impuesto
      from public.configuracion_hotelera
      where id_config = 'default'
      limit 1
    `,
  );

  const row = result.rows[0] ?? {};
  const baseCurrency = normalizeSupportedCurrency(row.moneda, 'USD');
  const secondaryCurrency = normalizeSupportedCurrency(row.moneda_alterna, baseCurrency === 'USD' ? 'HNL' : 'USD');
  let exchangeRate = Number(row.tipo_cambio_base ?? DEFAULT_USD_HNL_RATE);
  let exchangeUpdatedAt = row.tipo_cambio_actualizado_en
    ? new Date(row.tipo_cambio_actualizado_en).toISOString()
    : new Date(0).toISOString();
  const lastUpdatedMs = new Date(exchangeUpdatedAt).getTime();
  const shouldRefresh = baseCurrency !== secondaryCurrency
    && (forceRefresh || !Number.isFinite(lastUpdatedMs) || Date.now() - lastUpdatedMs > 6 * 60 * 60 * 1000);

  if (shouldRefresh) {
    try {
      const usdHnlRate = await fetchUsdHnlRate();
      exchangeRate = getPairExchangeRate(baseCurrency, secondaryCurrency, usdHnlRate);
      exchangeUpdatedAt = new Date().toISOString();
      await db.query(
        `
          update public.configuracion_hotelera
          set tipo_cambio_base = $2,
              tipo_cambio_actualizado_en = $3,
              moneda = $4,
              moneda_alterna = $5
          where id_config = 'default'
        `,
        [
          'default',
          exchangeRate,
          exchangeUpdatedAt,
          baseCurrency,
          secondaryCurrency,
        ],
      );
    } catch {
      exchangeRate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : getPairExchangeRate(baseCurrency, secondaryCurrency, DEFAULT_USD_HNL_RATE);
    }
  }

  return {
    baseCurrency,
    secondaryCurrency,
    exchangeRate: Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1,
    exchangeUpdatedAt,
    seniorDiscountPercent: Number(row.descuento_tercera_edad ?? 0),
    seniorAge: Number(row.edad_tercera_edad ?? 60),
    taxPercent: Number(row.porcentaje_impuesto ?? 0),
  };
}

const tariffConfigPayloadSchema = z.object({
  monedaBase: z.enum(supportedCurrencies),
  monedaAlterna: z.enum(supportedCurrencies),
  descuentoTerceraEdad: z.number().min(0).max(100),
  edadTerceraEdad: z.number().int().min(50).max(100),
}).refine((payload) => payload.monedaBase !== payload.monedaAlterna, {
  message: 'La moneda base y la moneda alterna deben ser distintas.',
  path: ['monedaAlterna'],
});

const customTariffPayloadSchema = z.object({
  hotelId: z.string().uuid(),
  habitacionId: z.string().uuid().optional().nullable(),
  nombre: z.string().trim().min(2),
  descripcion: z.string().trim().optional(),
  montoNoche: z.number().min(0),
  moneda: z.enum(supportedCurrencies),
  activa: z.boolean().optional(),
  prioridad: z.number().int().min(0).max(999).optional(),
});

const roomTariffUpdatePayloadSchema = z.object({
  montoNoche: z.number().min(0),
});

async function syncFreshReservationPaymentStatus(reservationId: string, db: Queryable = pool) {
  const reservationResult = await db.query(
    'select estado, total_reserva from public.reservas_hotel where id_reserva_hotel = $1',
    [reservationId],
  );

  const reservation = reservationResult.rows[0];
  if (!reservation || reservation.estado === 'cancelada') return;

  const paidResult = await db.query(
    'select coalesce(sum(monto), 0)::numeric as total from public.pagos_hotel where id_reserva_hotel = $1',
    [reservationId],
  );

  const totalPaid = Number(paidResult.rows[0]?.total ?? 0);
  const totalReservation = Number(reservation.total_reserva ?? 0);

  const nextStatus = totalReservation > 0 && totalPaid >= totalReservation
    ? 'check_out'
    : totalPaid > 0
      ? 'confirmada'
      : 'pendiente';

  if (reservation.estado !== nextStatus) {
    await db.query(
      'update public.reservas_hotel set estado = $2 where id_reserva_hotel = $1',
      [reservationId, nextStatus],
    );
  }
}

async function syncLegacyReservationPaymentStatus(reservationId: string, db: Queryable = pool) {
  const reservationResult = await db.query(
    'select estado, precio_aplicado from public.reservas where id_reserva = $1',
    [reservationId],
  );

  const reservation = reservationResult.rows[0];
  if (!reservation || reservation.estado === 'cancelada') return;

  const paidResult = await db.query(
    'select coalesce(sum(monto), 0)::numeric as total from public.pagos where id_reserva = $1',
    [reservationId],
  );

  const totalPaid = Number(paidResult.rows[0]?.total ?? 0);
  const totalReservation = Number(reservation.precio_aplicado ?? 0);

  const nextStatus = totalReservation > 0 && totalPaid >= totalReservation
    ? 'completada'
    : totalPaid > 0
      ? 'confirmada'
      : 'creada';

  if (reservation.estado !== nextStatus) {
    await db.query(
      'update public.reservas set estado = $2 where id_reserva = $1',
      [reservationId, nextStatus],
    );
  }
}

async function getFreshBootstrapData() {
  const [hoteles, huespedes, personal] = await Promise.all([
    pool.query('select id_hotel as id, nombre_hotel as nombre from public.hoteles order by nombre_hotel asc'),
    pool.query('select id_huesped as id, nombre_completo as nombre from public.huespedes order by nombre_completo asc'),
    pool.query('select id_personal as id, nombre_completo as nombre from public.personal_hotel order by nombre_completo asc'),
  ]);

  return {
    hoteles: hoteles.rows,
    huespedes: huespedes.rows,
    personalHotelero: personal.rows,
    sedes: hoteles.rows,
    clientes: huespedes.rows,
    entrenadores: personal.rows,
    membresias: [],
  };
}

async function getFreshOperationalDataCompat() {
  const [
    huespedes,
    hoteles,
    personal,
    tiposHabitacion,
    habitaciones,
    reservasHotel,
    pagosHotel,
    configuracionHotelera,
  ] = await Promise.all([
    pool.query('select * from public.huespedes order by fecha_registro asc, nombre_completo asc'),
    pool.query('select * from public.hoteles order by nombre_hotel asc'),
    pool.query('select * from public.personal_hotel order by nombre_completo asc'),
    pool.query('select * from public.tipos_habitacion order by nombre_tipo asc'),
    pool.query(`
      select
        h.*,
        row_number() over(order by h.codigo_habitacion asc) as sort_index
      from public.habitaciones h
      order by h.codigo_habitacion asc
    `),
    pool.query('select * from public.reservas_hotel order by created_at desc'),
    pool.query('select * from public.pagos_hotel order by fecha_pago desc'),
    pool.query('select * from public.configuracion_hotelera where id_config = $1 limit 1', ['default']),
  ]);

  const personas = [
    ...huespedes.rows.map((row) => ({
      id_persona: row.id_huesped,
      nombre: row.nombre_completo,
      correo: row.correo,
      direccion_ciudad: row.ciudad,
      direccion_colonia: null,
      direccion_calle: row.direccion,
      fecha_nacimiento: null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
    ...personal.rows.map((row) => {
      const hotel = hoteles.rows.find((hotelRow) => hotelRow.id_hotel === row.id_hotel);
      return {
        id_persona: row.id_personal,
        nombre: row.nombre_completo,
        correo: row.correo,
        direccion_ciudad: hotel?.ciudad ?? null,
        direccion_colonia: null,
        direccion_calle: hotel?.direccion ?? null,
        fecha_nacimiento: null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    }),
  ];

  const telefonos = [
    ...huespedes.rows.filter((row) => row.telefono).map((row) => ({ id_persona: row.id_huesped, telefono: row.telefono })),
    ...personal.rows.filter((row) => row.telefono).map((row) => ({ id_persona: row.id_personal, telefono: row.telefono })),
  ];

  const clientes = huespedes.rows.map((row) => ({
    id_persona: row.id_huesped,
    fecha_registro: row.fecha_registro,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const entrenadores = personal.rows.map((row) => ({
    id_persona: row.id_personal,
    especialidad: row.rol,
    estado_laboral: row.estado === 'vacaciones' ? 'Vacaciones' : row.estado === 'inactivo' ? 'Inactivo' : 'Activo',
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const sedes = hoteles.rows.map((row) => ({
    id_sede: row.id_hotel,
    nombre_sede: row.nombre_hotel,
    ubicacion: `${row.ciudad} - ${row.direccion}`,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const actividades = tiposHabitacion.rows.map((row) => ({
    id_actividad: row.id_tipo_habitacion,
    nombre_actividad: row.nombre_tipo,
    descripcion: row.descripcion,
    tipo: 'Servicio',
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const programaciones = habitaciones.rows.map((row) => ({
    id_programacion: row.id_habitacion,
    id_sede: row.id_hotel,
    id_actividad: row.id_tipo_habitacion,
    id_entrenador: null,
    horario: new Date(Date.now() + Number(row.sort_index) * 86_400_000).toISOString(),
    cupo_maximo: row.capacidad,
    costo: row.tarifa_noche,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const reservas = reservasHotel.rows.map((row) => ({
    id_reserva: row.id_reserva_hotel,
    id_cliente: row.id_huesped,
    id_programacion: row.id_habitacion,
    fecha_reserva: row.created_at,
    precio_aplicado: row.total_reserva,
    estado: mapHotelStatusToLegacy(row.estado),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const pagos = pagosHotel.rows.map((row) => ({
    id_pago: row.id_pago_hotel,
    monto: row.monto,
    fecha_pago: row.fecha_pago,
    metodo_pago: row.metodo_pago,
    referencia: row.referencia,
    id_reserva: row.id_reserva_hotel,
    id_membresia: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const config = configuracionHotelera.rows[0];
  const configuracionOperativa = [{
    id_config: 'default',
    ciudad_base: hoteles.rows[0]?.ciudad ?? 'Tegucigalpa',
    horas_anticipacion_reserva: 12,
    umbral_ocupacion: 85,
    auto_confirmar_pagos: true,
    permitir_edicion_entrenador: true,
    hora_cierre: config?.hora_check_out?.slice(0, 5) ?? '12:00',
  }];

  return {
    huespedes: huespedes.rows,
    hoteles: hoteles.rows,
    personalHotelero: personal.rows,
    tiposHabitacion: tiposHabitacion.rows,
    habitacionesHotel: habitaciones.rows,
    reservasHotel: reservasHotel.rows,
    pagosHotel: pagosHotel.rows,
    configuracionHotelera: configuracionHotelera.rows,
    personas,
    telefonos,
    clientes,
    membresias: [],
    entrenadores,
    sedes,
    actividades,
    programaciones,
    reservas,
    pagos,
    configuracionOperativa,
  };
}

const withHotelReservationAliases = <T extends Record<string, unknown>>(row: T) => ({
  ...row,
  huespedId: row.clienteId ?? null,
  huesped: row.cliente ?? null,
  habitacionId: row.actividadId ?? null,
  habitacion: row.actividad ?? null,
  hotel: row.sede ?? null,
  responsableId: row.entrenadorId ?? null,
  responsable: row.entrenador ?? null,
});

const withHotelPaymentAliases = <T extends Record<string, unknown>>(row: T) => ({
  ...row,
  huesped: row.cliente ?? null,
  huespedId: row.clienteId ?? null,
  estadia: row.actividad ?? null,
  hotel: row.sede ?? null,
  estadiaId: row.reservaId ?? null,
});

const withHotelActivityAliases = <T extends Record<string, unknown>>(row: T) => ({
  ...row,
  nombreHabitacion: row.nombreActividad ?? null,
  hotelId: row.sedeId ?? null,
  hotel: row.sede ?? null,
  responsableId: row.entrenadorId ?? null,
  responsable: row.entrenador ?? null,
  capacidad: row.cupoMaximo ?? null,
  tarifa: row.costo ?? null,
  ocupacion: row.inscritos ?? 0,
});

async function getFreshReservationById(id: string) {
  const result = await pool.query(
    `
      select
        r.id_reserva_hotel as id,
        r.id_huesped as "clienteId",
        h.nombre_completo as cliente,
        r.id_habitacion as "actividadId",
        room.nombre_habitacion as actividad,
        r.created_at as "fechaReserva",
        r.check_in as horario,
        $2::text as estado,
        r.total_reserva as "precioAplicado",
        r.adultos,
        r.ninos,
        hotel.nombre_hotel as sede
      from public.reservas_hotel r
      join public.huespedes h on h.id_huesped = r.id_huesped
      join public.habitaciones room on room.id_habitacion = r.id_habitacion
      join public.hoteles hotel on hotel.id_hotel = r.id_hotel
      where r.id_reserva_hotel = $1
    `,
    [id, 'confirmada'],
  );

  const row = result.rows[0] ?? null;
  if (!row) return null;

  const statusResult = await pool.query('select estado from public.reservas_hotel where id_reserva_hotel = $1', [id]);
  const hotelStatus = statusResult.rows[0]?.estado ?? 'pendiente';
  row.estado = mapHotelStatusToLegacy(hotelStatus);
  return row;
}

async function getFreshPaymentById(id: string) {
  const result = await pool.query(
    `
      select
        p.id_pago_hotel as id,
        p.monto,
        p.fecha_pago as "fechaPago",
        p.metodo_pago as "metodoPago",
        p.referencia,
        p.id_reserva_hotel as "reservaId",
        null::uuid as "membresiaId",
        h.nombre_completo as cliente,
        room.nombre_habitacion as actividad,
        null::text as "tipoPlan"
      from public.pagos_hotel p
      join public.reservas_hotel r on r.id_reserva_hotel = p.id_reserva_hotel
      join public.huespedes h on h.id_huesped = r.id_huesped
      join public.habitaciones room on room.id_habitacion = r.id_habitacion
      where p.id_pago_hotel = $1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

async function getFreshRoomById(id: string) {
  const result = await pool.query(
    `
      select
        h.id_habitacion as id,
        h.id_hotel as "hotelId",
        hotel.nombre_hotel as hotel,
        h.id_tipo_habitacion as "tipoHabitacionId",
        t.nombre_tipo as tipo,
        h.codigo_habitacion as codigo,
        h.nombre_habitacion as nombre,
        h.piso,
        h.capacidad,
        h.tarifa_noche as tarifa,
        h.estado,
        h.created_at as "createdAt"
      from public.habitaciones h
      join public.hoteles hotel on hotel.id_hotel = h.id_hotel
      join public.tipos_habitacion t on t.id_tipo_habitacion = h.id_tipo_habitacion
      where h.id_habitacion = $1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

async function ensureFreshReservationRules(clienteId: string, habitacionId: string, checkIn: string, checkOut: string, excludeId?: string) {
  const guestResult = await pool.query('select 1 from public.huespedes where id_huesped = $1', [clienteId]);
  if (guestResult.rowCount === 0) {
    throw new ApiError(400, 'El huesped indicado no existe.');
  }

  const roomResult = await pool.query(
    `
      select id_habitacion, id_hotel, tarifa_noche, estado
      from public.habitaciones
      where id_habitacion = $1
    `,
    [habitacionId],
  );

  const room = roomResult.rows[0];
  if (!room) throw new ApiError(404, 'La habitación indicada no existe.');
  if (['mantenimiento', 'bloqueada', 'limpieza'].includes(room.estado)) {
    throw new ApiError(409, 'La habitación no está disponible para reserva.');
  }

  const start = new Date(checkIn);
  const end = new Date(checkOut);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new ApiError(400, 'Las fechas de check-in y check-out no son válidas.');
  }

  const overlapReservations = await pool.query(
    `
      select count(*)::int as total
      from public.reservas_hotel
      where id_habitacion = $1
        and estado not in ('cancelada', 'no_show')
        and check_out > $2::timestamptz
        and check_in < $3::timestamptz
        and ($4::uuid is null or id_reserva_hotel <> $4::uuid)
    `,
    [habitacionId, checkIn, checkOut, excludeId ?? null],
  );

  if ((overlapReservations.rows[0]?.total ?? 0) > 0) {
    throw new ApiError(409, 'La habitación ya está ocupada en el rango seleccionado.');
  }

  const overlapBlocks = await pool.query(
    `
      select count(*)::int as total
      from public.bloqueos_habitacion
      where id_habitacion = $1
        and fecha_fin > $2::timestamptz
        and fecha_inicio < $3::timestamptz
    `,
    [habitacionId, checkIn, checkOut],
  );

  if ((overlapBlocks.rows[0]?.total ?? 0) > 0) {
    throw new ApiError(409, 'La habitación está bloqueada en el rango seleccionado.');
  }

  return room;
}

async function queryIfTableExists<T>(qualifiedName: string, query: string) {
  if (!(await tableExists(qualifiedName))) {
    return [] as T[];
  }

  const result = await pool.query(query);
  return result.rows as T[];
}

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
const guestPayloadSchema = z.object({
  nombre: z.string().trim().min(3),
  correo: z.string().trim().email(),
  telefono: z.string().trim().min(7).optional(),
  ciudad: z.string().trim().optional(),
  direccion: z.string().trim().optional(),
});

const activityPayloadSchema = z.object({
  nombreActividad: z.string().trim().min(3).optional(),
  nombreHabitacion: z.string().trim().min(3).optional(),
  descripcion: z.string().trim().min(3),
  tipo: z.enum(['Clase grupal', 'Servicio']),
  sedeId: z.string().uuid().optional(),
  hotelId: z.string().uuid().optional(),
  entrenadorId: z.string().uuid().nullable().optional(),
  responsableId: z.string().uuid().nullable().optional(),
  horario: z.string().datetime().optional(),
  cupoMaximo: z.number().int().positive(),
  costo: z.number().min(0),
  codigoHabitacion: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9-]+$/).optional(),
  piso: z.number().int().min(0).optional(),
  estadoOperativo: z.enum(['disponible', 'ocupada', 'mantenimiento', 'bloqueada', 'limpieza']).optional(),
}).transform((payload) => ({
  nombreActividad: payload.nombreHabitacion ?? payload.nombreActividad ?? '',
  descripcion: payload.descripcion,
  tipo: payload.tipo,
  sedeId: payload.hotelId ?? payload.sedeId ?? '',
  entrenadorId: payload.responsableId ?? payload.entrenadorId ?? null,
  horario: payload.horario,
  cupoMaximo: payload.cupoMaximo,
  costo: payload.costo,
  codigoHabitacion: payload.codigoHabitacion?.trim().toUpperCase() ?? '',
  piso: payload.piso ?? 1,
  estadoOperativo: payload.estadoOperativo ?? 'disponible',
}));

const reservationPayloadSchema = z.object({
  clienteId: z.string().uuid().optional(),
  huespedId: z.string().uuid().optional(),
  actividadId: z.string().uuid().optional(),
  habitacionId: z.string().uuid().optional(),
  fechaReserva: z.string().datetime().optional(),
  checkIn: z.string().datetime().optional(),
  checkOut: z.string().datetime().optional(),
  noches: z.number().int().positive().optional(),
  adultos: z.number().int().positive().optional(),
  ninos: z.number().int().min(0).optional(),
  observaciones: z.string().trim().optional(),
  estado: z.enum(['creada', 'confirmada', 'cancelada', 'completada']).default('creada'),
  precioAplicado: z.number().min(0).optional(),
  pago: z.object({
    fechaPago: z.string().datetime().optional(),
    metodoPago: z.enum(['efectivo', 'tarjeta', 'transferencia', 'deposito', 'otro']),
    referencia: z.string().trim().min(1).optional(),
  }).optional(),
}).transform((payload) => ({
  clienteId: payload.huespedId ?? payload.clienteId ?? '',
  actividadId: payload.habitacionId ?? payload.actividadId ?? '',
  fechaReserva: payload.fechaReserva,
  checkIn: payload.checkIn,
  checkOut: payload.checkOut,
  noches: payload.noches,
  adultos: payload.adultos ?? 1,
  ninos: payload.ninos ?? 0,
  observaciones: payload.observaciones,
  estado: payload.estado,
  precioAplicado: payload.precioAplicado,
  pago: payload.pago,
}));

const reservationReschedulePayloadSchema = z.object({
  actividadId: z.string().uuid().optional(),
  habitacionId: z.string().uuid().optional(),
}).transform((payload) => ({
  actividadId: payload.habitacionId ?? payload.actividadId ?? '',
}));

const trainerPayloadSchema = z.object({
  nombre: z.string().trim().min(3),
  correo: z.string().trim().email(),
  fechaNacimiento: z.string().date(),
  especialidad: z.string().trim().min(2).optional(),
  areaOperativa: z.string().trim().min(2).optional(),
  estadoLaboral: z.enum(['Activo', 'Inactivo', 'Vacaciones']).default('Activo'),
}).transform((payload) => ({
  nombre: payload.nombre,
  correo: payload.correo,
  fechaNacimiento: payload.fechaNacimiento,
  especialidad: payload.areaOperativa ?? payload.especialidad ?? '',
  estadoLaboral: payload.estadoLaboral,
}));

const paymentPayloadSchema = z.object({
  reservaId: z.string().uuid(),
  monto: z.number().positive(),
  fechaPago: z.string().datetime().optional(),
  metodoPago: z.enum(['efectivo', 'tarjeta', 'transferencia', 'deposito', 'otro']),
  referencia: z.string().trim().min(1).optional(),
});

const roomBlockPayloadSchema = z.object({
  habitacionId: z.string().uuid(),
  fechaInicio: z.string().datetime(),
  fechaFin: z.string().datetime(),
  motivo: z.string().trim().min(3),
  permitirConReservas: z.boolean().optional(),
});

const operationalSettingsPayloadSchema = z.object({
  ciudadBase: z.string().trim().min(2),
  horasAnticipacionReserva: z.number().int().min(0),
  umbralOcupacion: z.number().int().min(0).max(100),
  autoConfirmarPagos: z.boolean(),
  permitirEdicionEntrenador: z.boolean(),
  horaCierre: z.string().trim().regex(/^\d{2}:\d{2}$/),
});


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
async function getFreshGuestById(id: string) {
  const result = await pool.query(
    `
      select
        h.id_huesped as id,
        h.nombre_completo as nombre,
        h.correo,
        h.telefono,
        h.ciudad,
        h.direccion,
        h.fecha_registro as "fechaRegistro"
      from public.huespedes h
      where h.id_huesped = $1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

async function getCustomTariffById(id: string) {
  const result = await pool.query(
    `
      select
        t.id_tarifa_personalizada as id,
        t.id_hotel as "hotelId",
        h.nombre_hotel as hotel,
        t.id_habitacion as "habitacionId",
        room.nombre_habitacion as habitacion,
        room.codigo_habitacion as codigo,
        t.nombre_tarifa as nombre,
        t.descripcion,
        t.moneda,
        t.monto_noche as "montoNoche",
        t.activa,
        t.prioridad,
        t.created_at as "createdAt",
        t.updated_at as "updatedAt"
      from public.tarifas_personalizadas_hotel t
      join public.hoteles h on h.id_hotel = t.id_hotel
      left join public.habitaciones room on room.id_habitacion = t.id_habitacion
      where t.id_tarifa_personalizada = $1
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
        persona.nombre as cliente,
        actividad.nombre_actividad as actividad,
        null::uuid as "membresiaId",
        null::text as "tipoPlan"
      from public.pagos pg
      left join public.reservas r on r.id_reserva = pg.id_reserva
      left join public.personas persona on persona.id_persona = r.id_cliente
      left join public.programacion_actividades pa on pa.id_programacion = r.id_programacion
      left join public.actividades actividad on actividad.id_actividad = pa.id_actividad
      where pg.id_pago = $1
    `,
    [id],
  );

  return result.rows[0] ?? null;
}

async function ensureStaffScheduleAvailability(staffId: string | null | undefined, horario: string, excludeId?: string) {
  if (!staffId) return;

  const result = await pool.query(
    `
      select count(*)::int as total
      from public.programacion_actividades
      where id_entrenador = $1
        and horario = $2
        and ($3::uuid is null or id_programacion <> $3::uuid)
    `,
    [staffId, horario, excludeId ?? null],
  );

  if ((result.rows[0]?.total ?? 0) > 0) {
    throw new ApiError(409, 'El responsable ya tiene una habitación asignada en ese horario.');
  }
}

async function ensureReservationRules(huespedId: string, programacionId: string, excludeId?: string) {
  const guestResult = await pool.query('select 1 from public.clientes where id_persona = $1', [huespedId]);
  if (guestResult.rowCount === 0) {
    throw new ApiError(400, 'La persona indicada no está registrada como huésped.');
  }

  const activityResult = await pool.query(
    `
      select id_programacion, horario, cupo_maximo
      from public.programacion_actividades
      where id_programacion = $1
    `,
    [programacionId],
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
    [huespedId, programacionId, excludeId ?? null],
  );

  if ((duplicateResult.rows[0]?.total ?? 0) > 0) {
    throw new ApiError(409, 'Ya existe una reserva para este huésped en la misma habitación y horario.');
  }

  const occupancyResult = await pool.query(
    `
      select count(*)::int as total
      from public.reservas
      where id_programacion = $1
        and estado <> 'cancelada'
        and ($2::uuid is null or id_reserva <> $2::uuid)
    `,
    [programacionId, excludeId ?? null],
  );

  if ((occupancyResult.rows[0]?.total ?? 0) >= activity.cupo_maximo) {
    throw new ApiError(409, 'No hay cupos disponibles para esta habitación.');
  }
}

async function ensurePaymentRules(payload: z.infer<typeof paymentPayloadSchema>, excludeId?: string) {
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

async function ensureReservationRescheduleRules(reservationId: string, nextProgramacionId: string) {
  const reservationResult = await pool.query(
    'select id_reserva, id_cliente, id_programacion, estado from public.reservas where id_reserva = $1',
    [reservationId],
  );

  const reservation = reservationResult.rows[0];
  if (!reservation) throw new ApiError(404, 'Reserva no encontrada.');
  if (!reservation.id_cliente) throw new ApiError(400, 'La reserva no tiene un huésped asociado.');
  if (reservation.estado === 'cancelada') throw new ApiError(400, 'No se puede reprogramar una reserva cancelada.');
  if (reservation.id_programacion === nextProgramacionId) throw new ApiError(400, 'Selecciona una habitación distinta para reprogramar la reserva.');

  const activityResult = await pool.query(
    `
      select id_programacion, horario, cupo_maximo, costo
      from public.programacion_actividades
      where id_programacion = $1
    `,
    [nextProgramacionId],
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
    throw new ApiError(400, 'La nueva habitación no cumple la anticipación mínima de reserva configurada.');
  }

  const occupancyResult = await pool.query(
    `
      select count(*)::int as total
      from public.reservas
      where id_programacion = $1
        and estado <> 'cancelada'
        and id_reserva <> $2
    `,
    [nextProgramacionId, reservationId],
  );

  if ((occupancyResult.rows[0]?.total ?? 0) >= Number(activity.cupo_maximo)) {
    throw new ApiError(409, 'No hay cupos disponibles para la nueva habitación.');
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
    [reservation.id_cliente, nextProgramacionId, reservationId],
  );

  if ((duplicateResult.rows[0]?.total ?? 0) > 0) {
    throw new ApiError(409, 'Ya existe una reserva activa para este huésped en la habitación seleccionada.');
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
  if (await hasFreshHotelSchema()) {
    response.json(await getFreshBootstrapData());
    return;
  }

  const [sedes, clientes, entrenadores] = await Promise.all([
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
  ]);

  response.json({
    hoteles: sedes.rows,
    huespedes: clientes.rows,
    personalHotelero: entrenadores.rows,
    sedes: sedes.rows,
    clientes: clientes.rows,
    entrenadores: entrenadores.rows,
    membresias: [],
  });
}));

app.get('/api/operational-data', asyncHandler(async (_request, response) => {
  if (await hasFreshHotelSchema()) {
    response.json(await getFreshOperationalDataCompat());
    return;
  }

  const [
    personas,
    telefonos,
    clientes,
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
    pool.query('select * from public.entrenadores order by id_persona asc'),
    pool.query('select * from public.sedes order by nombre_sede asc'),
    pool.query('select * from public.actividades order by nombre_actividad asc'),
    pool.query('select * from public.programacion_actividades order by horario asc'),
    pool.query('select * from public.reservas order by created_at desc'),
    pool.query('select * from public.pagos order by fecha_pago desc'),
    pool.query('select * from public.configuracion_operativa where id_config = $1 limit 1', ['default']),
  ]);

  response.json({
    hoteles: sedes.rows,
    huespedes: clientes.rows,
    personalHotelero: entrenadores.rows,
    habitacionesCatalogo: actividades.rows,
    habitacionesOperativas: programaciones.rows,
    configuracionHotelera: configuracionOperativa.rows,
    personas: personas.rows,
    telefonos: telefonos.rows,
    clientes: clientes.rows,
    membresias: [],
    entrenadores: entrenadores.rows,
    sedes: sedes.rows,
    actividades: actividades.rows,
    programaciones: programaciones.rows,
    reservas: reservas.rows,
    pagos: pagos.rows,
    configuracionOperativa: configuracionOperativa.rows,
  });
}));

app.get('/api/hotel-bootstrap', asyncHandler(async (_request, response) => {
  const [hoteles, habitaciones] = await Promise.all([
    queryIfTableExists<{ id: string; nombre: string }>('public.hoteles', `
      select id_hotel as id, nombre_hotel as nombre
      from public.hoteles
      order by nombre_hotel asc
    `),
    queryIfTableExists<{ id: string; nombre: string; hotelId: string }>('public.habitaciones', `
      select id_habitacion as id, nombre_habitacion as nombre, id_hotel as "hotelId"
      from public.habitaciones
      order by nombre_habitacion asc
    `),
  ]);

  response.json({ hoteles, habitaciones });
}));

app.get('/api/hotel-operational-data', asyncHandler(async (_request, response) => {
  const [
    hoteles,
    habitaciones,
    reservasHotel,
    personas,
    clientes,
    personal,
  ] = await Promise.all([
    queryIfTableExists('public.hoteles', 'select * from public.hoteles order by nombre_hotel asc'),
    queryIfTableExists('public.habitaciones', 'select * from public.habitaciones order by nombre_habitacion asc'),
    queryIfTableExists('public.reservas_hotel', 'select * from public.reservas_hotel order by created_at desc'),
    pool.query('select * from public.personas order by created_at asc').then((result) => result.rows),
    pool.query('select * from public.clientes order by fecha_registro asc nulls last, id_persona asc').then((result) => result.rows),
    pool.query('select * from public.entrenadores order by id_persona asc').then((result) => result.rows),
  ]);

  response.json({
    hoteles,
    habitaciones,
    reservasHotel,
    personas,
    clientes,
    personal,
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
app.post('/api/huespedes', asyncHandler(async (request, response) => {
  const payload = guestPayloadSchema.parse(request.body);

  if (await hasFreshHotelSchema()) {
    const guest = await withTransaction(async (client) => {
      const existing = await client.query(
        'select id_huesped from public.huespedes where lower(correo) = lower($1) limit 1',
        [payload.correo],
      );

      if (existing.rowCount > 0) {
        const guestId = existing.rows[0].id_huesped as string;
        await client.query(
          `
            update public.huespedes
            set nombre_completo = $2,
                correo = $3,
                telefono = $4,
                ciudad = $5,
                direccion = $6
            where id_huesped = $1
          `,
          [guestId, payload.nombre, payload.correo.toLowerCase(), payload.telefono ?? null, payload.ciudad ?? null, payload.direccion ?? null],
        );
        return getFreshGuestById(guestId);
      }

      const inserted = await client.query(
        `
          insert into public.huespedes (
            nombre_completo,
            correo,
            telefono,
            ciudad,
            direccion
          )
          values ($1, $2, $3, $4, $5)
          returning id_huesped
        `,
        [payload.nombre, payload.correo.toLowerCase(), payload.telefono ?? null, payload.ciudad ?? null, payload.direccion ?? null],
      );

      return getFreshGuestById(inserted.rows[0].id_huesped as string);
    });

    response.status(201).json(guest ?? {});
    return;
  }

  const client = await withTransaction(async (db) => {
    const existing = await db.query(
      'select id_persona from public.personas where lower(correo) = lower($1) limit 1',
      [payload.correo],
    );

    let personId = existing.rows[0]?.id_persona as string | undefined;

    if (personId) {
      await db.query(
        `
          update public.personas
          set nombre = $2,
              correo = $3,
              direccion_ciudad = $4,
              direccion_calle = $5
          where id_persona = $1
        `,
        [personId, payload.nombre, payload.correo.toLowerCase(), payload.ciudad ?? null, payload.direccion ?? null],
      );
    } else {
      const inserted = await db.query(
        `
          insert into public.personas (nombre, correo, direccion_ciudad, direccion_calle)
          values ($1, $2, $3, $4)
          returning id_persona
        `,
        [payload.nombre, payload.correo.toLowerCase(), payload.ciudad ?? null, payload.direccion ?? null],
      );
      personId = inserted.rows[0].id_persona as string;
    }

    await db.query('insert into public.clientes (id_persona) values ($1) on conflict (id_persona) do nothing', [personId]);

    if (payload.telefono) {
      await db.query('delete from public.persona_telefonos where id_persona = $1', [personId]);
      await db.query('insert into public.persona_telefonos (id_persona, telefono) values ($1, $2)', [personId, payload.telefono]);
    }

    return getPersonById(personId);
  });

  response.status(201).json(client ?? {});
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

app.post('/api/personal', asyncHandler(async (request, response) => {
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

app.put('/api/personal/:id', asyncHandler(async (request, response) => {
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

app.delete('/api/personal/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const existing = await pool.query('select 1 from public.entrenadores where id_persona = $1', [id]);
  if (existing.rowCount === 0) throw new ApiError(404, 'Entrenador no encontrado.');

  await withTransaction(async (client) => {
    await client.query('update public.programacion_actividades set id_entrenador = null where id_entrenador = $1', [id]);
    await client.query('delete from public.entrenadores where id_persona = $1', [id]);
  });

  response.status(204).send();
}));

app.get('/api/habitaciones', asyncHandler(async (_request, response) => {
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

  response.json(result.rows.map(withHotelActivityAliases));
}));

app.get('/api/habitaciones/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);

  if (await hasFreshHotelSchema()) {
    const row = await getFreshRoomById(id);
    if (!row) throw new ApiError(404, 'Habitación no encontrada.');
    response.json(row);
    return;
  }

  const row = await getActivityById(id);
  if (!row) throw new ApiError(404, 'Actividad no encontrada.');
  response.json(withHotelActivityAliases(row));
}));

app.post('/api/habitaciones', asyncHandler(async (request, response) => {
  const payload = activityPayloadSchema.parse(request.body);

  if (await hasFreshHotelSchema()) {
    const createdId = await withTransaction(async (client) => {
      const hotel = await client.query('select 1 from public.hoteles where id_hotel = $1', [payload.sedeId]);
      if (hotel.rowCount === 0) throw new ApiError(404, 'El hotel indicado no existe.');

      const duplicate = await client.query(
        'select 1 from public.habitaciones where id_hotel = $1 and codigo_habitacion = $2 limit 1',
        [payload.sedeId, payload.codigoHabitacion],
      );
      if (duplicate.rowCount > 0) {
        throw new ApiError(409, 'Ya existe una habitación con ese código en el hotel seleccionado.');
      }

      const roomTypeName = payload.tipo === 'Clase grupal' ? 'Estándar' : 'Suite';
      const existingType = await client.query(
        'select id_tipo_habitacion from public.tipos_habitacion where lower(nombre_tipo) = lower($1) limit 1',
        [roomTypeName],
      );

      const roomTypeId = existingType.rows[0]?.id_tipo_habitacion
        ?? (await client.query(
          `
            insert into public.tipos_habitacion (nombre_tipo, descripcion, capacidad_base, tarifa_base)
            values ($1, $2, $3, $4)
            returning id_tipo_habitacion
          `,
          [roomTypeName, payload.descripcion, payload.cupoMaximo, payload.costo],
        )).rows[0].id_tipo_habitacion;

      const created = await client.query(
        `
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
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          returning id_habitacion
        `,
        [
          payload.sedeId,
          roomTypeId,
          payload.codigoHabitacion,
          payload.nombreActividad,
          payload.piso,
          payload.cupoMaximo,
          payload.costo,
          payload.estadoOperativo,
        ],
      );

      return created.rows[0].id_habitacion as string;
    });

    const room = await getFreshRoomById(createdId);
    response.status(201).json(room ?? { id: createdId });
    return;
  }

  if (!payload.horario) {
    throw new ApiError(400, 'La fecha de disponibilidad es obligatoria.');
  }

  if (new Date(payload.horario).getTime() < Date.now()) {
    throw new ApiError(400, 'No se puede crear una actividad en un horario pasado.');
  }

  const createdId = await withTransaction(async (client) => {
    const hotel = await client.query('select 1 from public.sedes where id_sede = $1', [payload.sedeId]);
    if (hotel.rowCount === 0) throw new ApiError(404, 'El hotel indicado no existe.');

    if (payload.entrenadorId) {
      const staffMember = await client.query('select 1 from public.entrenadores where id_persona = $1', [payload.entrenadorId]);
      if (staffMember.rowCount === 0) throw new ApiError(404, 'El responsable indicado no existe.');
    }

    await ensureStaffScheduleAvailability(payload.entrenadorId ?? null, payload.horario);

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
  response.status(201).json(withHotelActivityAliases(activity ?? {}));
}));

app.put('/api/habitaciones/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const payload = activityPayloadSchema.parse(request.body);
  const existing = await getActivityById(id);
  if (!existing) throw new ApiError(404, 'Actividad no encontrada.');

  if (!payload.horario) {
    throw new ApiError(400, 'La fecha de disponibilidad es obligatoria.');
  }

  await withTransaction(async (client) => {
    const hotel = await client.query('select 1 from public.sedes where id_sede = $1', [payload.sedeId]);
    if (hotel.rowCount === 0) throw new ApiError(404, 'El hotel indicado no existe.');

    if (payload.entrenadorId) {
      const staffMember = await client.query('select 1 from public.entrenadores where id_persona = $1', [payload.entrenadorId]);
      if (staffMember.rowCount === 0) throw new ApiError(404, 'El responsable indicado no existe.');
    }

    await ensureStaffScheduleAvailability(payload.entrenadorId ?? null, payload.horario, id);

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
  response.json(withHotelActivityAliases(activity ?? {}));
}));

app.patch('/api/habitaciones/:id/tarifa', asyncHandler(async (request, response) => {
  if (!(await hasFreshHotelSchema())) {
    throw new ApiError(400, 'La actualización directa de tarifas solo está disponible en el esquema hotelero actual.');
  }

  const id = routeId(request);
  const payload = roomTariffUpdatePayloadSchema.parse(request.body);
  const existing = await getFreshRoomById(id);
  if (!existing) throw new ApiError(404, 'Habitación no encontrada.');

  await pool.query(
    'update public.habitaciones set tarifa_noche = $2 where id_habitacion = $1',
    [id, payload.montoNoche],
  );

  const room = await getFreshRoomById(id);
  response.json(room ?? {});
}));

app.get('/api/tarifas', asyncHandler(async (request, response) => {
  if (!(await hasFreshHotelSchema())) {
    throw new ApiError(400, 'El catálogo de tarifas solo está disponible en el esquema hotelero actual.');
  }

  const hotelId = typeof request.query.hotelId === 'string' ? request.query.hotelId : null;
  const forceRefresh = String(request.query.refresh ?? '').toLowerCase() === 'true';
  const config = await getHotelPricingConfig(pool, forceRefresh);

  const [currentRates, customRates] = await Promise.all([
    pool.query(
      `
        select
          room.id_habitacion as id,
          room.id_hotel as "hotelId",
          h.nombre_hotel as hotel,
          room.id_tipo_habitacion as "tipoHabitacionId",
          t.nombre_tipo as tipo,
          room.codigo_habitacion as codigo,
          room.nombre_habitacion as habitacion,
          room.tarifa_noche as "montoNoche",
          room.estado
        from public.habitaciones room
        join public.hoteles h on h.id_hotel = room.id_hotel
        join public.tipos_habitacion t on t.id_tipo_habitacion = room.id_tipo_habitacion
        where ($1::uuid is null or room.id_hotel = $1::uuid)
        order by h.nombre_hotel asc, room.codigo_habitacion asc
      `,
      [hotelId],
    ),
    pool.query(
      `
        select
          t.id_tarifa_personalizada as id,
          t.id_hotel as "hotelId",
          h.nombre_hotel as hotel,
          t.id_habitacion as "habitacionId",
          room.nombre_habitacion as habitacion,
          room.codigo_habitacion as codigo,
          t.nombre_tarifa as nombre,
          t.descripcion,
          t.moneda,
          t.monto_noche as "montoNoche",
          t.activa,
          t.prioridad,
          t.created_at as "createdAt",
          t.updated_at as "updatedAt"
        from public.tarifas_personalizadas_hotel t
        join public.hoteles h on h.id_hotel = t.id_hotel
        left join public.habitaciones room on room.id_habitacion = t.id_habitacion
        where ($1::uuid is null or t.id_hotel = $1::uuid)
        order by h.nombre_hotel asc, t.prioridad desc, t.updated_at desc
      `,
      [hotelId],
    ),
  ]);

  response.json({
    config: {
      monedaBase: config.baseCurrency,
      monedaAlterna: config.secondaryCurrency,
      tipoCambio: config.exchangeRate,
      actualizadoEn: config.exchangeUpdatedAt,
      descuentoTerceraEdad: config.seniorDiscountPercent,
      edadTerceraEdad: config.seniorAge,
      porcentajeImpuesto: config.taxPercent,
    },
    actuales: currentRates.rows,
    personalizadas: customRates.rows,
  });
}));

app.put('/api/tarifas/configuracion', asyncHandler(async (request, response) => {
  if (!(await hasFreshHotelSchema())) {
    throw new ApiError(400, 'La configuración tarifaria solo está disponible en el esquema hotelero actual.');
  }

  const payload = tariffConfigPayloadSchema.parse(request.body);

  await pool.query(
    `
      update public.configuracion_hotelera
      set moneda = $2,
          moneda_alterna = $3,
          descuento_tercera_edad = $4,
          edad_tercera_edad = $5
      where id_config = 'default'
    `,
    ['default', payload.monedaBase, payload.monedaAlterna, payload.descuentoTerceraEdad, payload.edadTerceraEdad],
  );

  const config = await getHotelPricingConfig(pool, true);
  response.json({
    monedaBase: config.baseCurrency,
    monedaAlterna: config.secondaryCurrency,
    tipoCambio: config.exchangeRate,
    actualizadoEn: config.exchangeUpdatedAt,
    descuentoTerceraEdad: config.seniorDiscountPercent,
    edadTerceraEdad: config.seniorAge,
    porcentajeImpuesto: config.taxPercent,
  });
}));

app.post('/api/tarifas-personalizadas', asyncHandler(async (request, response) => {
  if (!(await hasFreshHotelSchema())) {
    throw new ApiError(400, 'Las tarifas personalizadas solo están disponibles en el esquema hotelero actual.');
  }

  const payload = customTariffPayloadSchema.parse(request.body);
  if (payload.habitacionId) {
    const room = await getFreshRoomById(payload.habitacionId);
    if (!room) throw new ApiError(404, 'Habitación no encontrada para la tarifa personalizada.');
    if (room.hotelId !== payload.hotelId) {
      throw new ApiError(400, 'La habitación seleccionada no pertenece al hotel indicado.');
    }
  }

  const created = await pool.query(
    `
      insert into public.tarifas_personalizadas_hotel (
        id_hotel,
        id_habitacion,
        nombre_tarifa,
        descripcion,
        moneda,
        monto_noche,
        activa,
        prioridad
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      returning id_tarifa_personalizada
    `,
    [
      payload.hotelId,
      payload.habitacionId ?? null,
      payload.nombre,
      payload.descripcion ?? null,
      payload.moneda,
      payload.montoNoche,
      payload.activa ?? true,
      payload.prioridad ?? 0,
    ],
  );

  const tariff = await getCustomTariffById(created.rows[0].id_tarifa_personalizada as string);
  response.status(201).json(tariff ?? {});
}));

app.put('/api/tarifas-personalizadas/:id', asyncHandler(async (request, response) => {
  if (!(await hasFreshHotelSchema())) {
    throw new ApiError(400, 'Las tarifas personalizadas solo están disponibles en el esquema hotelero actual.');
  }

  const id = routeId(request);
  const payload = customTariffPayloadSchema.parse(request.body);
  const existing = await getCustomTariffById(id);
  if (!existing) throw new ApiError(404, 'Tarifa personalizada no encontrada.');
  if (payload.habitacionId) {
    const room = await getFreshRoomById(payload.habitacionId);
    if (!room) throw new ApiError(404, 'Habitación no encontrada para la tarifa personalizada.');
    if (room.hotelId !== payload.hotelId) {
      throw new ApiError(400, 'La habitación seleccionada no pertenece al hotel indicado.');
    }
  }

  await pool.query(
    `
      update public.tarifas_personalizadas_hotel
      set id_hotel = $2,
          id_habitacion = $3,
          nombre_tarifa = $4,
          descripcion = $5,
          moneda = $6,
          monto_noche = $7,
          activa = $8,
          prioridad = $9
      where id_tarifa_personalizada = $1
    `,
    [
      id,
      payload.hotelId,
      payload.habitacionId ?? null,
      payload.nombre,
      payload.descripcion ?? null,
      payload.moneda,
      payload.montoNoche,
      payload.activa ?? true,
      payload.prioridad ?? 0,
    ],
  );

  const tariff = await getCustomTariffById(id);
  response.json(tariff ?? {});
}));

app.delete('/api/tarifas-personalizadas/:id', asyncHandler(async (request, response) => {
  if (!(await hasFreshHotelSchema())) {
    throw new ApiError(400, 'Las tarifas personalizadas solo están disponibles en el esquema hotelero actual.');
  }

  const id = routeId(request);
  const existing = await getCustomTariffById(id);
  if (!existing) throw new ApiError(404, 'Tarifa personalizada no encontrada.');

  await pool.query('delete from public.tarifas_personalizadas_hotel where id_tarifa_personalizada = $1', [id]);
  response.status(204).send();
}));

app.delete('/api/habitaciones/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);

  if (await hasFreshHotelSchema()) {
    const existing = await getFreshRoomById(id);
    if (!existing) throw new ApiError(404, 'Habitación no encontrada.');

    const reservations = await pool.query(
      `
        select count(*)::int as total
        from public.reservas_hotel
        where id_habitacion = $1
          and estado not in ('cancelada', 'check_out', 'no_show')
      `,
      [id],
    );

    if ((reservations.rows[0]?.total ?? 0) > 0) {
      throw new ApiError(409, 'No se puede eliminar la habitación porque tiene reservas activas asociadas.');
    }

    await pool.query('delete from public.habitaciones where id_habitacion = $1', [id]);
    response.status(204).send();
    return;
  }

  const existing = await getActivityById(id);
  if (!existing) throw new ApiError(404, 'Actividad no encontrada.');

  await pool.query('delete from public.programacion_actividades where id_programacion = $1', [id]);
  response.status(204).send();
}));

app.get('/api/bloqueos-habitacion', asyncHandler(async (request, response) => {
  if (!(await hasFreshHotelSchema())) {
    response.json([]);
    return;
  }

  const hotelId = typeof request.query.hotelId === 'string' ? request.query.hotelId : null;
  const fechaInicio = typeof request.query.fechaInicio === 'string' ? request.query.fechaInicio : null;
  const fechaFin = typeof request.query.fechaFin === 'string' ? request.query.fechaFin : null;

  const result = await pool.query(
    `
      select
        b.id_bloqueo as id,
        b.id_habitacion as "habitacionId",
        h.nombre_habitacion as habitacion,
        h.codigo_habitacion as codigo,
        h.id_hotel as "hotelId",
        hotel.nombre_hotel as hotel,
        b.fecha_inicio as "fechaInicio",
        b.fecha_fin as "fechaFin",
        b.motivo,
        b.created_at as "createdAt"
      from public.bloqueos_habitacion b
      join public.habitaciones h on h.id_habitacion = b.id_habitacion
      join public.hoteles hotel on hotel.id_hotel = h.id_hotel
      where ($1::uuid is null or h.id_hotel = $1::uuid)
        and ($2::timestamptz is null or b.fecha_fin > $2::timestamptz)
        and ($3::timestamptz is null or b.fecha_inicio < $3::timestamptz)
      order by b.fecha_inicio asc, h.codigo_habitacion asc
    `,
    [hotelId, fechaInicio, fechaFin],
  );

  response.json(result.rows);
}));

app.post('/api/bloqueos-habitacion', asyncHandler(async (request, response) => {
  if (!(await hasFreshHotelSchema())) {
    throw new ApiError(400, 'Los bloqueos por fechas solo están disponibles con el esquema hotelero actual.');
  }

  const payload = roomBlockPayloadSchema.parse(request.body);
  const start = new Date(payload.fechaInicio);
  const end = new Date(payload.fechaFin);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new ApiError(400, 'El rango de fechas del bloqueo no es válido.');
  }

  const created = await withTransaction(async (client) => {
    const roomResult = await client.query(
      `
        select id_habitacion, id_hotel
        from public.habitaciones
        where id_habitacion = $1
      `,
      [payload.habitacionId],
    );

    const room = roomResult.rows[0];
    if (!room) throw new ApiError(404, 'La habitación indicada no existe.');

    if (!payload.permitirConReservas) {
      const overlappingReservations = await client.query(
        `
          select count(*)::int as total
          from public.reservas_hotel
          where id_habitacion = $1
            and estado not in ('cancelada', 'check_out', 'no_show')
            and check_out > $2::timestamptz
            and check_in < $3::timestamptz
        `,
        [payload.habitacionId, payload.fechaInicio, payload.fechaFin],
      );

      if ((overlappingReservations.rows[0]?.total ?? 0) > 0) {
        throw new ApiError(409, 'No se puede cerrar la habitación porque ya tiene reservas activas en ese rango. Marca la opción de permitir cierre con reservas si solo quieres bloquear nuevas reservas.');
      }
    }

    const overlappingBlocks = await client.query(
      `
        select count(*)::int as total
        from public.bloqueos_habitacion
        where id_habitacion = $1
          and fecha_fin > $2::timestamptz
          and fecha_inicio < $3::timestamptz
      `,
      [payload.habitacionId, payload.fechaInicio, payload.fechaFin],
    );

    if ((overlappingBlocks.rows[0]?.total ?? 0) > 0) {
      throw new ApiError(409, 'Ya existe un cierre operativo para esa habitación dentro del rango seleccionado.');
    }

    const inserted = await client.query(
      `
        insert into public.bloqueos_habitacion (
          id_habitacion,
          fecha_inicio,
          fecha_fin,
          motivo
        )
        values ($1, $2, $3, $4)
        returning id_bloqueo
      `,
      [payload.habitacionId, payload.fechaInicio, payload.fechaFin, payload.motivo],
    );

    const blockId = inserted.rows[0].id_bloqueo as string;
    const blockResult = await client.query(
      `
        select
          b.id_bloqueo as id,
          b.id_habitacion as "habitacionId",
          h.nombre_habitacion as habitacion,
          h.codigo_habitacion as codigo,
          h.id_hotel as "hotelId",
          hotel.nombre_hotel as hotel,
          b.fecha_inicio as "fechaInicio",
          b.fecha_fin as "fechaFin",
          b.motivo,
          b.created_at as "createdAt"
        from public.bloqueos_habitacion b
        join public.habitaciones h on h.id_habitacion = b.id_habitacion
        join public.hoteles hotel on hotel.id_hotel = h.id_hotel
        where b.id_bloqueo = $1
      `,
      [blockId],
    );

    return blockResult.rows[0] ?? { id: blockId };
  });

  response.status(201).json(created);
}));

app.delete('/api/bloqueos-habitacion/:id', asyncHandler(async (request, response) => {
  if (!(await hasFreshHotelSchema())) {
    throw new ApiError(400, 'Los bloqueos por fechas solo están disponibles con el esquema hotelero actual.');
  }

  const id = routeId(request);
  const existing = await pool.query('select 1 from public.bloqueos_habitacion where id_bloqueo = $1', [id]);
  if (existing.rowCount === 0) throw new ApiError(404, 'Bloqueo no encontrado.');

  await pool.query('delete from public.bloqueos_habitacion where id_bloqueo = $1', [id]);
  response.status(204).send();
}));

app.get('/api/estadias', asyncHandler(async (_request, response) => {
  if (await hasFreshHotelSchema()) {
    const result = await pool.query(
      `
        select
          r.id_reserva_hotel as id,
          r.id_huesped as "clienteId",
          h.nombre_completo as cliente,
          r.id_habitacion as "actividadId",
          room.nombre_habitacion as actividad,
          r.created_at as "fechaReserva",
          r.check_in as horario,
          r.total_reserva as "precioAplicado",
          r.adultos,
          r.ninos,
          hotel.nombre_hotel as sede,
          r.estado as hotel_estado
        from public.reservas_hotel r
        join public.huespedes h on h.id_huesped = r.id_huesped
        join public.habitaciones room on room.id_habitacion = r.id_habitacion
        join public.hoteles hotel on hotel.id_hotel = r.id_hotel
        order by r.check_in asc, r.created_at desc
      `,
    );

    response.json(result.rows.map((row) => withHotelReservationAliases({
      ...row,
      estado: mapHotelStatusToLegacy(row.hotel_estado),
    })));
    return;
  }

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

  response.json(result.rows.map(withHotelReservationAliases));
}));

app.get('/api/estadias/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);

  if (await hasFreshHotelSchema()) {
    const row = await getFreshReservationById(id);
    if (!row) throw new ApiError(404, 'Reserva no encontrada.');
    response.json(withHotelReservationAliases(row));
    return;
  }

  const row = await getReservationById(id);
  if (!row) throw new ApiError(404, 'Reserva no encontrada.');
  response.json(withHotelReservationAliases(row));
}));

app.post('/api/estadias', asyncHandler(async (request, response) => {
  const payload = reservationPayloadSchema.parse(request.body);

  if (await hasFreshHotelSchema()) {
    const checkIn = payload.checkIn ?? payload.fechaReserva ?? new Date(Date.now() + 86_400_000).toISOString();
    const checkOut = payload.checkOut ?? new Date(new Date(checkIn).getTime() + (payload.noches ?? 1) * 86_400_000).toISOString();
    const room = await ensureFreshReservationRules(payload.clienteId, payload.actividadId, checkIn, checkOut);

    const reservationId = await withTransaction(async (client) => {
      const start = new Date(checkIn);
      const end = new Date(checkOut);
      const nights = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
      const finalPrice = payload.precioAplicado ?? Number(room.tarifa_noche) * nights;
      const finalStatus = payload.pago ? 'confirmada' : mapLegacyStatusToHotel(payload.estado);

      const created = await client.query(
        `
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
          values ($1, $2, $3, $4, $5, $6, $7, $8, 'web', $9, $10, $11)
          returning id_reserva_hotel
        `,
        [
          payload.clienteId,
          room.id_hotel,
          payload.actividadId,
          checkIn,
          checkOut,
          payload.adultos ?? 1,
          payload.ninos ?? 0,
          finalStatus,
          finalPrice,
          payload.pago ? finalPrice : 0,
          payload.observaciones ?? null,
        ],
      );

      const createdReservationId = created.rows[0].id_reserva_hotel as string;

      if (payload.pago) {
        await client.query(
          `
            insert into public.pagos_hotel (
              id_reserva_hotel,
              monto,
              metodo_pago,
              referencia,
              fecha_pago,
              estado
            )
            values ($1, $2, $3, $4, $5, 'aplicado')
          `,
          [
            createdReservationId,
            finalPrice,
            payload.pago.metodoPago,
            payload.pago.referencia ?? null,
            payload.pago.fechaPago ?? new Date().toISOString(),
          ],
        );
      }

      await syncFreshReservationPaymentStatus(createdReservationId, client);

      return createdReservationId;
    });

    const reservation = await getFreshReservationById(reservationId);
    response.status(201).json(withHotelReservationAliases(reservation ?? {}));
    return;
  }

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
            id_reserva
          )
          values ($1, $2, $3, $4, $5)
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

    await syncLegacyReservationPaymentStatus(createdReservationId, client);

    return createdReservationId;
  });

  const reservation = await getReservationById(reservationId);
  response.status(201).json(withHotelReservationAliases(reservation ?? {}));
}));

app.put('/api/estadias/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const payload = reservationPayloadSchema.parse(request.body);

  if (await hasFreshHotelSchema()) {
    const existing = await getFreshReservationById(id);
    if (!existing) throw new ApiError(404, 'Reserva no encontrada.');

    const checkIn = payload.checkIn ?? existing.horario;
    const checkOut = payload.checkOut ?? new Date(new Date(checkIn).getTime() + (payload.noches ?? 1) * 86_400_000).toISOString();
    const room = await ensureFreshReservationRules(payload.clienteId, payload.actividadId, checkIn, checkOut, id);
    const nights = Math.max(1, Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000));

    await pool.query(
      `
        update public.reservas_hotel
        set id_huesped = $2,
            id_hotel = $3,
            id_habitacion = $4,
            check_in = $5,
            check_out = $6,
            adultos = $7,
            ninos = $8,
            estado = $9,
            total_reserva = $10,
            observaciones = $11
        where id_reserva_hotel = $1
      `,
      [
        id,
        payload.clienteId,
        room.id_hotel,
        payload.actividadId,
        checkIn,
        checkOut,
        payload.adultos ?? 1,
        payload.ninos ?? 0,
        mapLegacyStatusToHotel(payload.estado),
        payload.precioAplicado ?? Number(room.tarifa_noche) * nights,
        payload.observaciones ?? null,
      ],
    );

    await syncFreshReservationPaymentStatus(id);

    const reservation = await getFreshReservationById(id);
    response.json(withHotelReservationAliases(reservation ?? {}));
    return;
  }

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

  await syncLegacyReservationPaymentStatus(id);

  const reservation = await getReservationById(id);
  response.json(withHotelReservationAliases(reservation ?? {}));
}));

app.delete('/api/estadias/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);

  if (await hasFreshHotelSchema()) {
    const existing = await getFreshReservationById(id);
    if (!existing) throw new ApiError(404, 'Reserva no encontrada.');

    await pool.query('delete from public.reservas_hotel where id_reserva_hotel = $1', [id]);
    response.status(204).send();
    return;
  }

  const existing = await getReservationById(id);
  if (!existing) throw new ApiError(404, 'Reserva no encontrada.');

  await pool.query('delete from public.reservas where id_reserva = $1', [id]);
  response.status(204).send();
}));

app.patch('/api/estadias/:id/cancelar', asyncHandler(async (request, response) => {
  const id = routeId(request);

  if (await hasFreshHotelSchema()) {
    const existing = await getFreshReservationById(id);
    if (!existing) throw new ApiError(404, 'Reserva no encontrada.');

    await pool.query(
      `
        update public.reservas_hotel
        set estado = 'cancelada'
        where id_reserva_hotel = $1
      `,
      [id],
    );

    const reservation = await getFreshReservationById(id);
    response.json(withHotelReservationAliases(reservation ?? {}));
    return;
  }

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
  response.json(withHotelReservationAliases(reservation ?? {}));
}));

app.patch('/api/estadias/:id/reprogramar', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const payload = reservationReschedulePayloadSchema.parse(request.body);

  if (await hasFreshHotelSchema()) {
    const existing = await pool.query(
      'select id_huesped, check_in, check_out from public.reservas_hotel where id_reserva_hotel = $1',
      [id],
    );

    const reservation = existing.rows[0];
    if (!reservation) throw new ApiError(404, 'Reserva no encontrada.');

    const room = await ensureFreshReservationRules(
      reservation.id_huesped,
      payload.actividadId,
      reservation.check_in,
      reservation.check_out,
      id,
    );

    const nights = Math.max(1, Math.ceil((new Date(reservation.check_out).getTime() - new Date(reservation.check_in).getTime()) / 86_400_000));

    await pool.query(
      `
        update public.reservas_hotel
        set id_hotel = $2,
            id_habitacion = $3,
            total_reserva = $4,
            estado = 'confirmada'
        where id_reserva_hotel = $1
      `,
      [id, room.id_hotel, payload.actividadId, Number(room.tarifa_noche) * nights],
    );

    const updated = await getFreshReservationById(id);
    response.json(withHotelReservationAliases(updated ?? {}));
    return;
  }

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
  response.json(withHotelReservationAliases(reservation ?? {}));
}));

app.post('/api/membresias/checkout', asyncHandler(async (request, response) => {
  void request;
  response.status(410).json({ message: 'Las membresias ya no forman parte del flujo hotelero.' });
}));

app.get('/api/pagos', asyncHandler(async (_request, response) => {
  if (await hasFreshHotelSchema()) {
    const result = await pool.query(
      `
        select
          p.id_pago_hotel as id,
          p.monto,
          p.fecha_pago as "fechaPago",
          p.metodo_pago as "metodoPago",
          p.referencia,
          p.id_reserva_hotel as "reservaId",
          null::uuid as "membresiaId",
          h.nombre_completo as cliente,
          room.nombre_habitacion as actividad,
          hotel.nombre_hotel as sede,
          null::text as "tipoPlan"
        from public.pagos_hotel p
        join public.reservas_hotel r on r.id_reserva_hotel = p.id_reserva_hotel
        join public.huespedes h on h.id_huesped = r.id_huesped
        join public.habitaciones room on room.id_habitacion = r.id_habitacion
        join public.hoteles hotel on hotel.id_hotel = r.id_hotel
        order by p.fecha_pago desc
      `,
    );

    response.json(result.rows.map(withHotelPaymentAliases));
    return;
  }

  const result = await pool.query(
    `
      select
        pg.id_pago as id,
        pg.monto,
        pg.fecha_pago as "fechaPago",
        pg.metodo_pago as "metodoPago",
        pg.referencia,
        pg.id_reserva as "reservaId",
        null::uuid as "membresiaId",
        persona.nombre as cliente,
        actividad.nombre_actividad as actividad,
        s.nombre_sede as sede,
        null::text as "tipoPlan"
      from public.pagos pg
      join public.reservas r on r.id_reserva = pg.id_reserva
      left join public.personas persona on persona.id_persona = r.id_cliente
      left join public.programacion_actividades pa on pa.id_programacion = r.id_programacion
      left join public.actividades actividad on actividad.id_actividad = pa.id_actividad
      left join public.sedes s on s.id_sede = pa.id_sede
      order by pg.fecha_pago desc
    `,
  );

  response.json(result.rows.map(withHotelPaymentAliases));
}));

app.post('/api/pagos', asyncHandler(async (request, response) => {
  const payload = paymentPayloadSchema.parse(request.body);

  if (await hasFreshHotelSchema()) {
    if (!payload.reservaId) {
      throw new ApiError(400, 'En la base hotelera nueva solo se aceptan pagos asociados a reservas.');
    }

    const reservationResult = await pool.query(
      'select id_reserva_hotel, total_reserva from public.reservas_hotel where id_reserva_hotel = $1',
      [payload.reservaId],
    );

    const reservation = reservationResult.rows[0];
    if (!reservation) throw new ApiError(404, 'La reserva indicada no existe.');

    const paidResult = await pool.query(
      'select coalesce(sum(monto), 0)::numeric as total from public.pagos_hotel where id_reserva_hotel = $1',
      [payload.reservaId],
    );
    const totalPaid = Number(paidResult.rows[0]?.total ?? 0);
    if (totalPaid + payload.monto > Number(reservation.total_reserva)) {
      throw new ApiError(400, 'El pago supera el saldo de la reserva hotelera.');
    }

    const paymentId = await withTransaction(async (client) => {
      const paymentResult = await client.query(
        `
          insert into public.pagos_hotel (
            id_reserva_hotel,
            monto,
            metodo_pago,
            referencia,
            fecha_pago,
            estado
          )
          values ($1, $2, $3, $4, $5, 'aplicado')
          returning id_pago_hotel
        `,
        [
          payload.reservaId,
          payload.monto,
          payload.metodoPago,
          payload.referencia ?? null,
          payload.fechaPago ?? new Date().toISOString(),
        ],
      );

      await syncFreshReservationPaymentStatus(payload.reservaId, client);
      return paymentResult.rows[0].id_pago_hotel as string;
    });

    const payment = await getFreshPaymentById(paymentId);
    response.status(201).json(payment);
    return;
  }

  await ensurePaymentRules(payload);

  const paymentId = await withTransaction(async (client) => {
    const created = await client.query(
      `
        insert into public.pagos (
          monto,
          fecha_pago,
          metodo_pago,
          referencia,
          id_reserva
        )
        values ($1, $2, $3, $4, $5)
        returning id_pago
      `,
      [
        payload.monto,
        payload.fechaPago ?? new Date().toISOString(),
        payload.metodoPago,
        payload.referencia ?? null,
        payload.reservaId,
      ],
    );

    if (payload.reservaId) {
      await syncLegacyReservationPaymentStatus(payload.reservaId, client);
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

  await withTransaction(async (client) => {
    await client.query(
      `
        update public.pagos
        set monto = $2,
            fecha_pago = $3,
            metodo_pago = $4,
            referencia = $5,
            id_reserva = $6
        where id_pago = $1
      `,
      [
        id,
        payload.monto,
        payload.fechaPago ?? existing.fechaPago,
        payload.metodoPago,
        payload.referencia ?? existing.referencia ?? null,
        payload.reservaId,
      ],
    );

    if (existing.reservaId) {
      await syncLegacyReservationPaymentStatus(existing.reservaId, client);
    }
    if (payload.reservaId && payload.reservaId !== existing.reservaId) {
      await syncLegacyReservationPaymentStatus(payload.reservaId, client);
    }
  });

  const payment = await getPaymentById(id);
  response.json(payment);
}));

app.delete('/api/pagos/:id', asyncHandler(async (request, response) => {
  const id = routeId(request);
  const existing = await getPaymentById(id);
  if (!existing) throw new ApiError(404, 'Pago no encontrado.');

  await withTransaction(async (client) => {
    await client.query('delete from public.pagos where id_pago = $1', [id]);
    if (existing.reservaId) {
      await syncLegacyReservationPaymentStatus(existing.reservaId, client);
    }
  });

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