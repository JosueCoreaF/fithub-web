import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StatCard from './StatCard';
import AreaChartNeon from './AreaChartNeon';
import DonutChart from './DonutChart';
import BarChart from './BarChart';
import { buildDashboardData } from '../lib/api';
import { useHotelData } from '../context/HotelDataContext';
import { useAuth } from '../context/AuthContext';

const startOfDayKey = (dateLike: string | Date) => new Date(dateLike).toISOString().slice(0, 10);

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

type DynamicMetric = 'reservas' | 'ocupacion' | 'inscritos';
type DateWindowPreset = 7 | 30 | 'custom';

export const AdminHome: React.FC = () => {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const { data, loading, error } = useHotelData();
  const [selectedHotel, setSelectedHotel] = useState('Todas');
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

  const guests = dashboard ? dashboard.huespedes.toLocaleString('es-HN') : '0';
  const reservasHoy = dashboard ? dashboard.reservasHoy.toLocaleString('es-HN') : '0';
  const dataMensual = dashboard?.dataMensual ?? [];
  const week = dashboard?.week ?? [0, 0, 0, 0, 0, 0, 0];
  const weekLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const recentItems = dashboard?.recentActivity ?? ['Sin actividad reciente'];
  const availableHotels = useMemo(() => ['Todas', ...(data ? Array.from(new Set(data.hotelesView.map((item) => item.nombre))) : [])], [data]);

  const { dynamicCutoff, dynamicRangeEnd, rangeDayCount } = useMemo(() => {
    const start = parseDateStart(rangeStart);
    const end = parseDateEnd(rangeEnd);
    const normalizedStart = start.getTime() <= end.getTime() ? start : parseDateStart(rangeEnd);
    const normalizedEnd = start.getTime() <= end.getTime() ? end : parseDateEnd(rangeStart);
    const dayCount = Math.max(1, Math.round((normalizedEnd.getTime() - normalizedStart.getTime()) / 86_400_000) + 1);

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
      const sameHotel = selectedHotel === 'Todas' || item.hotel === selectedHotel;
      const timestamp = new Date(item.fecha).getTime();
      return sameHotel && timestamp >= dynamicCutoff.getTime() && timestamp <= dynamicRangeEnd.getTime();
    });
  }, [data, dynamicCutoff, dynamicRangeEnd, selectedHotel]);

  const scopedRooms = useMemo(() => {
    if (!data) return [];

    return data.habitacionesView.filter((item) => {
      const sameHotel = selectedHotel === 'Todas' || item.hotel === selectedHotel;
      const timestamp = new Date(item.fechaISO).getTime();
      return sameHotel && timestamp >= dynamicCutoff.getTime() && timestamp <= dynamicRangeEnd.getTime();
    });
  }, [data, dynamicCutoff, dynamicRangeEnd, selectedHotel]);

  const scopedGuests = useMemo(() => {
    if (!data) return [];
    if (selectedHotel === 'Todas') return data.huespedesView;

    const guestIdsAtHotel = new Set(
      data.reservasView
        .filter((item) => item.hotel === selectedHotel)
        .map((item) => item.huespedId)
        .filter((value): value is string => Boolean(value)),
    );

    return data.huespedesView.filter((item) => guestIdsAtHotel.has(item.id));
  }, [data, selectedHotel]);

  const dynamicTrend = useMemo(() => Array.from({ length: rangeDayCount }, (_, index) => {
    const day = new Date(dynamicCutoff);
    day.setDate(dynamicCutoff.getDate() + index);
    const dayKey = startOfDayKey(day);
    const dayReservations = scopedReservations.filter((item) => startOfDayKey(item.fecha) === dayKey);
    const dayRooms = scopedRooms.filter((item) => startOfDayKey(item.fechaISO) === dayKey);
    const inscritos = dayRooms.reduce((sum, item) => sum + item.inscritos, 0);
    const capacity = dayRooms.reduce((sum, item) => sum + item.capacidad, 0);
    const ocupacion = capacity > 0 ? Math.round((inscritos / capacity) * 100) : 0;

    return {
      name: day.toLocaleDateString('es-HN', { day: '2-digit', month: rangeDayCount > 14 ? 'short' : undefined }),
      reservas: selectedMetric === 'reservas' ? dayReservations.length : selectedMetric === 'ocupacion' ? ocupacion : inscritos,
    };
  }), [dynamicCutoff, rangeDayCount, scopedReservations, scopedRooms, selectedMetric]);

  const dynamicWeek = useMemo(() => dynamicTrend.slice(-7).map((item) => item.reservas), [dynamicTrend]);
  const dynamicWeekLabels = useMemo(() => dynamicTrend.slice(-7).map((item) => item.name), [dynamicTrend]);
  const filteredOccupancy = useMemo(() => {
    const inscritos = scopedRooms.reduce((sum, item) => sum + item.inscritos, 0);
    const capacity = scopedRooms.reduce((sum, item) => sum + item.capacidad, 0);
    return capacity > 0 ? Math.round((inscritos / capacity) * 100) : 0;
  }, [scopedRooms]);

  const filteredRecentItems = useMemo(() => scopedReservations
    .slice()
    .sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime())
    .slice(0, 4)
    .map((item) => `${item.estado} — ${item.huesped} (${item.habitacion})`), [scopedReservations]);

  const chartHeading = selectedMetric === 'reservas'
    ? 'Reservas por día'
    : selectedMetric === 'ocupacion'
      ? 'Ocupación promedio diaria'
      : 'Asignaciones por día';
  const activeRangeLabel = `${dynamicCutoff.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })} - ${dynamicRangeEnd.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })}`;
  const chartSummary = selectedMetric === 'reservas'
    ? `${scopedReservations.length} reservas entre ${activeRangeLabel}`
    : selectedMetric === 'ocupacion'
      ? `${filteredOccupancy}% de ocupación promedio entre ${activeRangeLabel}`
      : `${scopedRooms.reduce((sum, item) => sum + item.inscritos, 0)} asignaciones acumuladas entre ${activeRangeLabel}`;

  const title = isSuperAdmin ? 'Panel de super admin' : 'Panel del hotel';
  const actionLabel = isSuperAdmin ? 'Gestionar accesos' : 'Nueva habitación';
  const actionPath = isSuperAdmin ? '/accesos' : '/habitaciones';
  const summaryItems = isSuperAdmin
    ? [
        `Hoteles activos en el filtro: ${selectedHotel === 'Todas' ? Math.max(availableHotels.length - 1, 0) : 1}`,
        `Reservas filtradas: ${scopedReservations.length}`,
        `Ocupación promedio: ${filteredOccupancy}%`,
      ]
    : [
        `Huéspedes visibles: ${scopedGuests.length}`,
        `Habitaciones en rango: ${scopedRooms.length}`,
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
                  <StatCard title="Asignaciones" value={`${scopedRooms.reduce((sum, item) => sum + item.inscritos, 0)}`} small="Cambiar a asignaciones" />
                </button>
                <button type="button" className="dashboard-stat-button passive">
                  <StatCard title="Huéspedes" value={selectedHotel === 'Todas' ? guests : scopedGuests.length.toLocaleString('es-HN')} small="Filtrados por hotel" />
                </button>
              </div>

              <div className="chart-wrap">
                <div className="dashboard-filter-bar">
                  <div className="dashboard-filter-group">
                    <span className="dashboard-filter-label">Hotel</span>
                    <select className="input dashboard-filter-select" value={selectedHotel} onChange={(event) => setSelectedHotel(event.target.value)}>
                      {availableHotels.map((item) => <option key={item} value={item}>{item}</option>)}
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
                  <h4>Ocupación filtrada</h4>
                  <DonutChart percent={filteredOccupancy || dashboard?.retentionPercent || 0} />
                </div>
                <div className="small-item weekly-activity-card">
                  <h4>Actividad del rango</h4>
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
              <h3>{isSuperAdmin ? 'Supervisión global' : 'Resumen rápido'}</h3>
              <ul className="summary-list">
                {summaryItems.map((item) => <li key={item}>{item}</li>)}
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