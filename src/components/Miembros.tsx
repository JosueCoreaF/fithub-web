import React, { useMemo, useState } from 'react';
import MemberCard from './MemberCard';
import DonutChart from './DonutChart';
import BarChart from './BarChart';

type Miembro = { id: string; nombre: string; plan: string; estado: 'Activo' | 'Vencido'; telefono?: string };

export const Miembros: React.FC = () => {
  const [query, setQuery] = useState('');
  const [filterPlan, setFilterPlan] = useState<'Todos' | string>('Todos');
  const [members, setMembers] = useState<Miembro[]>([
    { id: 'm1', nombre: 'Ana Torres', plan: 'Premium', estado: 'Activo', telefono: '50498765432' },
    { id: 'm2', nombre: 'Luis Gómez', plan: 'Mensual', estado: 'Vencido', telefono: '50499887766' },
    { id: 'm3', nombre: 'Sofía Díaz', plan: 'Anual', estado: 'Activo', telefono: '50491234567' },
  ]);

  const plans = useMemo(() => {
    const s = new Set<string>(['Todos']);
    members.forEach(m => s.add(m.plan));
    return Array.from(s);
  }, [members]);

  const filtered = members.filter(m => {
    const matchesQuery = m.nombre.toLowerCase().includes(query.toLowerCase());
    const matchesPlan = filterPlan === 'Todos' ? true : m.plan === filterPlan;
    return matchesQuery && matchesPlan;
  });

  const [activeProfile, setActiveProfile] = useState<Miembro | null>(null);
  const counts = {
    activos: members.filter(m => m.estado === 'Activo').length,
    vencidos: members.filter(m => m.estado !== 'Activo').length,
  };

  const handleRenew = (id: string) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, estado: 'Activo' } : m));
  };

  return (
    <div className="page">
      <h2>Miembros</h2>
      <p className="muted">Lista de miembros registrados.</p>

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

        <div className="list-controls">
          <input className="input search-neon" placeholder="Buscar por nombre o ID..." value={query} onChange={e => setQuery(e.target.value)} />
          <select className="input" value={filterPlan} onChange={e => setFilterPlan(e.target.value)}>
            {plans.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="members-metrics" style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <div className="card small" style={{ flex: 1 }}>
          <div className="card-body">
            <h4>Activos vs Vencidos</h4>
            <DonutChart percent={Math.round((counts.activos / Math.max(1, members.length)) * 100)} />
          </div>
        </div>

        <div className="card small" style={{ flex: 2 }}>
          <div className="card-body">
            <h4>Distribución por plan</h4>
            <BarChart values={plans.map(p => members.filter(m => m.plan === p).length)} />
          </div>
        </div>
      </div>

      <div className="card-list" style={{ marginTop: 14 }}>
        {filtered.map(m => (
          <div key={m.id} onClick={() => setActiveProfile(m)}>
            <MemberCard nombre={m.nombre} plan={m.plan} estado={m.estado} telefono={m.telefono} onViewProfile={() => setActiveProfile(m)} onRenew={() => handleRenew(m.id)} />
          </div>
        ))}
      </div>

      {activeProfile && (
        <div className="modal-overlay" onClick={() => setActiveProfile(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{activeProfile.nombre}</h3>
            <p>Plan: {activeProfile.plan}</p>
            <h4>Historial de pagos (mock)</h4>
            <ul>
              <li>2026-02-01 — Pago recibido — 25 USD</li>
              <li>2026-01-01 — Pago recibido — 25 USD</li>
            </ul>
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setActiveProfile(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Miembros;
