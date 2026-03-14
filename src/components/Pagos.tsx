import React, { useEffect, useMemo, useState } from 'react';
import AreaChartNeon from './AreaChartNeon';
import BarChart from './BarChart';
import { downloadCsv } from '../lib/export';
import { createPayment, type PaymentFormInput } from '../lib/api';
import { useGymData } from '../context/GymDataContext';
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

const downloadPaymentReceipt = (payment: {
  id: string;
  cliente: string;
  concepto: string;
  tipo: string;
  metodo: string;
  referencia: string;
  monto: number;
  fecha?: string;
  sede: string;
}) => {
  const content = [
    'FitHub - Comprobante de pago',
    `Pago: ${payment.id}`,
    `Cliente: ${payment.cliente}`,
    `Concepto: ${payment.concepto}`,
    `Tipo: ${payment.tipo}`,
    `Metodo: ${payment.metodo}`,
    `Referencia: ${payment.referencia || 'N/D'}`,
    `Sede: ${payment.sede}`,
    `Monto: ${formatCurrency(payment.monto)}`,
    `Fecha: ${formatDateTime(payment.fecha)}`,
  ].join('\n');

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `comprobante_${payment.id}.txt`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const Pagos: React.FC = () => {
  const { role, user } = useAuth();
  const { data, loading, error, refresh } = useGymData();
  const isSuperAdmin = role === 'super_admin';
  const isClient = role === 'client';
  const pagos = data?.pagosView ?? [];
  const reservas = data?.reservasView ?? [];
  const miembros = data?.miembrosView ?? [];
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'todos' | 'reserva' | 'membresia'>('todos');
  const [sourceType, setSourceType] = useState<'reserva' | 'membresia'>('reserva');
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
  const [selectedMembershipId, setSelectedMembershipId] = useState('');
  const [method, setMethod] = useState<PaymentFormInput['metodoPago']>('tarjeta');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('0');
  const [paymentDate, setPaymentDate] = useState(() => toLocalDateTimeInputValue(new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const linkedPerson = useMemo(() => {
    if (!data || !user?.email) return null;
    return data.personas.find((item) => item.correo?.toLowerCase() === user.email?.toLowerCase()) ?? null;
  }, [data, user?.email]);

  const clientMemberProfile = useMemo(() => {
    if (!linkedPerson) return null;
    return miembros.find((item) => item.id === linkedPerson.id_persona) ?? null;
  }, [linkedPerson, miembros]);

  const clientPayments = useMemo(() => {
    if (!linkedPerson) return [];
    return pagos.filter((payment) => payment.clienteId === linkedPerson.id_persona);
  }, [linkedPerson, pagos]);

  const visiblePaymentsSource = isClient ? clientPayments : pagos;
  const visibleMembersSource = useMemo(() => {
    if (!isClient) return miembros;
    return clientMemberProfile ? [clientMemberProfile] : [];
  }, [clientMemberProfile, isClient, miembros]);
  const visibleReservationsSource = useMemo(() => {
    if (!isClient || !linkedPerson) return reservas;
    return reservas.filter((reservation) => reservation.clienteId === linkedPerson.id_persona);
  }, [isClient, linkedPerson, reservas]);

  const paidReservationIds = useMemo(
    () => new Set(visiblePaymentsSource.filter((payment) => payment.reservaId).map((payment) => payment.reservaId as string)),
    [visiblePaymentsSource],
  );

  const pendingReservations = useMemo(
    () => visibleReservationsSource
      .filter((reservation) => reservation.estado !== 'cancelada' && !paidReservationIds.has(reservation.id))
      .sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime()),
    [paidReservationIds, visibleReservationsSource],
  );

  const membershipOptions = useMemo(
    () => visibleMembersSource
      .filter((member) => member.membershipId && Math.max(0, member.costoMembresia - member.totalPagadoMembresia) > 0)
      .sort((left, right) => left.nombre.localeCompare(right.nombre, 'es')),
    [visibleMembersSource],
  );

  const pendingMembershipCollections = useMemo(
    () => membershipOptions.map((member) => ({
      id: member.membershipId ?? member.id,
      tipo: 'membresia' as const,
      cliente: member.nombre,
      concepto: `${member.plan} · vence ${member.fechaVencimiento ? new Date(member.fechaVencimiento).toLocaleDateString('es-HN') : 'sin fecha'}`,
      saldo: Math.max(0, member.costoMembresia - member.totalPagadoMembresia),
    })),
    [membershipOptions],
  );

  const pendingReservationCollections = useMemo(
    () => pendingReservations.map((reservation) => ({
      id: reservation.id,
      tipo: 'reserva' as const,
      cliente: reservation.cliente,
      concepto: `${reservation.servicio} · ${reservation.sede}`,
      saldo: reservation.precioAplicado,
    })),
    [pendingReservations],
  );

  const pendingCollectionsList = useMemo(
    () => [...pendingReservationCollections, ...pendingMembershipCollections]
      .sort((left, right) => right.saldo - left.saldo)
      .slice(0, 8),
    [pendingMembershipCollections, pendingReservationCollections],
  );

  useEffect(() => {
    if (sourceType === 'reserva') {
      const selectedReservation = pendingReservations.find((reservation) => reservation.id === selectedReservationId) ?? pendingReservations[0] ?? null;
      if (selectedReservation && selectedReservation.id !== selectedReservationId) {
        setSelectedReservationId(selectedReservation.id);
      }
      setAmount(selectedReservation ? String(selectedReservation.precioAplicado) : '0');
      return;
    }

    const selectedMember = membershipOptions.find((member) => member.membershipId === selectedMembershipId) ?? membershipOptions[0] ?? null;
    if (selectedMember && selectedMember.membershipId !== selectedMembershipId) {
      setSelectedMembershipId(selectedMember.membershipId ?? '');
    }
    const outstandingBalance = selectedMember
      ? Math.max(0, selectedMember.costoMembresia - selectedMember.totalPagadoMembresia)
      : 0;
    setAmount(String(outstandingBalance));
  }, [membershipOptions, pendingReservations, selectedMembershipId, selectedReservationId, sourceType]);

  const filteredPayments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return visiblePaymentsSource.filter((payment) => {
      const matchesType = typeFilter === 'todos' || payment.tipo === typeFilter;
      const matchesQuery = !normalizedQuery
        || payment.cliente.toLowerCase().includes(normalizedQuery)
        || payment.referencia.toLowerCase().includes(normalizedQuery)
        || payment.concepto.toLowerCase().includes(normalizedQuery)
        || payment.correo.toLowerCase().includes(normalizedQuery);

      return matchesType && matchesQuery;
    }).sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime());
  }, [query, typeFilter, visiblePaymentsSource]);

  const summary = useMemo(() => {
    const todayKey = toLocalDateKey(new Date());
    const totalRevenue = visiblePaymentsSource.reduce((sum, payment) => sum + payment.monto, 0);
    const todayRevenue = visiblePaymentsSource
      .filter((payment) => payment.fecha && toLocalDateKey(payment.fecha) === todayKey)
      .reduce((sum, payment) => sum + payment.monto, 0);
    const membershipRevenue = visiblePaymentsSource
      .filter((payment) => payment.tipo === 'membresia')
      .reduce((sum, payment) => sum + payment.monto, 0);
    const reservationRevenue = visiblePaymentsSource
      .filter((payment) => payment.tipo === 'reserva')
      .reduce((sum, payment) => sum + payment.monto, 0);
    const averageTicket = visiblePaymentsSource.length > 0 ? totalRevenue / visiblePaymentsSource.length : 0;

    return {
      totalRevenue,
      todayRevenue,
      membershipRevenue,
      reservationRevenue,
      averageTicket,
      pendingCollections: pendingReservations.length + membershipOptions.length,
    };
  }, [membershipOptions.length, pendingReservations.length, visiblePaymentsSource]);

  const recentPayments = useMemo(
    () => visiblePaymentsSource.slice().sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime()).slice(0, 4),
    [visiblePaymentsSource],
  );

  const pageCopy = isClient
    ? {
        title: 'Mis pagos',
        subtitle: 'Consulta tus cobros registrados, el saldo de tu membresía y tus movimientos más recientes.',
        exportLabel: 'Exportar mis pagos',
        pulseTitle: 'Distribucion por metodo',
        pulseSubtitle: 'Así se reparte tu historial por método de cobro registrado.',
        pendingKicker: 'Cuenta',
        pendingTitle: 'Pendientes de tu cuenta',
        pendingSubtitle: 'Reservas sin cobro asociado y saldo pendiente de membresía para tu perfil.',
        registerKicker: 'Cuenta',
        registerTitle: 'Estado de membresía',
        registerButton: 'Registrar pago',
        emptyTable: 'No hay pagos registrados en tu cuenta.',
      }
    : isSuperAdmin
    ? {
        title: 'Ingresos',
        subtitle: 'Visión ejecutiva de ventas registradas, métodos de cobro y cuentas por cobrar.',
        exportLabel: 'Exportar ingresos',
        pulseTitle: 'Distribucion de ingresos por metodo',
        pulseSubtitle: 'Muestra de dónde entra el dinero registrado y qué canal pesa más en la operación.',
        pendingKicker: 'Cobranza',
        pendingTitle: 'Cuentas por cobrar',
        pendingSubtitle: 'Pendientes abiertos entre reservas y membresías que todavía no entran a ingresos.',
        registerKicker: 'Caja',
        registerTitle: 'Registro operativo',
        registerButton: 'Registrar cobro',
        emptyTable: 'No hay ingresos que coincidan con el filtro actual.',
      }
    : {
        title: 'Pagos',
        subtitle: 'Caja operativa, historial de cobros y registro de pagos por reserva o membresia.',
        exportLabel: 'Exportar CSV',
        pulseTitle: 'Distribucion por metodo',
        pulseSubtitle: 'Resume cuánto ingreso real llegó por efectivo, tarjeta, transferencia u otros métodos.',
        pendingKicker: 'Pendientes',
        pendingTitle: 'Cobros por atender',
        pendingSubtitle: 'Esta lista combina reservas sin pago y membresías con saldo pendiente.',
        registerKicker: 'Registrar',
        registerTitle: 'Nuevo pago',
        registerButton: 'Registrar pago',
        emptyTable: 'No hay pagos que coincidan con el filtro actual.',
      };

  const methodDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    visiblePaymentsSource.forEach((payment) => {
      counts.set(payment.metodo, (counts.get(payment.metodo) ?? 0) + payment.monto);
    });

    return Array.from(counts.entries())
      .sort(([, left], [, right]) => right - left)
      .map(([label, value]) => ({ label, value }));
  }, [visiblePaymentsSource]);

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
      const reservationTotal = visiblePaymentsSource
        .filter((payment) => payment.tipo === 'reserva' && payment.fecha && toLocalDateKey(payment.fecha) === dayKey)
        .reduce((sum, payment) => sum + payment.monto, 0);
      const membershipTotal = visiblePaymentsSource
        .filter((payment) => payment.tipo === 'membresia' && payment.fecha && toLocalDateKey(payment.fecha) === dayKey)
        .reduce((sum, payment) => sum + payment.monto, 0);

      return {
        name: day.toLocaleDateString('es-HN', { day: '2-digit', month: executiveDayCount > 14 ? 'short' : undefined }),
        reservas: Number(reservationTotal.toFixed(2)),
        membresias: Number(membershipTotal.toFixed(2)),
      };
    });
  }, [executiveDayCount, executiveRangeStartDate, visiblePaymentsSource]);

  const executiveSedeSeries = useMemo(() => {
    const buckets = new Map<string, number>();

    visiblePaymentsSource.forEach((payment) => {
      const key = payment.sede && payment.sede !== 'Sin sede'
        ? payment.sede
        : payment.tipo === 'membresia'
          ? 'Membresias'
          : 'Sin sede';
      buckets.set(key, (buckets.get(key) ?? 0) + payment.monto);
    });

    return Array.from(buckets.entries())
      .sort(([, left], [, right]) => right - left)
      .slice(0, 6)
      .map(([label, value]) => ({ label, value: Number(value.toFixed(2)) }));
  }, [visiblePaymentsSource]);

  const bestRevenueSource = executiveSedeSeries[0] ?? null;
  const pendingAmount = pendingCollectionsList.reduce((sum, item) => sum + item.saldo, 0);
  const executiveCollectedShare = summary.totalRevenue + pendingAmount > 0
    ? Math.round((summary.totalRevenue / (summary.totalRevenue + pendingAmount)) * 100)
    : 0;
  const executiveRangeLabel = `${executiveRangeStartDate.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })} - ${executiveRangeEndDate.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })}`;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    setActionError(null);

    try {
      await createPayment({
        tipo: sourceType,
        metodoPago: method,
        referencia: reference,
        monto: Number(amount),
        fechaPago: new Date(paymentDate).toISOString(),
        reservaId: sourceType === 'reserva' ? selectedReservationId : undefined,
        membresiaId: sourceType === 'membresia' ? selectedMembershipId : undefined,
      });
      await refresh();
      setFeedback('Pago registrado correctamente.');
      setReference('');
      setPaymentDate(toLocalDateTimeInputValue(new Date()));
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : 'No se pudo registrar el pago.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportPayments = () => {
    downloadCsv(filteredPayments, [
      { header: 'ID Pago', value: (payment) => payment.id },
      { header: 'Tipo', value: (payment) => payment.tipo },
      { header: 'Cliente', value: (payment) => payment.cliente },
      { header: 'Correo', value: (payment) => payment.correo },
      { header: 'Concepto', value: (payment) => payment.concepto },
      { header: 'Sede', value: (payment) => payment.sede },
      { header: 'Metodo', value: (payment) => payment.metodo },
      { header: 'Referencia', value: (payment) => payment.referencia },
      { header: 'Monto', value: (payment) => payment.monto },
      { header: 'Fecha', value: (payment) => formatDateTime(payment.fecha) },
    ], isClient ? 'mis_pagos' : 'pagos');
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
        <article className="card payments-summary-card"><span>{isClient ? 'Total pagado' : 'Ingresos acumulados'}</span><strong>{formatCurrency(summary.totalRevenue)}</strong></article>
        <article className="card payments-summary-card"><span>{isClient ? 'Pagado hoy' : 'Ingresos de hoy'}</span><strong>{formatCurrency(summary.todayRevenue)}</strong></article>
        <article className="card payments-summary-card"><span>{isClient ? 'Membresía abonada' : isSuperAdmin ? 'Ticket promedio' : 'Cobros de membresia'}</span><strong>{formatCurrency(isClient ? summary.membershipRevenue : isSuperAdmin ? summary.averageTicket : summary.membershipRevenue)}</strong></article>
        <article className="card payments-summary-card"><span>{isClient ? 'Saldo pendiente' : isSuperAdmin ? 'Cobranza pendiente' : 'Cobros pendientes'}</span><strong>{isClient ? formatCurrency(Math.max(0, (clientMemberProfile?.costoMembresia ?? 0) - (clientMemberProfile?.totalPagadoMembresia ?? 0))) : summary.pendingCollections}</strong><small>{isClient ? `${clientMemberProfile?.plan ?? 'Sin plan'} · ${clientMemberProfile?.estado ?? 'Pendiente'}` : isSuperAdmin ? `${formatCurrency(summary.reservationRevenue)} en reservas registradas` : undefined}</small></article>
      </section>

      {isSuperAdmin && (
        <section className="payments-executive-grid">
          <article className="card payments-executive-trend-card">
            <div className="payments-section-head payments-executive-head">
              <div>
                <span className="trainers-eyebrow">Tendencia</span>
                <h3>Ingresos por periodo</h3>
                <p className="muted">Comparativo diario de reservas y membresías entre {executiveRangeLabel}.</p>
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
                { key: 'membresias', label: 'Membresías', color: '#ff7ab6', fillOpacity: 0.18 },
              ]}
            />
          </article>

          <article className="card payments-executive-breakdown-card">
            <div className="payments-section-head">
              <div>
                <span className="trainers-eyebrow">Origen</span>
                <h3>Ingresos por sede</h3>
                <p className="muted">Comparativo acumulado entre sedes activas y membresías sin sede operativa.</p>
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

      {isClient && (
        <section className="payments-top-grid">
          <article className="card payments-form-card">
            <div className="payments-section-head">
              <div>
                <span className="trainers-eyebrow">Cuenta</span>
                <h3>Estado de membresía</h3>
                <p className="muted">Resumen de tu plan vigente, vencimiento y saldo acumulado.</p>
              </div>
            </div>
            <div className="profile-security-list">
              <div className="profile-security-item">
                <strong>Plan actual</strong>
                <span>{clientMemberProfile?.plan ?? 'Sin plan activo'}</span>
              </div>
              <div className="profile-security-item">
                <strong>Estado</strong>
                <span>{clientMemberProfile?.estado ?? 'Pendiente'}</span>
              </div>
              <div className="profile-security-item">
                <strong>Vencimiento</strong>
                <span>{clientMemberProfile?.fechaVencimiento ? new Date(clientMemberProfile.fechaVencimiento).toLocaleDateString('es-HN') : 'Sin fecha registrada'}</span>
              </div>
              <div className="profile-security-item">
                <strong>Pagado</strong>
                <span>{formatCurrency(clientMemberProfile?.totalPagadoMembresia ?? 0)}</span>
              </div>
            </div>
          </article>

          <article className="card payments-methods-card">
            <div className="payments-section-head">
              <div>
                <span className="trainers-eyebrow">Pulso</span>
                <h3>{pageCopy.pulseTitle}</h3>
                <p className="muted">{pageCopy.pulseSubtitle}</p>
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
              }) : <p className="muted">Aun no hay pagos registrados.</p>}
            </div>
          </article>
        </section>
      )}

      {isClient && (
        <section className="payments-client-recent-grid">
          <article className="card payments-client-recent-card">
            <div className="payments-section-head">
              <div>
                <span className="trainers-eyebrow">Actividad</span>
                <h3>Pagos recientes</h3>
                <p className="muted">Tus últimos movimientos quedan aquí, junto al historial completo y los comprobantes.</p>
              </div>
            </div>
            {recentPayments.length > 0 ? (
              <div className="payments-pending-list">
                {recentPayments.map((payment) => (
                  <article key={`recent-${payment.id}`} className="payments-pending-item">
                    <div>
                      <strong>{payment.concepto}</strong>
                      <span>{payment.metodo} · {payment.referencia || 'Sin referencia'} · {formatDateTime(payment.fecha)}</span>
                    </div>
                    <div className="payments-pending-meta">
                      <span className={`pill ${payment.tipo === 'reserva' ? 'ok' : 'warn'}`}>{payment.tipo}</span>
                      <strong>{formatCurrency(payment.monto)}</strong>
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className="muted">Todavía no hay pagos recientes en tu cuenta.</p>}
          </article>
        </section>
      )}

      {!isClient && <section className="payments-top-grid">
        <article className="card payments-form-card">
          <div className="payments-section-head">
            <div>
              <span className="trainers-eyebrow">{pageCopy.registerKicker}</span>
              <h3>{pageCopy.registerTitle}</h3>
            </div>
          </div>

          <form className="payments-form-grid" onSubmit={handleSubmit}>
            <div className="payments-source-toggle">
              <button type="button" className={`btn ${sourceType === 'reserva' ? '' : 'ghost'}`} onClick={() => setSourceType('reserva')}>Por reserva</button>
              <button type="button" className={`btn ${sourceType === 'membresia' ? '' : 'ghost'}`} onClick={() => setSourceType('membresia')}>Por membresia</button>
            </div>

            {sourceType === 'reserva' ? (
              <select className="input" value={selectedReservationId} onChange={(event) => setSelectedReservationId(event.target.value)}>
                {pendingReservations.map((reservation) => (
                  <option key={reservation.id} value={reservation.id}>{reservation.cliente} · {reservation.servicio} · {formatCurrency(reservation.precioAplicado)}</option>
                ))}
              </select>
            ) : (
              <select className="input" value={selectedMembershipId} onChange={(event) => setSelectedMembershipId(event.target.value)}>
                {membershipOptions.map((member) => (
                  <option key={member.id} value={member.membershipId}>{member.nombre} · {member.plan} · saldo {formatCurrency(Math.max(0, member.costoMembresia - member.totalPagadoMembresia))}</option>
                ))}
              </select>
            )}

            <select className="input" value={method} onChange={(event) => setMethod(event.target.value as PaymentFormInput['metodoPago'])}>
              {paymentMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <input className="input" placeholder="Referencia" value={reference} onChange={(event) => setReference(event.target.value)} />
            <input className="input" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
            <input className="input" type="datetime-local" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
            <button className="btn" type="submit" disabled={submitting || (sourceType === 'reserva' && pendingReservations.length === 0) || (sourceType === 'membresia' && membershipOptions.length === 0)}>
              {submitting ? 'Guardando...' : pageCopy.registerButton}
            </button>
          </form>
        </article>

        <article className="card payments-methods-card">
          <div className="payments-section-head">
            <div>
              <span className="trainers-eyebrow">Pulso</span>
              <h3>{pageCopy.pulseTitle}</h3>
              <p className="muted">{pageCopy.pulseSubtitle}</p>
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
            }) : <p className="muted">Aun no hay pagos registrados.</p>}
          </div>
        </article>
      </section>}

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
                <strong>{item.cliente}</strong>
                <span>{item.concepto}</span>
              </div>
              <div className="payments-pending-meta">
                <span className={`pill ${item.tipo === 'reserva' ? 'ok' : 'warn'}`}>{item.tipo}</span>
                <strong>{formatCurrency(item.saldo)}</strong>
              </div>
            </article>
          )) : <p className="muted">{isClient ? 'Tu cuenta no tiene saldos pendientes en este momento.' : 'No hay cobros pendientes en este momento.'}</p>}
        </div>
      </section>

      <section className="card payments-toolbar-card">
        <div className="payments-toolbar">
          <input className="input" placeholder="Buscar por cliente, concepto o referencia" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select className="input" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
            <option value="todos">Todos los tipos</option>
            <option value="reserva">Reservas</option>
            <option value="membresia">Membresias</option>
          </select>
        </div>
      </section>

      <section className="card payments-table-card">
        <div className="members-table-scroll">
          <table className="table dark payments-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Concepto</th>
                <th>Tipo</th>
                <th>Metodo</th>
                <th>Referencia</th>
                <th>Monto</th>
                <th>Fecha</th>
                {isClient && <th>Comprobante</th>}
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((payment) => (
                <tr key={payment.id}>
                  <td>
                    <div className="payments-client-cell">
                      <strong>{payment.cliente}</strong>
                      <span>{payment.correo || 'Sin correo'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="payments-client-cell">
                      <strong>{payment.concepto}</strong>
                      <span>{payment.sede}</span>
                    </div>
                  </td>
                  <td><span className={`pill ${payment.tipo === 'reserva' ? 'ok' : 'warn'}`}>{payment.tipo}</span></td>
                  <td>{payment.metodo}</td>
                  <td>{payment.referencia}</td>
                  <td>{formatCurrency(payment.monto)}</td>
                  <td>{formatDateTime(payment.fecha)}</td>
                  {isClient && (
                    <td>
                      <button className="btn ghost payments-receipt-button" type="button" onClick={() => downloadPaymentReceipt(payment)}>
                        Descargar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!loading && filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={isClient ? 8 : 7} className="muted members-table-empty">{pageCopy.emptyTable}</td>
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