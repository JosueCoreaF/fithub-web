import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGymData } from '../context/GymDataContext';
import { MEMBERSHIP_PLAN_OPTIONS, checkoutMembershipPlan, type PaymentFormInput } from '../lib/api';

const formatCurrency = (value: number) => `${value.toFixed(2)} USD`;

const formatDate = (value?: string | null) => {
  if (!value) return 'Sin fecha registrada';
  return new Date(value).toLocaleDateString('es-HN');
};

const diffInDays = (value?: string | null) => {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

export const MembresiaCliente: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error, refresh } = useGymData();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentFormInput['metodoPago']>('tarjeta');
  const [paymentReference, setPaymentReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const paymentMethods: Array<{ value: PaymentFormInput['metodoPago']; label: string }> = [
    { value: 'efectivo', label: 'Efectivo' },
    { value: 'tarjeta', label: 'Tarjeta' },
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'deposito', label: 'Deposito' },
    { value: 'otro', label: 'Otro' },
  ];

  const linkedPerson = useMemo(() => {
    if (!data || !user?.email) return null;
    return data.personas.find((item) => item.correo?.toLowerCase() === user.email?.toLowerCase()) ?? null;
  }, [data, user?.email]);

  const memberProfile = useMemo(() => {
    if (!data || !linkedPerson) return null;
    return data.miembrosView.find((item) => item.id === linkedPerson.id_persona) ?? null;
  }, [data, linkedPerson]);

  const reservations = useMemo(() => {
    if (!data || !linkedPerson) return [];

    return data.reservasView
      .filter((item) => item.clienteId === linkedPerson.id_persona)
      .slice()
      .sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime());
  }, [data, linkedPerson]);

  const payments = useMemo(() => {
    if (!data || !linkedPerson) return [];

    return data.pagosView
      .filter((item) => item.clienteId === linkedPerson.id_persona)
      .slice()
      .sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime());
  }, [data, linkedPerson]);

  const completedReservations = reservations.filter((item) => item.estado === 'completada').length;
  const upcomingReservations = reservations.filter((item) => new Date(item.fecha).getTime() >= Date.now() && item.estado !== 'cancelada');
  const pendingBalance = Math.max(0, (memberProfile?.costoMembresia ?? 0) - (memberProfile?.totalPagadoMembresia ?? 0));
  const coverage = memberProfile?.costoMembresia
    ? Math.min(100, Math.round(((memberProfile.totalPagadoMembresia ?? 0) / Math.max(1, memberProfile.costoMembresia)) * 100))
    : 0;
  const expirationDelta = diffInDays(memberProfile?.fechaVencimiento);
  const paymentsThisCycle = payments.filter((item) => item.tipo === 'membresia');
  const selectedPlanConfig = useMemo(
    () => MEMBERSHIP_PLAN_OPTIONS.find((plan) => plan.value === selectedPlan) ?? null,
    [selectedPlan],
  );

  const handleMembershipCheckout = async () => {
    if (!linkedPerson || !selectedPlanConfig) return;

    setSubmitting(true);
    setActionError(null);
    setFeedback(null);

    try {
      await checkoutMembershipPlan({
        clienteId: linkedPerson.id_persona,
        tipoPlan: selectedPlanConfig.value,
        referencia: paymentReference,
        metodoPago: paymentMethod,
      });
      await refresh();
      setFeedback(`Tu plan ${selectedPlanConfig.label} quedó activado y pagado correctamente.`);
      setSelectedPlan(null);
      setPaymentReference('');
    } catch (checkoutError) {
      setActionError(checkoutError instanceof Error ? checkoutError.message : 'No se pudo activar la membresía.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page membership-page">
      <header className="dashboard-header membership-header">
        <div>
          <span className="trainers-eyebrow">Portal del cliente</span>
          <h2>Mi membresía</h2>
          <p className="muted">Consulta tu plan activo, cobertura pagada, vigencia y movimientos vinculados a tu membresía.</p>
        </div>
        <div className="header-actions">
          <button className="btn ghost" onClick={() => navigate('/pagos')}>Ver mis pagos</button>
          <button className="btn ghost" onClick={() => navigate('/perfil')}>Actualizar perfil</button>
          <button className="btn" onClick={() => navigate('/reservas')}>Ver reservas</button>
        </div>
      </header>

      {error && <p className="muted">{error}</p>}
      {loading && <p className="muted">Cargando tu membresía...</p>}
      {(actionError || feedback) && (
        <div className={`profile-feedback ${actionError ? 'error' : 'success'}`}>
          {actionError ?? feedback}
        </div>
      )}

      {!loading && !linkedPerson && (
        <article className="card">
          <h3>Perfil pendiente de enlazar</h3>
          <p className="muted">No encontramos una persona operativa asociada a tu correo actual, por lo que todavía no podemos mostrar tu membresía.</p>
        </article>
      )}

      {!loading && linkedPerson && (
        <>
          <section className="payments-summary-grid membership-summary-grid">
            <article className="card payments-summary-card">
              <span>Plan actual</span>
              <strong>{memberProfile?.plan ?? 'Sin plan'}</strong>
              <small>{memberProfile?.estado ?? 'Pendiente'}</small>
            </article>
            <article className="card payments-summary-card">
              <span>Vigencia</span>
              <strong>{formatDate(memberProfile?.fechaVencimiento)}</strong>
              <small>{expirationDelta === null ? 'Sin vencimiento definido' : expirationDelta >= 0 ? `${expirationDelta} días restantes` : `${Math.abs(expirationDelta)} días vencida`}</small>
            </article>
            <article className="card payments-summary-card">
              <span>Cobertura pagada</span>
              <strong>{coverage}%</strong>
              <small>{formatCurrency(memberProfile?.totalPagadoMembresia ?? 0)} de {formatCurrency(memberProfile?.costoMembresia ?? 0)}</small>
            </article>
            <article className="card payments-summary-card">
              <span>Saldo pendiente</span>
              <strong>{formatCurrency(pendingBalance)}</strong>
              <small>{paymentsThisCycle.length} pagos aplicados a membresía</small>
            </article>
          </section>

          <section className="membership-grid">
            <article className="card membership-plan-card">
              <div className="payments-section-head">
                <div>
                  <span className="trainers-eyebrow">Plan</span>
                  <h3>Estado actual</h3>
                  <p className="muted">Resumen del ciclo actual y progreso de pago acumulado.</p>
                </div>
              </div>

              <div className="membership-highlight">
                <div>
                  <strong>{memberProfile?.plan ?? 'Sin plan activo'}</strong>
                  <span>{memberProfile?.estado ?? 'Pendiente'} · vence {formatDate(memberProfile?.fechaVencimiento)}</span>
                </div>
                <span className={`pill ${pendingBalance > 0 ? 'warn' : 'ok'}`}>{pendingBalance > 0 ? 'Pago pendiente' : 'Al día'}</span>
              </div>

              <div className="membership-progress-block">
                <div className="payments-method-head">
                  <strong>Avance de cobertura</strong>
                  <span className="muted">{coverage}%</span>
                </div>
                <div className="payments-method-track membership-progress-track">
                  <div className="payments-method-fill membership-progress-fill" style={{ width: `${coverage}%` }} />
                </div>
              </div>

              <div className="profile-security-list membership-meta-list">
                <div className="profile-security-item">
                  <strong>Pagado acumulado</strong>
                  <span>{formatCurrency(memberProfile?.totalPagadoMembresia ?? 0)}</span>
                </div>
                <div className="profile-security-item">
                  <strong>Costo del plan</strong>
                  <span>{formatCurrency(memberProfile?.costoMembresia ?? 0)}</span>
                </div>
                <div className="profile-security-item">
                  <strong>Correo asociado</strong>
                  <span>{linkedPerson.correo ?? 'Sin correo registrado'}</span>
                </div>
                <div className="profile-security-item">
                  <strong>Ciudad base</strong>
                  <span>{memberProfile?.ciudad ?? linkedPerson.direccion_ciudad ?? 'Sin ciudad registrada'}</span>
                </div>
              </div>
            </article>

            <article className="card membership-activity-card">
              <div className="payments-section-head">
                <div>
                  <span className="trainers-eyebrow">Actividad</span>
                  <h3>Uso de tu cuenta</h3>
                  <p className="muted">Cruce rápido entre reservas realizadas y pagos asociados a tu perfil.</p>
                </div>
              </div>

              <div className="membership-kpi-list">
                <div className="membership-kpi-item">
                  <strong>{upcomingReservations.length}</strong>
                  <span>reservas próximas</span>
                </div>
                <div className="membership-kpi-item">
                  <strong>{completedReservations}</strong>
                  <span>sesiones completadas</span>
                </div>
                <div className="membership-kpi-item">
                  <strong>{payments.length}</strong>
                  <span>pagos registrados</span>
                </div>
              </div>

              <div className="membership-activity-list">
                {payments.slice(0, 5).map((payment) => (
                  <div key={payment.id} className="payments-pending-item membership-activity-item">
                    <div>
                      <strong>{payment.concepto}</strong>
                      <span>{payment.metodo} · {payment.referencia || 'Sin referencia'} · {formatDate(payment.fecha)}</span>
                    </div>
                    <div className="payments-pending-meta">
                      <span className={`pill ${payment.tipo === 'membresia' ? 'warn' : 'ok'}`}>{payment.tipo}</span>
                      <strong>{formatCurrency(payment.monto)}</strong>
                    </div>
                  </div>
                ))}
                {payments.length === 0 && <p className="muted">Todavía no hay movimientos registrados en tu cuenta.</p>}
              </div>
            </article>
          </section>

          <section className="membership-offers-grid">
            {MEMBERSHIP_PLAN_OPTIONS.map((plan) => (
              <article key={plan.value} className={`card membership-offer-card ${plan.recommended ? 'recommended' : ''}`}>
                <div className="membership-offer-head">
                  <div>
                    <span className="trainers-eyebrow">{plan.recommended ? 'Recomendado' : 'Plan disponible'}</span>
                    <h3>{plan.label}</h3>
                  </div>
                  <strong>{formatCurrency(plan.cost)}</strong>
                </div>
                <p className="muted">{plan.description}</p>
                <div className="membership-offer-meta">
                  <span>{plan.durationDays ? `${plan.durationDays} días` : `${plan.durationMonths ?? 1} mes${(plan.durationMonths ?? 1) > 1 ? 'es' : ''}`}</span>
                  <span>{plan.value === memberProfile?.plan ? 'Tu plan actual' : plan.recommended ? 'Mejor equilibrio' : 'Cambio disponible'}</span>
                </div>
                <div className="membership-benefit-list">
                  {plan.benefits.map((benefit) => (
                    <span key={`${plan.value}-${benefit}`} className="membership-benefit-chip">{benefit}</span>
                  ))}
                </div>
                <button className="btn ghost" type="button" onClick={() => {
                  setSelectedPlan(plan.value);
                  setActionError(null);
                  setFeedback(null);
                }}>
                  {plan.value === memberProfile?.plan ? 'Renovar este plan' : 'Elegir y pagar'}
                </button>
              </article>
            ))}
          </section>

          {selectedPlanConfig && (
            <div className="modal-overlay" onClick={() => !submitting && setSelectedPlan(null)}>
              <div className="modal membership-checkout-modal" onClick={(event) => event.stopPropagation()}>
                <div className="payments-section-head">
                  <div>
                    <span className="trainers-eyebrow">Checkout de membresía</span>
                    <h3>{selectedPlanConfig.label}</h3>
                    <p className="muted">Activa tu plan desde aquí y registra el cobro en la misma operación.</p>
                  </div>
                </div>

                <div className="membership-checkout-grid">
                  <div className="membership-checkout-plan">
                    <strong>{selectedPlanConfig.label}</strong>
                    <span>{selectedPlanConfig.description}</span>
                    <small>{formatCurrency(selectedPlanConfig.cost)} · {selectedPlanConfig.durationDays ? `${selectedPlanConfig.durationDays} días` : `${selectedPlanConfig.durationMonths ?? 1} mes${(selectedPlanConfig.durationMonths ?? 1) > 1 ? 'es' : ''}`}</small>
                    <div className="membership-benefit-list membership-benefit-list-compact">
                      {selectedPlanConfig.benefits.map((benefit) => (
                        <span key={`checkout-${benefit}`} className="membership-benefit-chip">{benefit}</span>
                      ))}
                    </div>
                  </div>

                  <select className="input" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentFormInput['metodoPago'])}>
                    {paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                  </select>

                  <input
                    className="input"
                    placeholder="Referencia del pago"
                    value={paymentReference}
                    onChange={(event) => setPaymentReference(event.target.value)}
                  />
                </div>

                <div className="member-modal-actions" style={{ marginTop: 18 }}>
                  <button className="btn" type="button" disabled={submitting} onClick={() => void handleMembershipCheckout()}>
                    {submitting ? 'Procesando...' : `Pagar ${formatCurrency(selectedPlanConfig.cost)}`}
                  </button>
                  <button className="btn ghost" type="button" disabled={submitting} onClick={() => setSelectedPlan(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MembresiaCliente;