import React, { useEffect, useMemo, useState } from 'react';
import AreaChartNeon from './AreaChartNeon';
import DonutChart from './DonutChart';
import BarChart from './BarChart';
import SedeDistributionChart from './SedeDistributionChart';
import { cancelEstadia, type EstadiaView } from '../lib/api';
import { downloadCsv } from '../lib/export';
import { useHotelData } from '../context/HotelDataContext';

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
  if (normalized.startsWith('cread')) return 'warn';
  return 'danger';
};

const isFutureReservation = (reservation: EstadiaView, currentTimestamp: number) => new Date(reservation.checkIn).getTime() >= currentTimestamp;

export const Reservas: React.FC = () => {
  const { data, error, refresh } = useHotelData();
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const reservas = (data?.estadiasView ?? []) as EstadiaView[];

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

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

  const visibleReservas = useMemo(() => reservas
    .filter((reservation) => {
      const timestamp = new Date(reservation.checkIn).getTime();
      return timestamp >= rangeStartDate.getTime() && timestamp <= rangeEndDate.getTime();
    })
    .slice()
    .sort((left, right) => new Date(left.checkIn).getTime() - new Date(right.checkIn).getTime()), [rangeEndDate, rangeStartDate, reservas]);

  const upcomingReservations = useMemo(
    () => reservas.filter((reservation) => new Date(reservation.checkIn).getTime() >= currentTimestamp && reservation.estado !== 'cancelada').length,
    [currentTimestamp, reservas],
  );

  const completedReservations = useMemo(
    () => reservas.filter((reservation) => reservation.estado === 'completada').length,
    [reservas],
  );

  const cancelledReservations = useMemo(
    () => reservas.filter((reservation) => reservation.estado === 'cancelada').length,
    [reservas],
  );

  const stats = useMemo(() => {
    const labels: string[] = [];
    const dayKeys: string[] = [];

    for (let index = 0; index < rangeDayCount; index++) {
      const day = new Date(rangeStartDate);
      day.setDate(rangeStartDate.getDate() + index);
      labels.push(day.toLocaleDateString('es-ES', { month: rangeDayCount > 14 ? 'short' : undefined, day: '2-digit' }));
      dayKeys.push(toInputDateValue(day));
    }

    const countsByDay = dayKeys.map((key) => visibleReservas.filter((reservation) => toLocalDateKey(reservation.checkIn) === key).length);
    const estadoCounts: Record<string, number> = {};

    visibleReservas.forEach((reservation) => {
      estadoCounts[reservation.estado] = (estadoCounts[reservation.estado] || 0) + 1;
    });

    const total = visibleReservas.length;
    const confirmed = (estadoCounts.confirmada || 0) + (estadoCounts.completada || 0);
    const pending = estadoCounts.creada || 0;
    const cancelled = estadoCounts.cancelada || 0;
    const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];

    visibleReservas.forEach((reservation) => {
      const date = new Date(reservation.checkIn);
      weekdayCounts[date.getDay() === 0 ? 6 : date.getDay() - 1] += 1;
    });

    return { labels, countsByDay, total, confirmed, pending, cancelled, weekdayCounts };
  }, [rangeDayCount, rangeStartDate, visibleReservas]);

  const areaData = useMemo(() => stats.labels.map((label, index) => ({
    name: label,
    reservas: stats.countsByDay[index] ?? 0,
  })), [stats]);

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
      { header: 'Estado', value: (reservation) => reservation.estado },
      { header: 'Total', value: (reservation) => reservation.total },
    ], 'estadias');
  };

  const handleCancelReservation = async (reservationId: string) => {
    setCancellingId(reservationId);
    setActionError(null);
    setActionMessage(null);

    try {
      await cancelEstadia(reservationId);
      await refresh();
      setActionMessage('Reserva cancelada.');
    } catch (cancelError) {
      setActionError(cancelError instanceof Error ? cancelError.message : 'No se pudo cancelar la reserva.');
    } finally {
      setCancellingId(null);
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
          <small>{cancelledReservations} canceladas</small>
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

      <div className="grid reservas-layout" style={{ gridTemplateColumns: '1fr 320px', gap: 20 }}>
        <div>
          <div className="card neon-card reservas-feature-card" style={{ marginBottom: 16 }}>
            <div className="reservas-card-head">
              <div>
                <h3 style={{ marginBottom: 8 }}>Reservas por rango</h3>
                <p className="muted">{activeRangeLabel}</p>
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <AreaChartNeon data={areaData} />
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Tabla de próximas reservas</h3>
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
                    <td><span className={`pill ${getStatusTone(reservation.estado)}`}>{reservation.estado}</span></td>
                    <td>
                      {reservation.estado !== 'cancelada' && isFutureReservation(reservation, currentTimestamp) ? (
                        <button className="btn small ghost" disabled={cancellingId === reservation.id} onClick={() => void handleCancelReservation(reservation.id)}>
                          {cancellingId === reservation.id ? 'Cancelando...' : 'Cancelar'}
                        </button>
                      ) : (
                        <span className="muted">Sin acción</span>
                      )}
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
              <div className="muted">Total reservas</div>
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
            <h4>Estados</h4>
            <div className="reservas-mini-list">
              {[
                { label: 'Confirmadas', value: stats.confirmed, color: '#06b6d4' },
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
    </div>
  );
};

export default Reservas;