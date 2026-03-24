import { supabase } from './supabaseClient';

const API_BASE_URL = (() => {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined' && !import.meta.env.DEV) return `${window.location.origin}/api`;
  return 'http://localhost:4000/api';
})();

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = 'No se pudo completar la solicitud al backend.';

    try {
      const payload = await response.json() as { error?: string; message?: string };
      message = payload.error ?? payload.message ?? message;
    } catch {
      // Si no hay JSON válido, mantenemos el mensaje por defecto.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

const toPersonPayload = (input: OperationalUserInput) => ({
  nombre: input.nombre,
  correo: input.correo,
  telefonos: input.telefono?.trim() ? [input.telefono.trim()] : [],
  direccion: {
    ciudad: input.ciudad?.trim() || undefined,
    colonia: input.colonia?.trim() || undefined,
    calle: input.calle?.trim() || undefined,
  },
  fechaNacimiento: input.fechaNacimiento?.trim() || undefined,
  roles: {
    cliente: input.esCliente,
    entrenador: input.esEntrenador,
  },
  especialidad: input.esEntrenador ? input.especialidad?.trim() || undefined : undefined,
  estadoLaboral: input.esEntrenador ? input.estadoLaboral ?? 'Activo' : undefined,
});

type PersonaRow = {
  id_persona: string;
  nombre: string;
  correo: string;
  direccion_ciudad?: string | null;
  direccion_colonia?: string | null;
  direccion_calle?: string | null;
  fecha_nacimiento?: string | null;
};

type TelefonoRow = {
  id_persona: string;
  telefono: string;
};

type ClienteRow = {
  id_persona: string;
  fecha_registro?: string | null;
};

type EntrenadorRow = {
  id_persona: string;
  especialidad?: string | null;
  estado_laboral?: string | null;
};

type SedeRow = {
  id_sede: string;
  nombre_sede: string;
  ubicacion: string;
};

type ActividadRow = {
  id_actividad: string;
  nombre_actividad: string;
  descripcion?: string | null;
  tipo?: string | null;
};

type ProgramacionRow = {
  id_programacion: string;
  id_sede: string | null;
  id_actividad: string | null;
  id_entrenador: string | null;
  horario: string;
  cupo_maximo: number;
  costo: number;
};

type ReservaRow = {
  id_reserva: string;
  id_cliente: string | null;
  id_programacion: string | null;
  fecha_reserva?: string | null;
  precio_aplicado: number;
  estado: 'creada' | 'confirmada' | 'cancelada' | 'completada';
};

type PagoRow = {
  id_pago: string;
  monto: number;
  fecha_pago?: string | null;
  metodo_pago?: string | null;
  referencia?: string | null;
  id_reserva?: string | null;
};

type ConfiguracionOperativaRow = {
  id_config: string;
  ciudad_base: string;
  horas_anticipacion_reserva: number;
  umbral_ocupacion: number;
  auto_confirmar_pagos: boolean;
  permitir_edicion_entrenador: boolean;
  hora_cierre: string;
};

type FreshHotelRow = {
  id_hotel: string;
  nombre_hotel: string;
  ciudad?: string | null;
  direccion?: string | null;
  estado?: string | null;
};

type FreshRoomTypeRow = {
  id_tipo_habitacion: string;
  nombre_tipo: string;
  descripcion?: string | null;
};

type FreshRoomRow = {
  id_habitacion: string;
  id_hotel: string;
  id_tipo_habitacion?: string | null;
  codigo_habitacion?: string | null;
  nombre_habitacion: string;
  capacidad: number;
  tarifa_noche: number;
  estado?: string | null;
  created_at?: string | null;
};

type FreshReservationHotelRow = {
  id_reserva_hotel: string;
  id_huesped: string;
  id_hotel: string;
  id_habitacion: string;
  check_in: string;
  check_out: string;
  adultos?: number;
  ninos?: number;
  estado: string;
  total_reserva: number;
  anticipo?: number | null;
  observaciones?: string | null;
};

export type ReservaView = {
  id: string;
  programacionId: string | null;
  huesped: string;
  huespedId: string | null;
  habitacion: string;
  hotel: string;
  responsable: string;
  cliente: string;
  clienteId: string | null;
  servicio: string;
  fecha: string;
  estado: string;
  sede: string;
  entrenador: string;
  precioAplicado: number;
  capacidad: number;
  inscritos: number;
};

export type EstadiaView = ReservaView & {
  huesped: string;
  hotel: string;
  habitacion: string;
  responsable: string;
  checkIn: string;
  checkOut: string;
  adultos?: number;
  ninos?: number;
  noches: number;
  total: number;
  observaciones?: string;
  anticipo?: number;
};

export type HuespedView = {
  id: string;
  nombre: string;
  correo: string;
  telefono?: string;
  ciudad: string;
  fechaRegistro: string;
  estado: 'Activo' | 'Sin reservas';
  pagos: Array<{
    id: string;
    monto: number;
    fecha: string;
    metodo: string;
    referencia: string;
  }>;
};

export type OperationalUserView = {
  id: string;
  nombre: string;
  correo: string;
  telefono: string;
  ciudad: string;
  colonia?: string;
  calle?: string;
  fechaNacimiento?: string;
  esCliente: boolean;
  esEntrenador: boolean;
  fechaRegistro?: string;
  especialidad?: string;
  estadoLaboral?: string;
  tipoPerfil: 'cliente' | 'entrenador' | 'cliente_y_entrenador' | 'persona';
};

export type OperationalSettings = {
  ciudadBase: string;
  horasAnticipacionReserva: number;
  umbralOcupacion: number;
  autoConfirmarPagos: boolean;
  permitirEdicionEntrenador: boolean;
  horaCierre: string;
};

export type SupportedCurrency = 'USD' | 'HNL';

export type TariffConfigView = {
  monedaBase: SupportedCurrency;
  monedaAlterna: SupportedCurrency;
  tipoCambio: number;
  actualizadoEn: string;
  descuentoTerceraEdad: number;
  edadTerceraEdad: number;
  porcentajeImpuesto: number;
};

export type CurrentRoomTariffView = {
  id: string;
  hotelId: string;
  hotel: string;
  tipoHabitacionId?: string | null;
  tipo: string;
  codigo: string;
  habitacion: string;
  montoNoche: number;
  estado: string;
};

export type CustomTariffView = {
  id: string;
  hotelId: string;
  hotel: string;
  habitacionId?: string | null;
  habitacion?: string | null;
  codigo?: string | null;
  nombre: string;
  descripcion?: string;
  moneda: SupportedCurrency;
  montoNoche: number;
  activa: boolean;
  prioridad: number;
  createdAt?: string;
  updatedAt?: string;
};

export type TariffCatalogView = {
  config: TariffConfigView;
  actuales: CurrentRoomTariffView[];
  personalizadas: CustomTariffView[];
};

export type TariffConfigInput = {
  monedaBase: SupportedCurrency;
  monedaAlterna: SupportedCurrency;
  descuentoTerceraEdad: number;
  edadTerceraEdad: number;
};

export type CustomTariffInput = {
  hotelId: string;
  habitacionId?: string | null;
  nombre: string;
  descripcion?: string;
  montoNoche: number;
  moneda: SupportedCurrency;
  activa?: boolean;
  prioridad?: number;
};

export type PagoView = {
  id: string;
  tipo: 'reserva';
  huesped: string;
  huespedId: string | null;
  estadia: string;
  hotel: string;
  estadiaId: string | null;
  cliente: string;
  clienteId: string | null;
  correo: string;
  concepto: string;
  sede: string;
  monto: number;
  fecha: string;
  metodo: string;
  referencia: string;
  reservaId: string | null;
  membresiaId: null;
};

export type PersonalView = {
  id: string;
  nombre: string;
  especialidad: string;
  estadoLaboral: string;
  hotelHoy: string;
  sedeHoy: string;
  workload: number;
  assignedCount: number;
  rating: number;
  availability: string;
  schedule: Array<{
    id: string;
    actividad: string;
    horario: string;
    hotel: string;
    sede: string;
  }>;
};

export type HabitacionView = {
  id: string;
  nombre: string;
  tipo: string;
  costo: string;
  responsable: string;
  instructor: string;
  hotel: string;
  sede: string;
  horario: string;
  fechaISO: string;
  capacidad: number;
  inscritos: number;
  estadoOperativo?: string;
};

export type RoomBlockView = {
  id: string;
  habitacionId: string;
  habitacion: string;
  codigo?: string;
  hotelId: string;
  hotel: string;
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
  createdAt?: string;
};

export type InventarioHabitacionView = HabitacionView & {
  hotel: string;
  categoria: string;
  disponible: number;
  tarifa: string;
};

export type HotelView = {
  id: string;
  nombre: string;
  ubicacion: string;
  habitaciones: number;
  personalAsignado: number;
  actividades: number;
  entrenadores: number;
  reservas: number;
};

export type DashboardData = {
  huespedes: number;
  reservasHoy: number;
  habitaciones: number;
  dataMensual: Array<{ name: string; reservas: number }>;
  week: number[];
  retentionPercent: number;
  nuevosHuespedes: number;
  pagosPendientes: number;
  habitacionesLlenas: number;
  recentActivity: string[];
};

export type TrainerFormInput = {
  nombre: string;
  correo: string;
  fechaNacimiento: string;
  especialidad: string;
  estadoLaboral: string;
};

export type PersonalFormInput = TrainerFormInput;

export type ServiceFormInput = {
  nombre: string;
  descripcion: string;
  tipo: 'Clase grupal' | 'Servicio';
  sedeId: string;
  entrenadorId: string;
  horario: string;
  cupoMaximo: number;
  costo: number;
};

export type RoomOperationalStatus = 'disponible' | 'ocupada' | 'mantenimiento' | 'bloqueada' | 'limpieza';

export type HabitacionFormInput = Omit<ServiceFormInput, 'sedeId' | 'entrenadorId'> & {
  hotelId: string;
  responsableId: string;
  codigo: string;
  piso: number;
  estadoOperativo: RoomOperationalStatus;
};

export type PaymentFormInput = {
  referencia: string;
  metodoPago: 'efectivo' | 'tarjeta' | 'transferencia' | 'deposito' | 'otro';
  monto: number;
  fechaPago?: string;
  reservaId?: string;
};

export type ReservationCheckoutInput = {
  referencia?: string;
  metodoPago: PaymentFormInput['metodoPago'];
  fechaPago?: string;
};

export type ReservationCreateInput = {
  clienteId: string;
  actividadId: string;
  estado?: 'creada' | 'confirmada' | 'cancelada' | 'completada';
  pago?: ReservationCheckoutInput;
};

export type EstadiaCreateInput = Omit<ReservationCreateInput, 'clienteId' | 'actividadId'> & {
  huespedId: string;
  habitacionId: string;
};

export type HotelReservationCreateInput = EstadiaCreateInput & {
  checkIn?: string;
  checkOut?: string;
  noches?: number;
  adultos?: number;
  ninos?: number;
  observaciones?: string;
  precioAplicado?: number;
};

export type ClientProfileInput = {
  nombre: string;
  correo: string;
  fechaNacimiento: string;
};

export type OperationalUserInput = {
  nombre: string;
  correo: string;
  telefono?: string;
  ciudad?: string;
  colonia?: string;
  calle?: string;
  fechaNacimiento?: string;
  esCliente: boolean;
  esEntrenador: boolean;
  especialidad?: string;
  estadoLaboral?: 'Activo' | 'Inactivo' | 'Vacaciones';
};

const defaultOperationalSettings: OperationalSettings = {
  ciudadBase: 'Tegucigalpa',
  horasAnticipacionReserva: 12,
  umbralOcupacion: 85,
  autoConfirmarPagos: true,
  permitirEdicionEntrenador: true,
  horaCierre: '21:00',
};

export type AccessProfile = {
  userId: string;
  email: string;
  fullName: string;
  role: 'admin' | 'super_admin';
  personaId: string | null;
  personaNombre: string | null;
  telefono: string | null;
  profileType: string;
  emailConfirmed: boolean;
  lastSignInAt: string | null;
};

export type AccessInvitationRole = 'admin' | 'super_admin';

export type AccessAuditEntry = {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  targetUserId: string | null;
  targetEmail: string | null;
  action: string;
  previousRole: string | null;
  nextRole: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AccessInvitation = {
  id: string;
  email: string;
  fullName: string | null;
  role: 'admin' | 'super_admin';
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  inviteToken: string;
  invitedBy: string | null;
  invitedByEmail: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

export type InvitationValidation = {
  email: string;
  fullName: string | null;
  role: 'admin' | 'super_admin';
  expiresAt: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
};

const formatCurrency = (value: number) => `${value.toFixed(2)} USD`;

const buildFallbackName = (prefix: string, id?: string | null, email?: string | null) => {
  if (email) {
    const local = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
    if (local) {
      return local
        .split(' ')
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }
  }

  return id ? `${prefix} ${id.slice(0, 8)}` : `${prefix} sin registro`;
};

const formatDateLabel = (date: Date, options: Intl.DateTimeFormatOptions) =>
  date.toLocaleDateString('es-ES', options);

const startOfDayKey = (dateLike: string | Date) => new Date(dateLike).toISOString().slice(0, 10);
const toNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getAvailability = (schedule: Array<{ horario: string }>) => {
  if (schedule.length === 0) return 'Disponible';
  const now = new Date();
  const todayKey = startOfDayKey(now);
  const todaySchedules = schedule.filter(item => startOfDayKey(item.horario) === todayKey);
  if (todaySchedules.length === 0) return 'Disponible';
  return todaySchedules.some(item => new Date(item.horario).getHours() <= now.getHours()) ? 'En Clase' : 'Disponible';
};

const DEFAULT_STAY_NIGHTS = 1;

const getCheckOutDate = (checkIn: string, nights = DEFAULT_STAY_NIGHTS) => {
  const date = new Date(checkIn);
  date.setDate(date.getDate() + Math.max(1, nights));
  return date.toISOString();
};

const mapHotelReservationStatus = (status?: string | null) => {
  if (status === 'pendiente') return 'creada';
  if (status === 'confirmada' || status === 'check_in') return 'confirmada';
  if (status === 'check_out') return 'completada';
  return 'cancelada';
};

const formatRoomOperationalStatus = (status?: string | null) => {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return 'disponible';
  if (normalized === 'bloqueada') return 'bloqueada';
  if (normalized === 'mantenimiento') return 'mantenimiento';
  if (normalized === 'limpieza') return 'limpieza';
  return normalized;
};

const normalizeEstadiaCreateInput = (input: ReservationCreateInput | EstadiaCreateInput | HotelReservationCreateInput): HotelReservationCreateInput => {
  const huespedId = 'huespedId' in input ? input.huespedId : input.clienteId;
  const habitacionId = 'habitacionId' in input ? input.habitacionId : input.actividadId;

  if (!huespedId) {
    throw new Error('El huésped es obligatorio para crear la estadía.');
  }

  if (!habitacionId) {
    throw new Error('La habitación es obligatoria para crear la estadía.');
  }

  return {
    clienteId: huespedId,
    actividadId: habitacionId,
    estado: input.estado,
    pago: input.pago,
    precioAplicado: 'precioAplicado' in input ? input.precioAplicado : undefined,
    checkIn: 'checkIn' in input ? input.checkIn : undefined,
    checkOut: 'checkOut' in input ? input.checkOut : undefined,
    noches: 'noches' in input ? input.noches : undefined,
    adultos: 'adultos' in input ? input.adultos : undefined,
    ninos: 'ninos' in input ? input.ninos : undefined,
    observaciones: 'observaciones' in input ? input.observaciones : undefined,
  };
};

type NormalizedRoomInput = ServiceFormInput & {
  codigo: string;
  piso: number;
  estadoOperativo: RoomOperationalStatus;
};

const normalizeHabitacionFormInput = (input: ServiceFormInput | HabitacionFormInput): NormalizedRoomInput => {
  const hotelId = 'hotelId' in input ? input.hotelId : input.sedeId;
  const responsableId = 'responsableId' in input ? input.responsableId : input.entrenadorId;
  const codigo = 'codigo' in input ? input.codigo : input.nombre;
  const piso = 'piso' in input ? input.piso : 1;
  const estadoOperativo = 'estadoOperativo' in input ? input.estadoOperativo : 'disponible';

  if (!hotelId) {
    throw new Error('El hotel es obligatorio para registrar la habitación.');
  }

  if (!input.nombre.trim()) {
    throw new Error('El nombre de la habitación es obligatorio.');
  }

  if ('descripcion' in input && !input.descripcion.trim()) {
    throw new Error('La descripción de la habitación es obligatoria.');
  }

  if (!codigo.trim()) {
    throw new Error('El código de la habitación es obligatorio.');
  }

  return {
    nombre: input.nombre,
    descripcion: input.descripcion,
    tipo: input.tipo,
    sedeId: hotelId,
    entrenadorId: responsableId || '',
    horario: input.horario,
    cupoMaximo: input.cupoMaximo,
    costo: input.costo,
    codigo: codigo.trim().toUpperCase(),
    piso,
    estadoOperativo,
  };
};

export async function fetchHotelData() {
  const payload = await apiRequest<{
    personas: PersonaRow[];
    telefonos: TelefonoRow[];
    clientes: ClienteRow[];
    entrenadores: EntrenadorRow[];
    sedes: SedeRow[];
    actividades: ActividadRow[];
    programaciones: ProgramacionRow[];
    reservas: ReservaRow[];
    pagos: PagoRow[];
    configuracionOperativa: ConfiguracionOperativaRow[];
    hoteles?: FreshHotelRow[];
    tiposHabitacion?: FreshRoomTypeRow[];
    habitacionesHotel?: FreshRoomRow[];
    reservasHotel?: FreshReservationHotelRow[];
  }>('/operational-data');

  const {
    personas,
    telefonos,
    clientes,
    entrenadores,
    sedes,
    actividades,
  } = payload;
  const programaciones = payload.programaciones.map((item) => ({
    ...item,
    cupo_maximo: toNumber(item.cupo_maximo),
    costo: toNumber(item.costo),
  }));
  const reservas = payload.reservas.map((item) => ({
    ...item,
    precio_aplicado: toNumber(item.precio_aplicado),
  }));
  const pagos = payload.pagos.map((item) => ({
    ...item,
    monto: toNumber(item.monto),
  }));
  const configuracionOperativa = payload.configuracionOperativa.map((item) => ({
    ...item,
    horas_anticipacion_reserva: toNumber(item.horas_anticipacion_reserva),
    umbral_ocupacion: toNumber(item.umbral_ocupacion),
  }));

  const personasMap = new Map(personas.map(item => [item.id_persona, item]));
  const telefonosMap = new Map(telefonos.map(item => [item.id_persona, item.telefono]));
  const clientesMap = new Map(clientes.map(item => [item.id_persona, item]));
  const entrenadoresMap = new Map(entrenadores.map(item => [item.id_persona, item]));
  const sedesMap = new Map(sedes.map(item => [item.id_sede, item]));
  const actividadesMap = new Map(actividades.map(item => [item.id_actividad, item]));
  const reservasByProgramacion = new Map<string, ReservaRow[]>();

  for (const reserva of reservas) {
    if (!reserva.id_programacion) continue;
    const current = reservasByProgramacion.get(reserva.id_programacion) ?? [];
    current.push(reserva);
    reservasByProgramacion.set(reserva.id_programacion, current);
  }

  const programacionesMap = new Map(programaciones.map(item => [item.id_programacion, item]));

  const reservasView: ReservaView[] = reservas.map(reserva => {
    const programacion = reserva.id_programacion ? programacionesMap.get(reserva.id_programacion) : null;
    const cliente = reserva.id_cliente ? personasMap.get(reserva.id_cliente) : null;
    const actividad = programacion?.id_actividad ? actividadesMap.get(programacion.id_actividad) : null;
    const sede = programacion?.id_sede ? sedesMap.get(programacion.id_sede) : null;
    const entrenador = programacion?.id_entrenador ? personasMap.get(programacion.id_entrenador) : null;
    const inscritos = programacion ? (reservasByProgramacion.get(programacion.id_programacion)?.length ?? 0) : 0;

    return {
      id: reserva.id_reserva,
      programacionId: reserva.id_programacion,
      huesped: cliente?.nombre?.trim() || buildFallbackName('Huesped', reserva.id_cliente, cliente?.correo),
      huespedId: reserva.id_cliente,
      habitacion: actividad?.nombre_actividad ?? 'Sin habitación',
      hotel: sede?.nombre_sede ?? 'Sin hotel',
      responsable: entrenador?.nombre?.trim() || buildFallbackName('Responsable', programacion?.id_entrenador, entrenador?.correo),
      cliente: cliente?.nombre?.trim() || buildFallbackName('Cliente', reserva.id_cliente, cliente?.correo),
      clienteId: reserva.id_cliente,
      servicio: actividad?.nombre_actividad ?? 'Sin servicio',
      fecha: programacion?.horario ?? reserva.fecha_reserva ?? new Date().toISOString(),
      estado: reserva.estado,
      sede: sede?.nombre_sede ?? 'Sin sede',
      entrenador: entrenador?.nombre?.trim() || buildFallbackName('Entrenador', programacion?.id_entrenador, entrenador?.correo),
      precioAplicado: reserva.precio_aplicado,
      capacidad: programacion?.cupo_maximo ?? 0,
      inscritos,
    };
  });

  const pagosByReserva = new Map<string, PagoRow[]>();
  for (const pago of pagos) {
    if (!pago.id_reserva) continue;
    const current = pagosByReserva.get(pago.id_reserva) ?? [];
    current.push(pago);
    pagosByReserva.set(pago.id_reserva, current);
  }

  const pagosByCliente = new Map<string, HuespedView['pagos']>();
  for (const reserva of reservas) {
    if (!reserva.id_cliente) continue;
    const pagosReserva = pagosByReserva.get(reserva.id_reserva) ?? [];
    const current = pagosByCliente.get(reserva.id_cliente) ?? [];
    for (const pago of pagosReserva) {
      current.push({
        id: pago.id_pago,
        monto: pago.monto,
        fecha: pago.fecha_pago ?? '',
        metodo: pago.metodo_pago ?? 'N/D',
        referencia: pago.referencia ?? 'N/D',
      });
    }
    pagosByCliente.set(reserva.id_cliente, current);
  }

  const huespedesView: HuespedView[] = clientes.map(cliente => {
    const persona = personasMap.get(cliente.id_persona);
    const pagosCliente = pagosByCliente.get(cliente.id_persona) ?? [];

    return {
      id: cliente.id_persona,
      nombre: persona?.nombre?.trim() || buildFallbackName('Huesped', cliente.id_persona, persona?.correo),
      correo: persona?.correo ?? '',
      telefono: telefonosMap.get(cliente.id_persona),
      ciudad: persona?.direccion_ciudad ?? 'Sin ciudad',
      fechaRegistro: cliente.fecha_registro ?? '',
      estado: pagosCliente.length > 0 ? 'Activo' : 'Sin reservas',
      pagos: pagosCliente
        .sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime()),
    };
  });

  const usuariosView: OperationalUserView[] = personas.map(persona => {
    const cliente = clientesMap.get(persona.id_persona) ?? null;
    const entrenador = entrenadoresMap.get(persona.id_persona) ?? null;
    const esCliente = Boolean(cliente);
    const esEntrenador = Boolean(entrenador);
    const tipoPerfil = esCliente && esEntrenador
      ? 'cliente_y_entrenador'
      : esCliente
        ? 'cliente'
        : esEntrenador
          ? 'entrenador'
          : 'persona';

    return {
      id: persona.id_persona,
      nombre: persona.nombre?.trim() || buildFallbackName('Usuario', persona.id_persona, persona.correo),
      correo: persona.correo ?? '',
      telefono: telefonosMap.get(persona.id_persona) ?? '',
      ciudad: persona.direccion_ciudad ?? 'Sin ciudad',
      colonia: persona.direccion_colonia ?? undefined,
      calle: persona.direccion_calle ?? undefined,
      fechaNacimiento: persona.fecha_nacimiento ?? undefined,
      esCliente,
      esEntrenador,
      fechaRegistro: cliente?.fecha_registro ?? undefined,
      especialidad: entrenador?.especialidad ?? undefined,
      estadoLaboral: entrenador?.estado_laboral ?? undefined,
      tipoPerfil,
    };
  });

  const settingsRow = configuracionOperativa[0];
  const operationalSettings: OperationalSettings = settingsRow
    ? {
        ciudadBase: settingsRow.ciudad_base,
        horasAnticipacionReserva: settingsRow.horas_anticipacion_reserva,
        umbralOcupacion: settingsRow.umbral_ocupacion,
        autoConfirmarPagos: settingsRow.auto_confirmar_pagos,
        permitirEdicionEntrenador: settingsRow.permitir_edicion_entrenador,
        horaCierre: settingsRow.hora_cierre,
      }
    : defaultOperationalSettings;

  const pagosView: PagoView[] = pagos.map(pago => {
    const reserva = pago.id_reserva ? reservas.find(item => item.id_reserva === pago.id_reserva) ?? null : null;
    const reservaProgramacion = reserva?.id_programacion ? programacionesMap.get(reserva.id_programacion) ?? null : null;
    const reservaActividad = reservaProgramacion?.id_actividad ? actividadesMap.get(reservaProgramacion.id_actividad) ?? null : null;
    const reservaSede = reservaProgramacion?.id_sede ? sedesMap.get(reservaProgramacion.id_sede) ?? null : null;
    const reservaCliente = reserva?.id_cliente ? personasMap.get(reserva.id_cliente) ?? null : null;
    const cliente = reservaCliente;

    return {
      id: pago.id_pago,
      tipo: 'reserva',
      huesped: cliente?.nombre?.trim() || buildFallbackName('Huesped', reserva?.id_cliente, cliente?.correo),
      huespedId: reserva?.id_cliente ?? null,
      estadia: reservaActividad?.nombre_actividad ?? 'Estadía sin habitación',
      hotel: reservaSede?.nombre_sede ?? 'Sin hotel',
      estadiaId: pago.id_reserva ?? null,
      cliente: cliente?.nombre?.trim() || buildFallbackName('Cliente', reserva?.id_cliente, cliente?.correo),
      clienteId: reserva?.id_cliente ?? null,
      correo: cliente?.correo ?? '',
      concepto: reservaActividad?.nombre_actividad ?? 'Reserva sin actividad',
      sede: reservaSede?.nombre_sede ?? 'Sin sede',
      monto: pago.monto,
      fecha: pago.fecha_pago ?? '',
      metodo: pago.metodo_pago ?? 'N/D',
      referencia: pago.referencia ?? 'N/D',
      reservaId: pago.id_reserva ?? null,
      membresiaId: null,
    };
  });

  const scheduleByTrainer = new Map<string, PersonalView['schedule']>();
  for (const programacion of programaciones) {
    if (!programacion.id_entrenador) continue;
    const actividad = programacion.id_actividad ? actividadesMap.get(programacion.id_actividad) : null;
    const sede = programacion.id_sede ? sedesMap.get(programacion.id_sede) : null;
    const current = scheduleByTrainer.get(programacion.id_entrenador) ?? [];
    current.push({
      id: programacion.id_programacion,
      actividad: actividad?.nombre_actividad ?? 'Sin actividad',
      horario: programacion.horario,
      hotel: sede?.nombre_sede ?? 'Sin hotel',
      sede: sede?.nombre_sede ?? 'Sin sede',
    });
    scheduleByTrainer.set(programacion.id_entrenador, current);
  }

  const assignedByTrainer = new Map<string, number>();
  for (const programacion of programaciones) {
    if (!programacion.id_entrenador) continue;
    const count = reservasByProgramacion.get(programacion.id_programacion)?.length ?? 0;
    assignedByTrainer.set(
      programacion.id_entrenador,
      (assignedByTrainer.get(programacion.id_entrenador) ?? 0) + count,
    );
  }

  const personalView: PersonalView[] = entrenadores.map(entrenador => {
    const persona = personasMap.get(entrenador.id_persona);
    const schedule = scheduleByTrainer.get(entrenador.id_persona) ?? [];
    const workload = schedule.length;
    const sedeHoy = schedule[0]?.sede ?? 'Sin sede';
    const assignedCount = assignedByTrainer.get(entrenador.id_persona) ?? 0;

    return {
      id: entrenador.id_persona,
      nombre: persona?.nombre?.trim() || buildFallbackName('Responsable', entrenador.id_persona, persona?.correo),
      especialidad: entrenador.especialidad ?? 'General',
      estadoLaboral: entrenador.estado_laboral ?? 'Activo',
      hotelHoy: sedeHoy,
      sedeHoy,
      workload,
      assignedCount,
      rating: Math.min(5, Math.max(1, Math.round((assignedCount || 1) / Math.max(1, workload || 1)))),
      availability: getAvailability(schedule),
      schedule,
    };
  });

  let habitacionesView: HabitacionView[] = programaciones.map(programacion => {
    const actividad = programacion.id_actividad ? actividadesMap.get(programacion.id_actividad) : null;
    const entrenador = programacion.id_entrenador ? personasMap.get(programacion.id_entrenador) : null;
    const sede = programacion.id_sede ? sedesMap.get(programacion.id_sede) : null;
    const inscritos = reservasByProgramacion.get(programacion.id_programacion)?.filter(item => item.estado !== 'cancelada').length ?? 0;
    const date = new Date(programacion.horario);

    return {
      id: programacion.id_programacion,
      nombre: actividad?.nombre_actividad ?? 'Sin actividad',
      tipo: actividad?.tipo ?? 'Sin tipo',
      costo: formatCurrency(programacion.costo),
      responsable: entrenador?.nombre ?? 'Sin responsable',
      instructor: entrenador?.nombre ?? 'Sin instructor',
      hotel: sede?.nombre_sede ?? 'Sin hotel',
      sede: sede?.nombre_sede ?? 'Sin sede',
      horario: date.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }),
      fechaISO: programacion.horario,
      capacidad: programacion.cupo_maximo,
      inscritos,
      estadoOperativo: inscritos >= programacion.cupo_maximo && programacion.cupo_maximo > 0 ? 'ocupada' : 'disponible',
    };
  });

  const reservasBySede = new Map<string, number>();
  for (const reserva of reservasView) {
    reservasBySede.set(reserva.sede, (reservasBySede.get(reserva.sede) ?? 0) + 1);
  }

  const actividadesBySede = new Map<string, number>();
  const entrenadoresBySede = new Map<string, Set<string>>();
  for (const programacion of programaciones) {
    const sede = programacion.id_sede ? sedesMap.get(programacion.id_sede) : null;
    if (!sede) continue;
    actividadesBySede.set(sede.nombre_sede, (actividadesBySede.get(sede.nombre_sede) ?? 0) + 1);
    const current = entrenadoresBySede.get(sede.nombre_sede) ?? new Set<string>();
    if (programacion.id_entrenador) current.add(programacion.id_entrenador);
    entrenadoresBySede.set(sede.nombre_sede, current);
  }

  let hotelesView: HotelView[] = sedes.map(sede => ({
    id: sede.id_sede,
    nombre: sede.nombre_sede,
    ubicacion: sede.ubicacion,
    habitaciones: actividadesBySede.get(sede.nombre_sede) ?? 0,
    personalAsignado: entrenadoresBySede.get(sede.nombre_sede)?.size ?? 0,
    actividades: actividadesBySede.get(sede.nombre_sede) ?? 0,
    entrenadores: entrenadoresBySede.get(sede.nombre_sede)?.size ?? 0,
    reservas: reservasBySede.get(sede.nombre_sede) ?? 0,
  }));

  let estadiasView: EstadiaView[] = reservasView.map((reserva) => ({
    ...reserva,
    huesped: reserva.cliente,
    hotel: reserva.sede,
    habitacion: reserva.servicio,
    responsable: reserva.entrenador,
    checkIn: reserva.fecha,
    checkOut: getCheckOutDate(reserva.fecha),
    noches: DEFAULT_STAY_NIGHTS,
    total: reserva.precioAplicado,
  }));

  if (payload.habitacionesHotel && payload.reservasHotel && payload.hoteles && payload.tiposHabitacion) {
    const freshHoteles = payload.hoteles;
    const freshHabitaciones = payload.habitacionesHotel.map((item) => ({
      ...item,
      capacidad: toNumber(item.capacidad),
      tarifa_noche: toNumber(item.tarifa_noche),
    }));
    const freshReservasHotel = payload.reservasHotel.map((item) => ({
      ...item,
      total_reserva: toNumber(item.total_reserva),
      anticipo: toNumber(item.anticipo),
    }));
    const roomTypesMap = new Map(payload.tiposHabitacion.map((item) => [item.id_tipo_habitacion, item]));
    const freshHotelsMap = new Map(freshHoteles.map((item) => [item.id_hotel, item]));
    const freshRoomsMap = new Map(freshHabitaciones.map((item) => [item.id_habitacion, item]));
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(todayStart.getDate() + 1);
    const activeReservationsByRoom = new Map<string, FreshReservationHotelRow[]>();

    freshReservasHotel
      .filter((item) => item.estado !== 'cancelada' && item.estado !== 'no_show')
      .forEach((item) => {
        const current = activeReservationsByRoom.get(item.id_habitacion) ?? [];
        current.push(item);
        activeReservationsByRoom.set(item.id_habitacion, current);
      });

    habitacionesView = freshHabitaciones.map((room) => {
      const roomType = room.id_tipo_habitacion ? roomTypesMap.get(room.id_tipo_habitacion) : null;
      const hotel = freshHotelsMap.get(room.id_hotel);
      const activeTodayCount = (activeReservationsByRoom.get(room.id_habitacion) ?? []).filter((reservation) => {
        const checkIn = new Date(reservation.check_in);
        const checkOut = new Date(reservation.check_out);
        return checkOut > todayStart && checkIn < tomorrowStart;
      }).length;

      return {
        id: room.id_habitacion,
        nombre: room.nombre_habitacion || room.codigo_habitacion || 'Habitación sin nombre',
        tipo: roomType?.nombre_tipo ?? 'Habitación',
        costo: formatCurrency(room.tarifa_noche),
        responsable: 'Sin responsable',
        instructor: 'Sin responsable',
        hotel: hotel?.nombre_hotel ?? 'Sin hotel',
        sede: hotel?.nombre_hotel ?? 'Sin sede',
        horario: formatRoomOperationalStatus(room.estado),
        fechaISO: room.created_at ?? new Date().toISOString(),
        capacidad: room.capacidad,
        inscritos: activeTodayCount,
        estadoOperativo: formatRoomOperationalStatus(room.estado),
      };
    });

    const roomCountByHotel = new Map<string, number>();
    freshHabitaciones.forEach((room) => {
      roomCountByHotel.set(room.id_hotel, (roomCountByHotel.get(room.id_hotel) ?? 0) + 1);
    });

    const reservationCountByHotel = new Map<string, number>();
    freshReservasHotel.forEach((reservation) => {
      reservationCountByHotel.set(reservation.id_hotel, (reservationCountByHotel.get(reservation.id_hotel) ?? 0) + 1);
    });

    hotelesView = freshHoteles.map((hotel) => ({
      id: hotel.id_hotel,
      nombre: hotel.nombre_hotel,
      ubicacion: [hotel.ciudad, hotel.direccion].filter(Boolean).join(' - ') || 'Sin ubicación',
      habitaciones: roomCountByHotel.get(hotel.id_hotel) ?? 0,
      personalAsignado: 0,
      actividades: roomCountByHotel.get(hotel.id_hotel) ?? 0,
      entrenadores: 0,
      reservas: reservationCountByHotel.get(hotel.id_hotel) ?? 0,
    }));

    estadiasView = freshReservasHotel.map((reservation) => {
      const guest = personasMap.get(reservation.id_huesped);
      const room = freshRoomsMap.get(reservation.id_habitacion);
      const hotel = freshHotelsMap.get(reservation.id_hotel);
      const checkIn = reservation.check_in;
      const checkOut = reservation.check_out;
      const nights = Math.max(1, Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000));
      const roomReservations = activeReservationsByRoom.get(reservation.id_habitacion) ?? [];

      return {
        id: reservation.id_reserva_hotel,
        programacionId: reservation.id_habitacion,
        huesped: guest?.nombre?.trim() || buildFallbackName('Huesped', reservation.id_huesped, guest?.correo),
        huespedId: reservation.id_huesped,
        habitacion: room?.nombre_habitacion ?? room?.codigo_habitacion ?? 'Habitación sin nombre',
        hotel: hotel?.nombre_hotel ?? 'Sin hotel',
        responsable: 'Sin responsable',
        cliente: guest?.nombre?.trim() || buildFallbackName('Cliente', reservation.id_huesped, guest?.correo),
        clienteId: reservation.id_huesped,
        servicio: room?.nombre_habitacion ?? room?.codigo_habitacion ?? 'Habitación sin nombre',
        fecha: checkIn,
        estado: mapHotelReservationStatus(reservation.estado),
        sede: hotel?.nombre_hotel ?? 'Sin sede',
        entrenador: 'Sin responsable',
        precioAplicado: reservation.total_reserva,
        capacidad: room?.capacidad ?? 1,
        inscritos: roomReservations.length,
        checkIn,
        checkOut,
        adultos: reservation.adultos ?? 1,
        ninos: reservation.ninos ?? 0,
        noches: nights,
        total: reservation.total_reserva,
        observaciones: reservation.observaciones ?? undefined,
        anticipo: reservation.anticipo ?? 0,
      };
    }).sort((left, right) => new Date(left.checkIn).getTime() - new Date(right.checkIn).getTime());
  }

  const inventarioHabitacionesView: InventarioHabitacionView[] = habitacionesView.map((habitacion) => ({
    ...habitacion,
    hotel: habitacion.sede,
    categoria: habitacion.tipo,
    disponible: Math.max(0, habitacion.capacidad - habitacion.inscritos),
    tarifa: habitacion.costo,
  }));

  return {
    personas,
    clientes,
    entrenadores,
    sedes,
    actividades,
    programaciones,
    reservas,
    pagos,
    reservasView,
    huespedesView,
    usuariosView,
    operationalSettings,
    pagosView,
    personalView,
    habitacionesView,
    hotelesView,
    estadiasView,
    inventarioHabitacionesView,
  };
}

