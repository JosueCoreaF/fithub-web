import React, { useEffect, useMemo, useState } from 'react';
import DonutChart from './DonutChart';
import { downloadCsv } from '../lib/export';
import { MEMBERSHIP_PLAN_OPTIONS, renewMemberMembership, type MiembroView } from '../lib/api';
import { useGymData } from '../context/GymDataContext';

export const Miembros: React.FC = () => {
  const [query, setQuery] = useState('');
  const [filterPlan, setFilterPlan] = useState<'Todos' | string>('Todos');
  const [filterStatus, setFilterStatus] = useState<'Todos' | 'Activo' | 'Vencido'>('Todos');
  const [filterCity, setFilterCity] = useState<'Todas' | string>('Todas');
  const { data, loading, error, refresh } = useGymData();
  const members = data?.miembrosView ?? [];
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [selectedRenewalPlan, setSelectedRenewalPlan] = useState('Mensual');
  const planColors = ['#06b6d4', '#7c3aed', '#06d6a0', '#ff7ab6', '#f59e0b', '#38bdf8'];

  const formatDate = (value?: string) => {
    if (!value) return 'N/D';
    return new Date(value).toLocaleDateString('es-HN');
  };

  const shortId = (value: string) => value.slice(0, 8);

  const plans = useMemo(() => {
    const s = new Set<string>(['Todos']);
    members.forEach(m => s.add(m.plan));
    return Array.from(s);
  }, [members]);

  const cities = useMemo(() => {
    const values = new Set<string>(['Todas']);
    members.forEach(member => {
      if (member.ciudad) values.add(member.ciudad);
    });
    return Array.from(values).sort((left, right) => {
      if (left === 'Todas') return -1;
      if (right === 'Todas') return 1;
      return left.localeCompare(right, 'es');
    });
  }, [members]);

  const planDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    members.forEach(member => {
      counts.set(member.plan, (counts.get(member.plan) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .sort(([, left], [, right]) => right - left)
      .map(([label, value], index) => ({
        label,
        value,
        color: planColors[index % planColors.length],
      }));
  }, [members]);

  const maxPlanCount = useMemo(
    () => Math.max(1, ...planDistribution.map(segment => segment.value)),
    [planDistribution],
  );

  const filtered = members.filter(m => {
    const normalizedQuery = query.toLowerCase();
    const matchesQuery = m.nombre.toLowerCase().includes(normalizedQuery) || m.id.toLowerCase().includes(normalizedQuery);
    const matchesPlan = filterPlan === 'Todos' ? true : m.plan === filterPlan;
    const matchesStatus = filterStatus === 'Todos' ? true : m.estado === filterStatus;
    const matchesCity = filterCity === 'Todas' ? true : m.ciudad === filterCity;
    return matchesQuery && matchesPlan && matchesStatus && matchesCity;
  });

  const [activeProfile, setActiveProfile] = useState<MiembroView | null>(null);
  const counts = {
    activos: members.filter(m => m.estado === 'Activo').length,
    vencidos: members.filter(m => m.estado !== 'Activo').length,
  };

  useEffect(() => {
    if (!activeProfile) return;
    const updatedProfile = members.find(member => member.id === activeProfile.id) ?? null;
    setActiveProfile(updatedProfile);
  }, [members, activeProfile?.id]);

  useEffect(() => {
    if (!activeProfile) return;
    setSelectedRenewalPlan(activeProfile.plan === 'Sin plan' ? 'Mensual' : activeProfile.plan);
  }, [activeProfile]);

  const handleRenew = async (member: MiembroView, planName: string) => {
    setRenewingId(member.id);
    setActionError(null);
    setActionMessage(null);
    try {
      await renewMemberMembership(member.id, planName);
      await refresh();
      setActionMessage(`Membresía ${planName} renovada para ${member.nombre}.`);
    } catch (renewError) {
      setActionError(renewError instanceof Error ? renewError.message : 'No se pudo renovar la membresía.');
    } finally {
      setRenewingId(null);
    }
  };

  const handleExportMembers = () => {
    downloadCsv(filtered, [
      { header: 'ID', value: (member) => member.id },
      { header: 'Nombre', value: (member) => member.nombre },
      { header: 'Correo', value: (member) => member.correo },
      { header: 'Telefono', value: (member) => member.telefono ?? '' },
      { header: 'Ciudad', value: (member) => member.ciudad },
      { header: 'Plan', value: (member) => member.plan },
      { header: 'Estado', value: (member) => member.estado },
      { header: 'Estado Membresia', value: (member) => member.membresiaEstado },
      { header: 'Fecha Registro', value: (member) => member.fechaRegistro ? new Date(member.fechaRegistro).toLocaleDateString('es-HN') : '' },
      { header: 'Fecha Vencimiento', value: (member) => member.fechaVencimiento ? new Date(member.fechaVencimiento).toLocaleDateString('es-HN') : '' },
      { header: 'Pagos Registrados', value: (member) => member.pagos.length },
    ], 'miembros');
  };

  return (
    <div className="page">
      <div className="dashboard-header" style={{ marginBottom: 12 }}>
        <div>
          <h2>Miembros</h2>
          <p className="muted">Lista de miembros registrados.</p>
        </div>
        <div className="header-actions">
          <button className="btn ghost" onClick={handleExportMembers} disabled={filtered.length === 0}>
            Exportar CSV
          </button>
        </div>
      </div>
      {error && <p className="muted">{error}</p>}
      {loading && <p className="muted">Cargando miembros...</p>}
      {actionMessage && <p className="muted">{actionMessage}</p>}
      {actionError && <p className="muted">{actionError}</p>}

      <div className="members-header">
        <div className="widgets">
          <div className="widget">
            <div className="widget-title">Activos</div>
            <div className="widget-value">{counts.activos}</div>
          </div>
          <div className="widget">
            <div className="widget-title">Vencidos</div>
            <div className="widget-value">{counts.vencidos}</div>
          </div>
        </div>

        <div className="list-controls members-filters">
          <input className="input search-neon" placeholder="Buscar por nombre o ID..." value={query} onChange={e => setQuery(e.target.value)} />
          <select className="input" value={filterPlan} onChange={e => setFilterPlan(e.target.value)}>
            {plans.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value as 'Todos' | 'Activo' | 'Vencido')}>
            <option value="Todos">Todos los estados</option>
            <option value="Activo">Activos</option>
            <option value="Vencido">Vencidos</option>
          </select>
          <select className="input" value={filterCity} onChange={e => setFilterCity(e.target.value)}>
            {cities.map(city => <option key={city} value={city}>{city}</option>)}
          </select>
          <button
            className="btn ghost"
            onClick={() => {
              setQuery('');
              setFilterPlan('Todos');
              setFilterStatus('Todos');
              setFilterCity('Todas');
            }}
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="members-results-bar">
        <span className="muted">{filtered.length} resultados</span>
      </div>

      <div className="members-metrics">
        <div className="card small member-metric-card">
          <div className="card-body">
            <h4>Activos vs Vencidos</h4>
            <DonutChart percent={Math.round((counts.activos / Math.max(1, members.length)) * 100)} />
          </div>
        </div>

        <div className="card small member-metric-card member-distribution-card">
          <div className="card-body member-distribution-body">
            <h4>Distribución por plan</h4>
            {planDistribution.length > 0 ? (
              <div className="member-distribution-bars">
                {planDistribution.map(segment => {
                  const percentage = Math.round((segment.value / Math.max(1, members.length)) * 100);
                  const width = Math.max(8, Math.round((segment.value / maxPlanCount) * 100));

                  return (
                    <div key={segment.label} className="member-distribution-row">
                      <div className="member-distribution-rowHead">
                        <div className="member-distribution-labelWrap">
                          <span className="member-distribution-dot" style={{ backgroundColor: segment.color }} />
                          <span className="member-distribution-label" title={segment.label}>{segment.label}</span>
                        </div>
                        <span className="muted member-distribution-value">{segment.value} • {percentage}%</span>
                      </div>
                      <div className="member-distribution-track">
                        <div className="member-distribution-fill" style={{ width: `${width}%`, background: `linear-gradient(90deg, ${segment.color}, ${segment.color}cc)` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted">Sin datos de planes.</p>
            )}
          </div>
        </div>
      </div>

      <div className="card members-table-card" style={{ marginTop: 14 }}>
        <div className="members-table-scroll">
          <table className="table dark members-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Miembro</th>
                <th>Plan</th>
                <th>Estado</th>
                <th>Ciudad</th>
                <th>Vence</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(member => {
                const isRenewing = renewingId === member.id;

                return (
                  <tr key={member.id}>
                    <td className="members-table-id">{shortId(member.id)}</td>
                    <td>
                      <div className="members-table-nameWrap">
                        <strong className="members-table-name" title={member.nombre}>{member.nombre}</strong>
                        <span className="muted members-table-email" title={member.correo}>{member.correo}</span>
                      </div>
                    </td>
                    <td>{member.plan}</td>
                    <td>
                      <span className={`member-status ${member.estado === 'Activo' ? 'active' : 'expired'}`}>
                        {isRenewing ? 'Renovando...' : member.estado}
                      </span>
                    </td>
                    <td>{member.ciudad}</td>
                    <td>{formatDate(member.fechaVencimiento)}</td>
                    <td>
                      <div className="members-table-actions">
                        <button className="btn small" onClick={() => setActiveProfile(member)}>Gestionar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted members-table-empty">No hay miembros que coincidan con el filtro.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeProfile && (
        <div className="modal-overlay" onClick={() => setActiveProfile(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{activeProfile.nombre}</h3>
            <div className="member-modal-grid">
              <p>Correo: {activeProfile.correo}</p>
              <p>Ciudad: {activeProfile.ciudad}</p>
              <p>Plan: {activeProfile.plan}</p>
              <p>Vence: {formatDate(activeProfile.fechaVencimiento)}</p>
              <p>Estado: {activeProfile.estado}</p>
              <p>ID: {shortId(activeProfile.id)}</p>
            </div>
            <h4>Historial de pagos</h4>
            <ul>
              {activeProfile.pagos.length > 0 ? activeProfile.pagos.map(pago => (
                <li key={pago.id}>{formatDate(pago.fecha)} - {pago.metodo} - {pago.monto.toFixed(2)} USD</li>
              )) : <li>Sin pagos asociados.</li>}
            </ul>
            <div className="users-section-head" style={{ marginTop: 18 }}>
              <h4>Renovar con otro plan</h4>
              <p className="muted">Ahora puedes elegir entre varios ciclos de membresía antes de renovar.</p>
            </div>
            <div className="member-plan-picker">
              {MEMBERSHIP_PLAN_OPTIONS.map((plan) => (
                <button
                  key={plan.value}
                  type="button"
                  className={`member-plan-option ${selectedRenewalPlan === plan.value ? 'active' : ''}`}
                  onClick={() => setSelectedRenewalPlan(plan.value)}
                >
                  <strong>{plan.label}</strong>
                  <span>{plan.description}</span>
                  <small>{plan.cost.toFixed(2)} USD</small>
                </button>
              ))}
            </div>
            <div className="member-modal-actions" style={{ marginTop: 12 }}>
              {(activeProfile.estado !== 'Activo' || activeProfile.plan !== selectedRenewalPlan) && (
                <button className="btn" disabled={renewingId === activeProfile.id} onClick={async () => {
                  await handleRenew(activeProfile, selectedRenewalPlan);
                }}>{renewingId === activeProfile.id ? 'Renovando...' : `Renovar ${selectedRenewalPlan}`}</button>
              )}
              {activeProfile.telefono && (
                <a className="btn ghost" href={`https://wa.me/${activeProfile.telefono.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>
              )}
              <button className="btn" onClick={() => setActiveProfile(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Miembros;
