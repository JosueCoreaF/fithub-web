import { supabase } from './supabaseClient';

const API_BASE_URL = (() => {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined' && !import.meta.env.DEV) return `${window.location.origin}/api`;
  return 'http://localhost:4000/api';
})();

export type MembershipPlanOption = {
  value: string;
  label: string;
  description: string;
  benefits: string[];
  cost: number;
  durationMonths?: number;
  durationDays?: number;
  recommended?: boolean;
};

export const MEMBERSHIP_PLAN_OPTIONS: MembershipPlanOption[] = [
  { value: 'Semanal', label: 'Semanal', description: 'Acceso rápido para arrancar o retomar ritmo sin compromiso largo.', benefits: ['Acceso general al gimnasio', 'Ideal para viajes o reinicio', 'Sin compromiso mensual'], cost: 12, durationDays: 7 },
  { value: 'Quincenal', label: 'Quincenal', description: 'Ideal para probar la rutina durante dos semanas completas.', benefits: ['Dos semanas de acceso continuo', 'Perfecto para crear hábito', 'Pago ligero de entrada'], cost: 22, durationDays: 15 },
  { value: 'Mensual', label: 'Mensual', description: 'El plan base para entrenar con continuidad mes a mes.', benefits: ['Acceso completo al gym', 'Reserva continua de clases', 'Equilibrio entre precio y constancia'], cost: 30, durationMonths: 1, recommended: true },
  { value: 'Bimestral', label: 'Bimestral', description: 'Dos meses de avance con mejor precio por ciclo.', benefits: ['Mejor tarifa por mes', 'Más tiempo para ver progreso', 'Menos renovaciones'], cost: 56, durationMonths: 2 },
  { value: 'Trimestral', label: 'Trimestral', description: 'Un bloque sólido para construir hábito y resultados.', benefits: ['Ciclo completo de transformación', 'Precio preferente', 'Mayor continuidad en reservas'], cost: 78, durationMonths: 3 },
  { value: 'Semestral', label: 'Semestral', description: 'Compromiso de medio año para clientes constantes.', benefits: ['Ahorro superior por periodo', 'Rutina sostenida de largo plazo', 'Ideal para objetivos serios'], cost: 150, durationMonths: 6 },
  { value: 'Anual', label: 'Anual', description: 'La tarifa más rentable para clientes de alto compromiso.', benefits: ['Mejor valor del catálogo', 'Un año completo de acceso', 'Pensado para clientes de alto rendimiento'], cost: 280, durationMonths: 12 },
];

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