export type HotelDataSnapshot = Awaited<ReturnType<typeof fetchHotelData>>;

export function buildDashboardData(data: HotelDataSnapshot): DashboardData {
  const today = startOfDayKey(new Date());
  const huespedes = data.huespedesView.length;
  const reservasHoy = data.reservasView.filter(item => startOfDayKey(item.fecha) === today).length;
  const habitaciones = data.habitacionesView.length;
  const pagosByReserva = data.pagosView.reduce((totals, payment) => {
    if (!payment.reservaId) return totals;
    totals.set(payment.reservaId, (totals.get(payment.reservaId) ?? 0) + payment.monto);
    return totals;
  }, new Map<string, number>());

  const monthlyMap = new Map<string, number>();
  for (const reserva of data.reservasView) {
    const date = new Date(reserva.fecha);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
  }

  const monthLabels = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, value]) => {
      const [year, month] = key.split('-').map(Number);
      const date = new Date(year, month, 1);
      return {
        name: formatDateLabel(date, { month: 'short' }),
        reservas: value,
      };
    });

  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const dayKey = startOfDayKey(date);
    return data.reservasView.filter(item => startOfDayKey(item.fecha) === dayKey).length;
  });

  const activos = data.huespedesView.filter(item => item.estado === 'Activo').length;
  const retentionPercent = Math.round((activos / Math.max(1, huespedes)) * 100);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const nuevosHuespedes = data.huespedesView.filter(item => item.fechaRegistro && new Date(item.fechaRegistro) >= thirtyDaysAgo).length;
  const pagosPendientes = data.reservasView.filter((item) => {
    if (item.estado === 'cancelada') return false;
    const pagado = pagosByReserva.get(item.id) ?? 0;
    return item.precioAplicado - pagado > 0.009;
  }).length;
  const habitacionesLlenas = data.habitacionesView.filter(item => item.inscritos >= item.capacidad && item.capacidad > 0).length;
  const recentActivity = data.reservasView
    .slice()
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, 3)
    .map(item => `${item.estado} - ${item.huesped} (${item.habitacion})`);

  return {
    huespedes,
    reservasHoy,
    habitaciones,
    dataMensual: monthLabels,
    week,
    retentionPercent,
    nuevosHuespedes,
    pagosPendientes,
    habitacionesLlenas,
    recentActivity,
  };
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const data = await fetchHotelData();
  return buildDashboardData(data);
}

