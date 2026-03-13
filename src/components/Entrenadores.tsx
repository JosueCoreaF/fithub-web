import React, { useState, useMemo } from 'react';
import TrainerCard from './TrainerCard';
import BarChart from './BarChart';
import DonutChart from './DonutChart';

type Trainer = { id: string; nombre: string; especialidad: string; sedeHoy?: string; workload: number };

export const Entrenadores: React.FC = () => {
  const [trainers, setTrainers] = useState<Trainer[]>([
    { id: 'e1', nombre: 'Pedro Salinas', especialidad: 'Fuerza', sedeHoy: 'Multiplaza', workload: 5 },
    { id: 'e2', nombre: 'Laura Mendez', especialidad: 'Yoga', sedeHoy: 'City Mall', workload: 3 },
    { id: 'e3', nombre: 'Diego Cano', especialidad: 'Cardio', sedeHoy: 'Centro', workload: 4 },
  ]);

  const [openForm, setOpenForm] = useState(false);
  const [name, setName] = useState('');
  const [spec, setSpec] = useState('');
  const [sede, setSede] = useState('Centro');

  const handleAdd = () => {
    const t: Trainer = { id: `t${Date.now()}`, nombre: name || 'Nuevo', especialidad: spec || 'General', sedeHoy: sede, workload: 0 };
    setTrainers(prev => [t, ...prev]);
    setOpenForm(false);
    setName(''); setSpec('');
  };

  const workloads = useMemo(() => trainers.map(t => t.workload), [trainers]);
  const totalWork = workloads.reduce((a,b) => a+b, 0);

  const busiest = trainers.reduce((max, t) => t.workload > max.workload ? t : max, trainers[0]);

  const [scheduleOpen, setScheduleOpen] = useState<Trainer | null>(null);
  const [editing, setEditing] = useState<Trainer | null>(null);

  const handleDelete = (id: string) => {
    setTrainers(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="page">
      <h2>Entrenadores</h2>
      <p className="muted">Equipo de entrenadores disponibles.</p>

      <div className="trainers-hero">
        <div className="hero-left">
          <div className="card small">
            <div className="card-body">
              <h4>Carga semanal total</h4>
              <div className="metric-large">{totalWork} clases</div>
            </div>
          </div>
        </div>
        <div className="hero-right">
          <div className="card small">
            <div className="card-body">
              <h4>Distribución de carga</h4>
              <BarChart values={workloads} />
            </div>
          </div>
          <div className="card small">
            <div className="card-body">
              <h4>Entrenador más ocupado</h4>
              <div className="muted">{busiest?.nombre}</div>
              <DonutChart percent={Math.round((busiest?.workload||0) / Math.max(1, totalWork) * 100)} />
            </div>
          </div>
        </div>
      </div>

      <div className="card-list">
        {trainers.map(t => (
          <TrainerCard
            key={t.id}
            id={t.id}
            nombre={t.nombre}
            especialidad={t.especialidad}
            sedeHoy={t.sedeHoy}
            workload={t.workload}
            assignedCount={Math.max(0, Math.floor(Math.random()*10))}
            rating={Math.round((Math.random()*4 + 1))*1}
            availability={['Disponible','En Clase','Fuera de Horario'][Math.floor(Math.random()*3)]}
            onViewSchedule={() => setScheduleOpen(t)}
            onEdit={() => setEditing(t)}
            onDelete={() => handleDelete(t.id)}
          />
        ))}

        <article className="add-card floating-add" onClick={() => setOpenForm(true)}>
          <div className="plus">+</div>
          <div>Agregar Entrenador</div>
        </article>
      </div>

      {openForm && (
        <div className="modal-overlay" onClick={() => setOpenForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Agregar entrenador</h3>
            <input className="input" placeholder="Nombre" value={name} onChange={e => setName(e.target.value)} />
            <input className="input" placeholder="Especialidad" value={spec} onChange={e => setSpec(e.target.value)} />
            <select className="input" value={sede} onChange={e => setSede(e.target.value)}>
              <option>Centro</option>
              <option>Multiplaza</option>
              <option>City Mall</option>
            </select>
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={handleAdd}>Crear</button>
              <button className="btn ghost" onClick={() => setOpenForm(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Editar entrenador</h3>
            <input className="input" defaultValue={editing.nombre} />
            <input className="input" defaultValue={editing.especialidad} />
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setEditing(null)}>Guardar</button>
              <button className="btn ghost" onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {scheduleOpen && (
        <div className="modal-overlay" onClick={() => setScheduleOpen(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Horario — {scheduleOpen.nombre}</h3>
            <p className="muted">(Mock) Agenda semanal:</p>
            <ul>
              <li>Lun 08:00 - 10:00 — Spinning</li>
              <li>Mar 12:00 - 13:00 — Yoga</li>
              <li>Mié 18:00 - 19:00 — Entrenamiento Personal</li>
            </ul>
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setScheduleOpen(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Entrenadores;
