import React, { useEffect, useMemo, useState } from 'react';
import DonutChart from './DonutChart';
import BarChart from './BarChart';
import SedeDistributionChart from './SedeDistributionChart';
import {
  cancelEstadia,
  createEstadia,
  createQuickGuest,
  createRoomBlock,
  deleteRoomBlock,
  fetchRoomBlocks,
  fetchTariffCatalog,
  updateEstadia,
  type EstadiaView,
  type PagoView,
  type RoomBlockView,
  type SupportedCurrency,
  type TariffCatalogView,
} from '../lib/api';
import { downloadCsv } from '../lib/export';
import { useHotelData } from '../context/HotelDataContext';
import { buildTariffQuote } from '../lib/tariffMath';

type OccupancyRoomRow = {
  key: string;
  roomId: string | null;
  habitacion: string;
  hotel: string;
  responsable: string;
  estadoOperativo: string;
};

type OccupancyCell = {
  reservation: EstadiaView;
  isArrival: boolean;
  isDeparture: boolean;
  isFirstVisibleDay: boolean;
};

type OccupancyBlockCell = {
  block: RoomBlockView;
  isFirstVisibleDay: boolean;
};

type ReservationEditorState = {
  huespedId: string;
  habitacionId: string;
  checkIn: string;
  checkOut: string;
  modoFechas: 'rango' | 'dias';
  noches: number;
  adultos: number;
  ninos: number;
  estado: 'creada' | 'confirmada' | 'completada' | 'cancelada';
  modoTarifa: 'actual' | 'personalizada';
  tarifaPersonalizadaId: string;
  tarifaManualMonto: number;
  tarifaManualMoneda: SupportedCurrency;
  aplicarDescuentoTerceraEdad: boolean;
  observaciones: string;
  permitirClienteNuevo: boolean;
  nuevoClienteNombre: string;
  nuevoClienteCorreo: string;
  nuevoClienteTelefono: string;
  nuevoClienteCiudad: string;
  nuevoClienteDireccion: string;
};

type ReservationAlertState = {
  tone: 'success' | 'warning' | 'danger' | 'info';
  title: string;
  detail: string;
};

type RoomBlockEditorState = {
  blockId?: string;
  habitacionId: string;
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
  permitirConReservas: boolean;
};

type ReservationDisplayStatus = ReservationEditorState['estado'] | 'abonada';
type ReservationWizardStep = 'datos' | 'tarifas' | 'resumen';

const reservationWizardSteps: Array<{ id: ReservationWizardStep; title: string; caption: string }> = [
  { id: 'datos', title: 'Datos', caption: 'Huésped, habitación y fechas' },
  { id: 'tarifas', title: 'Tarifas', caption: 'Esquema, descuento y cálculo' },
  { id: 'resumen', title: 'Resumen', caption: 'Revisión final y cierre' },
];

const buildMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const toInputDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDateTimeLocalValue = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const parseDateStart = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const parseDateEnd = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
};

const startOfLocalDay = (value: string | Date) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
};

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const buildDateKeysInRange = (start: Date, end: Date) => {
  const keys: string[] = [];
  const lastDay = startOfLocalDay(end);

  for (let cursor = startOfLocalDay(start); cursor.getTime() <= lastDay.getTime(); cursor = addDays(cursor, 1)) {
    keys.push(toInputDateValue(cursor));
  }

  return keys;
};

const getReservationStayBounds = (reservation: EstadiaView) => {
  const checkInDay = startOfLocalDay(reservation.checkIn);
  const parsedCheckOut = startOfLocalDay(reservation.checkOut);
  const checkoutDay = parsedCheckOut.getTime() > checkInDay.getTime()
    ? parsedCheckOut
    : addDays(checkInDay, Math.max(1, reservation.noches || 1));

  return { checkInDay, checkoutDay };
};

const reservationOverlapsRange = (reservation: EstadiaView, rangeStart: Date, rangeEnd: Date) => {
  const { checkInDay, checkoutDay } = getReservationStayBounds(reservation);
  const rangeStartDay = startOfLocalDay(rangeStart);
  const rangeEndExclusive = addDays(startOfLocalDay(rangeEnd), 1);

  return checkInDay.getTime() < rangeEndExclusive.getTime() && checkoutDay.getTime() > rangeStartDay.getTime();
};

const getOccupiedDateKeys = (reservation: EstadiaView) => {
  const { checkInDay, checkoutDay } = getReservationStayBounds(reservation);
  const occupiedDays: string[] = [];

  for (let cursor = checkInDay; cursor.getTime() < checkoutDay.getTime(); cursor = addDays(cursor, 1)) {
    occupiedDays.push(toInputDateValue(cursor));
  }

  return occupiedDays.length > 0 ? occupiedDays : [toInputDateValue(checkInDay)];
};

const getNightCountFromDates = (checkIn: string, checkOut: string) => {
  const start = new Date(checkIn);
  const end = new Date(checkOut);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return 1;
  }

  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
};

const getCheckOutFromNights = (checkIn: string, nights: number) => {
  const start = new Date(checkIn);
  if (Number.isNaN(start.getTime())) {
    return checkIn;
  }

  const next = new Date(start);
  next.setDate(next.getDate() + Math.max(1, nights));
  return toDateTimeLocalValue(next);
};

const getBlockedDateKeys = (block: RoomBlockView) => {
  const start = startOfLocalDay(block.fechaInicio);
  const rawEnd = new Date(block.fechaFin);
  const endDay = startOfLocalDay(rawEnd);
  const hasTimePortion = rawEnd.getHours() !== 0
    || rawEnd.getMinutes() !== 0
    || rawEnd.getSeconds() !== 0
    || rawEnd.getMilliseconds() !== 0;
  const endExclusive = rawEnd.getTime() <= new Date(block.fechaInicio).getTime()
    ? addDays(start, 1)
    : hasTimePortion
      ? addDays(endDay, 1)
      : endDay;
  const blockedDays: string[] = [];

  for (let cursor = start; cursor.getTime() < endExclusive.getTime(); cursor = addDays(cursor, 1)) {
    blockedDays.push(toInputDateValue(cursor));
  }

  return blockedDays.length > 0 ? blockedDays : [toInputDateValue(start)];
};

const getGuestShortName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return (parts.join(' ') || 'Reserva').slice(0, 18);
};

const getRoomOperationalTone = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized.includes('mantenimiento') || normalized.includes('bloque')) return 'danger';
  if (normalized.includes('limpieza')) return 'warn';
  return 'available';
};

const formatRoomOperationalStatus = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === 'bloqueada') return 'Bloqueada';
  if (normalized === 'mantenimiento') return 'Mantenimiento';
  if (normalized === 'limpieza') return 'Limpieza';
  if (normalized === 'ocupada') return 'Ocupada';
  return 'Disponible';
};

const buildCreateReservationState = (habitacionId = '', dayKey?: string): ReservationEditorState => {
  const baseDay = dayKey ? parseDateStart(dayKey) : new Date();
  const checkIn = new Date(baseDay);
  checkIn.setHours(14, 0, 0, 0);
  if (!dayKey && checkIn.getTime() < Date.now()) {
    checkIn.setDate(checkIn.getDate() + 1);
  }
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 1);
  checkOut.setHours(12, 0, 0, 0);

  return {
    huespedId: '',
    habitacionId,
    checkIn: toDateTimeLocalValue(checkIn),
    checkOut: toDateTimeLocalValue(checkOut),
    modoFechas: 'dias',
    noches: 1,
    adultos: 1,
    ninos: 0,
    estado: 'confirmada',
    modoTarifa: 'actual',
    tarifaPersonalizadaId: '',
    tarifaManualMonto: 0,
    tarifaManualMoneda: 'USD',
    aplicarDescuentoTerceraEdad: false,
    observaciones: '',
    permitirClienteNuevo: false,
    nuevoClienteNombre: '',
    nuevoClienteCorreo: '',
    nuevoClienteTelefono: '',
    nuevoClienteCiudad: '',
    nuevoClienteDireccion: '',
  };
};

const buildReservationEditorState = (reservation: EstadiaView): ReservationEditorState => ({
  huespedId: reservation.huespedId ?? reservation.clienteId ?? '',
  habitacionId: reservation.programacionId ?? '',
  checkIn: toDateTimeLocalValue(reservation.checkIn),
  checkOut: toDateTimeLocalValue(reservation.checkOut),
  modoFechas: 'dias',
  noches: Math.max(1, reservation.noches || getNightCountFromDates(reservation.checkIn, reservation.checkOut)),
  adultos: Math.max(1, reservation.adultos ?? 1),
  ninos: Math.max(0, reservation.ninos ?? 0),
  estado: (['creada', 'confirmada', 'completada', 'cancelada'].includes(reservation.estado)
    ? reservation.estado
    : 'confirmada') as ReservationEditorState['estado'],
  modoTarifa: 'actual',
  tarifaPersonalizadaId: '',
  tarifaManualMonto: 0,
  tarifaManualMoneda: 'USD',
  aplicarDescuentoTerceraEdad: false,
  observaciones: reservation.observaciones ?? '',
  permitirClienteNuevo: false,
  nuevoClienteNombre: '',
  nuevoClienteCorreo: '',
  nuevoClienteTelefono: '',
  nuevoClienteCiudad: '',
  nuevoClienteDireccion: '',
});

const buildCreateBlockState = (habitacionId = '', dayKey?: string): RoomBlockEditorState => {
  const baseDay = dayKey ? parseDateStart(dayKey) : new Date();
  const fechaInicio = new Date(baseDay);
  fechaInicio.setHours(8, 0, 0, 0);
  const fechaFin = new Date(fechaInicio);
  fechaFin.setDate(fechaFin.getDate() + 1);
  fechaFin.setHours(18, 0, 0, 0);

  return {
    habitacionId,
    fechaInicio: toDateTimeLocalValue(fechaInicio),
    fechaFin: toDateTimeLocalValue(fechaFin),
    motivo: '',
    permitirConReservas: false,
  };
};

const buildBlockEditorState = (block: RoomBlockView): RoomBlockEditorState => ({
  blockId: block.id,
  habitacionId: block.habitacionId,
  fechaInicio: toDateTimeLocalValue(block.fechaInicio),
  fechaFin: toDateTimeLocalValue(block.fechaFin),
  motivo: block.motivo,
  permitirConReservas: false,
});

const getMonthBounds = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
};

const getLatestReservationDate = (reservas: EstadiaView[]) => {
  const latest = reservas.reduce((acc, reservation) => {
    const date = new Date(reservation.checkIn);
    return (!acc || date > acc) ? date : acc;
  }, null as Date | null);

  return latest ?? new Date();
};