export async function fetchReservasView() {
  const data = await fetchHotelData();
  return data.reservasView;
}

export async function fetchHuespedesView() {
  const data = await fetchHotelData();
  return data.huespedesView;
}

export async function fetchOperationalUsers() {
  const data = await fetchHotelData();
  return data.usuariosView;
}

export async function fetchOperationalSettings() {
  const data = await fetchHotelData();
  return data.operationalSettings;
}

export async function fetchPersonalView() {
  const data = await fetchHotelData();
  return data.personalView;
}

export async function fetchHabitacionesView() {
  const data = await fetchHotelData();
  return data.habitacionesView;
}

export async function fetchHotelesView() {
  const data = await fetchHotelData();
  return data.hotelesView;
}

export async function fetchPagosView() {
  const data = await fetchHotelData();
  return data.pagosView;
}

const normalizeTariffConfig = (config: TariffConfigView): TariffConfigView => ({
  ...config,
  tipoCambio: toNumber(config.tipoCambio),
  descuentoTerceraEdad: toNumber(config.descuentoTerceraEdad),
  edadTerceraEdad: toNumber(config.edadTerceraEdad),
  porcentajeImpuesto: toNumber(config.porcentajeImpuesto),
});

const normalizeCurrentRoomTariff = (rate: CurrentRoomTariffView): CurrentRoomTariffView => ({
  ...rate,
  montoNoche: toNumber(rate.montoNoche),
});