type MembresiaRow = {
  id_membresia: string;
  id_cliente: string | null;
  tipo_plan: string;
  fecha_inicio: string;
  fecha_vencimiento: string;
  costo: number;
  estado: 'activa' | 'vencida' | 'cancelada';
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
  id_membresia?: string | null;
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

export type ReservaView = {
  id: string;
  programacionId: string | null;
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

export type MiembroView = {
  id: string;
  membershipId?: string;
  nombre: string;
  correo: string;
  telefono?: string;
  ciudad: string;
  fechaRegistro: string;
  plan: string;
  estado: 'Activo' | 'Vencido';
  membresiaEstado: string;
  costoMembresia: number;
  totalPagadoMembresia: number;
  fechaVencimiento?: string;
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
  planActual?: string;
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

export type PagoView = {
  id: string;
  tipo: 'reserva' | 'membresia';
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
  membresiaId: string | null;
};

export type EntrenadorView = {
  id: string;
  nombre: string;
  especialidad: string;
  estadoLaboral: string;
  sedeHoy: string;
  workload: number;
  assignedCount: number;
  rating: number;
  availability: string;
  schedule: Array<{
    id: string;
    actividad: string;
    horario: string;
    sede: string;
  }>;
};

export type ServicioView = {
  id: string;
  nombre: string;
  tipo: string;
  costo: string;
  instructor: string;
  sede: string;
  horario: string;
  fechaISO: string;
  capacidad: number;
  inscritos: number;
};

export type SedeView = {
  id: string;
  nombre: string;
  ubicacion: string;
  actividades: number;
  entrenadores: number;
  reservas: number;
};

export type DashboardData = {
  members: number;
  reservasHoy: number;
  clases: number;
  dataMensual: Array<{ name: string; reservas: number }>;
  week: number[];
  retentionPercent: number;
  nuevosMiembros: number;
  pagosPendientes: number;
  clasesLlenas: number;
  recentActivity: string[];
};

export type TrainerFormInput = {
  nombre: string;
  correo: string;
  fechaNacimiento: string;
  especialidad: string;
  estadoLaboral: string;
};

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

export type PaymentFormInput = {
  tipo: 'reserva' | 'membresia';
  referencia: string;
  metodoPago: 'efectivo' | 'tarjeta' | 'transferencia' | 'deposito' | 'otro';
  monto: number;
  fechaPago?: string;
  reservaId?: string;
  membresiaId?: string;
};

export type MembershipCheckoutInput = {
  clienteId: string;
  tipoPlan: string;
  referencia: string;
  metodoPago: PaymentFormInput['metodoPago'];
  fechaPago?: string;
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
  role: 'trainer' | 'admin' | 'super_admin';
  personaId: string | null;
  personaNombre: string | null;
  telefono: string | null;
  profileType: string;
  emailConfirmed: boolean;
  lastSignInAt: string | null;
};

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
  role: 'trainer' | 'admin' | 'super_admin';
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
  role: 'trainer' | 'admin' | 'super_admin';
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

const normalizeText = (value?: string | null) => value?.trim().toLowerCase() ?? '';

const getMembershipPlanOption = (planName: string) => {
  const normalized = normalizeText(planName);
  return MEMBERSHIP_PLAN_OPTIONS.find((option) => {
    const optionName = normalizeText(option.value);
    if (normalized === optionName) return true;
    if (normalized.includes(optionName)) return true;
    if (optionName.includes(normalized) && normalized.length >= 4) return true;
    if (optionName === 'anual' && (normalized.includes('annual') || normalized.includes('year'))) return true;
    return false;
  }) ?? null;
};

const getMembershipEndDate = (planName: string, startDate: Date) => {
  const option = getMembershipPlanOption(planName);
  const endDate = new Date(startDate);

  if (option?.durationDays) {
    endDate.setDate(endDate.getDate() + option.durationDays);
    return endDate;
  }

  endDate.setMonth(endDate.getMonth() + (option?.durationMonths ?? 1));
  return endDate;
};

const getMembershipBaseCost = (planName: string, fallbackCost?: number | null) => {
  const option = getMembershipPlanOption(planName);
  if (typeof fallbackCost === 'number' && Number.isFinite(fallbackCost) && fallbackCost > 0) {
    return fallbackCost;
  }

  return option?.cost ?? 30;
};

const getAvailability = (schedule: Array<{ horario: string }>) => {
  if (schedule.length === 0) return 'Disponible';
  const now = new Date();
  const todayKey = startOfDayKey(now);
  const todaySchedules = schedule.filter(item => startOfDayKey(item.horario) === todayKey);
  if (todaySchedules.length === 0) return 'Disponible';
  return todaySchedules.some(item => new Date(item.horario).getHours() <= now.getHours()) ? 'En Clase' : 'Disponible';
};

export async function fetchGymData() {
  const payload = await apiRequest<{
    personas: PersonaRow[];
    telefonos: TelefonoRow[];
    clientes: ClienteRow[];
    membresias: MembresiaRow[];
    entrenadores: EntrenadorRow[];
    sedes: SedeRow[];
    actividades: ActividadRow[];
    programaciones: ProgramacionRow[];
    reservas: ReservaRow[];
    pagos: PagoRow[];
    configuracionOperativa: ConfiguracionOperativaRow[];
  }>('/operational-data');

  const {
    personas,
    telefonos,
    clientes,
    entrenadores,
    sedes,
    actividades,
  } = payload;
  const membresias = payload.membresias.map((item) => ({
    ...item,
    costo: toNumber(item.costo),
  }));
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

  const latestMembershipByClient = new Map<string, MembresiaRow>();
  for (const membresia of membresias) {
    if (!membresia.id_cliente) continue;
    const previous = latestMembershipByClient.get(membresia.id_cliente);
    if (!previous || new Date(membresia.fecha_vencimiento) > new Date(previous.fecha_vencimiento)) {
      latestMembershipByClient.set(membresia.id_cliente, membresia);
    }
  }

  const membershipsMap = new Map(membresias.map(item => [item.id_membresia, item]));
  const pagosByMembership = new Map<string, PagoRow[]>();
  for (const pago of pagos) {
    if (!pago.id_membresia) continue;
    const current = pagosByMembership.get(pago.id_membresia) ?? [];
    current.push(pago);
    pagosByMembership.set(pago.id_membresia, current);
  }

  const pagosByCliente = new Map<string, MiembroView['pagos']>();
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

  const miembrosView: MiembroView[] = clientes.map(cliente => {
    const persona = personasMap.get(cliente.id_persona);
    const membresia = latestMembershipByClient.get(cliente.id_persona);
    const fechaVencimiento = membresia?.fecha_vencimiento;
    const membershipPayments = membresia?.id_membresia ? (pagosByMembership.get(membresia.id_membresia) ?? []) : [];
    const membershipPaymentItems = membershipPayments.map((pago) => ({
      id: pago.id_pago,
      monto: pago.monto,
      fecha: pago.fecha_pago ?? '',
      metodo: pago.metodo_pago ?? 'N/D',
      referencia: pago.referencia ?? 'N/D',
    }));
    const status = membresia?.estado === 'activa' && fechaVencimiento && new Date(fechaVencimiento) >= new Date()
      ? 'Activo'
      : 'Vencido';

    return {
      id: cliente.id_persona,
      membershipId: membresia?.id_membresia,
      nombre: persona?.nombre?.trim() || buildFallbackName('Miembro', cliente.id_persona, persona?.correo),
      correo: persona?.correo ?? '',
      telefono: telefonosMap.get(cliente.id_persona),
      ciudad: persona?.direccion_ciudad ?? 'Sin ciudad',
      fechaRegistro: cliente.fecha_registro ?? '',
      plan: membresia?.tipo_plan ?? 'Sin plan',
      estado: status,
      membresiaEstado: membresia?.estado ?? 'sin membresia',
      costoMembresia: Number(membresia?.costo ?? 0),
      totalPagadoMembresia: membershipPayments.reduce((sum, pago) => sum + Number(pago.monto ?? 0), 0),
      fechaVencimiento,
      pagos: [...(pagosByCliente.get(cliente.id_persona) ?? []), ...membershipPaymentItems]
        .sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime()),
    };
  });

  const usuariosView: OperationalUserView[] = personas.map(persona => {
    const cliente = clientesMap.get(persona.id_persona) ?? null;
    const entrenador = entrenadoresMap.get(persona.id_persona) ?? null;
    const membresia = latestMembershipByClient.get(persona.id_persona) ?? null;
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
      planActual: membresia?.tipo_plan ?? undefined,
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
    const membresia = pago.id_membresia ? membershipsMap.get(pago.id_membresia) ?? null : null;
    const membresiaCliente = membresia?.id_cliente ? personasMap.get(membresia.id_cliente) ?? null : null;
    const cliente = reservaCliente ?? membresiaCliente;

    return {
      id: pago.id_pago,
      tipo: pago.id_reserva ? 'reserva' : 'membresia',
      cliente: cliente?.nombre?.trim() || buildFallbackName('Cliente', reserva?.id_cliente ?? membresia?.id_cliente, cliente?.correo),
      clienteId: reserva?.id_cliente ?? membresia?.id_cliente ?? null,
      correo: cliente?.correo ?? '',
      concepto: pago.id_reserva
        ? (reservaActividad?.nombre_actividad ?? 'Reserva sin actividad')
        : `Membresia ${membresia?.tipo_plan ?? 'sin plan'}`,
      sede: reservaSede?.nombre_sede ?? 'Sin sede',
      monto: pago.monto,
      fecha: pago.fecha_pago ?? '',
      metodo: pago.metodo_pago ?? 'N/D',
      referencia: pago.referencia ?? 'N/D',
      reservaId: pago.id_reserva ?? null,
      membresiaId: pago.id_membresia ?? null,
    };
  });

  const scheduleByTrainer = new Map<string, EntrenadorView['schedule']>();
  for (const programacion of programaciones) {
    if (!programacion.id_entrenador) continue;
    const actividad = programacion.id_actividad ? actividadesMap.get(programacion.id_actividad) : null;
    const sede = programacion.id_sede ? sedesMap.get(programacion.id_sede) : null;
    const current = scheduleByTrainer.get(programacion.id_entrenador) ?? [];
    current.push({
      id: programacion.id_programacion,
      actividad: actividad?.nombre_actividad ?? 'Sin actividad',
      horario: programacion.horario,
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

  const entrenadoresView: EntrenadorView[] = entrenadores.map(entrenador => {
    const persona = personasMap.get(entrenador.id_persona);
    const schedule = scheduleByTrainer.get(entrenador.id_persona) ?? [];
    const workload = schedule.length;
    const sedeHoy = schedule[0]?.sede ?? 'Sin sede';
    const assignedCount = assignedByTrainer.get(entrenador.id_persona) ?? 0;

    return {
      id: entrenador.id_persona,
      nombre: persona?.nombre?.trim() || buildFallbackName('Entrenador', entrenador.id_persona, persona?.correo),
      especialidad: entrenador.especialidad ?? 'General',
      estadoLaboral: entrenador.estado_laboral ?? 'Activo',
      sedeHoy,
      workload,
      assignedCount,
      rating: Math.min(5, Math.max(1, Math.round((assignedCount || 1) / Math.max(1, workload || 1)))),
      availability: getAvailability(schedule),
      schedule,
    };
  });

  const serviciosView: ServicioView[] = programaciones.map(programacion => {
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
      instructor: entrenador?.nombre ?? 'Sin instructor',
      sede: sede?.nombre_sede ?? 'Sin sede',
      horario: date.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }),
      fechaISO: programacion.horario,
      capacidad: programacion.cupo_maximo,
      inscritos,
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

  const sedesView: SedeView[] = sedes.map(sede => ({
    id: sede.id_sede,
    nombre: sede.nombre_sede,
    ubicacion: sede.ubicacion,
    actividades: actividadesBySede.get(sede.nombre_sede) ?? 0,
    entrenadores: entrenadoresBySede.get(sede.nombre_sede)?.size ?? 0,
    reservas: reservasBySede.get(sede.nombre_sede) ?? 0,
  }));

  return {
    personas,
    clientes,
    membresias,
    entrenadores,
    sedes,
    actividades,
    programaciones,
    reservas,
    pagos,
    reservasView,
    miembrosView,
    usuariosView,
    operationalSettings,
    pagosView,
    entrenadoresView,
    serviciosView,
    sedesView,
  };
}

export function buildDashboardData(data: Awaited<ReturnType<typeof fetchGymData>>): DashboardData {
  const today = startOfDayKey(new Date());
  const members = data.miembrosView.length;
  const reservasHoy = data.reservasView.filter(item => startOfDayKey(item.fecha) === today).length;
  const clases = data.serviciosView.length;

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

  const activos = data.miembrosView.filter(item => item.estado === 'Activo').length;
  const retentionPercent = Math.round((activos / Math.max(1, members)) * 100);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const nuevosMiembros = data.miembrosView.filter(item => item.fechaRegistro && new Date(item.fechaRegistro) >= thirtyDaysAgo).length;
  const pagosPendientes = data.reservas.filter(item => item.estado === 'creada').length;
  const clasesLlenas = data.serviciosView.filter(item => item.inscritos >= item.capacidad && item.capacidad > 0).length;
  const recentActivity = data.reservasView
    .slice()
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, 3)
    .map(item => `${item.estado} — ${item.cliente} (${item.servicio})`);

  return {
    members,
    reservasHoy,
    clases,
    dataMensual: monthLabels,
    week,
    retentionPercent,
    nuevosMiembros,
    pagosPendientes,
    clasesLlenas,
    recentActivity,
  };
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const data = await fetchGymData();
  return buildDashboardData(data);
}

export async function fetchReservasView() {
  const data = await fetchGymData();
  return data.reservasView;
}

export async function fetchMiembrosView() {
  const data = await fetchGymData();
  return data.miembrosView;
}

export async function fetchOperationalUsers() {
  const data = await fetchGymData();
  return data.usuariosView;
}

export async function fetchOperationalSettings() {
  const data = await fetchGymData();
  return data.operationalSettings;
}

export async function fetchEntrenadoresView() {
  const data = await fetchGymData();
  return data.entrenadoresView;
}

export async function fetchServiciosView() {
  const data = await fetchGymData();
  return data.serviciosView;
}

export async function fetchSedesView() {
  const data = await fetchGymData();
  return data.sedesView;
}

export async function fetchPagosView() {
  const data = await fetchGymData();
  return data.pagosView;
}

export async function createTrainer(input: TrainerFormInput) {
  await apiRequest('/entrenadores', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateTrainer(id: string, input: TrainerFormInput) {
  await apiRequest(`/entrenadores/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteTrainer(id: string) {
  await apiRequest(`/entrenadores/${id}`, {
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

export async function renewMemberMembership(idCliente: string, tipoPlan: string) {
  const normalizedPlan = tipoPlan.trim() || 'Mensual';
  const { data: latestMembership, error: latestMembershipError } = await supabase
    .from('membresias')
    .select('tipo_plan, costo, fecha_vencimiento')
    .eq('id_cliente', idCliente)
    .order('fecha_vencimiento', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestMembershipError) throw latestMembershipError;

  const today = new Date();
  const startDate = new Date(today);
  const endDate = getMembershipEndDate(normalizedPlan, startDate);

  const { error: closeError } = await supabase
    .from('membresias')
    .update({ estado: 'cancelada' })
    .eq('id_cliente', idCliente)
    .eq('estado', 'activa');

  if (closeError) throw closeError;

  const { error } = await supabase.from('membresias').insert({
    id_cliente: idCliente,
    tipo_plan: normalizedPlan,
    fecha_inicio: startDate.toISOString().slice(0, 10),
    fecha_vencimiento: endDate.toISOString().slice(0, 10),
    costo: getMembershipBaseCost(normalizedPlan, Number(latestMembership?.costo ?? 0)),
    estado: 'activa',
  });

  if (error) throw error;
}

export async function createReservation(input: ReservationCreateInput) {
  await apiRequest('/reservas', {
    method: 'POST',
    body: JSON.stringify({
      clienteId: input.clienteId,
      actividadId: input.actividadId,
      estado: input.estado ?? 'confirmada',
      pago: input.pago,
    }),
  });
}

export async function rescheduleReservation(idReserva: string, nextProgramacionId: string) {
  await apiRequest(`/reservas/${idReserva}/reprogramar`, {
    method: 'PATCH',
    body: JSON.stringify({ actividadId: nextProgramacionId }),
  });
}

export async function cancelReservation(idReserva: string) {
  await apiRequest(`/reservas/${idReserva}/cancelar`, {
    method: 'PATCH',
  });
}

export async function createServiceSession(input: ServiceFormInput) {
  await apiRequest('/actividades', {
    method: 'POST',
    body: JSON.stringify({
      nombreActividad: input.nombre,
      descripcion: input.descripcion,
      tipo: input.tipo,
      sedeId: input.sedeId,
      entrenadorId: input.entrenadorId || null,
      horario: input.horario,
      cupoMaximo: input.cupoMaximo,
      costo: input.costo,
    }),
  });
}

export async function deleteServiceSession(idProgramacion: string) {
  await apiRequest(`/actividades/${idProgramacion}`, {
    method: 'DELETE',
  });
}

export async function createPayment(input: PaymentFormInput) {
  const normalizedReference = input.referencia.trim();

  if (!normalizedReference) {
    throw new Error('La referencia del pago es obligatoria.');
  }

  if (input.monto <= 0) {
    throw new Error('El monto debe ser mayor que cero.');
  }

  if (input.tipo === 'reserva' && !input.reservaId) {
    throw new Error('Selecciona una reserva para registrar el pago.');
  }

  if (input.tipo === 'membresia' && !input.membresiaId) {
    throw new Error('Selecciona una membresia para registrar el pago.');
  }

  await apiRequest('/pagos', {
    method: 'POST',
    body: JSON.stringify({
      monto: input.monto,
      fechaPago: input.fechaPago ?? new Date().toISOString(),
      metodoPago: input.metodoPago,
      referencia: normalizedReference,
      reservaId: input.tipo === 'reserva' ? input.reservaId ?? undefined : undefined,
      membresiaId: input.tipo === 'membresia' ? input.membresiaId ?? undefined : undefined,
    }),
  });
}

export async function checkoutMembershipPlan(input: MembershipCheckoutInput) {
  const normalizedReference = input.referencia.trim();

  if (!normalizedReference) {
    throw new Error('La referencia del pago es obligatoria.');
  }

  await apiRequest('/membresias/checkout', {
    method: 'POST',
    body: JSON.stringify({
      clienteId: input.clienteId,
      tipoPlan: input.tipoPlan,
      referencia: normalizedReference,
      metodoPago: input.metodoPago,
      fechaPago: input.fechaPago ?? new Date().toISOString(),
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
    role: 'trainer' | 'admin' | 'super_admin';
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
    role: 'trainer' | 'admin' | 'super_admin';
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

export async function createAccessInvitation(input: { email: string; fullName: string; role: AccessProfile['role'] }) {
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
    role: 'trainer' | 'admin' | 'super_admin';
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
