import React, { useEffect, useMemo, useState } from 'react';
import AreaChartNeon from './AreaChartNeon';
import DonutChart from './DonutChart';
import BarChart from './BarChart';
import SedeDistributionChart from './SedeDistributionChart';
import { cancelReservation, createReservation, rescheduleReservation, type ReservaView, type ServicioView } from '../lib/api';
import { downloadCsv } from '../lib/export';
import { useAuth } from '../context/AuthContext';
import { useGymData } from '../context/GymDataContext';

const paymentMethods = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'deposito', label: 'Deposito' },
  { value: 'otro', label: 'Otro' },
] as const;

const buildMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const toInputDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toLocalDateKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return toInputDateValue(date);
};

const parseDateStart = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const parseDateEnd = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
};

const getMonthBounds = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
};

const getLatestReservationDate = (reservas: ReservaView[]) => {
  const latest = reservas.reduce((acc, reservation) => {
    const date = new Date(reservation.fecha);
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
  if (normalized.startsWith('cread')) return 'warn';
  return 'danger';
};

const normalizeSearchText = (value: string) => value.trim().toLowerCase();

const isFutureReservation = (reservation: ReservaView) => new Date(reservation.fecha).getTime() >= Date.now();

export const Reservas: React.FC = () => {
  const { role, user } = useAuth();
  const { data, loading, error, refresh } = useGymData();
  const isClient = role === 'client';
  const currentPersona = useMemo(() => {
    if (!data || !user?.email) return null;
    return data.personas.find((item) => item.correo?.toLowerCase() === user.email?.toLowerCase()) ?? null;
  }, [data, user?.email]);
  const servicios = data?.serviciosView ?? [];

  const reservas = useMemo(() => {
    const allReservations = (data?.reservasView ?? []) as ReservaView[];

    if (!isClient || !currentPersona) {
      return allReservations;
    }

    return allReservations.filter((reservation) => reservation.clienteId === currentPersona.id_persona);
  }, [currentPersona, data?.reservasView, isClient]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [selectedSede, setSelectedSede] = useState<string>('Todas');
  const [selectedType, setSelectedType] = useState<string>('Todos');
  const [sessionDate, setSessionDate] = useState<string>('');
  const [sessionQuery, setSessionQuery] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<(typeof paymentMethods)[number]['value']>('tarjeta');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [rescheduleReservationId, setRescheduleReservationId] = useState<string | null>(null);
  const [rescheduleTargetId, setRescheduleTargetId] = useState<string>('');
  const [rescheduling, setRescheduling] = useState(false);

  const months = useMemo(() => {
    const latest = getLatestReservationDate(reservas);
    const year = latest.getFullYear();
    const list: { key: string; label: string }[] = [];

    for (let m = 0; m < 12; m++) {
      const d = new Date(year, m, 1);
      const key = buildMonthKey(d);
      const label = d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
      list.push({ key, label });
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
    const millisecondsPerDay = 86_400_000;
    const dayCount = Math.max(1, Math.round((normalizedEnd.getTime() - normalizedStart.getTime()) / millisecondsPerDay) + 1);

    return {
      rangeStartDate: normalizedStart,
      rangeEndDate: normalizedEnd,
      rangeDayCount: dayCount,
    };
  }, [rangeEnd, rangeStart]);

  const visibleReservas = useMemo(() => {
    return reservas
      .filter((reservation) => {
        const timestamp = new Date(reservation.fecha).getTime();
        return timestamp >= rangeStartDate.getTime() && timestamp <= rangeEndDate.getTime();
      })
      .slice()
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  }, [rangeEndDate, rangeStartDate, reservas]);

  const upcomingReservations = useMemo(
    () => reservas
      .filter((reservation) => new Date(reservation.fecha).getTime() >= Date.now() && reservation.estado !== 'cancelada')
      .slice()
      .sort((left, right) => new Date(left.fecha).getTime() - new Date(right.fecha).getTime()),
    [reservas],
  );

  const completedReservations = useMemo(
    () => reservas.filter((reservation) => reservation.estado === 'completada').length,
    [reservas],
  );

  const cancelledReservations = useMemo(
    () => reservas.filter((reservation) => reservation.estado === 'cancelada').length,
    [reservas],
  );

  const reservedProgramIds = useMemo(
    () => new Set(
      reservas
        .filter((reservation) => reservation.estado !== 'cancelada' && reservation.programacionId)
        .map((reservation) => reservation.programacionId as string),
    ),
    [reservas],
  );

  const leadTimeMs = (data?.operationalSettings.horasAnticipacionReserva ?? 0) * 60 * 60 * 1000;

  const availableSedes = useMemo(() => {
    const values = new Set<string>(['Todas']);
    servicios.forEach((service) => values.add(service.sede));
    return Array.from(values);
  }, [servicios]);

  const availableTypes = useMemo(() => {
    const values = new Set<string>(['Todos']);
    servicios.forEach((service) => values.add(service.tipo));
    return Array.from(values);
  }, [servicios]);

  const availableSessions = useMemo(() => {
    const normalizedQuery = normalizeSearchText(sessionQuery);
    const minimumTime = Date.now() + leadTimeMs;

    return servicios
      .filter((service) => new Date(service.fechaISO).getTime() >= minimumTime)
      .filter((service) => selectedSede === 'Todas' || service.sede === selectedSede)
      .filter((service) => selectedType === 'Todos' || service.tipo === selectedType)
      .filter((service) => !sessionDate || toLocalDateKey(service.fechaISO) === sessionDate)
      .filter((service) => {
        if (!normalizedQuery) return true;

        const searchBase = `${service.nombre} ${service.instructor} ${service.sede}`.toLowerCase();
        return searchBase.includes(normalizedQuery);
      })
      .slice()
      .sort((left, right) => new Date(left.fechaISO).getTime() - new Date(right.fechaISO).getTime());
  }, [leadTimeMs, selectedSede, selectedType, servicios, sessionDate, sessionQuery]);

  const availableSeats = (service: ServicioView) => Math.max(0, service.capacidad - service.inscritos);

  const nextBookableSession = availableSessions.find((service) => availableSeats(service) > 0) ?? null;
  const favoriteSede = useMemo(() => {
    const counts = new Map<string, number>();
    reservas.forEach((reservation) => {
      counts.set(reservation.sede, (counts.get(reservation.sede) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort(([, left], [, right]) => right - left)[0]?.[0] ?? 'Explora nuevas sedes';
  }, [reservas]);

  const reservationById = useMemo(
    () => new Map(reservas.map((reservation) => [reservation.id, reservation])),
    [reservas],
  );

  const activeRescheduleReservation = rescheduleReservationId ? reservationById.get(rescheduleReservationId) ?? null : null;

  const rescheduleOptions = useMemo(() => {
    if (!activeRescheduleReservation) return [];

    return availableSessions
      .filter((service) => service.id !== activeRescheduleReservation.programacionId)
      .filter((service) => service.capacidad > service.inscritos)
      .filter((service) => !reservedProgramIds.has(service.id))
      .slice()
      .sort((left, right) => {
        const leftPriority = left.nombre === activeRescheduleReservation.servicio ? 0 : 1;
        const rightPriority = right.nombre === activeRescheduleReservation.servicio ? 0 : 1;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        return new Date(left.fechaISO).getTime() - new Date(right.fechaISO).getTime();
      });
  }, [activeRescheduleReservation, availableSessions, reservedProgramIds]);

  useEffect(() => {
    if (!activeRescheduleReservation) {
      setRescheduleTargetId('');
      return;
    }

    const nextOption = rescheduleOptions[0]?.id ?? '';
    setRescheduleTargetId(nextOption);
  }, [activeRescheduleReservation, rescheduleOptions]);

  const stats = useMemo(() => {
    const labels: string[] = [];
    const dayKeys: string[] = [];
    for (let index = 0; index < rangeDayCount; index++) {
      const day = new Date(rangeStartDate);
      day.setDate(rangeStartDate.getDate() + index);
      labels.push(day.toLocaleDateString('es-ES', { month: rangeDayCount > 14 ? 'short' : undefined, day: '2-digit' }));
      dayKeys.push(toInputDateValue(day));
    }

    const countsByDay = dayKeys.map((key) => visibleReservas.filter((reservation) => toLocalDateKey(reservation.fecha) === key).length);

    const estadoCounts: Record<string, number> = {};
    visibleReservas.forEach((reservation) => {
      estadoCounts[reservation.estado] = (estadoCounts[reservation.estado] || 0) + 1;
    });
    const total = visibleReservas.length;
    const confirmed = (estadoCounts['confirmada'] || 0) + (estadoCounts['completada'] || 0);
    const pending = estadoCounts['creada'] || 0;
    const cancelled = estadoCounts['cancelada'] || 0;

    const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
    visibleReservas.forEach((reservation) => {
      const date = new Date(reservation.fecha);
      weekdayCounts[date.getDay() === 0 ? 6 : date.getDay() - 1]++;
    });

    return { labels, countsByDay, total, confirmed, pending, cancelled, weekdayCounts };
  }, [rangeDayCount, rangeStartDate, visibleReservas]);

  const areaData = useMemo(() => {
    return stats.labels.map((label, index) => ({
      name: label,
      reservas: stats.countsByDay[index] ?? 0,
    }));
  }, [stats]);

  const sedesMap: Record<string, number> = {};
  visibleReservas.forEach((reservation) => {
    sedesMap[reservation.sede] = (sedesMap[reservation.sede] || 0) + 1;
  });
  const sedeSegments = Object.entries(sedesMap).map(([label, value], index) => ({
    label,
    value,
    color: ['#06b6d4', '#7c3aed', '#06d6a0', '#ff7ab6'][index % 4],
  }));

  const reservaCountTotal = (segments: { label: string; value: number }[]) => segments.reduce((sum, segment) => sum + segment.value, 0) || 1;

  const estadoSegments = [
    { label: 'Confirmadas', value: stats.confirmed, color: '#06b6d4' },
    { label: 'Pendientes', value: stats.pending, color: '#f59e0b' },
    { label: 'Canceladas', value: stats.cancelled, color: '#ef4444' },
  ];

  const confirmationPercent = Math.round((stats.confirmed / Math.max(1, stats.total)) * 100);
  const activeRangeLabel = `${rangeStartDate.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })} - ${rangeEndDate.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })}`;

  const handleCreateReservation = async (service: ServicioView) => {
    if (!currentPersona) {
      setActionError('Tu cuenta no esta enlazada a un perfil operativo. No se puede reservar todavía.');
      return;
    }

    setBookingId(service.id);
    setActionError(null);
    setActionMessage(null);

    try {
      await createReservation({
        clienteId: currentPersona.id_persona,
        actividadId: service.id,
        estado: 'confirmada',
        pago: {
          metodoPago: paymentMethod,
          referencia: paymentReference.trim() || undefined,
          fechaPago: new Date().toISOString(),
        },
      });
      await refresh();
      setActionMessage(`Reserva creada y pagada para ${service.nombre}.`);
      setPaymentReference('');
    } catch (bookingError) {
      setActionError(bookingError instanceof Error ? bookingError.message : 'No se pudo crear la reserva.');
    } finally {
      setBookingId(null);
    }
  };

  const openRescheduleModal = (reservationId: string) => {
    setRescheduleReservationId(reservationId);
    setActionError(null);
    setActionMessage(null);
  };

  const closeRescheduleModal = () => {
    if (rescheduling) return;
    setRescheduleReservationId(null);
    setRescheduleTargetId('');
  };

  const handleRescheduleReservation = async () => {
    if (!activeRescheduleReservation || !rescheduleTargetId) return;

    setRescheduling(true);
    setActionError(null);
    setActionMessage(null);

    try {
      await rescheduleReservation(activeRescheduleReservation.id, rescheduleTargetId);
      await refresh();
      setActionMessage(`Reserva reprogramada para ${activeRescheduleReservation.servicio}.`);
      setRescheduleReservationId(null);
      setRescheduleTargetId('');
    } catch (rescheduleError) {
      setActionError(rescheduleError instanceof Error ? rescheduleError.message : 'No se pudo reprogramar la reserva.');
    } finally {
      setRescheduling(false);
    }
  };

  const handleExportReservations = () => {
    downloadCsv(visibleReservas, [
      { header: 'ID Reserva', value: (reservation) => reservation.id },
      { header: 'Cliente', value: (reservation) => reservation.cliente },
      { header: 'Servicio', value: (reservation) => reservation.servicio },
      { header: 'Sede', value: (reservation) => reservation.sede },
      { header: 'Entrenador', value: (reservation) => reservation.entrenador },
      { header: 'Fecha', value: (reservation) => new Date(reservation.fecha).toLocaleString('es-HN') },
      { header: 'Estado', value: (reservation) => reservation.estado },
      { header: 'Precio Aplicado', value: (reservation) => reservation.precioAplicado },
      { header: 'Capacidad', value: (reservation) => reservation.capacidad },
      { header: 'Inscritos', value: (reservation) => reservation.inscritos },
    ], isClient ? 'mis_reservas' : 'reservas');
  };

  return (
    <div className={`page ${isClient ? 'client-reservas-page' : ''}`}>
      <div className="dashboard-header" style={{ marginBottom: 12 }}>
        <div>
          <h2>{isClient ? 'Mis reservas' : 'Reservas'}</h2>
        </div>
        <div className="header-actions">
          <button className="btn ghost" onClick={handleExportReservations} disabled={visibleReservas.length === 0}>
            Exportar CSV
          </button>
        </div>
      </div>
      {error && <p className="muted">{error}</p>}
      {actionMessage && <p className="muted">{actionMessage}</p>}
      {actionError && <p className="muted">{actionError}</p>}

      {isClient && (
        <>
          <section className="client-reservas-hero">
            <article className="card client-reservas-hero-main">
              <span className="trainers-eyebrow">Experiencia FitHub</span>
              <h3>Reserva tu próxima sesión en segundos</h3>
              <p className="muted">Explora horarios, asegura tu cupo con pago inmediato y sigue tu progreso con una vista pensada para clientes, no para operación interna.</p>
              <div className="client-reservas-hero-pills">
                <span className="pill ok">{upcomingReservations.length} próximas</span>
                <span className="pill warn">Sede favorita: {favoriteSede}</span>
                <span className="pill ok">{availableSessions.length} opciones abiertas</span>
              </div>
            </article>

            <article className="card client-reservas-hero-side">
              <span className="trainers-eyebrow">Sugerencia</span>
              <h3>{nextBookableSession ? nextBookableSession.nombre : 'Agenda tu próxima visita'}</h3>
              <p className="muted">{nextBookableSession
                ? `${new Date(nextBookableSession.fechaISO).toLocaleString('es-HN')} · ${nextBookableSession.sede} · ${availableSeats(nextBookableSession)} cupos disponibles.`
                : 'No encontramos una sesión inmediata, pero puedes ajustar filtros para descubrir otras opciones.'}</p>
              <div className="client-reservas-hero-meta">
                <div>
                  <strong>{confirmationPercent}%</strong>
                  <span>confirmación en tu rango</span>
                </div>
                <div>
                  <strong>{completedReservations}</strong>
                  <span>sesiones completadas</span>
                </div>
              </div>
            </article>
          </section>

          <div className="stats-grid" style={{ marginBottom: 20 }}>
            <article className="card stat-card">
              <span>Próximas reservas</span>
              <strong>{upcomingReservations.length}</strong>
              <small>{upcomingReservations[0] ? upcomingReservations[0].servicio : 'Sin sesiones agendadas'}</small>
            </article>
            <article className="card stat-card">
              <span>Sesiones disponibles</span>
              <strong>{availableSessions.length}</strong>
              <small>{nextBookableSession ? formatDate(nextBookableSession.fechaISO) : 'Sin disponibilidad pronta'}</small>
            </article>
            <article className="card stat-card">
              <span>Completadas</span>
              <strong>{completedReservations}</strong>
              <small>{cancelledReservations} canceladas</small>
            </article>
          </div>

          <section className="card" style={{ marginBottom: 20 }}>
            <div className="reservas-card-head" style={{ marginBottom: 16 }}>
              <div>
                <h3 style={{ marginBottom: 6 }}>Descubre tu próxima sesión</h3>
                <p className="muted">Filtra por sede, tipo o fecha. Cuando elijas tu clase, el cupo queda asegurado con pago inmediato y confirmación al momento.</p>
              </div>
            </div>

            <div className="reservas-payment-banner">
              <div>
                <strong>Checkout instantáneo</strong>
                <p className="muted">Tu cobro se registra en la misma acción para que salgas con tu sesión confirmada.</p>
              </div>
              <div className="reservas-payment-fields">
                <select className="input" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as (typeof paymentMethods)[number]['value'])}>
                  {paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                </select>
                <input
                  className="input"
                  placeholder="Referencia de pago opcional"
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                />
              </div>
            </div>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
              <input
                className="input"
                placeholder="Buscar servicio, sede o entrenador"
                value={sessionQuery}
                onChange={(event) => setSessionQuery(event.target.value)}
              />
              <select className="input" value={selectedSede} onChange={(event) => setSelectedSede(event.target.value)}>
                {availableSedes.map((sede) => <option key={sede} value={sede}>{sede}</option>)}
              </select>
              <select className="input" value={selectedType} onChange={(event) => setSelectedType(event.target.value)}>
                {availableTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <input className="input" type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} />
            </div>

            <div className="service-grid">
              {availableSessions.slice(0, 12).map((service) => {
                const seatsLeft = availableSeats(service);
                const alreadyReserved = reservedProgramIds.has(service.id);
                const full = seatsLeft === 0;
                const buttonLabel = alreadyReserved ? 'Ya reservada' : full ? 'Sin cupos' : bookingId === service.id ? 'Reservando...' : 'Reservar';

                return (
                  <article key={service.id} className={`service-card client-service-card ${full ? 'agotado' : seatsLeft <= 2 ? 'ultimos-cupos' : 'disponible'}`}>
                    <div className="card-top">
                      <div className="service-name">{service.nombre}</div>
                      <div className={`state-pill ${full ? 'danger' : seatsLeft <= 2 ? 'warn' : 'ok'}`}>
                        {full ? 'COMPLETO' : `${seatsLeft} cupos`}
                      </div>
                    </div>

                    <div className="service-meta">
                      <div className="meta-left">
                        <div className="meta-line"><strong>Entrenador:</strong> {service.instructor}</div>
                        <div className="meta-line"><strong>Sede:</strong> {service.sede}</div>
                        <div className="meta-line"><strong>Fecha:</strong> {new Date(service.fechaISO).toLocaleString('es-HN')}</div>
                        <div className="meta-line"><strong>Tipo:</strong> {service.tipo}</div>
                      </div>
                      <div className="meta-right">
                        <div className="price">{service.costo}</div>
                      </div>
                    </div>

                    <div className="capacity">
                      <div className="cap-label">Cupo: {service.inscritos}/{service.capacidad}</div>
                      <div className="progress-outer">
                        <div className="progress-inner" style={{ width: `${Math.min(100, Math.round((service.inscritos / Math.max(1, service.capacidad)) * 100))}%` }} />
                      </div>
                    </div>

                    <div className="card-actions">
                      <button
                        className="btn"
                        disabled={full || alreadyReserved || bookingId === service.id || !currentPersona}
                        onClick={() => void handleCreateReservation(service)}
                      >
                        {alreadyReserved || full ? buttonLabel : bookingId === service.id ? 'Procesando pago...' : 'Confirmar cupo'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {availableSessions.length === 0 && (
              <p className="muted">No hay sesiones que coincidan con los filtros actuales.</p>
            )}

            {availableSessions.length > 12 && (
              <p className="muted" style={{ marginTop: 12 }}>Mostrando las primeras 12 sesiones disponibles. Ajusta los filtros para refinar la búsqueda.</p>
            )}
          </section>
        </>
      )}

      {isClient ? (
        <section className="card reservas-client-history-card">
          <div className="reservas-card-head reservas-client-toolbar">
            <div>
              <h3 style={{ marginBottom: 8 }}>Tus sesiones confirmadas y tu historial</h3>
              <p className="muted">Filtra por rango para revisar solo las clases que te interesan y actuar rápido sobre tus próximas reservas.</p>
            </div>
            <div className="reservas-range-controls">
              <select className="input reservas-select" value={selectedMonth} onChange={(e) => {
                const monthKey = e.target.value;
                const { start, end } = getMonthBounds(monthKey);
                setSelectedMonth(monthKey);
                setRangeStart(toInputDateValue(start));
                setRangeEnd(toInputDateValue(end));
              }}>
                {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              <input
                className="input reservas-date-input"
                type="date"
                value={rangeStart}
                max={rangeEnd}
                onChange={(event) => setRangeStart(event.target.value)}
              />
              <input
                className="input reservas-date-input"
                type="date"
                value={rangeEnd}
                min={rangeStart}
                onChange={(event) => setRangeEnd(event.target.value)}
              />
            </div>
          </div>

          <div className="members-table-scroll">
            <table className="table dark">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>Sede</th>
                  <th>Entrenador</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {visibleReservas.map(r => (
                  <tr key={r.id}>
                    <td>{r.servicio}</td>
                    <td>{r.sede}</td>
                    <td>{r.entrenador}</td>
                    <td>{formatDate(r.fecha)}</td>
                    <td><span className={`pill ${getStatusTone(r.estado)}`}>{r.estado}</span></td>
                    <td>
                      {r.estado !== 'cancelada' && isFutureReservation(r) ? (
                        <div className="card-actions" style={{ marginTop: 0 }}>
                          <button className="btn small" onClick={() => openRescheduleModal(r.id)}>
                            Reprogramar
                          </button>
                          <button className="btn small ghost" disabled={cancellingId === r.id} onClick={async () => {
                            setCancellingId(r.id);
                            setActionError(null);
                            setActionMessage(null);
                            try {
                              await cancelReservation(r.id);
                              await refresh();
                              setActionMessage('Reserva cancelada.');
                            } catch (cancelError) {
                              setActionError(cancelError instanceof Error ? cancelError.message : 'No se pudo cancelar la reserva.');
                            } finally {
                              setCancellingId(null);
                            }
                          }}>{cancellingId === r.id ? 'Cancelando...' : 'Cancelar'}</button>
                        </div>
                      ) : (
                        <span className="muted">Sin acción</span>
                      )}
                    </td>
                  </tr>
                ))}
                {visibleReservas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted members-table-empty">No hay reservas para el rango seleccionado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
      <div className="grid reservas-layout" style={{ gridTemplateColumns: '1fr 320px', gap: 20 }}>
        <div>
          <div className="card neon-card reservas-feature-card" style={{ marginBottom: 16 }}>
            <div className="reservas-card-head">
              <div>
                <h3 style={{ marginBottom: 8 }}>{isClient ? 'Tu ritmo de entrenamiento' : 'Reservas por rango'}</h3>
                <p className="muted">{activeRangeLabel}</p>
              </div>
              <div className="reservas-range-controls">
                <select className="input reservas-select" value={selectedMonth} onChange={(e) => {
                  const monthKey = e.target.value;
                  const { start, end } = getMonthBounds(monthKey);
                  setSelectedMonth(monthKey);
                  setRangeStart(toInputDateValue(start));
                  setRangeEnd(toInputDateValue(end));
                }}>
                  {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
                <input
                  className="input reservas-date-input"
                  type="date"
                  value={rangeStart}
                  max={rangeEnd}
                  onChange={(event) => setRangeStart(event.target.value)}
                />
                <input
                  className="input reservas-date-input"
                  type="date"
                  value={rangeEnd}
                  min={rangeStart}
                  onChange={(event) => setRangeEnd(event.target.value)}
                />
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <AreaChartNeon data={areaData} />
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 8 }}>{isClient ? 'Tus sesiones confirmadas y tu historial' : 'Tabla de próximas reservas'}</h3>
            <table className="table">
              <thead>
                <tr>
                  {!isClient && <th>Cliente</th>}
                  <th>Servicio</th>
                  <th>Sede</th>
                  {isClient && <th>Entrenador</th>}
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {visibleReservas.map(r => (
                  <tr key={r.id}>
                    {!isClient && <td>{r.cliente}</td>}
                    <td>{r.servicio}</td>
                    <td>{r.sede}</td>
                    {isClient && <td>{r.entrenador}</td>}
                    <td>{formatDate(r.fecha)}</td>
                    <td><span className={`pill ${getStatusTone(r.estado)}`}>{r.estado}</span></td>
                    <td>
                      {r.estado !== 'cancelada' && isFutureReservation(r) ? (
                        <div className="card-actions" style={{ marginTop: 0 }}>
                          {isClient && (
                            <button className="btn small" onClick={() => openRescheduleModal(r.id)}>
                              Reprogramar
                            </button>
                          )}
                          <button className="btn small ghost" disabled={cancellingId === r.id} onClick={async () => {
                            setCancellingId(r.id);
                            setActionError(null);
                            setActionMessage(null);
                            try {
                              await cancelReservation(r.id);
                              await refresh();
                              setActionMessage('Reserva cancelada.');
                            } catch (cancelError) {
                              setActionError(cancelError instanceof Error ? cancelError.message : 'No se pudo cancelar la reserva.');
                            } finally {
                              setCancellingId(null);
                            }
                          }}>{cancellingId === r.id ? 'Cancelando...' : 'Cancelar'}</button>
                        </div>
                      ) : (
                        <span className="muted">Sin acción</span>
                      )}
                    </td>
                  </tr>
                ))}
                {visibleReservas.length === 0 && (
                  <tr>
                    <td colSpan={isClient ? 6 : 6} className="muted">No hay reservas para el rango seleccionado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12 }}>
            <SedeDistributionChart data={sedeSegments.map(s => ({ name: s.label, value: s.value, color: s.color }))} />
          </div>
        </div>

        <div>
          <div className="card neon-card reservas-summary-card" style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
            <div>
              <div className="muted">{isClient ? 'Reservas del periodo' : 'Total reservas'}</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.total}</div>
              <div className="muted">Confirmadas: {stats.confirmed} • Pendientes: {stats.pending}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="muted">Confirmación del periodo</div>
              <DonutChart percent={confirmationPercent} size={160} color="#06b6d4" />
              <div className="muted">{stats.confirmed} de {stats.total} reservas</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h4>Horas / Día (Horas Pico)</h4>
            <BarChart values={stats.weekdayCounts} labels={['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']} />
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h4>Reservas por Sede</h4>
            <div className="reservas-mini-list">
              {sedeSegments.map((segment) => {
                const pct = Math.round((segment.value / reservaCountTotal(sedeSegments)) * 100);
                return (
                  <div key={segment.label} className="reservas-mini-item">
                    <div className="reservas-mini-head">
                      <div className="sede-summary-labelWrap">
                        <div style={{ width:12, height:12, background:segment.color, borderRadius:999, flex: '0 0 12px' }} />
                        <div className="sede-summary-label" title={segment.label}><strong>{segment.label}</strong></div>
                      </div>
                      <div className="muted sede-summary-value">{segment.value} • {pct}%</div>
                    </div>
                    <div className="reservas-mini-track">
                      <div className="reservas-mini-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${segment.color}, ${segment.color}cc)` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h4>Estados</h4>
            <div className="reservas-mini-list">
              {estadoSegments.map((segment) => {
                const pct = Math.round((segment.value / Math.max(1, stats.total)) * 100);
                return (
                  <div key={segment.label} className="reservas-mini-item">
                    <div className="reservas-mini-head">
                      <div className="sede-summary-labelWrap">
                        <div style={{ width:12, height:12, background:segment.color, borderRadius:999, flex: '0 0 12px' }} />
                        <div className="sede-summary-label"><strong>{segment.label}</strong></div>
                      </div>
                      <div className="muted sede-summary-value">{segment.value} • {pct}%</div>
                    </div>
                    <div className="reservas-mini-track">
                      <div className="reservas-mini-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${segment.color}, ${segment.color}cc)` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      )}
      {isClient && activeRescheduleReservation && (
        <div className="modal-overlay" onClick={closeRescheduleModal}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h3>Reprogramar reserva</h3>
            <p className="muted">Reserva actual: {activeRescheduleReservation.servicio} · {formatDate(activeRescheduleReservation.fecha)} · {activeRescheduleReservation.sede}</p>

            {rescheduleOptions.length > 0 ? (
              <>
                <select className="input" value={rescheduleTargetId} onChange={(event) => setRescheduleTargetId(event.target.value)}>
                  {rescheduleOptions.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.nombre} · {new Date(service.fechaISO).toLocaleString('es-HN')} · {service.sede} · {availableSeats(service)} cupos
                    </option>
                  ))}
                </select>

                <div className="reservas-mini-list" style={{ marginTop: 16 }}>
                  {rescheduleOptions.slice(0, 4).map((service) => (
                    <div key={`preview-${service.id}`} className="reservas-mini-item">
                      <div className="reservas-mini-head">
                        <strong>{service.nombre}</strong>
                        <span className={`pill ${service.nombre === activeRescheduleReservation.servicio ? 'ok' : 'warn'}`}>
                          {service.nombre === activeRescheduleReservation.servicio ? 'Mismo servicio' : 'Alternativa'}
                        </span>
                      </div>
                      <div className="muted">{new Date(service.fechaISO).toLocaleString('es-HN')} · {service.sede}</div>
                      <div className="muted">Entrenador: {service.instructor} · Cupos disponibles: {availableSeats(service)}</div>
                    </div>
                  ))}
                </div>

                <div className="member-modal-actions" style={{ marginTop: 16 }}>
                  <button className="btn" onClick={() => void handleRescheduleReservation()} disabled={rescheduling || !rescheduleTargetId}>
                    {rescheduling ? 'Reprogramando...' : 'Confirmar cambio'}
                  </button>
                  <button className="btn ghost" onClick={closeRescheduleModal} disabled={rescheduling}>Cancelar</button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">No encontramos sesiones alternativas disponibles con los criterios actuales y la anticipación mínima configurada.</p>
                <div className="member-modal-actions" style={{ marginTop: 16 }}>
                  <button className="btn" onClick={closeRescheduleModal}>Cerrar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {loading && <p className="muted">Cargando reservas...</p>}
    </div>
  );
};

export default Reservas;