const formatDate = (iso: string) => {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} - ${timePart}`;
};

const getStatusTone = (status: string) => {
  const normalized = status.toLowerCase();

  if (normalized.startsWith('confirm') || normalized.startsWith('complet')) return 'ok';
  if (normalized.startsWith('abonad')) return 'info';
  if (normalized.startsWith('cread')) return 'warn';
  return 'danger';
};

const getReservationStatusLabel = (status: ReservationDisplayStatus) => {
  switch (status) {
    case 'creada':
      return 'Pendiente';
    case 'abonada':
      return 'Abonada';
    case 'confirmada':
      return 'Confirmada';
    case 'completada':
      return 'Completada';
    case 'cancelada':
      return 'Cancelada';
    default:
      return status;
  }
};

const isFutureReservation = (reservation: EstadiaView, currentTimestamp: number) => new Date(reservation.checkIn).getTime() >= currentTimestamp;

const buildReservationAlert = (message: string, fallbackTitle: string): ReservationAlertState => {
  const normalized = message.toLowerCase();

  if (normalized.includes('ocupada')) {
    return {
      tone: 'warning',
      title: 'La habitación ya está ocupada',
      detail: 'Ese rango ya no está disponible. Cambia las fechas o selecciona otra habitación antes de guardar.',
    };
  }

  if (normalized.includes('bloqueada') || normalized.includes('mantenimiento') || normalized.includes('limpieza')) {
    return {
      tone: 'warning',
      title: 'La habitación no está disponible',
      detail: 'La unidad tiene un bloqueo operativo en ese rango. Revisa otra habitación o ajusta las fechas.',
    };
  }

  if (normalized.includes('check-in') || normalized.includes('check-out') || normalized.includes('fecha')) {
    return {
      tone: 'warning',
      title: 'Fechas inválidas',
      detail: message,
    };
  }

  return {
    tone: 'danger',
    title: fallbackTitle,
    detail: message,
  };
};

export const Reservas: React.FC = () => {
  const { data, error, refresh } = useHotelData();
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [alertState, setAlertState] = useState<ReservationAlertState | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<EstadiaView | null>(null);
  const [reservationForm, setReservationForm] = useState<ReservationEditorState | null>(null);
  const [reservationEditMode, setReservationEditMode] = useState(false);
  const [reservationWizardStep, setReservationWizardStep] = useState<ReservationWizardStep>('datos');
  const [savingReservation, setSavingReservation] = useState(false);
  const [roomBlocks, setRoomBlocks] = useState<RoomBlockView[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [blockForm, setBlockForm] = useState<RoomBlockEditorState | null>(null);
  const [savingBlock, setSavingBlock] = useState(false);
  const [tariffCatalog, setTariffCatalog] = useState<TariffCatalogView | null>(null);
  const reservas = (data?.estadiasView ?? []) as EstadiaView[];
  const habitaciones = data?.habitacionesView ?? [];
  const huespedes = data?.huespedesView ?? [];
  const pagos = (data?.pagosView ?? []) as PagoView[];

  const paidAmountsByReservation = useMemo(() => {
    const totals = new Map<string, number>();

    pagos.forEach((payment) => {
      if (!payment.reservaId) return;
      totals.set(payment.reservaId, (totals.get(payment.reservaId) ?? 0) + payment.monto);
    });

    return totals;
  }, [pagos]);

  const effectiveStatusByReservation = useMemo(() => {
    const statuses = new Map<string, ReservationDisplayStatus>();

    reservas.forEach((reservation) => {
      const totalPaid = paidAmountsByReservation.get(reservation.id) ?? 0;
      const totalDue = Math.max(0, reservation.total ?? 0);

      if (reservation.estado === 'cancelada') {
        statuses.set(reservation.id, 'cancelada');
        return;
      }

      if (totalDue > 0 && totalPaid + 0.009 >= totalDue) {
        statuses.set(reservation.id, 'completada');
        return;
      }

      if (totalPaid > 0) {
        statuses.set(reservation.id, 'abonada');
        return;
      }

      if (reservation.estado === 'confirmada') {
        statuses.set(reservation.id, 'confirmada');
        return;
      }

      statuses.set(reservation.id, 'creada');
    });

    return statuses;
  }, [paidAmountsByReservation, reservas]);

  const getReservationDisplayStatus = (reservation: EstadiaView): ReservationDisplayStatus => (
    effectiveStatusByReservation.get(reservation.id) ?? (reservation.estado === 'cancelada' ? 'cancelada' : 'creada')
  );

  const getReservationPaidAmount = (reservation: EstadiaView) => paidAmountsByReservation.get(reservation.id) ?? 0;

  const getReservationPendingAmount = (reservation: EstadiaView) => Math.max(0, reservation.total - getReservationPaidAmount(reservation));

  const hotelIdByName = useMemo(() => {
    const entries = new Map<string, string>();
    (data?.hotelesView ?? []).forEach((hotel) => {
      entries.set(hotel.nombre, hotel.id);
    });
    return entries;
  }, [data?.hotelesView]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!reservationForm) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [reservationForm]);

  useEffect(() => {
    let cancelled = false;

    const loadTariffs = async () => {
      try {
        const nextCatalog = await fetchTariffCatalog();
        if (!cancelled) {
          setTariffCatalog(nextCatalog);
        }
      } catch {
        if (!cancelled) {
          setTariffCatalog(null);
        }
      } finally {
      }
    };

    void loadTariffs();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRoomCurrentTariff = useMemo(() => {
    if (!reservationForm?.habitacionId) return null;
    return tariffCatalog?.actuales.find((item) => item.id === reservationForm.habitacionId) ?? null;
  }, [reservationForm?.habitacionId, tariffCatalog?.actuales]);

  const selectedGuest = useMemo(
    () => reservationForm?.huespedId ? huespedes.find((guest) => guest.id === reservationForm.huespedId) ?? null : null,
    [huespedes, reservationForm?.huespedId],
  );

  const selectedRoom = useMemo(
    () => reservationForm?.habitacionId ? habitaciones.find((room) => room.id === reservationForm.habitacionId) ?? null : null,
    [habitaciones, reservationForm?.habitacionId],
  );

  const applicableCustomTariffs = useMemo(() => {
    return (tariffCatalog?.personalizadas ?? [])
      .filter((item) => item.activa)
      .sort((left, right) => {
        if (left.prioridad !== right.prioridad) return right.prioridad - left.prioridad;
        return left.nombre.localeCompare(right.nombre);
      });
  }, [tariffCatalog?.personalizadas]);

  const selectedCustomTariff = useMemo(() => {
    if (!reservationForm || reservationForm.modoTarifa !== 'personalizada') return null;
    if (reservationForm.tarifaPersonalizadaId === 'manual') return null;
    return applicableCustomTariffs.find((item) => item.id === reservationForm.tarifaPersonalizadaId) ?? null;
  }, [applicableCustomTariffs, reservationForm]);

  const usesManualCustomTariff = Boolean(
    reservationForm
    && reservationForm.modoTarifa === 'personalizada'
    && reservationForm.tarifaPersonalizadaId === 'manual',
  );

  const reservationPricingQuote = useMemo(() => {
    if (!reservationForm || !selectedRoomCurrentTariff || !tariffCatalog) return null;

    return buildTariffQuote({
      nights: reservationForm.noches,
      currentNightlyRate: selectedRoomCurrentTariff.montoNoche,
      config: tariffCatalog.config,
      selectedCustomTariff,
      manualCustomNightlyRate: usesManualCustomTariff ? reservationForm.tarifaManualMonto : null,
      manualCustomCurrency: usesManualCustomTariff ? reservationForm.tarifaManualMoneda : undefined,
      applySeniorDiscount: reservationForm.aplicarDescuentoTerceraEdad,
    });
  }, [reservationForm, selectedRoomCurrentTariff, selectedCustomTariff, tariffCatalog, usesManualCustomTariff]);

  const reservationWizardMeta = reservationWizardSteps.find((step) => step.id === reservationWizardStep) ?? reservationWizardSteps[0];
  const reservationPreviewCheckOut = reservationForm
    ? (reservationForm.modoFechas === 'dias'
      ? getCheckOutFromNights(reservationForm.checkIn, reservationForm.noches)
      : reservationForm.checkOut)
    : null;

  const months = useMemo(() => {
    const latest = getLatestReservationDate(reservas);
    const year = latest.getFullYear();
    const list: { key: string; label: string }[] = [];

    for (let month = 0; month < 12; month++) {
      const date = new Date(year, month, 1);
      list.push({
        key: buildMonthKey(date),
        label: date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
      });
    }

    return list;
  }, [reservas]);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => buildMonthKey(getLatestReservationDate(reservas)));
  const [rangeStart, setRangeStart] = useState<string>(() => {
    const { start } = getMonthBounds(buildMonthKey(getLatestReservationDate(reservas)));
    return toInputDateValue(start);
  });
  const [rangeEnd, setRangeEnd] = useState<string>(() => {
    const { end } = getMonthBounds(buildMonthKey(getLatestReservationDate(reservas)));
    return toInputDateValue(end);
  });
  const [selectedHotel, setSelectedHotel] = useState<string>('Todos');

  useEffect(() => {
    if (reservas.length === 0) return;

    const latestMonth = buildMonthKey(getLatestReservationDate(reservas));
    const { start, end } = getMonthBounds(latestMonth);

    setSelectedMonth(latestMonth);
    setRangeStart(toInputDateValue(start));
    setRangeEnd(toInputDateValue(end));
  }, [reservas]);

  const { rangeStartDate, rangeEndDate, rangeDayCount } = useMemo(() => {
    const start = parseDateStart(rangeStart);
    const end = parseDateEnd(rangeEnd);
    const normalizedStart = start.getTime() <= end.getTime() ? start : parseDateStart(rangeEnd);
    const normalizedEnd = start.getTime() <= end.getTime() ? end : parseDateEnd(rangeStart);
    const dayCount = Math.max(1, Math.round((normalizedEnd.getTime() - normalizedStart.getTime()) / 86_400_000) + 1);

    return {
      rangeStartDate: normalizedStart,
      rangeEndDate: normalizedEnd,
      rangeDayCount: dayCount,
    };
  }, [rangeEnd, rangeStart]);

  useEffect(() => {
    let cancelled = false;

    const loadBlocks = async () => {
      setLoadingBlocks(true);

      try {
        const nextBlocks = await fetchRoomBlocks({
          hotelId: selectedHotel !== 'Todos' ? hotelIdByName.get(selectedHotel) : undefined,
          fechaInicio: rangeStartDate.toISOString(),
          fechaFin: addDays(startOfLocalDay(rangeEndDate), 1).toISOString(),
        });

        if (!cancelled) {
          setRoomBlocks(nextBlocks);
        }
      } catch {
        if (!cancelled) {
          setRoomBlocks([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingBlocks(false);
        }
      }
    };

    void loadBlocks();

    return () => {
      cancelled = true;
    };
  }, [hotelIdByName, rangeEndDate, rangeStartDate, selectedHotel]);

  const hotelOptions = useMemo(() => {
    const options = new Set<string>(['Todos']);
    habitaciones.forEach((room) => {
      if (room.hotel) options.add(room.hotel);
    });
    reservas.forEach((reservation) => {
      if (reservation.hotel) options.add(reservation.hotel);
    });
    return Array.from(options);
  }, [habitaciones, reservas]);

  const availableRoomsForReservationForm = useMemo(
    () => habitaciones.filter((room) => selectedHotel === 'Todos' ? true : room.hotel === selectedHotel),
    [habitaciones, selectedHotel],
  );

  useEffect(() => {
    if (!reservationForm || reservationForm.habitacionId || availableRoomsForReservationForm.length === 0) return;

    setReservationForm((current) => current ? { ...current, habitacionId: availableRoomsForReservationForm[0].id } : current);
  }, [availableRoomsForReservationForm, reservationForm]);

  const visibleReservas = useMemo(() => reservas
    .filter((reservation) => {
      if (selectedHotel !== 'Todos' && reservation.hotel !== selectedHotel) return false;
      return reservationOverlapsRange(reservation, rangeStartDate, rangeEndDate);
    })
    .slice()
    .sort((left, right) => new Date(left.checkIn).getTime() - new Date(right.checkIn).getTime()), [rangeEndDate, rangeStartDate, reservas, selectedHotel]);

  const upcomingReservations = useMemo(
    () => reservas.filter((reservation) => new Date(reservation.checkIn).getTime() >= currentTimestamp && getReservationDisplayStatus(reservation) !== 'cancelada').length,
    [currentTimestamp, effectiveStatusByReservation, reservas],
  );

  const completedReservations = useMemo(
    () => reservas.filter((reservation) => getReservationDisplayStatus(reservation) === 'completada').length,
    [effectiveStatusByReservation, reservas],
  );

  const partialPaidReservations = useMemo(
    () => reservas.filter((reservation) => getReservationDisplayStatus(reservation) === 'abonada').length,
    [effectiveStatusByReservation, reservas],
  );

  const stats = useMemo(() => {
    const estadoCounts: Record<string, number> = {};

    visibleReservas.forEach((reservation) => {
      const displayStatus = getReservationDisplayStatus(reservation);
      estadoCounts[displayStatus] = (estadoCounts[displayStatus] || 0) + 1;
    });

    const total = visibleReservas.length;
    const confirmed = (estadoCounts.confirmada || 0) + (estadoCounts.abonada || 0) + (estadoCounts.completada || 0);
    const partiallyPaid = estadoCounts.abonada || 0;
    const pending = estadoCounts.creada || 0;
    const cancelled = estadoCounts.cancelada || 0;
    const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];

    visibleReservas.forEach((reservation) => {
      const date = new Date(reservation.checkIn);
      weekdayCounts[date.getDay() === 0 ? 6 : date.getDay() - 1] += 1;
    });

    return { total, confirmed, partiallyPaid, pending, cancelled, weekdayCounts };
  }, [effectiveStatusByReservation, visibleReservas]);

  const hotelesMap: Record<string, number> = {};
  visibleReservas.forEach((reservation) => {
    hotelesMap[reservation.hotel] = (hotelesMap[reservation.hotel] || 0) + 1;
  });

  const hotelSegments = Object.entries(hotelesMap).map(([label, value], index) => ({
    label,
    value,
    color: ['#06b6d4', '#7c3aed', '#06d6a0', '#ff7ab6'][index % 4],
  }));

  const confirmationPercent = Math.round((stats.confirmed / Math.max(1, stats.total)) * 100);
  const activeRangeLabel = `${rangeStartDate.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })} - ${rangeEndDate.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })}`;
  const occupancyDateKeys = useMemo(() => buildDateKeysInRange(rangeStartDate, rangeEndDate), [rangeEndDate, rangeStartDate]);
  const todayKey = toInputDateValue(new Date());

  const occupancyRows = useMemo(() => {
    const rows = new Map<string, OccupancyRoomRow>();

    habitaciones.forEach((room) => {
      if (selectedHotel !== 'Todos' && room.hotel !== selectedHotel) return;
      rows.set(room.id, {
        key: room.id,
        roomId: room.id,
        habitacion: room.nombre,
        hotel: room.hotel,
        responsable: room.responsable,
        estadoOperativo: room.estadoOperativo ?? 'disponible',
      });
    });

    visibleReservas.forEach((reservation) => {
      const roomKey = reservation.programacionId ?? `${reservation.hotel}::${reservation.habitacion}`;
      if (!rows.has(roomKey)) {
        rows.set(roomKey, {
          key: roomKey,
          roomId: reservation.programacionId,
          habitacion: reservation.habitacion,
          hotel: reservation.hotel,
          responsable: reservation.responsable,
          estadoOperativo: 'ocupada',
        });
      }
    });

    return Array.from(rows.values()).sort((left, right) => {
      if (left.hotel !== right.hotel) return left.hotel.localeCompare(right.hotel);
      return left.habitacion.localeCompare(right.habitacion);
    });
  }, [habitaciones, selectedHotel, visibleReservas]);

  const occupancyMatrix = useMemo(() => {
    const matrix = new Map<string, Record<string, OccupancyCell>>();
    const visibleDaySet = new Set(occupancyDateKeys);

    occupancyRows.forEach((room) => {
      matrix.set(room.key, {});
    });

    visibleReservas
      .filter((reservation) => reservation.estado !== 'cancelada')
      .forEach((reservation) => {
        const roomKey = reservation.programacionId ?? `${reservation.hotel}::${reservation.habitacion}`;
        const cells = matrix.get(roomKey) ?? {};
        const occupiedKeys = getOccupiedDateKeys(reservation).filter((key) => visibleDaySet.has(key));

        occupiedKeys.forEach((key, index) => {
          if (cells[key]) return;
          cells[key] = {
            reservation,
            isArrival: key === toInputDateValue(startOfLocalDay(reservation.checkIn)),
            isDeparture: key === toInputDateValue(addDays(startOfLocalDay(reservation.checkOut), -1)),
            isFirstVisibleDay: index === 0,
          };
        });

        matrix.set(roomKey, cells);
      });

    return matrix;
  }, [occupancyDateKeys, occupancyRows, visibleReservas]);

  const blockMatrix = useMemo(() => {
    const matrix = new Map<string, Record<string, OccupancyBlockCell>>();
    const visibleDaySet = new Set(occupancyDateKeys);

    occupancyRows.forEach((room) => {
      matrix.set(room.key, {});
    });

    roomBlocks.forEach((block) => {
      const cells = matrix.get(block.habitacionId) ?? {};
      const blockedKeys = getBlockedDateKeys(block).filter((key) => visibleDaySet.has(key));

      blockedKeys.forEach((key, index) => {
        if (cells[key]) return;
        cells[key] = {
          block,
          isFirstVisibleDay: index === 0,
        };
      });

      matrix.set(block.habitacionId, cells);
    });

    return matrix;
  }, [occupancyDateKeys, occupancyRows, roomBlocks]);

  const occupiedRoomNights = useMemo(() => occupancyRows.reduce((total, room) => {
    const cells = occupancyMatrix.get(room.key) ?? {};
    return total + Object.keys(cells).length;
  }, 0), [occupancyMatrix, occupancyRows]);
  const blockedRoomNights = useMemo(() => occupancyRows.reduce((total, room) => {
    const cells = blockMatrix.get(room.key) ?? {};
    return total + Object.keys(cells).length;
  }, 0), [blockMatrix, occupancyRows]);

  const totalRoomNights = occupancyRows.length * rangeDayCount;
  const occupancyPercent = Math.round((occupiedRoomNights / Math.max(1, totalRoomNights)) * 100);
  const occupiedRoomsToday = occupancyRows.filter((room) => Boolean((occupancyMatrix.get(room.key) ?? {})[todayKey])).length;

  const handleExportReservations = () => {
    downloadCsv(visibleReservas, [
      { header: 'ID Reserva', value: (reservation) => reservation.id },
      { header: 'Huesped', value: (reservation) => reservation.huesped },
      { header: 'Habitacion', value: (reservation) => reservation.habitacion },
      { header: 'Hotel', value: (reservation) => reservation.hotel },
      { header: 'Responsable', value: (reservation) => reservation.responsable },
      { header: 'Check In', value: (reservation) => new Date(reservation.checkIn).toLocaleString('es-HN') },
      { header: 'Check Out', value: (reservation) => new Date(reservation.checkOut).toLocaleString('es-HN') },
      { header: 'Noches', value: (reservation) => reservation.noches },
      { header: 'Estado', value: (reservation) => getReservationStatusLabel(getReservationDisplayStatus(reservation)) },
      { header: 'Total', value: (reservation) => reservation.total },
    ], 'estadias');
  };

  const handleCancelReservation = async (reservationId: string) => {
    setCancellingId(reservationId);
    setActionError(null);
    setActionMessage(null);
    setAlertState(null);

    try {
      await cancelEstadia(reservationId);
      await refresh();
      setActionMessage('Reserva cancelada.');
      setAlertState({
        tone: 'success',
        title: 'Reserva cancelada',
        detail: 'La reserva se canceló correctamente y la habitación volvió a quedar libre para nuevas asignaciones.',
      });
    } catch (cancelError) {
      const message = cancelError instanceof Error ? cancelError.message : 'No se pudo cancelar la reserva.';
      setActionError(message);
      setAlertState(buildReservationAlert(message, 'No se pudo cancelar la reserva'));
    } finally {
      setCancellingId(null);
    }
  };

  const openCreateBlock = (habitacionId = '', dayKey?: string) => {
    setBlockForm(buildCreateBlockState(habitacionId, dayKey));
    setAlertState(null);
    setActionError(null);
  };

  const openBlockEditor = (block: RoomBlockView) => {
    setBlockForm(buildBlockEditorState(block));
    setAlertState(null);
    setActionError(null);
  };

  const closeBlockEditor = () => {
    setBlockForm(null);
    setSavingBlock(false);
  };

  const handleSaveBlock = async () => {
    if (!blockForm) return;
    if (!blockForm.habitacionId) {
      setAlertState({ tone: 'warning', title: 'Falta la habitación', detail: 'Selecciona la habitación que quieres cerrar temporalmente.' });
      return;
    }

    if (blockForm.motivo.trim().length < 3) {
      setAlertState({ tone: 'warning', title: 'Motivo incompleto', detail: 'Escribe un motivo breve para el cierre operativo.' });
      return;
    }

    const start = new Date(blockForm.fechaInicio);
    const end = new Date(blockForm.fechaFin);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setAlertState({ tone: 'warning', title: 'Rango inválido', detail: 'La fecha final del cierre debe ser posterior a la fecha inicial.' });
      return;
    }

    setSavingBlock(true);
    setActionError(null);
    setActionMessage(null);
    setAlertState(null);

    try {
      await createRoomBlock({
        habitacionId: blockForm.habitacionId,
        fechaInicio: start.toISOString(),
        fechaFin: end.toISOString(),
        motivo: blockForm.motivo.trim(),
        permitirConReservas: blockForm.permitirConReservas,
      });

      const nextBlocks = await fetchRoomBlocks({
        hotelId: selectedHotel !== 'Todos' ? hotelIdByName.get(selectedHotel) : undefined,
        fechaInicio: rangeStartDate.toISOString(),
        fechaFin: addDays(startOfLocalDay(rangeEndDate), 1).toISOString(),
      });

      setRoomBlocks(nextBlocks);
      setActionMessage('Cierre operativo registrado.');
      setAlertState({
        tone: 'success',
        title: 'Habitación cerrada',
        detail: 'La habitación quedó bloqueada en el calendario para ese rango y ya no aceptará reservas ahí.',
      });
      closeBlockEditor();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'No se pudo registrar el cierre operativo.';
      setActionError(message);
      setAlertState(buildReservationAlert(message, 'No se pudo cerrar la habitación'));
    } finally {
      setSavingBlock(false);
    }
  };

  const handleDeleteBlock = async (blockId: string) => {
    setSavingBlock(true);
    setActionError(null);
    setActionMessage(null);
    setAlertState(null);

    try {
      await deleteRoomBlock(blockId);
      const nextBlocks = await fetchRoomBlocks({
        hotelId: selectedHotel !== 'Todos' ? hotelIdByName.get(selectedHotel) : undefined,
        fechaInicio: rangeStartDate.toISOString(),
        fechaFin: addDays(startOfLocalDay(rangeEndDate), 1).toISOString(),
      });
      setRoomBlocks(nextBlocks);
      setActionMessage('Habitación habilitada nuevamente.');
      setAlertState({
        tone: 'success',
        title: 'Bloqueo eliminado',
        detail: 'La habitación quedó habilitada otra vez para recibir reservas en ese rango.',
      });
      closeBlockEditor();
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'No se pudo habilitar la habitación.';
      setActionError(message);
      setAlertState(buildReservationAlert(message, 'No se pudo habilitar la habitación'));
    } finally {
      setSavingBlock(false);
    }
  };

  const openReservationEditor = (reservation: EstadiaView) => {
    setSelectedReservation(reservation);
    setReservationForm(buildReservationEditorState(reservation));
    setReservationEditMode(false);
    setReservationWizardStep('datos');
    setActionError(null);
    setAlertState(null);
  };

  const openCreateReservation = (habitacionId = '', dayKey?: string) => {
    setSelectedReservation(null);
    setReservationForm(buildCreateReservationState(habitacionId, dayKey));
    setReservationEditMode(true);
    setReservationWizardStep('datos');
    setActionError(null);
    setAlertState(null);
  };

  const closeReservationEditor = () => {
    setSelectedReservation(null);
    setReservationForm(null);
    setReservationEditMode(false);
    setReservationWizardStep('datos');
    setSavingReservation(false);
  };

  const validateReservationDataStep = () => {
    if (!reservationForm) return false;

    if (!reservationForm.habitacionId) {
      const message = 'Selecciona una habitación.';
      setActionError(message);
      setAlertState({ tone: 'warning', title: 'Faltan datos obligatorios', detail: message });
      return false;
    }

    if (!selectedReservation && reservationForm.permitirClienteNuevo) {
      if (reservationForm.nuevoClienteNombre.trim().length < 3) {
        setAlertState({ tone: 'warning', title: 'Nombre incompleto', detail: 'Escribe el nombre completo del nuevo cliente.' });
        return false;
      }
      if (!reservationForm.nuevoClienteCorreo.trim()) {
        setAlertState({ tone: 'warning', title: 'Correo obligatorio', detail: 'Escribe el correo del nuevo cliente.' });
        return false;
      }
    } else if (!reservationForm.huespedId) {
      const message = 'Selecciona huésped y habitación.';
      setActionError(message);
      setAlertState({ tone: 'warning', title: 'Faltan datos obligatorios', detail: message });
      return false;
    }

    const normalizedCheckOut = reservationForm.modoFechas === 'dias'
      ? getCheckOutFromNights(reservationForm.checkIn, reservationForm.noches)
      : reservationForm.checkOut;
    const checkIn = new Date(reservationForm.checkIn);
    const checkOut = new Date(normalizedCheckOut);

    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
      const message = 'La salida debe ser posterior al check-in.';
      setActionError(message);
      setAlertState({ tone: 'warning', title: 'Rango inválido', detail: message });
      return false;
    }

    if (reservationForm.adultos < 1) {
      setAlertState({ tone: 'warning', title: 'Adultos obligatorios', detail: 'Debes indicar al menos 1 adulto en la reserva.' });
      return false;
    }

    if (reservationForm.ninos < 0) {
      setAlertState({ tone: 'warning', title: 'Cantidad inválida', detail: 'La cantidad de niños no puede ser negativa.' });
      return false;
    }

    return true;
  };

  const validateReservationTariffStep = () => {
    if (!reservationPricingQuote) {
      setAlertState({ tone: 'warning', title: 'Tarifa no disponible', detail: 'Espera a que cargue la configuración tarifaria o selecciona una habitación con tarifa vigente.' });
      return false;
    }

    if (usesManualCustomTariff && reservationForm && reservationForm.tarifaManualMonto < 0) {
      setAlertState({ tone: 'warning', title: 'Tarifa manual inválida', detail: 'La tarifa manual no puede ser negativa.' });
      return false;
    }

    return true;
  };

  const goToNextReservationStep = () => {
    if (reservationWizardStep === 'datos') {
      if (!validateReservationDataStep()) return;
      setReservationWizardStep('tarifas');
      return;
    }

    if (reservationWizardStep === 'tarifas') {
      if (!validateReservationTariffStep()) return;
      setReservationWizardStep('resumen');
    }
  };

  const goToPreviousReservationStep = () => {
    if (reservationWizardStep === 'resumen') {
      setReservationWizardStep('tarifas');
      return;
    }

    if (reservationWizardStep === 'tarifas') {
      setReservationWizardStep('datos');
    }
  };

  const handleConfirmReservation = async () => {
    if (!selectedReservation || !reservationForm) return;
    const calculatedPrice = reservationPricingQuote?.total ?? selectedReservation.total;

    setSavingReservation(true);
    setActionError(null);
    setActionMessage(null);
    setAlertState(null);

    try {
      await updateEstadia(selectedReservation.id, {
        huespedId: reservationForm.huespedId,
        habitacionId: reservationForm.habitacionId,
        precioAplicado: calculatedPrice,
        checkIn: new Date(reservationForm.checkIn).toISOString(),
        checkOut: new Date(reservationForm.checkOut).toISOString(),
        noches: reservationForm.noches,
        adultos: reservationForm.adultos,
        ninos: reservationForm.ninos,
        estado: 'confirmada',
        observaciones: reservationForm.observaciones.trim() || undefined,
      });
      await refresh();
      setActionMessage('Reserva confirmada.');
      setAlertState({
        tone: 'success',
        title: 'Reserva confirmada',
        detail: 'La reserva quedó confirmada y se actualizó en la matriz de ocupación.',
      });
      closeReservationEditor();
    } catch (confirmError) {
      const message = confirmError instanceof Error ? confirmError.message : 'No se pudo confirmar la reserva.';
      setActionError(message);
      setAlertState(buildReservationAlert(message, 'No se pudo confirmar la reserva'));
    } finally {
      setSavingReservation(false);
    }
  };

  const handleSaveReservation = async () => {
    if (!reservationForm) return;
    if (!validateReservationDataStep() || !validateReservationTariffStep()) return;

    const normalizedCheckOut = reservationForm.modoFechas === 'dias'
      ? getCheckOutFromNights(reservationForm.checkIn, reservationForm.noches)
      : reservationForm.checkOut;
    const checkIn = new Date(reservationForm.checkIn);
    const checkOut = new Date(normalizedCheckOut);
    const priceQuote = reservationPricingQuote!;

    setSavingReservation(true);
    setActionError(null);
    setActionMessage(null);
    setAlertState(null);

    try {
      let guestId = reservationForm.huespedId;

      if (!selectedReservation && reservationForm.permitirClienteNuevo) {
        const guest = await createQuickGuest({
          nombre: reservationForm.nuevoClienteNombre.trim(),
          correo: reservationForm.nuevoClienteCorreo.trim(),
          telefono: reservationForm.nuevoClienteTelefono.trim() || undefined,
          ciudad: reservationForm.nuevoClienteCiudad.trim() || undefined,
          direccion: reservationForm.nuevoClienteDireccion.trim() || undefined,
        });
        guestId = guest.id;

        if (!guestId) {
          throw new Error('No se pudo obtener el id del huésped recién creado.');
        }
      }

      if (selectedReservation) {
        await updateEstadia(selectedReservation.id, {
          huespedId: guestId,
          habitacionId: reservationForm.habitacionId,
          precioAplicado: priceQuote.total,
          checkIn: checkIn.toISOString(),
          checkOut: checkOut.toISOString(),
          noches: reservationForm.modoFechas === 'dias' ? reservationForm.noches : getNightCountFromDates(reservationForm.checkIn, normalizedCheckOut),
          adultos: reservationForm.adultos,
          ninos: reservationForm.ninos,
          estado: reservationForm.estado,
          observaciones: reservationForm.observaciones.trim() || undefined,
        });
      } else {
        await createEstadia({
          huespedId: guestId,
          habitacionId: reservationForm.habitacionId,
          precioAplicado: priceQuote.total,
          checkIn: checkIn.toISOString(),
          checkOut: checkOut.toISOString(),
          noches: reservationForm.modoFechas === 'dias' ? reservationForm.noches : getNightCountFromDates(reservationForm.checkIn, normalizedCheckOut),
          adultos: reservationForm.adultos,
          ninos: reservationForm.ninos,
          estado: reservationForm.estado,
          observaciones: reservationForm.observaciones.trim() || undefined,
        });
      }
      await refresh();
      setActionMessage(selectedReservation ? 'Reserva actualizada.' : 'Reserva creada.');
      setAlertState({
        tone: 'success',
        title: selectedReservation ? 'Reserva actualizada' : 'Reserva creada',
        detail: selectedReservation
          ? 'Los cambios quedaron guardados y la ocupación se recalculó en la matriz.'
          : 'La reserva se creó correctamente y ya aparece reflejada en la ocupación.',
      });
      closeReservationEditor();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : selectedReservation ? 'No se pudo actualizar la reserva.' : 'No se pudo crear la reserva.';
      setActionError(message);
      setAlertState(buildReservationAlert(message, selectedReservation ? 'No se pudo actualizar la reserva' : 'No se pudo crear la reserva'));
    } finally {
      setSavingReservation(false);
    }
  };

  return (
    <div className="page">
      <div className="dashboard-header" style={{ marginBottom: 12 }}>
        <div>
          <h2>Reservas del hotel</h2>
          <p className="muted">Seguimiento de estadías, ocupación y actividad por rango.</p>
        </div>
        <div className="header-actions">
          <button className="btn" onClick={() => openCreateReservation()}>
            Reservar
          </button>
          <button className="btn ghost" onClick={() => openCreateBlock()}>
            Cerrar habitación
          </button>
          <button className="btn ghost" onClick={handleExportReservations} disabled={visibleReservas.length === 0}>
            Exportar CSV
          </button>
        </div>
      </div>

      {error && <p className="muted">{error}</p>}
      {actionMessage && <p className="muted">{actionMessage}</p>}
      {actionError && <p className="muted">{actionError}</p>}

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <article className="card stat-card">
          <span>Total en rango</span>
          <strong>{stats.total}</strong>
          <small>{activeRangeLabel}</small>
        </article>
        <article className="card stat-card">
          <span>Próximas reservas</span>
          <strong>{upcomingReservations}</strong>
          <small>Solo reservas futuras activas</small>
        </article>
        <article className="card stat-card">
          <span>Completadas</span>
          <strong>{completedReservations}</strong>
          <small>{partialPaidReservations} abonadas</small>
        </article>
        <article className="card stat-card">
          <span>Confirmación</span>
          <strong>{confirmationPercent}%</strong>
          <small>{stats.confirmed} confirmadas</small>
        </article>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="reservas-card-head reservas-client-toolbar">
          <div>
            <h3 style={{ marginBottom: 8 }}>Filtrar rango operativo</h3>
            <p className="muted">Selecciona el periodo que quieres auditar para ver tendencias, estados y detalle de reservas.</p>
          </div>
          <div className="reservas-range-controls">
            <select className="input reservas-select" value={selectedHotel} onChange={(event) => setSelectedHotel(event.target.value)}>
              {hotelOptions.map((hotel) => <option key={hotel} value={hotel}>{hotel}</option>)}
            </select>
            <select className="input reservas-select" value={selectedMonth} onChange={(event) => {
              const monthKey = event.target.value;
              const { start, end } = getMonthBounds(monthKey);
              setSelectedMonth(monthKey);
              setRangeStart(toInputDateValue(start));
              setRangeEnd(toInputDateValue(end));
            }}>
              {months.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}
            </select>
            <input className="input reservas-date-input" type="date" value={rangeStart} max={rangeEnd} onChange={(event) => setRangeStart(event.target.value)} />
            <input className="input reservas-date-input" type="date" value={rangeEnd} min={rangeStart} onChange={(event) => setRangeEnd(event.target.value)} />
          </div>
        </div>
      </section>

      <div className="grid reservas-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20 }}>
        <div>
          <div className="card neon-card reservas-feature-card" style={{ marginBottom: 16 }}>
            <div className="reservas-card-head">
              <div>
                <h3 style={{ marginBottom: 8 }}>Matriz de ocupación</h3>
                <p className="muted">Vista mensual por habitación para operar como una planilla de recepción.</p>
              </div>
              <div className="reservas-occupancy-meta">
                <div>
                  <strong>{occupancyPercent}%</strong>
                  <span>ocupación del rango</span>
                </div>
                <div>
                  <strong>{occupiedRoomsToday}</strong>
                  <span>habitaciones ocupadas hoy</span>
                </div>
                <div>
                  <strong>{blockedRoomNights}</strong>
                  <span>noches bloqueadas</span>
                </div>
              </div>
            </div>
            <div className="occupancy-legend" style={{ marginTop: 12 }}>
              <span className="occupancy-legend-item"><span className="occupancy-legend-swatch ok" /> Pagada completa</span>
              <span className="occupancy-legend-item"><span className="occupancy-legend-swatch info" /> Abono parcial</span>
              <span className="occupancy-legend-item"><span className="occupancy-legend-swatch warn" /> Pendiente de pago</span>
              <span className="occupancy-legend-item"><span className="occupancy-legend-swatch available" /> Disponible</span>
              <span className="occupancy-legend-item"><span className="occupancy-legend-swatch room-warn" /> Limpieza</span>
              <span className="occupancy-legend-item"><span className="occupancy-legend-swatch room-danger" /> Bloqueo / mantenimiento</span>
            </div>
            <div className="occupancy-board-wrap" style={{ marginTop: 14 }}>
              <table className="occupancy-board">
                <thead>
                  <tr>
                    <th className="occupancy-room-head">Habitación</th>
                    {occupancyDateKeys.map((dayKey) => {
                      const day = parseDateStart(dayKey);
                      return (
                        <th key={dayKey} className={dayKey === todayKey ? 'is-today' : undefined}>
                          <span>{day.toLocaleDateString('es-HN', { weekday: 'short' })}</span>
                          <strong>{day.toLocaleDateString('es-HN', { day: '2-digit' })}</strong>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {occupancyRows.map((room) => {
                    const cells = occupancyMatrix.get(room.key) ?? {};
                    const blockCells = blockMatrix.get(room.key) ?? {};

                    return (
                      <tr key={room.key}>
                        <th className="occupancy-room-cell">
                          <div className="occupancy-room-label">
                            <strong>{room.habitacion}</strong>
                            <span>{room.hotel}</span>
                            <small>{room.responsable || 'Sin responsable'} · {formatRoomOperationalStatus(room.estadoOperativo)}</small>
                          </div>
                        </th>
                        {occupancyDateKeys.map((dayKey, dayIndex) => {
                          const cell = cells[dayKey];
                          const blockCell = blockCells[dayKey];

                          if (cell) {
                            const previousKey = occupancyDateKeys[dayIndex - 1];
                            const nextKey = occupancyDateKeys[dayIndex + 1];
                            const previousCell = previousKey ? cells[previousKey] : undefined;
                            const nextCell = nextKey ? cells[nextKey] : undefined;
                            const continuesLeft = previousCell?.reservation.id === cell.reservation.id;
                            const continuesRight = nextCell?.reservation.id === cell.reservation.id;
                            const segmentClass = continuesLeft
                              ? continuesRight
                                ? 'segment-middle'
                                : 'segment-end'
                              : continuesRight
                                ? 'segment-start'
                                : 'segment-single';
                            const displayStatus = getReservationDisplayStatus(cell.reservation);
                            const tone = getStatusTone(displayStatus);
                            const detail = `${cell.reservation.huesped} · ${cell.reservation.noches} noche${cell.reservation.noches === 1 ? '' : 's'}`;
                            let normalizedSegmentLength = 1;

                            for (let nextIndex = dayIndex + 1; nextIndex < occupancyDateKeys.length; nextIndex += 1) {
                              const candidateCell = cells[occupancyDateKeys[nextIndex]];
                              if (!candidateCell || candidateCell.reservation.id !== cell.reservation.id) break;
                              normalizedSegmentLength += 1;
                            }

                            return (
                              <td
                                key={`${room.key}-${dayKey}`}
                                className={`occupancy-cell has-booking status-${tone} ${segmentClass} ${dayKey === todayKey ? 'is-today' : ''}`}
                                title={detail}
                              >
                                <button
                                  type="button"
                                  className={`occupancy-booking-chip occupancy-booking-button ${cell.reservation.estado === 'creada' ? 'is-pending' : ''}`}
                                  onClick={() => openReservationEditor(cell.reservation)}
                                >
                                  {cell.isFirstVisibleDay ? (
                                    <small className={`occupancy-booking-status status-${tone}`}>
                                      {getReservationStatusLabel(displayStatus)}
                                    </small>
                                  ) : null}
                                  <strong>{cell.isFirstVisibleDay ? getGuestShortName(cell.reservation.huesped) : ''}</strong>
                                  <span>
                                    {cell.isFirstVisibleDay
                                      ? `${cell.isArrival ? 'Entrada' : 'Estadía'} · ${normalizedSegmentLength} noche${normalizedSegmentLength === 1 ? '' : 's'}`
                                      : ''}
                                  </span>
                                </button>
                              </td>
                            );
                          }

                          if (blockCell) {
                            const previousKey = occupancyDateKeys[dayIndex - 1];
                            const nextKey = occupancyDateKeys[dayIndex + 1];
                            const previousCell = previousKey ? blockCells[previousKey] : undefined;
                            const nextCell = nextKey ? blockCells[nextKey] : undefined;
                            const continuesLeft = previousCell?.block.id === blockCell.block.id;
                            const continuesRight = nextCell?.block.id === blockCell.block.id;
                            const segmentClass = continuesLeft
                              ? continuesRight
                                ? 'segment-middle'
                                : 'segment-end'
                              : continuesRight
                                ? 'segment-start'
                                : 'segment-single';

                            return (
                              <td
                                key={`${room.key}-${dayKey}`}
                                className={`occupancy-cell room-state room-danger ${segmentClass} ${dayKey === todayKey ? 'is-today' : ''}`}
                                title={blockCell.block.motivo}
                              >
                                <button type="button" className="occupancy-room-block-button" onClick={() => openBlockEditor(blockCell.block)}>
                                  <span>{blockCell.isFirstVisibleDay ? blockCell.block.motivo : ''}</span>
                                </button>
                              </td>
                            );
                          }

                          const roomTone = getRoomOperationalTone(room.estadoOperativo);
                          const roomIsUnavailable = roomTone !== 'available';
                          const previousKey = occupancyDateKeys[dayIndex - 1];
                          const nextKey = occupancyDateKeys[dayIndex + 1];
                          const continuesLeft = roomIsUnavailable && previousKey ? !cells[previousKey] : false;
                          const continuesRight = roomIsUnavailable && nextKey ? !cells[nextKey] : false;
                          const segmentClass = continuesLeft
                            ? continuesRight
                              ? 'segment-middle'
                              : 'segment-end'
                            : continuesRight
                              ? 'segment-start'
                              : 'segment-single';

                          return (
                            <td key={`${room.key}-${dayKey}`} className={`occupancy-cell ${roomIsUnavailable ? `room-state room-${roomTone} ${segmentClass}` : 'available'} ${dayKey === todayKey ? 'is-today' : ''}`}>
                              {roomIsUnavailable ? (
                                <button type="button" className="occupancy-room-block-button" onClick={() => room.roomId ? openCreateBlock(room.roomId, dayKey) : undefined}>
                                  <span>{segmentClass === 'segment-start' ? formatRoomOperationalStatus(room.estadoOperativo) : ''}</span>
                                </button>
                              ) : (
                                <button type="button" className="occupancy-available-button" onClick={() => openCreateReservation(room.roomId ?? '', dayKey)}>
                                  <span>Disponible</span>
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {occupancyRows.length === 0 && (
                    <tr>
                      <td colSpan={occupancyDateKeys.length + 1} className="muted">No hay habitaciones ni estadías para el filtro seleccionado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Detalle de reservas del rango</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Huésped</th>
                  <th>Habitación</th>
                  <th>Hotel</th>
                  <th>Check in</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {visibleReservas.map((reservation) => (
                  <tr key={reservation.id}>
                    <td>{reservation.huesped}</td>
                    <td>{reservation.habitacion}</td>
                    <td>{reservation.hotel}</td>
                    <td>{formatDate(reservation.checkIn)}</td>
                    <td><span className={`pill ${getStatusTone(getReservationDisplayStatus(reservation))}`}>{getReservationStatusLabel(getReservationDisplayStatus(reservation))}</span></td>
                    <td>
                      <div className="reservas-table-actions">
                        <button className="btn small ghost" onClick={() => openReservationEditor(reservation)}>Ver / editar</button>
                        {getReservationDisplayStatus(reservation) !== 'cancelada' && isFutureReservation(reservation, currentTimestamp) ? (
                          <button className="btn small ghost" disabled={cancellingId === reservation.id} onClick={() => void handleCancelReservation(reservation.id)}>
                            {cancellingId === reservation.id ? 'Cancelando...' : 'Cancelar'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleReservas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">No hay reservas para el rango seleccionado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12 }}>
            <SedeDistributionChart data={hotelSegments.map((segment) => ({ name: segment.label, value: segment.value, color: segment.color }))} />
          </div>
        </div>

        <div>
          <div className="card neon-card reservas-summary-card" style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
            <div>
              <div className="muted">Noches ocupadas</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{occupiedRoomNights}</div>
              <div className="muted">{occupancyRows.length} habitaciones • {totalRoomNights} noches posibles</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="muted">Ocupación del periodo</div>
              <DonutChart percent={occupancyPercent} size={160} color="#06b6d4" />
              <div className="muted">{occupiedRoomNights} de {totalRoomNights} noches</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h4>Horas / Día</h4>
            <BarChart values={stats.weekdayCounts} labels={['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']} />
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h4>Reservas por hotel</h4>
            <div className="reservas-mini-list">
              {hotelSegments.map((segment) => {
                const total = hotelSegments.reduce((sum, item) => sum + item.value, 0) || 1;
                const percentage = Math.round((segment.value / total) * 100);
                return (
                  <div key={segment.label} className="reservas-mini-item">
                    <div className="reservas-mini-head">
                      <div className="sede-summary-labelWrap">
                        <div style={{ width: 12, height: 12, background: segment.color, borderRadius: 999, flex: '0 0 12px' }} />
                        <div className="sede-summary-label" title={segment.label}><strong>{segment.label}</strong></div>
                      </div>
                      <div className="muted sede-summary-value">{segment.value} • {percentage}%</div>
                    </div>
                    <div className="reservas-mini-track">
                      <div className="reservas-mini-fill" style={{ width: `${percentage}%`, background: `linear-gradient(90deg, ${segment.color}, ${segment.color}cc)` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h4>Cierres programados</h4>
            <div className="reservas-mini-list">
              {roomBlocks.slice(0, 6).map((block) => (
                <div key={block.id} className="reservas-mini-item reservas-block-item">
                  <div className="reservas-mini-head">
                    <div className="sede-summary-labelWrap">
                      <div style={{ width: 12, height: 12, background: '#ef4444', borderRadius: 999, flex: '0 0 12px' }} />
                      <div className="sede-summary-label"><strong>{block.habitacion}</strong></div>
                    </div>
                    <button className="btn small ghost" onClick={() => openBlockEditor(block)}>Gestionar</button>
                  </div>
                  <div className="muted">{formatDate(block.fechaInicio)} → {formatDate(block.fechaFin)}</div>
                  <div className="muted">{block.motivo}</div>
                </div>
              ))}
              {!loadingBlocks && roomBlocks.length === 0 && <p className="muted">No hay cierres programados en este rango.</p>}
              {loadingBlocks && <p className="muted">Cargando cierres operativos...</p>}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h4>Estados</h4>
            <div className="reservas-mini-list">
              {[
                { label: 'Confirmadas', value: stats.confirmed, color: '#06b6d4' },
                { label: 'Abonadas', value: stats.partiallyPaid, color: '#38bdf8' },
                { label: 'Pendientes', value: stats.pending, color: '#f59e0b' },
                { label: 'Canceladas', value: stats.cancelled, color: '#ef4444' },
              ].map((segment) => {
                const percentage = Math.round((segment.value / Math.max(1, stats.total)) * 100);
                return (
                  <div key={segment.label} className="reservas-mini-item">
                    <div className="reservas-mini-head">
                      <div className="sede-summary-labelWrap">
                        <div style={{ width: 12, height: 12, background: segment.color, borderRadius: 999, flex: '0 0 12px' }} />
                        <div className="sede-summary-label"><strong>{segment.label}</strong></div>
                      </div>
                      <div className="muted sede-summary-value">{segment.value} • {percentage}%</div>
                    </div>
                    <div className="reservas-mini-track">
                      <div className="reservas-mini-fill" style={{ width: `${percentage}%`, background: `linear-gradient(90deg, ${segment.color}, ${segment.color}cc)` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {reservationForm && (
        <div className="modal-overlay" onClick={closeReservationEditor}>
          <div className="modal reservas-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="reservas-editor-head">
              <div>
                <h3 style={{ marginBottom: 8 }}>{selectedReservation ? (reservationEditMode ? 'Editar reserva' : 'Detalle de reserva') : 'Nueva reserva'}</h3>
                <p className="muted reservas-editor-subtitle">{selectedReservation ? (reservationEditMode ? 'Ajusta la reserva y confirma el resumen final.' : 'Revisa la reserva y decide la siguiente acción.') : 'Completa los pasos y finaliza la reserva desde el resumen.'}</p>
              </div>
              <div className="reservas-editor-head-actions">
                {selectedReservation ? <span className={`pill ${getStatusTone(getReservationDisplayStatus(selectedReservation))}`}>{getReservationStatusLabel(getReservationDisplayStatus(selectedReservation))}</span> : <span className="pill ok">nueva</span>}
                <button type="button" className="reservas-modal-close" onClick={closeReservationEditor} aria-label="Cerrar modal de reserva">×</button>
              </div>
            </div>

            {selectedReservation && !reservationEditMode ? (
              <>
                <div className="reservas-editor-grid reservas-editor-detail-grid">
                  <label>
                    <span>Huésped</span>
                    <div className="reservas-editor-value">{selectedReservation.huesped}</div>
                  </label>
                  <label>
                    <span>Habitación</span>
                    <div className="reservas-editor-value">{selectedReservation.habitacion}</div>
                  </label>
                  <label>
                    <span>Hotel</span>
                    <div className="reservas-editor-value">{selectedReservation.hotel}</div>
                  </label>
                  <label>
                    <span>Estado</span>
                    <div className="reservas-editor-value">{getReservationStatusLabel(getReservationDisplayStatus(selectedReservation))}</div>
                  </label>
                  <label>
                    <span>Pagado</span>
                    <div className="reservas-editor-value">{getReservationPaidAmount(selectedReservation).toFixed(2)} USD</div>
                  </label>
                  <label>
                    <span>Saldo pendiente</span>
                    <div className="reservas-editor-value">{getReservationPendingAmount(selectedReservation).toFixed(2)} USD</div>
                  </label>
                  <label>
                    <span>Check-in</span>
                    <div className="reservas-editor-value">{formatDate(selectedReservation.checkIn)}</div>
                  </label>
                  <label>
                    <span>Check-out</span>
                    <div className="reservas-editor-value">{formatDate(selectedReservation.checkOut)}</div>
                  </label>
                  <label>
                    <span>Noches</span>
                    <div className="reservas-editor-value">{reservationForm.noches}</div>
                  </label>
                  <label>
                    <span>Ocupación</span>
                    <div className="reservas-editor-value">{reservationForm.adultos} adulto{reservationForm.adultos === 1 ? '' : 's'} · {reservationForm.ninos} niño{reservationForm.ninos === 1 ? '' : 's'}</div>
                  </label>
                  <label style={{ gridColumn: '1 / -1' }}>
                    <span>Observaciones</span>
                    <div className="reservas-editor-value reservas-editor-value-multiline">{reservationForm.observaciones || 'Sin observaciones registradas.'}</div>
                  </label>
                  <label>
                    <span>Total</span>
                    <div className="reservas-editor-value">{selectedReservation.total.toFixed(2)} USD</div>
                  </label>
                </div>

                <div className="reservas-editor-actions">
                  {getReservationDisplayStatus(selectedReservation) === 'creada' ? (
                    <button className="btn" disabled={savingReservation} onClick={() => void handleConfirmReservation()}>
                      {savingReservation ? 'Confirmando...' : 'Confirmar'}
                    </button>
                  ) : null}
                  {getReservationDisplayStatus(selectedReservation) !== 'cancelada' && isFutureReservation(selectedReservation, currentTimestamp) ? (
                    <button className="btn ghost" disabled={cancellingId === selectedReservation.id} onClick={() => void handleCancelReservation(selectedReservation.id)}>
                      {cancellingId === selectedReservation.id ? 'Cancelando...' : 'Cancelar'}
                    </button>
                  ) : null}
                  <button className="btn ghost" onClick={() => setReservationEditMode(true)}>Editar</button>
                  <button className="btn ghost" onClick={closeReservationEditor}>Cerrar</button>
                </div>
              </>
            ) : (
              <>

            <div className="reservas-wizard-shell">
              <div className="reservas-wizard-progress reservas-wizard-progress-compact" role="tablist" aria-label="Fases de la reserva">
                {reservationWizardSteps.map((step, index) => {
                  const currentIndex = reservationWizardSteps.findIndex((item) => item.id === reservationWizardStep);
                  const status = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending';

                  return (
                    <button
                      key={step.id}
                      type="button"
                      className={`reservas-wizard-step is-${status}`}
                      onClick={() => {
                        if (index < currentIndex) setReservationWizardStep(step.id);
                      }}
                      disabled={index > currentIndex}
                    >
                      <span className="reservas-wizard-step-index">0{index + 1}</span>
                      <strong>{step.title}</strong>
                      <small>{step.caption}</small>
                    </button>
                  );
                })}
              </div>

              <div className="reservas-compact-overview">
                <article className="reservas-compact-overview-card accent">
                  <span>Total estimado</span>
                  <strong>{reservationPricingQuote ? `${reservationPricingQuote.total.toFixed(2)} ${reservationPricingQuote.currency}` : 'Pendiente'}</strong>
                  <small>{reservationPricingQuote?.sourceLabel ?? 'Sin tarifa definida'}</small>
                </article>
                <article className="reservas-compact-overview-card">
                  <span>Reserva</span>
                  <strong>{selectedRoom?.nombre ?? 'Sin habitación'}</strong>
                  <small>{reservationForm.permitirClienteNuevo ? (reservationForm.nuevoClienteNombre || 'Cliente nuevo') : (selectedGuest?.nombre ?? 'Sin huésped')}</small>
                </article>
                <article className="reservas-compact-overview-card">
                  <span>Estadía</span>
                  <strong>{reservationForm.noches} noche{reservationForm.noches === 1 ? '' : 's'}</strong>
                  <small>{reservationPreviewCheckOut ? `Salida ${new Date(reservationPreviewCheckOut).toLocaleDateString('es-HN')}` : 'Completa los datos'}</small>
                </article>
              </div>

              <div className="reservas-compact-body">
                {reservationWizardStep === 'datos' ? (
                  <section className="reservas-step-panel reservas-compact-panel">
                    <div className="reservas-compact-panel-head">
                      <div>
                        <span className="trainers-eyebrow">Paso 1</span>
                        <h4>Datos base</h4>
                      </div>
                      <p className="muted">Solo lo esencial para la reserva.</p>
                    </div>

                    <div className="reservas-compact-grid">
                      <label>
                        <span>Huésped</span>
                        <select className="input" value={reservationForm.huespedId} disabled={!selectedReservation && reservationForm.permitirClienteNuevo} onChange={(event) => setReservationForm((current) => current ? { ...current, huespedId: event.target.value } : current)}>
                          <option value="">Selecciona huésped</option>
                          {huespedes.map((guest) => <option key={guest.id} value={guest.id}>{guest.nombre}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>Habitación</span>
                        <select className="input" value={reservationForm.habitacionId} onChange={(event) => setReservationForm((current) => current ? { ...current, habitacionId: event.target.value } : current)}>
                          {habitaciones
                            .filter((room) => selectedHotel === 'Todos' ? true : room.hotel === selectedHotel)
                            .map((room) => <option key={room.id} value={room.id}>{room.nombre} · {room.hotel}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>Entrada</span>
                        <input className="input" type="datetime-local" value={reservationForm.checkIn} onChange={(event) => setReservationForm((current) => current ? {
                          ...current,
                          checkIn: event.target.value,
                          checkOut: current.modoFechas === 'dias' ? getCheckOutFromNights(event.target.value, current.noches) : current.checkOut,
                        } : current)} />
                      </label>
                      <label>
                        <span>Modo</span>
                        <select className="input" value={reservationForm.modoFechas} onChange={(event) => setReservationForm((current) => current ? {
                          ...current,
                          modoFechas: event.target.value as ReservationEditorState['modoFechas'],
                          checkOut: event.target.value === 'dias'
                            ? getCheckOutFromNights(current.checkIn, current.noches)
                            : current.checkOut,
                        } : current)}>
                          <option value="dias">Por noches</option>
                          <option value="rango">Por rango</option>
                        </select>
                      </label>
                      {reservationForm.modoFechas === 'rango' ? (
                        <label>
                          <span>Salida</span>
                          <input className="input" type="datetime-local" value={reservationForm.checkOut} min={reservationForm.checkIn} onChange={(event) => setReservationForm((current) => current ? {
                            ...current,
                            checkOut: event.target.value,
                            noches: getNightCountFromDates(current.checkIn, event.target.value),
                          } : current)} />
                        </label>
                      ) : (
                        <div className="reservas-compact-counter-field">
                          <span>Noches</span>
                          <div className="reservas-compact-counter">
                            <button type="button" className="btn ghost" onClick={() => setReservationForm((current) => current ? {
                              ...current,
                              noches: Math.max(1, current.noches - 1),
                              checkOut: getCheckOutFromNights(current.checkIn, Math.max(1, current.noches - 1)),
                            } : current)}>−</button>
                            <strong>{reservationForm.noches}</strong>
                            <button type="button" className="btn ghost" onClick={() => setReservationForm((current) => current ? {
                              ...current,
                              noches: current.noches + 1,
                              checkOut: getCheckOutFromNights(current.checkIn, current.noches + 1),
                            } : current)}>+</button>
                          </div>
                        </div>
                      )}
                      <label>
                        <span>Estado</span>
                        <select className="input" value={reservationForm.estado} onChange={(event) => setReservationForm((current) => current ? { ...current, estado: event.target.value as ReservationEditorState['estado'] } : current)}>
                          <option value="creada">Pendiente</option>
                          <option value="confirmada">Confirmada</option>
                          <option value="cancelada">Cancelada</option>
                        </select>
                      </label>
                    </div>

                    <div className="reservas-compact-counter-row">
                      <div className="reservas-compact-counter-field">
                        <span>Adultos</span>
                        <div className="reservas-compact-counter">
                          <button type="button" className="btn ghost" onClick={() => setReservationForm((current) => current ? { ...current, adultos: Math.max(1, current.adultos - 1) } : current)}>−</button>
                          <strong>{reservationForm.adultos}</strong>
                          <button type="button" className="btn ghost" onClick={() => setReservationForm((current) => current ? { ...current, adultos: current.adultos + 1 } : current)}>+</button>
                        </div>
                      </div>
                      <div className="reservas-compact-counter-field">
                        <span>Niños</span>
                        <div className="reservas-compact-counter">
                          <button type="button" className="btn ghost" onClick={() => setReservationForm((current) => current ? { ...current, ninos: Math.max(0, current.ninos - 1) } : current)}>−</button>
                          <strong>{reservationForm.ninos}</strong>
                          <button type="button" className="btn ghost" onClick={() => setReservationForm((current) => current ? { ...current, ninos: current.ninos + 1 } : current)}>+</button>
                        </div>
                      </div>
                      <label className="reservas-compact-note-field">
                        <span>Nota breve</span>
                        <input className="input" maxLength={120} placeholder="Observación corta" value={reservationForm.observaciones} onChange={(event) => setReservationForm((current) => current ? { ...current, observaciones: event.target.value } : current)} />
                      </label>
                    </div>

                    {!selectedReservation ? (
                      <div className="reservas-guest-creation-card reservas-guest-creation-card-compact">
                        <label className="reservas-editor-checkbox reservas-side-toggle">
                          <input
                            type="checkbox"
                            checked={reservationForm.permitirClienteNuevo}
                            onChange={(event) => setReservationForm((current) => current ? {
                              ...current,
                              permitirClienteNuevo: event.target.checked,
                              huespedId: event.target.checked ? '' : current.huespedId,
                            } : current)}
                          />
                          <span>Registrar cliente nuevo</span>
                        </label>

                        {reservationForm.permitirClienteNuevo ? (
                          <div className="reservas-compact-grid reservas-compact-grid-guest">
                            <label>
                              <span>Nombre</span>
                              <input className="input" value={reservationForm.nuevoClienteNombre} onChange={(event) => setReservationForm((current) => current ? { ...current, nuevoClienteNombre: event.target.value } : current)} />
                            </label>
                            <label>
                              <span>Correo</span>
                              <input className="input" type="email" value={reservationForm.nuevoClienteCorreo} onChange={(event) => setReservationForm((current) => current ? { ...current, nuevoClienteCorreo: event.target.value } : current)} />
                            </label>
                            <label>
                              <span>Teléfono</span>
                              <input className="input" value={reservationForm.nuevoClienteTelefono} onChange={(event) => setReservationForm((current) => current ? { ...current, nuevoClienteTelefono: event.target.value } : current)} />
                            </label>
                            <label>
                              <span>Ciudad</span>
                              <input className="input" value={reservationForm.nuevoClienteCiudad} onChange={(event) => setReservationForm((current) => current ? { ...current, nuevoClienteCiudad: event.target.value } : current)} />
                            </label>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {reservationWizardStep === 'tarifas' ? (
                  <section className="reservas-step-panel reservas-compact-panel">
                    <div className="reservas-compact-panel-head">
                      <div>
                        <span className="trainers-eyebrow">Paso 2</span>
                        <h4>Tarifa y cobro</h4>
                      </div>
                      <p className="muted">Selecciona el esquema de cobro.</p>
                    </div>

                    <div className="reservas-mode-cards">
                      <button type="button" className={`reservas-mode-card ${reservationForm.modoTarifa === 'actual' ? 'active' : ''}`} onClick={() => setReservationForm((current) => current ? { ...current, modoTarifa: 'actual', tarifaPersonalizadaId: '' } : current)}>
                        <span>Actual</span>
                        <strong>{selectedRoomCurrentTariff && tariffCatalog ? `${selectedRoomCurrentTariff.montoNoche.toFixed(2)} ${tariffCatalog.config.monedaBase}` : 'Sin tarifa'}</strong>
                      </button>
                      <button type="button" className={`reservas-mode-card ${reservationForm.modoTarifa === 'personalizada' ? 'active' : ''}`} onClick={() => setReservationForm((current) => current ? { ...current, modoTarifa: 'personalizada', tarifaPersonalizadaId: current.tarifaPersonalizadaId || applicableCustomTariffs[0]?.id || 'manual' } : current)}>
                        <span>Personalizada</span>
                        <strong>{selectedCustomTariff?.nombre ?? (usesManualCustomTariff ? 'Manual' : 'Elegir')}</strong>
                      </button>
                    </div>

                    {reservationForm.modoTarifa === 'personalizada' ? (
                      <div className="reservas-compact-grid reservas-compact-grid-tariff">
                        <label className="reservas-compact-grid-full">
                          <span>Origen</span>
                          <select className="input" value={reservationForm.tarifaPersonalizadaId} onChange={(event) => setReservationForm((current) => current ? { ...current, tarifaPersonalizadaId: event.target.value } : current)}>
                            <option value="manual">Valor manual</option>
                            {applicableCustomTariffs.map((tariff) => (
                              <option key={tariff.id} value={tariff.id}>{tariff.nombre} · {tariff.montoNoche.toFixed(2)} {tariff.moneda}</option>
                            ))}
                          </select>
                        </label>
                        {usesManualCustomTariff ? (
                          <>
                            <label>
                              <span>Monto</span>
                              <input className="input" type="number" min="0" step="0.01" value={reservationForm.tarifaManualMonto} onChange={(event) => setReservationForm((current) => current ? { ...current, tarifaManualMonto: Math.max(0, Number(event.target.value) || 0) } : current)} />
                            </label>
                            <label>
                              <span>Moneda</span>
                              <select className="input" value={reservationForm.tarifaManualMoneda} onChange={(event) => setReservationForm((current) => current ? { ...current, tarifaManualMoneda: event.target.value as SupportedCurrency } : current)}>
                                <option value="USD">USD</option>
                                <option value="HNL">HNL</option>
                              </select>
                            </label>
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    <button type="button" className={`reservas-toggle-chip ${reservationForm.aplicarDescuentoTerceraEdad ? 'active' : ''}`} onClick={() => setReservationForm((current) => current ? { ...current, aplicarDescuentoTerceraEdad: !current.aplicarDescuentoTerceraEdad } : current)}>
                      {reservationForm.aplicarDescuentoTerceraEdad ? 'Descuento tercera edad activo' : 'Aplicar descuento tercera edad'}
                    </button>

                    <div className="reservas-compact-metrics">
                      <article>
                        <span>Tarifa</span>
                        <strong>{reservationPricingQuote ? `${reservationPricingQuote.appliedNightlyRate.toFixed(2)} ${reservationPricingQuote.currency}` : 'N/D'}</strong>
                      </article>
                      <article>
                        <span>Subtotal</span>
                        <strong>{reservationPricingQuote ? `${reservationPricingQuote.subtotal.toFixed(2)} ${reservationPricingQuote.currency}` : 'N/D'}</strong>
                      </article>
                      <article>
                        <span>Descuento</span>
                        <strong>{reservationPricingQuote ? `${reservationPricingQuote.seniorDiscount.toFixed(2)} ${reservationPricingQuote.currency}` : 'N/D'}</strong>
                      </article>
                      <article>
                        <span>Total</span>
                        <strong>{reservationPricingQuote ? `${reservationPricingQuote.total.toFixed(2)} ${reservationPricingQuote.currency}` : 'N/D'}</strong>
                      </article>
                    </div>
                  </section>
                ) : null}

                {reservationWizardStep === 'resumen' ? (
                  <section className="reservas-step-panel reservas-compact-panel reservas-checkout-confirmation">
                    <div className="reservas-compact-panel-head">
                      <div>
                        <span className="trainers-eyebrow">Paso 3</span>
                        <h4>Resumen final</h4>
                      </div>
                      <p className="muted">Última revisión antes de guardar.</p>
                    </div>

                    <div className="reservas-confirmation-list reservas-confirmation-list-compact">
                      <article>
                        <strong>Huésped</strong>
                        <p>{reservationForm.permitirClienteNuevo ? reservationForm.nuevoClienteNombre || 'Cliente nuevo' : selectedGuest?.nombre ?? 'Sin huésped'}</p>
                      </article>
                      <article>
                        <strong>Habitación</strong>
                        <p>{selectedRoom?.nombre ?? 'Sin habitación'}</p>
                      </article>
                      <article>
                        <strong>Estadía</strong>
                        <p>{reservationForm.noches} noche{reservationForm.noches === 1 ? '' : 's'} · {reservationForm.adultos}A · {reservationForm.ninos}N</p>
                      </article>
                      <article>
                        <strong>Total</strong>
                        <p>{reservationPricingQuote ? `${reservationPricingQuote.total.toFixed(2)} ${reservationPricingQuote.currency}` : 'Pendiente'}</p>
                      </article>
                    </div>

                    <div className="reservas-summary-note reservas-summary-note-compact">
                      <strong>Detalle</strong>
                      <p>{reservationForm.observaciones.trim() || 'Sin observaciones adicionales.'}</p>
                    </div>
                  </section>
                ) : null}
              </div>

            </div>
            <div className="reservas-editor-actions reservas-editor-actions-wizard">
              <div className="reservas-editor-footer-meta">
                <div>
                  <span>Fase actual</span>
                  <strong>{reservationWizardMeta.title}</strong>
                  <small>{reservationWizardMeta.caption}</small>
                </div>
                <div>
                  <span>Total estimado</span>
                  <strong>{reservationPricingQuote ? `${reservationPricingQuote.total.toFixed(2)} ${reservationPricingQuote.currency}` : selectedReservation ? `${selectedReservation.total.toFixed(2)} USD` : 'Pendiente'}</strong>
                  <small>{reservationPreviewCheckOut ? `Salida ${new Date(reservationPreviewCheckOut).toLocaleString('es-HN')}` : 'Completa los datos'}</small>
                </div>
              </div>
              <div className="reservas-editor-action-buttons">
                {selectedReservation && selectedReservation.estado !== 'cancelada' && isFutureReservation(selectedReservation, currentTimestamp) ? (
                  <button className="btn ghost" disabled={cancellingId === selectedReservation.id} onClick={() => void handleCancelReservation(selectedReservation.id)}>
                    {cancellingId === selectedReservation.id ? 'Cancelando...' : 'Cancelar reserva'}
                  </button>
                ) : null}
                {selectedReservation ? <button className="btn ghost" onClick={() => setReservationEditMode(false)}>Volver al detalle</button> : null}
                <button className="btn ghost" onClick={closeReservationEditor}>Cerrar</button>
                {reservationWizardStep !== 'datos' ? <button className="btn ghost" onClick={goToPreviousReservationStep}>Atrás</button> : null}
                {reservationWizardStep !== 'resumen' ? (
                  <button className="btn" onClick={goToNextReservationStep}>
                    {reservationWizardStep === 'datos' ? 'Siguiente: tarifas' : 'Siguiente: resumen'}
                  </button>
                ) : (
                  <button className="btn" disabled={savingReservation} onClick={() => void handleSaveReservation()}>
                    {savingReservation ? 'Guardando...' : selectedReservation ? 'Finalizar cambios' : 'Finalizar reserva'}
                  </button>
                )}
              </div>
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {blockForm && (
        <div className="modal-overlay" onClick={closeBlockEditor}>
          <div className="modal reservas-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="reservas-editor-head">
              <div>
                <h3 style={{ marginBottom: 8 }}>{blockForm.blockId ? 'Calendario de cierre' : 'Cerrar habitación por fechas'}</h3>
                <p className="muted">Usa este calendario operativo para sacar temporalmente una habitación de inventario y volver a habilitarla cuando termine el cierre.</p>
              </div>
              <span className={`pill ${blockForm.blockId ? 'danger' : 'warn'}`}>{blockForm.blockId ? 'cerrada' : 'nuevo cierre'}</span>
            </div>

            <div className="reservas-editor-grid">
              <label>
                <span>Habitación</span>
                <select className="input" value={blockForm.habitacionId} disabled={Boolean(blockForm.blockId)} onChange={(event) => setBlockForm((current) => current ? { ...current, habitacionId: event.target.value } : current)}>
                  <option value="">Selecciona habitación</option>
                  {habitaciones
                    .filter((room) => selectedHotel === 'Todos' ? true : room.hotel === selectedHotel)
                    .map((room) => <option key={room.id} value={room.id}>{room.nombre} · {room.hotel}</option>)}
                </select>
              </label>
              <label>
                <span>Motivo</span>
                <input className="input" value={blockForm.motivo} placeholder="Mantenimiento, limpieza profunda, evento, etc." onChange={(event) => setBlockForm((current) => current ? { ...current, motivo: event.target.value } : current)} />
              </label>
              <label>
                <span>Desde</span>
                <input className="input" type="datetime-local" value={blockForm.fechaInicio} disabled={Boolean(blockForm.blockId)} onChange={(event) => setBlockForm((current) => current ? { ...current, fechaInicio: event.target.value } : current)} />
              </label>
              <label>
                <span>Hasta</span>
                <input className="input" type="datetime-local" value={blockForm.fechaFin} min={blockForm.fechaInicio} disabled={Boolean(blockForm.blockId)} onChange={(event) => setBlockForm((current) => current ? { ...current, fechaFin: event.target.value } : current)} />
              </label>
            </div>

            {!blockForm.blockId ? (
              <label className="reservas-editor-checkbox">
                <input
                  type="checkbox"
                  checked={blockForm.permitirConReservas}
                  onChange={(event) => setBlockForm((current) => current ? { ...current, permitirConReservas: event.target.checked } : current)}
                />
                <span>Permitir cierre aunque existan reservas activas en el rango. Solo bloqueará nuevas reservas.</span>
              </label>
            ) : null}

            <div className="reservas-editor-actions">
              {blockForm.blockId ? (
                <button className="btn ghost" disabled={savingBlock} onClick={() => void handleDeleteBlock(blockForm.blockId!)}>
                  {savingBlock ? 'Habilitando...' : 'Habilitar habitación'}
                </button>
              ) : <span className="muted">El cierre bloqueará reservas nuevas dentro del rango.</span>}
              <button className="btn ghost" onClick={closeBlockEditor}>Cerrar</button>
              {!blockForm.blockId ? (
                <button className="btn" disabled={savingBlock} onClick={() => void handleSaveBlock()}>
                  {savingBlock ? 'Guardando...' : 'Guardar cierre'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {alertState && (
        <div className="modal-overlay" onClick={() => setAlertState(null)}>
          <div className={`modal reservas-alert-modal ${alertState.tone}`} onClick={(event) => event.stopPropagation()}>
            <div className="reservas-alert-head">
              <div className={`reservas-alert-icon ${alertState.tone}`} aria-hidden="true">
                {alertState.tone === 'success' ? 'OK' : alertState.tone === 'warning' ? '!' : alertState.tone === 'info' ? 'i' : 'X'}
              </div>
              <div>
                <h3>{alertState.title}</h3>
                <p>{alertState.detail}</p>
              </div>
            </div>
            <div className="reservas-alert-actions">
              <button className="btn" onClick={() => setAlertState(null)}>Entendido</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reservas;