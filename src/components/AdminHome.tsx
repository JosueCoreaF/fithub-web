import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StatCard from './StatCard';
import AreaChartNeon from './AreaChartNeon';
import DonutChart from './DonutChart';
import BarChart from './BarChart';
import { buildDashboardData } from '../lib/api';
import { useGymData } from '../context/GymDataContext';
import { useAuth } from '../context/AuthContext';

const startOfDayKey = (dateLike: string | Date) => new Date(dateLike).toISOString().slice(0, 10);

const formatSessionTime = (dateValue: string) =>
  new Date(dateValue).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });

const formatSessionDate = (dateValue: string) =>
  new Date(dateValue).toLocaleDateString('es-HN', { weekday: 'short', day: '2-digit', month: 'short' });

const toInputDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateStart = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const parseDateEnd = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
};

const statusTone = (status: string) => {
  const normalized = status.toLowerCase();

  if (normalized.startsWith('confirm') || normalized.startsWith('complet')) return 'ok';
  if (normalized.startsWith('cread')) return 'warn';
  return 'danger';
};

type DynamicMetric = 'reservas' | 'ocupacion' | 'inscritos';
type DateWindowPreset = 7 | 30 | 'custom';

export const AdminHome: React.FC = () => {
  const navigate = useNavigate();
  const { user, isTrainer, isSuperAdmin } = useAuth();
  const { data, loading, error } = useGymData();
  const [selectedSede, setSelectedSede] = useState('Todas');
  const [selectedWindow, setSelectedWindow] = useState<DateWindowPreset>(7);
  const [selectedMetric, setSelectedMetric] = useState<DynamicMetric>('reservas');
  const [rangeStart, setRangeStart] = useState(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    return toInputDateValue(start);
  });
  const [rangeEnd, setRangeEnd] = useState(() => toInputDateValue(new Date()));
  const dashboard = useMemo(() => (data ? buildDashboardData(data) : null), [data]);
  const todayKey = startOfDayKey(new Date());

  const members = dashboard ? dashboard.members.toLocaleString('es-HN') : '0';
  const reservasHoy = dashboard ? dashboard.reservasHoy.toLocaleString('es-HN') : '0';
  const dataMensual = dashboard?.dataMensual ?? [];
  const week = dashboard?.week ?? [0, 0, 0, 0, 0, 0, 0];
  const weekLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const recentItems = dashboard?.recentActivity ?? ['Sin actividad reciente'];
  const availableSedes = useMemo(() => ['Todas', ...(data ? Array.from(new Set(data.sedesView.map((item) => item.nombre))) : [])], [data]);

  const { dynamicCutoff, dynamicRangeEnd, rangeDayCount } = useMemo(() => {
    const start = parseDateStart(rangeStart);
    const end = parseDateEnd(rangeEnd);
    const normalizedStart = start.getTime() <= end.getTime() ? start : parseDateStart(rangeEnd);
    const normalizedEnd = start.getTime() <= end.getTime() ? end : parseDateEnd(rangeStart);
    const millisecondsPerDay = 86_400_000;
    const dayCount = Math.max(1, Math.round((normalizedEnd.getTime() - normalizedStart.getTime()) / millisecondsPerDay) + 1);

    return {
      dynamicCutoff: normalizedStart,
      dynamicRangeEnd: normalizedEnd,
      rangeDayCount: dayCount,
    };
  }, [rangeEnd, rangeStart]);

  const applyPresetWindow = (window: 7 | 30) => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - (window - 1));

    setSelectedWindow(window);
    setRangeStart(toInputDateValue(start));
    setRangeEnd(toInputDateValue(end));
  };

  const scopedReservations = useMemo(() => {
    if (!data) return [];

    return data.reservasView.filter((item) => {
      const sameSede = selectedSede === 'Todas' || item.sede === selectedSede;
      const timestamp = new Date(item.fecha).getTime();
      return sameSede && timestamp >= dynamicCutoff.getTime() && timestamp <= dynamicRangeEnd.getTime();
    });
  }, [data, dynamicCutoff, dynamicRangeEnd, selectedSede]);

  const scopedServices = useMemo(() => {
    if (!data) return [];

    return data.serviciosView.filter((item) => {
      const sameSede = selectedSede === 'Todas' || item.sede === selectedSede;
      const timestamp = new Date(item.fechaISO).getTime();
      return sameSede && timestamp >= dynamicCutoff.getTime() && timestamp <= dynamicRangeEnd.getTime();
    });
  }, [data, dynamicCutoff, dynamicRangeEnd, selectedSede]);

  const scopedMembers = useMemo(() => {
    if (!data) return [];
    if (selectedSede === 'Todas') {
      return data.miembrosView;
    }

    const memberIdsAtSede = new Set(
      data.reservasView
        .filter((item) => item.sede === selectedSede)
        .map((item) => item.clienteId)
        .filter((value): value is string => Boolean(value)),
    );

    return data.miembrosView.filter((item) => memberIdsAtSede.has(item.id));
  }, [data, selectedSede]);

  const dynamicTrend = useMemo(() => {
    const points = Array.from({ length: rangeDayCount }, (_, index) => {
      const day = new Date(dynamicCutoff);
      day.setDate(dynamicCutoff.getDate() + index);
      const dayKey = startOfDayKey(day);
      const dayReservations = scopedReservations.filter((item) => startOfDayKey(item.fecha) === dayKey);
      const dayServices = scopedServices.filter((item) => startOfDayKey(item.fechaISO) === dayKey);
      const inscritos = dayServices.reduce((sum, item) => sum + item.inscritos, 0);
      const capacity = dayServices.reduce((sum, item) => sum + item.capacidad, 0);
      const ocupacion = capacity > 0 ? Math.round((inscritos / capacity) * 100) : 0;

      return {
        name: day.toLocaleDateString('es-HN', { day: '2-digit', month: rangeDayCount > 14 ? 'short' : undefined }),
        reservas: selectedMetric === 'reservas' ? dayReservations.length : selectedMetric === 'ocupacion' ? ocupacion : inscritos,
      };
    });

    return points;
  }, [dynamicCutoff, rangeDayCount, scopedReservations, scopedServices, selectedMetric]);

  const dynamicWeek = useMemo(() => dynamicTrend.slice(-7).map((item) => item.reservas), [dynamicTrend]);
  const dynamicWeekLabels = useMemo(() => dynamicTrend.slice(-7).map((item) => item.name), [dynamicTrend]);
  const filteredOccupancy = useMemo(() => {
    const inscritos = scopedServices.reduce((sum, item) => sum + item.inscritos, 0);
    const capacity = scopedServices.reduce((sum, item) => sum + item.capacidad, 0);
    return capacity > 0 ? Math.round((inscritos / capacity) * 100) : 0;
  }, [scopedServices]);
  const filteredRecentItems = useMemo(() => {
    return scopedReservations
      .slice()
      .sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime())
      .slice(0, 4)
      .map((item) => `${item.estado} — ${item.cliente} (${item.servicio})`);
  }, [scopedReservations]);
  const chartHeading = selectedMetric === 'reservas'
    ? 'Reservas por día'
    : selectedMetric === 'ocupacion'
      ? 'Ocupación promedio diaria'
      : 'Inscritos por día';
  const activeRangeLabel = `${dynamicCutoff.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })} - ${dynamicRangeEnd.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })}`;
  const chartSummary = selectedMetric === 'reservas'
    ? `${scopedReservations.length} reservas entre ${activeRangeLabel}`
    : selectedMetric === 'ocupacion'
      ? `${filteredOccupancy}% de ocupación promedio entre ${activeRangeLabel}`
      : `${scopedServices.reduce((sum, item) => sum + item.inscritos, 0)} inscritos acumulados entre ${activeRangeLabel}`;

  const trainerPersona = useMemo(() => {
    if (!data || !user?.email) return null;

    return data.personas.find((person) => person.correo?.toLowerCase() === user.email?.toLowerCase()) ?? null;
  }, [data, user?.email]);

  const trainerProfile = useMemo(() => {
    if (!data || !isTrainer || !trainerPersona) return null;

    return data.entrenadoresView.find((trainer) => trainer.id === trainerPersona.id_persona) ?? null;
  }, [data, isTrainer, trainerPersona]);

  const trainerSchedule = useMemo(() => {
    if (!trainerProfile) return [];

    return trainerProfile.schedule.slice().sort((left, right) => new Date(left.horario).getTime() - new Date(right.horario).getTime());
  }, [trainerProfile]);

  const trainerReservations = useMemo(() => {
    if (!data || !trainerProfile) return [];

    return data.reservasView
      .filter((item) => item.entrenador === trainerProfile.nombre)
      .slice()
      .sort((left, right) => new Date(left.fecha).getTime() - new Date(right.fecha).getTime());
  }, [data, trainerProfile]);

  const todaySessions = useMemo(
    () => trainerSchedule.filter((session) => startOfDayKey(session.horario) === todayKey),
    [todayKey, trainerSchedule],
  );

  const upcomingSessions = useMemo(() => {
    const now = Date.now();

    return trainerSchedule.filter((session) => new Date(session.horario).getTime() >= now).slice(0, 4);
  }, [trainerSchedule]);

  const trainerReservationsToday = useMemo(
    () => trainerReservations.filter((reservation) => startOfDayKey(reservation.fecha) === todayKey),
    [todayKey, trainerReservations],
  );

  const uniqueClientsToday = useMemo(() => {
    const seen = new Set<string>();

    return trainerReservationsToday.filter((reservation) => {
      const key = reservation.clienteId ?? reservation.cliente;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [trainerReservationsToday]);

  const nextSession = upcomingSessions[0] ?? null;
  const freeBlocks = Math.max(0, 8 - todaySessions.length);
  const confirmedToday = trainerReservationsToday.filter((reservation) => statusTone(reservation.estado) === 'ok').length;
  const pendingToday = trainerReservationsToday.filter((reservation) => statusTone(reservation.estado) === 'warn').length;
  const cancelledToday = trainerReservationsToday.filter((reservation) => statusTone(reservation.estado) === 'danger').length;
  const occupancyPercent = Math.round((confirmedToday / Math.max(1, trainerReservationsToday.length)) * 100);

  const trainerMonthlyTrend = useMemo(() => {
    const monthlyMap = new Map<string, number>();

    for (const reservation of trainerReservations) {
      const date = new Date(reservation.fecha);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
    }

    return Array.from(monthlyMap.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-6)
      .map(([key, value]) => {
        const [year, month] = key.split('-').map(Number);
        return {
          name: new Date(year, month, 1).toLocaleDateString('es-HN', { month: 'short' }),
          reservas: value,
        };
      });
  }, [trainerReservations]);

  const trainerWeeklyLoad = useMemo(() => {
    const totals = [0, 0, 0, 0, 0, 0, 0];

    trainerSchedule.forEach((session) => {
      const weekday = new Date(session.horario).getDay();
      const normalized = weekday === 0 ? 6 : weekday - 1;
      totals[normalized] += 1;
    });

    return totals;
  }, [trainerSchedule]);

  const trainerFocusMembers = useMemo(() => {
    if (!data) return [];

    return uniqueClientsToday.slice(0, 4).map((reservation) => {
      const member = reservation.clienteId
        ? data.miembrosView.find((item) => item.id === reservation.clienteId)
        : data.miembrosView.find((item) => item.nombre === reservation.cliente);

      return {
        id: reservation.id,
        name: reservation.cliente,
        plan: member?.plan ?? 'Plan no identificado',
        status: reservation.estado,
        service: reservation.servicio,
        time: formatSessionTime(reservation.fecha),
      };
    });
  }, [data, uniqueClientsToday]);

  const trainerAlerts = useMemo(() => {
    const alerts: Array<{ title: string; detail: string; tone: 'ok' | 'warn' | 'danger' }> = [];

    if (!trainerProfile) {
      alerts.push({
        title: 'Perfil no enlazado',
        detail: 'Tu correo aún no coincide con un entrenador registrado en la base actual.',
        tone: 'warn',
      });
    }

    if (pendingToday > 0) {
      alerts.push({
        title: 'Reservas por confirmar',
        detail: `${pendingToday} reservas de hoy siguen en estado pendiente.`,
        tone: 'warn',
      });
    }

    if (cancelledToday > 0) {
      alerts.push({
        title: 'Cancelaciones del día',
        detail: `${cancelledToday} sesiones se movieron o cancelaron y requieren seguimiento.`,
        tone: 'danger',
      });
    }

    if (freeBlocks > 0) {
      alerts.push({
        title: 'Capacidad disponible',
        detail: `Aún tienes ${freeBlocks} bloques libres que puedes reasignar o abrir.`,
        tone: 'ok',
      });
    }

    return alerts.slice(0, 4);
  }, [cancelledToday, freeBlocks, pendingToday, trainerProfile]);

  if (isTrainer) {
    const trainerName = trainerProfile?.nombre ?? user?.user_metadata?.full_name ?? 'Entrenador';
    const trainerSpecialty = trainerProfile?.especialidad ?? 'Especialidad pendiente';
    const trainerVenue = trainerProfile?.sedeHoy ?? 'Sede por definir';

    return (
      <div className="page trainer-dashboard-page">
        <header className="dashboard-header trainer-dashboard-header">
          <div>
            <span className="trainers-eyebrow">Vista del entrenador</span>
            <h2>Tu jornada en un solo panel</h2>
            <p className="muted">Agenda inmediata, alumnos de hoy y pendientes operativos sin ruido administrativo.</p>
          </div>
          <div className="header-actions trainer-header-actions">
            <button className="btn ghost" onClick={() => navigate('/perfil')}>Actualizar disponibilidad</button>
            <button className="cta-button" onClick={() => navigate('/reservas')}>Abrir mi agenda</button>
          </div>
        </header>

        <section className="trainer-hero-grid">
          <article className="card trainer-identity-card">
            <div className="trainer-identity-top">
              <div className="trainer-identity-avatar">{trainerName.slice(0, 2).toUpperCase()}</div>
              <div className="trainer-identity-copy">
                <span className="trainer-identity-kicker">Perfil activo</span>
                <h3>{trainerName}</h3>
                <p>{trainerSpecialty} · {trainerVenue}</p>
              </div>
            </div>
            <div className="trainer-identity-pills">
              <span className="tag">{todaySessions.length} sesiones hoy</span>
              <span className="tag">{trainerProfile?.availability ?? 'Disponible'}</span>
              <span className="tag">{uniqueClientsToday.length} alumnos esperados</span>
            </div>
            <div className="trainer-identity-meta">
              <div>
                <span>Rating interno</span>
                <strong>{trainerProfile?.rating ?? 0}/5</strong>
              </div>
              <div>
                <span>Carga semanal</span>
                <strong>{trainerProfile?.workload ?? 0} bloques</strong>
              </div>
              <div>
                <span>Clientes asignados</span>
                <strong>{trainerProfile?.assignedCount ?? 0}</strong>
              </div>
            </div>
          </article>

          <article className="card trainer-next-session-card">
            <div className="trainer-next-head">
              <span className="trainers-eyebrow">Próxima sesión</span>
              <span className={`pill ${nextSession ? 'ok' : 'warn'}`}>{nextSession ? 'Programada' : 'Sin próximos bloques'}</span>
            </div>
            {nextSession ? (
              <>
                <h3>{nextSession.actividad}</h3>
                <p>{formatSessionDate(nextSession.horario)} · {formatSessionTime(nextSession.horario)}</p>
                <div className="trainer-next-detail-grid">
                  <div>
                    <span>Sede</span>
                    <strong>{nextSession.sede}</strong>
                  </div>
                  <div>
                    <span>Reservas hoy</span>
                    <strong>{trainerReservationsToday.length}</strong>
                  </div>
                  <div>
                    <span>Ocupación</span>
                    <strong>{occupancyPercent}%</strong>
                  </div>
                </div>
              </>
            ) : (
              <div className="trainer-empty-state">
                <strong>No hay sesiones futuras asignadas.</strong>
                <p className="muted">Revisa tu disponibilidad o consulta nuevas reservas desde tu agenda.</p>
              </div>
            )}
          </article>
        </section>

        <section className="cards-row trainer-stat-row">
          <StatCard title="Sesiones de hoy" value={`${todaySessions.length}`} small="Bloques asignados" />
          <StatCard title="Alumnos esperados" value={`${uniqueClientsToday.length}`} small="Clientes distintos" />
          <StatCard title="Ocupación diaria" value={`${occupancyPercent}%`} small="Reservas confirmadas" />
          <StatCard title="Pendientes" value={`${pendingToday}`} small="Seguimiento inmediato" />
        </section>

        <section className="trainer-main-grid">
          <div className="trainer-main-col">
            <article className="card trainer-trend-card">
              <div className="trainer-section-head">
                <div>
                  <span className="trainers-eyebrow">Rendimiento</span>
                  <h3>Reservas vinculadas por mes</h3>
                </div>
                <div className="trainer-section-inlineMeta">
                  <span>{confirmedToday} confirmadas</span>
                  <span>{cancelledToday} canceladas</span>
                </div>
              </div>
              {loading && <p className="muted">Cargando métricas...</p>}
              <AreaChartNeon data={trainerMonthlyTrend.length > 0 ? trainerMonthlyTrend : [{ name: 'Hoy', reservas: trainerReservationsToday.length }]} />
            </article>

            <article className="card trainer-timeline-card">
              <div className="trainer-section-head">
                <div>
                  <span className="trainers-eyebrow">Agenda</span>
                  <h3>Próximos bloques</h3>
                </div>
                <button className="btn ghost" onClick={() => navigate('/reservas')}>Ver agenda completa</button>
              </div>
              <div className="trainer-timeline-list">
                {upcomingSessions.length > 0 ? upcomingSessions.map((session, index) => (
                  <article key={session.id} className="trainer-timeline-item">
                    <div className="trainer-timeline-marker">{index + 1}</div>
                    <div className="trainer-timeline-content">
                      <strong>{session.actividad}</strong>
                      <p>{formatSessionDate(session.horario)} · {formatSessionTime(session.horario)} · {session.sede}</p>
                    </div>
                  </article>
                )) : (
                  <p className="muted">No tienes más bloques programados por ahora.</p>
                )}
              </div>
            </article>

            <article className="card trainer-members-card">
              <div className="trainer-section-head">
                <div>
                  <span className="trainers-eyebrow">Alumnos de hoy</span>
                  <h3>Seguimiento rápido</h3>
                </div>
              </div>
              <div className="trainer-member-list">
                {trainerFocusMembers.length > 0 ? trainerFocusMembers.map((member) => (
                  <article key={member.id} className="trainer-member-item">
                    <div>
                      <strong>{member.name}</strong>
                      <p>{member.service} · {member.time}</p>
                    </div>
                    <div className="trainer-member-meta">
                      <span className="tag">{member.plan}</span>
                      <span className={`pill ${statusTone(member.status)}`}>{member.status}</span>
                    </div>
                  </article>
                )) : (
                  <p className="muted">Todavía no hay alumnos vinculados a tu jornada de hoy.</p>
                )}
              </div>
            </article>
          </div>

          <aside className="trainer-side-col">
            <article className="card trainer-occupancy-card">
              <div className="trainer-section-head compact">
                <div>
                  <span className="trainers-eyebrow">Capacidad</span>
                  <h3>Ritmo semanal</h3>
                </div>
              </div>
              <DonutChart percent={occupancyPercent} />
              <div className="trainer-occupancy-copy">
                <strong>{occupancyPercent}% de ocupación</strong>
                <span>{confirmedToday} confirmadas de {Math.max(1, trainerReservationsToday.length)} reservas hoy</span>
              </div>
              <BarChart values={trainerWeeklyLoad} labels={['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']} />
            </article>

            <article className="card trainer-alerts-card">
              <div className="trainer-section-head compact">
                <div>
                  <span className="trainers-eyebrow">Pendientes</span>
                  <h3>Alertas del turno</h3>
                </div>
              </div>
              <div className="trainer-alert-list">
                {trainerAlerts.length > 0 ? trainerAlerts.map((alert) => (
                  <article key={alert.title} className={`trainer-alert-item ${alert.tone}`}>
                    <strong>{alert.title}</strong>
                    <p>{alert.detail}</p>
                  </article>
                )) : (
                  <p className="muted">No hay alertas activas para tu turno.</p>
                )}
              </div>
            </article>

            <article className="card trainer-actions-card">
              <div className="trainer-section-head compact">
                <div>
                  <span className="trainers-eyebrow">Acciones rápidas</span>
                  <h3>Lo que más usarás</h3>
                </div>
              </div>
              <div className="trainer-action-list">
                <button className="btn" onClick={() => navigate('/reservas')}>Registrar asistencia</button>
                <button className="btn ghost" onClick={() => navigate('/reservas')}>Gestionar reservas</button>
                <button className="btn ghost" onClick={() => navigate('/perfil')}>Editar perfil profesional</button>
              </div>
            </article>
          </aside>
        </section>
      </div>
    );
  }

  const title = isTrainer ? 'Panel de entrenador' : isSuperAdmin ? 'Panel de super admin' : 'Panel de administrador';
  const actionLabel = isTrainer ? 'Ver reservas' : isSuperAdmin ? 'Gestionar accesos' : 'Nuevo servicio';
  const actionPath = isTrainer ? '/reservas' : isSuperAdmin ? '/accesos' : '/servicios';
  const summaryItems = isSuperAdmin
    ? [
        `Sedes activas en el filtro: ${selectedSede === 'Todas' ? availableSedes.length - 1 : 1}`,
        `Reservas filtradas: ${scopedReservations.length}`,
        `Ocupación promedio: ${filteredOccupancy}%`,
      ]
    : [
        `Miembros visibles: ${scopedMembers.length}`,
        `Sesiones en rango: ${scopedServices.length}`,
        `Reservas filtradas: ${scopedReservations.length}`,
      ];

  return (
    <div>
      <header className="dashboard-header">
        <h2>{title}</h2>
        <div className="header-actions">
          <button className="cta-button" onClick={() => navigate(actionPath)}>{actionLabel}</button>
        </div>
      </header>
      {error && <p className="muted">{error}</p>}

      <section className="dashboard-grid">
          <div className="left-col">
            <div className="card horizontal">
              <div className="card-body">
                <div className="cards-row">
                  <button type="button" className={`dashboard-stat-button ${selectedMetric === 'reservas' ? 'active' : ''}`} onClick={() => setSelectedMetric('reservas')}>
                    <StatCard title="Reservas hoy" value={reservasHoy} small="Cambiar a reservas" />
                  </button>
                  <button type="button" className={`dashboard-stat-button ${selectedMetric === 'ocupacion' ? 'active' : ''}`} onClick={() => setSelectedMetric('ocupacion')}>
                    <StatCard title="Ocupación" value={`${filteredOccupancy}%`} small="Cambiar a ocupación" />
                  </button>
                  <button type="button" className={`dashboard-stat-button ${selectedMetric === 'inscritos' ? 'active' : ''}`} onClick={() => setSelectedMetric('inscritos')}>
                    <StatCard title="Inscritos" value={`${scopedServices.reduce((sum, item) => sum + item.inscritos, 0)}`} small="Cambiar a inscritos" />
                  </button>
                  <button type="button" className="dashboard-stat-button passive">
                    <StatCard title="Miembros" value={selectedSede === 'Todas' ? members : scopedMembers.length.toLocaleString('es-HN')} small="Filtrados por sede" />
                  </button>
                </div>

                <div className="chart-wrap">
                  <div className="dashboard-filter-bar">
                    <div className="dashboard-filter-group">
                      <span className="dashboard-filter-label">Sede</span>
                      <select className="input dashboard-filter-select" value={selectedSede} onChange={(event) => setSelectedSede(event.target.value)}>
                        {availableSedes.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </div>
                    <div className="dashboard-filter-group">
                      <span className="dashboard-filter-label">Ventana</span>
                      <div className="dashboard-chip-group">
                        <button type="button" className={`dashboard-chip ${selectedWindow === 7 ? 'active' : ''}`} onClick={() => applyPresetWindow(7)}>7 días</button>
                        <button type="button" className={`dashboard-chip ${selectedWindow === 30 ? 'active' : ''}`} onClick={() => applyPresetWindow(30)}>30 días</button>
                      </div>
                    </div>
                    <div className="dashboard-filter-group dashboard-date-range-group">
                      <span className="dashboard-filter-label">Rango manual</span>
                      <div className="dashboard-date-range">
                        <input
                          type="date"
                          className="input dashboard-date-input"
                          value={rangeStart}
                          max={rangeEnd}
                          onChange={(event) => {
                            setSelectedWindow('custom');
                            setRangeStart(event.target.value);
                          }}
                        />
                        <span className="dashboard-date-separator">a</span>
                        <input
                          type="date"
                          className="input dashboard-date-input"
                          value={rangeEnd}
                          min={rangeStart}
                          onChange={(event) => {
                            setSelectedWindow('custom');
                            setRangeEnd(event.target.value);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <h3>{chartHeading}</h3>
                  <p className="muted">{chartSummary}</p>
                  {loading && <p className="muted">Cargando métricas...</p>}
                  <AreaChartNeon data={dynamicTrend.length > 0 ? dynamicTrend : dataMensual} />
                </div>
              </div>
            </div>

            <div className="card small-cards">
              <div className="card-body">
                <div className="small-grid">
                  <div className="small-item">
                    <h4>{isTrainer ? 'Satisfacción' : 'Ocupación filtrada'}</h4>
                    <DonutChart percent={filteredOccupancy || dashboard?.retentionPercent || 0} />
                  </div>
                  <div className="small-item weekly-activity-card">
                    <h4>{isTrainer ? 'Ritmo semanal' : 'Actividad del rango'}</h4>
                    <BarChart values={dynamicWeek.length > 0 ? dynamicWeek : week} labels={dynamicWeekLabels.length > 0 ? dynamicWeekLabels : weekLabels} />
                    <div className="weekly-activity-summary">
                      <span>{dynamicWeek.reduce((sum, current) => sum + current, 0)} puntos</span>
                      <span>Pico: {Math.max(...dynamicWeek, 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="right-col">
            <div className="card">
              <div className="card-body">
                <h3>{isSuperAdmin ? 'Supervisión global' : isTrainer ? 'Resumen del turno' : 'Resumen rápido'}</h3>
                <ul className="summary-list">
                  {(isSuperAdmin ? summaryItems : summaryItems).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>

            <div className="card">
              <div className="card-body recent-activity-body">
                <div className="recent-activity-head">
                  <h3>Actividad reciente</h3>
                  <span className="recent-activity-pill">Últimos movimientos</span>
                </div>
                <div className="recent-activity-list">
                  {(filteredRecentItems.length > 0 ? filteredRecentItems : recentItems).map((item, index) => {
                    const [status, detail] = item.split(' — ');

                    return (
                      <article key={item} className="recent-activity-item">
                        <div className="recent-activity-marker">{index + 1}</div>
                        <div className="recent-activity-content">
                          <div className="recent-activity-status">{status}</div>
                          <p>{detail ?? item}</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>
        </section>
    </div>
  );
};

export default AdminHome;