const normalizeCustomTariff = (rate: CustomTariffView): CustomTariffView => ({
  ...rate,
  habitacionId: rate.habitacionId ?? null,
  habitacion: rate.habitacion ?? null,
  codigo: rate.codigo ?? null,
  montoNoche: toNumber(rate.montoNoche),
  prioridad: toNumber(rate.prioridad),
});

export async function fetchTariffCatalog(filters?: { hotelId?: string; refresh?: boolean }) {
  const searchParams = new URLSearchParams();
  if (filters?.hotelId) searchParams.set('hotelId', filters.hotelId);
  if (filters?.refresh) searchParams.set('refresh', 'true');
  const query = searchParams.toString();
  const catalog = await apiRequest<TariffCatalogView>(`/tarifas${query ? `?${query}` : ''}`);
  return {
    config: normalizeTariffConfig(catalog.config),
    actuales: catalog.actuales.map(normalizeCurrentRoomTariff),
    personalizadas: catalog.personalizadas.map(normalizeCustomTariff),
  };
}

export async function saveTariffConfig(input: TariffConfigInput) {
  const config = await apiRequest<TariffConfigView>('/tarifas/configuracion', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return normalizeTariffConfig(config);
}

export async function createCustomTariff(input: CustomTariffInput) {
  const tariff = await apiRequest<CustomTariffView>('/tarifas-personalizadas', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return normalizeCustomTariff(tariff);
}

export async function updateCustomTariff(idTarifa: string, input: CustomTariffInput) {
  const tariff = await apiRequest<CustomTariffView>(`/tarifas-personalizadas/${idTarifa}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return normalizeCustomTariff(tariff);
}

export async function deleteCustomTariff(idTarifa: string) {
  await apiRequest(`/tarifas-personalizadas/${idTarifa}`, {
    method: 'DELETE',
  });
}

export async function updateCurrentRoomTariff(roomId: string, montoNoche: number) {
  const room = await apiRequest<CurrentRoomTariffView>(`/habitaciones/${roomId}/tarifa`, {
    method: 'PATCH',
    body: JSON.stringify({ montoNoche }),
  });
  return normalizeCurrentRoomTariff(room);
}

export async function createPersonal(input: PersonalFormInput) {
  await apiRequest('/personal', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updatePersonal(id: string, input: PersonalFormInput) {
  await apiRequest(`/personal/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deletePersonal(id: string) {
  await apiRequest(`/personal/${id}`, {
    method: 'DELETE',
  });
}

export async function createOperationalUser(input: OperationalUserInput) {
  if (!input.fechaNacimiento?.trim()) {
    throw new Error('La fecha de nacimiento es obligatoria para crear el usuario.');
  }

  await apiRequest('/personas', {
    method: 'POST',
    body: JSON.stringify(toPersonPayload(input)),
  });
}

export async function updateOperationalUser(id: string, input: OperationalUserInput) {
  if (!input.fechaNacimiento?.trim()) {
    throw new Error('La fecha de nacimiento es obligatoria para guardar el usuario.');
  }

  await apiRequest(`/personas/${id}`, {
    method: 'PUT',
    body: JSON.stringify(toPersonPayload(input)),
  });
}

export async function deleteOperationalUser(id: string) {
  await apiRequest(`/personas/${id}`, {
    method: 'DELETE',
  });
}

export async function saveOperationalSettings(settings: OperationalSettings) {
  await apiRequest('/configuracion-operativa', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function createEstadia(input: ReservationCreateInput | EstadiaCreateInput | HotelReservationCreateInput) {
  const normalized = normalizeEstadiaCreateInput(input);

  await apiRequest('/estadias', {
    method: 'POST',
    body: JSON.stringify({
      huespedId: normalized.clienteId,
      habitacionId: normalized.actividadId,
      estado: normalized.estado ?? 'confirmada',
      precioAplicado: normalized.precioAplicado,
      checkIn: normalized.checkIn,
      checkOut: normalized.checkOut,
      noches: normalized.noches,
      adultos: normalized.adultos,
      ninos: normalized.ninos,
      observaciones: normalized.observaciones,
      pago: normalized.pago,
    }),
  });
}

export async function updateEstadia(idReserva: string, input: ReservationCreateInput | EstadiaCreateInput | HotelReservationCreateInput) {
  const normalized = normalizeEstadiaCreateInput(input);

  await apiRequest(`/estadias/${idReserva}`, {
    method: 'PUT',
    body: JSON.stringify({
      huespedId: normalized.clienteId,
      habitacionId: normalized.actividadId,
      estado: normalized.estado ?? 'confirmada',
      precioAplicado: normalized.precioAplicado,
      checkIn: normalized.checkIn,
      checkOut: normalized.checkOut,
      noches: normalized.noches,
      adultos: normalized.adultos,
      ninos: normalized.ninos,
      observaciones: normalized.observaciones,
      pago: normalized.pago,
    }),
  });
}

export async function reprogramEstadia(idReserva: string, nextHabitacionId: string) {
  await apiRequest(`/estadias/${idReserva}/reprogramar`, {
    method: 'PATCH',
    body: JSON.stringify({ habitacionId: nextHabitacionId }),
  });
}

export async function cancelEstadia(idReserva: string) {
  await apiRequest(`/estadias/${idReserva}/cancelar`, {
    method: 'PATCH',
  });
}

export async function createHabitacion(input: ServiceFormInput | HabitacionFormInput) {
  const normalized = normalizeHabitacionFormInput(input);

  await apiRequest('/habitaciones', {
    method: 'POST',
    body: JSON.stringify({
      nombreHabitacion: normalized.nombre,
      descripcion: normalized.descripcion,
      tipo: normalized.tipo,
      hotelId: normalized.sedeId,
      responsableId: normalized.entrenadorId || null,
      horario: normalized.horario,
      cupoMaximo: normalized.cupoMaximo,
      costo: normalized.costo,
      codigoHabitacion: normalized.codigo,
      piso: normalized.piso,
      estadoOperativo: normalized.estadoOperativo,
    }),
  });
}

export async function deleteHabitacion(idProgramacion: string) {
  await apiRequest(`/habitaciones/${idProgramacion}`, {
    method: 'DELETE',
  });
}

export async function fetchRoomBlocks(filters?: { hotelId?: string; fechaInicio?: string; fechaFin?: string }) {
  const searchParams = new URLSearchParams();

  if (filters?.hotelId) searchParams.set('hotelId', filters.hotelId);
  if (filters?.fechaInicio) searchParams.set('fechaInicio', filters.fechaInicio);
  if (filters?.fechaFin) searchParams.set('fechaFin', filters.fechaFin);

  const query = searchParams.toString();
  return apiRequest<RoomBlockView[]>(`/bloqueos-habitacion${query ? `?${query}` : ''}`);
}

export async function createRoomBlock(input: {
  habitacionId: string;
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
  permitirConReservas?: boolean;
}) {
  return apiRequest<RoomBlockView>('/bloqueos-habitacion', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteRoomBlock(idBloqueo: string) {
  await apiRequest(`/bloqueos-habitacion/${idBloqueo}`, {
    method: 'DELETE',
  });
}

export async function createQuickGuest(input: {
  nombre: string;
  correo: string;
  telefono?: string;
  ciudad?: string;
  direccion?: string;
}) {
  const payload = await apiRequest<Partial<HuespedView> & { id?: string; id_huesped?: string; id_persona?: string; nombre?: string; correo?: string; telefono?: string; ciudad?: string; fechaRegistro?: string }>('/huespedes', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return {
    id: payload.id ?? payload.id_huesped ?? payload.id_persona ?? '',
    nombre: payload.nombre ?? input.nombre,
    correo: payload.correo ?? input.correo,
    telefono: payload.telefono,
    ciudad: payload.ciudad ?? '',
    fechaRegistro: payload.fechaRegistro ?? new Date().toISOString(),
    estado: 'Sin reservas' as const,
    pagos: [],
  } satisfies HuespedView;
}

export async function createPayment(input: PaymentFormInput) {
  const normalizedReference = input.referencia.trim();

  if (!normalizedReference) {
    throw new Error('La referencia del pago es obligatoria.');
  }

  if (input.monto <= 0) {
    throw new Error('El monto debe ser mayor que cero.');
  }

  if (!input.reservaId) {
    throw new Error('Selecciona una reserva para registrar el pago.');
  }

  await apiRequest('/pagos', {
    method: 'POST',
    body: JSON.stringify({
      monto: input.monto,
      fechaPago: input.fechaPago ?? new Date().toISOString(),
      metodoPago: input.metodoPago,
      referencia: normalizedReference,
      reservaId: input.reservaId,
    }),
  });
}


export async function ensureClientProfile(input: ClientProfileInput) {
  const normalizedEmail = input.correo.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error('El correo del cliente es obligatorio.');
  }

  if (!input.fechaNacimiento?.trim()) {
    throw new Error('La fecha de nacimiento es obligatoria para crear el perfil del cliente.');
  }

  const { data: existingPersona, error: lookupError } = await supabase
    .from('personas')
    .select('id_persona')
    .ilike('correo', normalizedEmail)
    .maybeSingle();

  if (lookupError) throw lookupError;

  let personaId = existingPersona?.id_persona ?? null;

  if (!personaId) {
    const { data: createdPersona, error: createPersonaError } = await supabase
      .from('personas')
      .insert({
        nombre: input.nombre,
        correo: normalizedEmail,
        fecha_nacimiento: input.fechaNacimiento,
      })
      .select('id_persona')
      .single();

    if (createPersonaError) throw createPersonaError;
    personaId = createdPersona.id_persona;
  } else {
    const { error: updatePersonaError } = await supabase
      .from('personas')
      .update({
        nombre: input.nombre,
        correo: normalizedEmail,
        fecha_nacimiento: input.fechaNacimiento,
      })
      .eq('id_persona', personaId);

    if (updatePersonaError) throw updatePersonaError;
  }

  const { data: existingClient, error: clientLookupError } = await supabase
    .from('clientes')
    .select('id_persona')
    .eq('id_persona', personaId)
    .maybeSingle();

  if (clientLookupError) throw clientLookupError;

  if (!existingClient?.id_persona) {
    const { error: clientCreateError } = await supabase
      .from('clientes')
      .insert({ id_persona: personaId });

    if (clientCreateError) throw clientCreateError;
  }
}

export async function syncProfilePersona(
  currentEmail: string,
  input: {
    nombre: string;
    correo: string;
    telefono: string;
    ciudad?: string;
    colonia?: string;
    calle?: string;
  },
) {
  const normalizedCurrentEmail = currentEmail.trim().toLowerCase();
  const normalizedNextEmail = input.correo.trim().toLowerCase();

  if (!normalizedCurrentEmail && !normalizedNextEmail) return;

  const matches = await apiRequest<Array<{
    id: string;
    nombre: string;
    correo: string;
    ciudad?: string | null;
    colonia?: string | null;
    calle?: string | null;
    fechaNacimiento?: string | null;
    telefonos: string[];
    esCliente: boolean;
    esEntrenador: boolean;
    especialidad?: string | null;
    estadoLaboral?: string | null;
  }>>(`/personas?search=${encodeURIComponent(normalizedCurrentEmail || normalizedNextEmail)}`);

  const person = matches.find((item) => item.correo?.toLowerCase() === normalizedCurrentEmail)
    ?? matches.find((item) => item.correo?.toLowerCase() === normalizedNextEmail)
    ?? null;

  if (!person?.id) return;

  await apiRequest(`/personas/${person.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      nombre: input.nombre,
      correo: normalizedNextEmail || person.correo,
      telefonos: input.telefono.trim() ? [input.telefono.trim()] : [],
      direccion: {
        ciudad: input.ciudad?.trim() || undefined,
        colonia: input.colonia?.trim() || undefined,
        calle: input.calle?.trim() || undefined,
      },
      fechaNacimiento: person.fechaNacimiento ?? undefined,
      roles: {
        cliente: Boolean(person.esCliente),
        entrenador: Boolean(person.esEntrenador),
      },
      especialidad: person.esEntrenador ? person.especialidad ?? undefined : undefined,
      estadoLaboral: person.esEntrenador ? (person.estadoLaboral as OperationalUserInput['estadoLaboral'] | undefined) : undefined,
    }),
  });
}

export async function fetchAccessProfiles(): Promise<AccessProfile[]> {
  const { data, error } = await supabase.rpc('list_access_profiles');

  if (error) throw error;

  return ((data ?? []) as Array<{
    user_id: string;
    email: string;
    full_name: string;
    role: 'admin' | 'super_admin';
    persona_id: string | null;
    persona_nombre: string | null;
    telefono: string | null;
    profile_type: string;
    email_confirmed: boolean;
    last_sign_in_at: string | null;
  }>).map((item) => ({
    userId: item.user_id,
    email: item.email,
    fullName: item.full_name,
    role: item.role,
    personaId: item.persona_id,
    personaNombre: item.persona_nombre,
    telefono: item.telefono,
    profileType: item.profile_type,
    emailConfirmed: item.email_confirmed,
    lastSignInAt: item.last_sign_in_at,
  }));
}

export async function assignAccessRole(userId: string, role: AccessProfile['role']) {
  const { error } = await supabase.rpc('assign_access_role', {
    target_user_id: userId,
    next_role: role,
  });

  if (error) throw error;
}

export async function fetchAccessAudit(limit = 40): Promise<AccessAuditEntry[]> {
  const { data, error } = await supabase.rpc('list_access_audit', {
    limit_count: limit,
  });

  if (error) throw error;

  return ((data ?? []) as Array<{
    id: string;
    actor_user_id: string | null;
    actor_email: string | null;
    target_user_id: string | null;
    target_email: string | null;
    action: string;
    previous_role: string | null;
    next_role: string | null;
    reason: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>).map((item) => ({
    id: item.id,
    actorUserId: item.actor_user_id,
    actorEmail: item.actor_email,
    targetUserId: item.target_user_id,
    targetEmail: item.target_email,
    action: item.action,
    previousRole: item.previous_role,
    nextRole: item.next_role,
    reason: item.reason,
    metadata: item.metadata ?? {},
    createdAt: item.created_at,
  }));
}

export async function fetchAccessInvitations(): Promise<AccessInvitation[]> {
  const { data, error } = await supabase.rpc('list_access_invitations');

  if (error) throw error;

  return ((data ?? []) as Array<{
    id: string;
    email: string;
    full_name: string | null;
    role: 'admin' | 'super_admin';
    status: 'pending' | 'accepted' | 'expired' | 'revoked';
    invite_token: string;
    invited_by: string | null;
    invited_by_email: string | null;
    expires_at: string;
    accepted_at: string | null;
    created_at: string;
  }>).map((item) => ({
    id: item.id,
    email: item.email,
    fullName: item.full_name,
    role: item.role,
    status: item.status,
    inviteToken: item.invite_token,
    invitedBy: item.invited_by,
    invitedByEmail: item.invited_by_email,
    expiresAt: item.expires_at,
    acceptedAt: item.accepted_at,
    createdAt: item.created_at,
  }));
}

export async function createAccessInvitation(input: { email: string; fullName: string; role: AccessInvitationRole }) {
  const { data, error } = await supabase.rpc('create_access_invitation', {
    target_email: input.email,
    target_full_name: input.fullName,
    target_role: input.role,
  });

  if (error) throw error;

  const row = (data?.[0] ?? null) as {
    invitation_id: string;
    invite_token: string;
    email: string;
    role: AccessProfile['role'];
    expires_at: string;
  } | null;

  if (!row) {
    throw new Error('No se recibió la invitación creada.');
  }

  return {
    invitationId: row.invitation_id,
    inviteToken: row.invite_token,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at,
  };
}

export async function validateAccessInvitation(inviteToken: string): Promise<InvitationValidation | null> {
  const { data, error } = await supabase.rpc('validate_access_invitation', {
    invite_token_input: inviteToken,
  });

  if (error) throw error;

  const row = (data?.[0] ?? null) as {
    email: string;
    full_name: string | null;
    role: 'admin' | 'super_admin';
    expires_at: string;
    status: 'pending' | 'accepted' | 'expired' | 'revoked';
  } | null;

  if (!row) return null;

  return {
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    expiresAt: row.expires_at,
    status: row.status,
  };
}

export async function consumeAccessInvitation(inviteToken: string, email: string, fullName: string) {
  const { data, error } = await supabase.rpc('consume_access_invitation', {
    invite_token_input: inviteToken,
    invited_email: email,
    invited_full_name: fullName,
  });

  if (error) throw error;

  return (data?.[0] ?? null) as { role: string; email: string } | null;
}
