import React, { useEffect, useMemo, useState } from 'react';
import AreaChartNeon from './AreaChartNeon';
import BarChart from './BarChart';
import { downloadCsv } from '../lib/export';
import { createPayment, type PaymentFormInput } from '../lib/api';
import { useHotelData } from '../context/HotelDataContext';
import { useAuth } from '../context/AuthContext';

const paymentMethods: Array<{ value: PaymentFormInput['metodoPago']; label: string }> = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'deposito', label: 'Deposito' },
  { value: 'otro', label: 'Otro' },
];

const executiveWindowOptions = [7, 30] as const;

const formatCurrency = (value: number) => `${value.toFixed(2)} USD`;

const toLocalDateKey = (value: string | Date) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toLocalDateTimeInputValue = (value: string | Date) => {
  const date = new Date(value);
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

const formatDateTime = (value?: string) => {
  if (!value) return 'N/D';
  return new Date(value).toLocaleString('es-HN');
};

export const Pagos: React.FC = () => {
  const { role } = useAuth();
  const { data, loading, error, refresh } = useHotelData();
  const isSuperAdmin = role === 'super_admin';
  const pagos = data?.pagosView ?? [];
  const reservas = data?.reservasView ?? [];
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'todos' | 'reserva'>('todos');
  const [executiveWindow, setExecutiveWindow] = useState<(typeof executiveWindowOptions)[number] | 'custom'>(7);
  const [executiveRangeStart, setExecutiveRangeStart] = useState(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return toLocalDateKey(start);
  });
  const [executiveRangeEnd, setExecutiveRangeEnd] = useState(() => toLocalDateKey(new Date()));
  const [selectedReservationId, setSelectedReservationId] = useState('');
  const [method, setMethod] = useState<PaymentFormInput['metodoPago']>('tarjeta');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('0');
  const [paymentDate, setPaymentDate] = useState(() => toLocalDateTimeInputValue(new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const paidReservationIds = useMemo(
    () => new Set(pagos.filter((payment) => payment.reservaId).map((payment) => payment.reservaId as string)),
    [pagos],
  );

  const pendingReservations = useMemo(
    () => reservas
      .filter((reservation) => reservation.estado !== 'cancelada' && !paidReservationIds.has(reservation.id))
      .sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime()),
    [paidReservationIds, reservas],
  );

  const pendingCollectionsList = useMemo(
    () => pendingReservations
      .map((reservation) => ({
        id: reservation.id,
        tipo: 'reserva' as const,
        huesped: reservation.huesped,
        concepto: `${reservation.habitacion} · ${reservation.hotel}`,
        saldo: reservation.precioAplicado,
      }))
      .sort((left, right) => right.saldo - left.saldo)
      .slice(0, 8),
    [pendingReservations],
  );

  useEffect(() => {
    const selectedReservation = pendingReservations.find((reservation) => reservation.id === selectedReservationId) ?? pendingReservations[0] ?? null;
    if (selectedReservation && selectedReservation.id !== selectedReservationId) {
      setSelectedReservationId(selectedReservation.id);
    }
    if (!selectedReservation) {
      setSelectedReservationId('');
    }
    setAmount(selectedReservation ? String(selectedReservation.precioAplicado) : '0');
  }, [pendingReservations, selectedReservationId]);

  const filteredPayments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return pagos.filter((payment) => {
      const matchesType = typeFilter === 'todos' || payment.tipo === typeFilter;
      const matchesQuery = !normalizedQuery
        || payment.huesped.toLowerCase().includes(normalizedQuery)
        || payment.referencia.toLowerCase().includes(normalizedQuery)
        || payment.estadia.toLowerCase().includes(normalizedQuery)
        || payment.correo.toLowerCase().includes(normalizedQuery);

      return matchesType && matchesQuery;
    }).sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime());
  }, [pagos, query, typeFilter]);

  const summary = useMemo(() => {
    const todayKey = toLocalDateKey(new Date());
    const totalRevenue = pagos.reduce((sum, payment) => sum + payment.monto, 0);
    const todayRevenue = pagos
      .filter((payment) => payment.fecha && toLocalDateKey(payment.fecha) === todayKey)
      .reduce((sum, payment) => sum + payment.monto, 0);
    const reservationRevenue = pagos
      .filter((payment) => payment.tipo === 'reserva')
      .reduce((sum, payment) => sum + payment.monto, 0);
    const averageTicket = pagos.length > 0 ? totalRevenue / pagos.length : 0;

    return {
      totalRevenue,
      todayRevenue,
      reservationRevenue,
      averageTicket,
      pendingCollections: pendingReservations.length,
    };
  }, [pagos, pendingReservations.length]);

  const methodDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    pagos.forEach((payment) => {
      counts.set(payment.metodo, (counts.get(payment.metodo) ?? 0) + payment.monto);
    });

    return Array.from(counts.entries())
      .sort(([, left], [, right]) => right - left)
      .map(([label, value]) => ({ label, value }));
  }, [pagos]);

  const { executiveRangeStartDate, executiveRangeEndDate, executiveDayCount } = useMemo(() => {
    const start = parseDateStart(executiveRangeStart);
    const end = parseDateEnd(executiveRangeEnd);
    const normalizedStart = start.getTime() <= end.getTime() ? start : parseDateStart(executiveRangeEnd);
    const normalizedEnd = start.getTime() <= end.getTime() ? end : parseDateEnd(executiveRangeStart);
    const dayCount = Math.max(1, Math.round((normalizedEnd.getTime() - normalizedStart.getTime()) / 86_400_000) + 1);

    return {
      executiveRangeStartDate: normalizedStart,
      executiveRangeEndDate: normalizedEnd,
      executiveDayCount: dayCount,
    };
  }, [executiveRangeEnd, executiveRangeStart]);

  const applyExecutivePreset = (window: (typeof executiveWindowOptions)[number]) => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - (window - 1));

    setExecutiveWindow(window);
    setExecutiveRangeStart(toLocalDateKey(start));
    setExecutiveRangeEnd(toLocalDateKey(end));
  };

  const executiveTrend = useMemo(() => {
    return Array.from({ length: executiveDayCount }, (_, index) => {
      const day = new Date(executiveRangeStartDate);
      day.setDate(executiveRangeStartDate.getDate() + index);
      const dayKey = toLocalDateKey(day);
      const reservationTotal = pagos
        .filter((payment) => payment.tipo === 'reserva' && payment.fecha && toLocalDateKey(payment.fecha) === dayKey)
        .reduce((sum, payment) => sum + payment.monto, 0);
      return {
        name: day.toLocaleDateString('es-HN', { day: '2-digit', month: executiveDayCount > 14 ? 'short' : undefined }),
        reservas: Number(reservationTotal.toFixed(2)),
      };
    });
  }, [executiveDayCount, executiveRangeStartDate, pagos]);

  const executiveSedeSeries = useMemo(() => {
    const buckets = new Map<string, number>();

    pagos.forEach((payment) => {
      const key = payment.hotel && payment.hotel !== 'Sin hotel' ? payment.hotel : 'Sin hotel';
      buckets.set(key, (buckets.get(key) ?? 0) + payment.monto);
    });

    return Array.from(buckets.entries())
      .sort(([, left], [, right]) => right - left)
      .slice(0, 6)
      .map(([label, value]) => ({ label, value: Number(value.toFixed(2)) }));
  }, [pagos]);

  const bestRevenueSource = executiveSedeSeries[0] ?? null;
  const pendingAmount = pendingCollectionsList.reduce((sum, item) => sum + item.saldo, 0);
  const executiveCollectedShare = summary.totalRevenue + pendingAmount > 0
    ? Math.round((summary.totalRevenue / (summary.totalRevenue + pendingAmount)) * 100)
    : 0;
  const executiveRangeLabel = `${executiveRangeStartDate.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })} - ${executiveRangeEndDate.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })}`;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedReservationId) return;

    setSubmitting(true);
    setFeedback(null);
    setActionError(null);

    try {
      await createPayment({
        metodoPago: method,
        referencia: reference,
        monto: Number(amount),
        fechaPago: new Date(paymentDate).toISOString(),
        reservaId: selectedReservationId,
      });
      await refresh();
      setFeedback('Cobro registrado correctamente.');
      setReference('');
      setPaymentDate(toLocalDateTimeInputValue(new Date()));
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : 'No se pudo registrar el cobro.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportPayments = () => {
    downloadCsv(filteredPayments, [
      { header: 'ID Pago', value: (payment) => payment.id },
      { header: 'Tipo', value: (payment) => payment.tipo },
      { header: 'Huesped', value: (payment) => payment.huesped },
      { header: 'Correo', value: (payment) => payment.correo },
      { header: 'Estadia', value: (payment) => payment.estadia },
      { header: 'Hotel', value: (payment) => payment.hotel },
      { header: 'Metodo', value: (payment) => payment.metodo },
      { header: 'Referencia', value: (payment) => payment.referencia },
      { header: 'Monto', value: (payment) => payment.monto },
      { header: 'Fecha', value: (payment) => formatDateTime(payment.fecha) },
    ], isSuperAdmin ? 'ingresos' : 'pagos');
  };

  const pageCopy = isSuperAdmin
    ? {
        title: 'Ingresos',
        subtitle: 'Visión ejecutiva de ventas registradas, métodos de cobro y cuentas por cobrar.',
        exportLabel: 'Exportar ingresos',
        pendingKicker: 'Cobranza',
        pendingTitle: 'Cuentas por cobrar',
        pendingSubtitle: 'Pendientes abiertos de reservas que todavía no entran a ingresos.',
      }
    : {
        title: 'Cobros',
        subtitle: 'Caja operativa, historial de cobros y registro de pagos por reserva.',
        exportLabel: 'Exportar CSV',
        pendingKicker: 'Pendientes',
        pendingTitle: 'Cobros por atender',
        pendingSubtitle: 'Esta lista reúne reservas sin pago asociado.',
      };

  return (
    <div className="page payments-page">
      <div className="payments-header">
        <div>
          <h2>{pageCopy.title}</h2>
          <p className="muted">{pageCopy.subtitle}</p>
        </div>
        <div className="header-actions">
          <button className="btn ghost" onClick={handleExportPayments} disabled={filteredPayments.length === 0}>
            {pageCopy.exportLabel}
          </button>
        </div>
      </div>

      {(error || actionError || feedback) && (
        <div className={`profile-feedback ${(error || actionError) ? 'error' : 'success'}`}>
          {error ?? actionError ?? feedback}
        </div>
      )}

      <section className="payments-summary-grid">
        <article className="card payments-summary-card"><span>Ingresos acumulados</span><strong>{formatCurrency(summary.totalRevenue)}</strong></article>
        <article className="card payments-summary-card"><span>Ingresos de hoy</span><strong>{formatCurrency(summary.todayRevenue)}</strong></article>
        <article className="card payments-summary-card"><span>{isSuperAdmin ? 'Ticket promedio' : 'Ingresos por reserva'}</span><strong>{formatCurrency(isSuperAdmin ? summary.averageTicket : summary.reservationRevenue)}</strong></article>
        <article className="card payments-summary-card"><span>{isSuperAdmin ? 'Cobranza pendiente' : 'Cobros pendientes'}</span><strong>{summary.pendingCollections}</strong><small>{isSuperAdmin ? `${formatCurrency(summary.reservationRevenue)} en reservas registradas` : undefined}</small></article>
      </section>

      {isSuperAdmin && (
        <section className="payments-executive-grid">
          <article className="card payments-executive-trend-card">
            <div className="payments-section-head payments-executive-head">
              <div>
                <span className="trainers-eyebrow">Tendencia</span>
                <h3>Ingresos por periodo</h3>
                <p className="muted">Comparativo diario de reservas cobradas entre {executiveRangeLabel}.</p>
              </div>
              <div className="payments-executive-controls">
                <div className="dashboard-chip-group">
                  {executiveWindowOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`dashboard-chip ${executiveWindow === option ? 'active' : ''}`}
                      onClick={() => applyExecutivePreset(option)}
                    >
                      {option} días
                    </button>
                  ))}
                </div>
                <div className="payments-executive-range">
                  <input
                    className="input payments-executive-date"
                    type="date"
                    value={executiveRangeStart}
                    max={executiveRangeEnd}
                    onChange={(event) => {
                      setExecutiveWindow('custom');
                      setExecutiveRangeStart(event.target.value);
                    }}
                  />
                  <span className="payments-executive-separator">a</span>
                  <input
                    className="input payments-executive-date"
                    type="date"
                    value={executiveRangeEnd}
                    min={executiveRangeStart}
                    onChange={(event) => {
                      setExecutiveWindow('custom');
                      setExecutiveRangeEnd(event.target.value);
                    }}
                  />
                </div>
              </div>
            </div>
            <AreaChartNeon
              data={executiveTrend}
              series={[
                { key: 'reservas', label: 'Reservas', color: '#00f2fe', fillOpacity: 0.24 },
              ]}
            />
          </article>

          <article className="card payments-executive-breakdown-card">
            <div className="payments-section-head">
              <div>
                <span className="trainers-eyebrow">Origen</span>
                <h3>Ingresos por hotel</h3>
                <p className="muted">Comparativo acumulado entre propiedades activas.</p>
              </div>
            </div>
            <BarChart
              values={executiveSedeSeries.length > 0 ? executiveSedeSeries.map((item) => item.value) : [0]}
              labels={executiveSedeSeries.length > 0 ? executiveSedeSeries.map((item) => item.label) : ['Sin datos']}
            />
            <div className="payments-executive-inlineStats">
              <div className="payments-executive-stat">
                <span>Mayor fuente</span>
                <strong>{bestRevenueSource ? bestRevenueSource.label : 'Sin registros'}</strong>
                <small>{bestRevenueSource ? formatCurrency(bestRevenueSource.value) : '0.00 USD'}</small>
              </div>
              <div className="payments-executive-stat">
                <span>Cobrado vs pendiente</span>
                <strong>{executiveCollectedShare}%</strong>
                <small>{formatCurrency(summary.totalRevenue)} cobrados</small>
              </div>
            </div>
          </article>
        </section>
      )}

      <section className="payments-top-grid">
        <article className="card payments-form-card">
          <div className="payments-section-head">
            <div>
              <span className="trainers-eyebrow">Registrar</span>
              <h3>Nuevo cobro</h3>
            </div>
          </div>

          <form className="payments-form-grid" onSubmit={handleSubmit}>
            <select className="input" value={selectedReservationId} onChange={(event) => setSelectedReservationId(event.target.value)}>
              {pendingReservations.length === 0 && <option value="">Sin reservas pendientes</option>}
              {pendingReservations.map((reservation) => (
                <option key={reservation.id} value={reservation.id}>{reservation.huesped} · {reservation.habitacion} · {formatCurrency(reservation.precioAplicado)}</option>
              ))}
            </select>

            <select className="input" value={method} onChange={(event) => setMethod(event.target.value as PaymentFormInput['metodoPago'])}>
              {paymentMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <input className="input" placeholder="Referencia" value={reference} onChange={(event) => setReference(event.target.value)} />
            <input className="input" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
            <input className="input" type="datetime-local" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
            <button className="btn" type="submit" disabled={submitting || pendingReservations.length === 0 || !selectedReservationId}>
              {submitting ? 'Guardando...' : 'Registrar cobro'}
            </button>
          </form>
        </article>

        <article className="card payments-methods-card">
          <div className="payments-section-head">
            <div>
              <span className="trainers-eyebrow">Pulso</span>
              <h3>Distribución por método</h3>
              <p className="muted">Resume cuánto ingreso real llegó por efectivo, tarjeta, transferencia u otros métodos.</p>
            </div>
          </div>

          <div className="payments-method-list">
            {methodDistribution.length > 0 ? methodDistribution.map((item) => {
              const percentage = Math.round((item.value / Math.max(1, summary.totalRevenue)) * 100);

              return (
                <div key={item.label} className="payments-method-item">
                  <div className="payments-method-head">
                    <strong>{item.label}</strong>
                    <span className="muted">{formatCurrency(item.value)} · {percentage}%</span>
                  </div>
                  <div className="payments-method-track">
                    <div className="payments-method-fill" style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              );
            }) : <p className="muted">Aún no hay cobros registrados.</p>}
          </div>
        </article>
      </section>

      <section className="card payments-pending-card">
        <div className="payments-section-head">
          <div>
            <span className="trainers-eyebrow">{pageCopy.pendingKicker}</span>
            <h3>{pageCopy.pendingTitle}</h3>
            <p className="muted">{pageCopy.pendingSubtitle}</p>
          </div>
        </div>

        <div className="payments-pending-list">
          {pendingCollectionsList.length > 0 ? pendingCollectionsList.map((item) => (
            <article key={`${item.tipo}-${item.id}`} className="payments-pending-item">
              <div>
                <strong>{item.huesped}</strong>
                <span>{item.concepto}</span>
              </div>
              <div className="payments-pending-meta">
                <span className="pill ok">{item.tipo}</span>
                <strong>{formatCurrency(item.saldo)}</strong>
              </div>
            </article>
          )) : <p className="muted">No hay cobros pendientes en este momento.</p>}
        </div>
      </section>

      <section className="card payments-toolbar-card">
        <div className="payments-toolbar">
          <input className="input" placeholder="Buscar por huésped, estadía o referencia" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select className="input" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
            <option value="todos">Todos los tipos</option>
            <option value="reserva">Reservas</option>
          </select>
        </div>
      </section>

      <section className="card payments-table-card">
        <div className="members-table-scroll">
          <table className="table dark payments-table">
            <thead>
              <tr>
                <th>Huésped</th>
                <th>Estadía</th>
                <th>Tipo</th>
                <th>Metodo</th>
                <th>Referencia</th>
                <th>Monto</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((payment) => (
                <tr key={payment.id}>
                  <td>
                    <div className="payments-client-cell">
                      <strong>{payment.huesped}</strong>
                      <span>{payment.correo || 'Sin correo'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="payments-client-cell">
                      <strong>{payment.estadia}</strong>
                      <span>{payment.hotel}</span>
                    </div>
                  </td>
                  <td><span className="pill ok">{payment.tipo}</span></td>
                  <td>{payment.metodo}</td>
                  <td>{payment.referencia}</td>
                  <td>{formatCurrency(payment.monto)}</td>
                  <td>{formatDateTime(payment.fecha)}</td>
                </tr>
              ))}
              {!loading && filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted members-table-empty">No hay cobros que coincidan con el filtro actual.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Pagos;