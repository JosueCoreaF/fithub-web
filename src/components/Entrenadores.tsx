import React, { useMemo, useState } from 'react';
import TrainerCard from './TrainerCard';
import DonutChart from './DonutChart';
import { createTrainer, deleteTrainer, updateTrainer, type EntrenadorView, type TrainerFormInput } from '../lib/api';
import { useGymData } from '../context/GymDataContext';

export const Entrenadores: React.FC = () => {
  const { data, loading, error, refresh } = useGymData();
  const trainers = data?.entrenadoresView ?? [];
  const personas = data?.personas ?? [];
  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [form, setForm] = useState<TrainerFormInput>({
    nombre: '',
    correo: '',
    fechaNacimiento: '1990-01-01',
    especialidad: '',
    estadoLaboral: 'Activo',
  });

  const workloads = useMemo(() => trainers.map(t => t.workload), [trainers]);
  const totalWork = workloads.reduce((a,b) => a+b, 0);
  const availableCount = trainers.filter(trainer => trainer.availability === 'Disponible').length;
  const uniqueSpecialties = new Set(trainers.map(trainer => trainer.especialidad)).size;
  const averageLoad = trainers.length > 0 ? (totalWork / trainers.length).toFixed(1) : '0.0';
  const workloadRanking = useMemo(
    () => [...trainers].sort((left, right) => right.workload - left.workload).slice(0, 5),
    [trainers],
  );
  const topWorkload = Math.max(1, ...workloadRanking.map(trainer => trainer.workload));

  const busiest = trainers.length > 0 ? trainers.reduce((max, t) => t.workload > max.workload ? t : max, trainers[0]) : null;

  const [scheduleOpen, setScheduleOpen] = useState<EntrenadorView | null>(null);

  const startCreate = () => {
    setEditingId(null);
    setForm({ nombre: '', correo: '', fechaNacimiento: '1990-01-01', especialidad: '', estadoLaboral: 'Activo' });
    setActionError(null);
    setOpenForm(true);
  };

  const startEdit = (trainer: EntrenadorView) => {
    const persona = personas.find(item => item.id_persona === trainer.id);
    setEditingId(trainer.id);
    setForm({
      nombre: trainer.nombre,
      correo: persona?.correo ?? '',
      fechaNacimiento: persona?.fecha_nacimiento ?? '1990-01-01',
      especialidad: trainer.especialidad,
      estadoLaboral: trainer.estadoLaboral,
    });
    setActionError(null);
    setOpenForm(true);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setActionError(null);
    setActionMessage(null);
    try {
      if (editingId) {
        await updateTrainer(editingId, form);
        setActionMessage('Entrenador actualizado.');
      } else {
        await createTrainer(form);
        setActionMessage('Entrenador creado.');
      }
      await refresh();
      setOpenForm(false);
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : 'No se pudo guardar el entrenador.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (trainer: EntrenadorView) => {
    if (!window.confirm(`Eliminar a ${trainer.nombre}?`)) return;
    setActionError(null);
    setActionMessage(null);
    try {
      await deleteTrainer(trainer.id);
      await refresh();
      setActionMessage('Entrenador eliminado.');
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar el entrenador.');
    }
  };

  return (
    <div className="page">
      <div className="trainers-page-head">
        <div>
          <h2>Entrenadores</h2>
          <p className="muted">Equipo de entrenadores disponibles.</p>
        </div>
        <button className="cta-button trainers-cta" onClick={startCreate}>Agregar entrenador</button>
      </div>
      {error && <p className="muted">{error}</p>}
      {loading && <p className="muted">Cargando entrenadores...</p>}
      {actionMessage && <p className="muted">{actionMessage}</p>}
      {actionError && <p className="muted">{actionError}</p>}

      <div className="trainers-hero">
        <div className="hero-left">
          <div className="card trainers-overview-card">
            <div className="trainers-overview-top">
              <div>
                <span className="trainers-eyebrow">Vista general</span>
                <h3>Carga semanal del equipo</h3>
              </div>
              <div className="trainers-overview-total">{totalWork} clases</div>
            </div>

            <div className="trainers-overview-stats">
              <div className="trainers-mini-stat">
                <span>Entrenadores activos</span>
                <strong>{trainers.length}</strong>
              </div>
              <div className="trainers-mini-stat">
                <span>Disponibles ahora</span>
                <strong>{availableCount}</strong>
              </div>
              <div className="trainers-mini-stat">
                <span>Especialidades</span>
                <strong>{uniqueSpecialties}</strong>
              </div>
              <div className="trainers-mini-stat">
                <span>Promedio semanal</span>
                <strong>{averageLoad}</strong>
              </div>
            </div>

            <div className="trainers-load-board">
              <div className="trainers-load-head">
                <h4>Distribución de carga</h4>
                <span className="muted">Top entrenadores por clases asignadas</span>
              </div>
              {workloadRanking.length > 0 ? workloadRanking.map(trainer => {
                const width = Math.max(10, Math.round((trainer.workload / topWorkload) * 100));

                return (
                  <div key={trainer.id} className="trainers-load-row">
                    <div className="trainers-load-rowHead">
                      <div className="trainers-load-nameWrap">
                        <strong title={trainer.nombre}>{trainer.nombre}</strong>
                        <span>{trainer.especialidad}</span>
                      </div>
                      <span className="trainers-load-value">{trainer.workload} clases</span>
                    </div>
                    <div className="trainers-load-track">
                      <div className="trainers-load-fill" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              }) : <p className="muted">Sin carga asignada.</p>}
            </div>
          </div>
        </div>
        <div className="hero-right">
          <div className="card trainers-spotlight-card">
            <div className="card-body trainers-spotlight-body">
              <span className="trainers-eyebrow">Spotlight</span>
              <h4>Entrenador más ocupado</h4>
              <div className="trainers-spotlight-name">{busiest?.nombre ?? 'Sin datos'}</div>
              <div className="muted">{busiest?.especialidad ?? 'Sin especialidad'} · {busiest?.sedeHoy ?? 'Sin sede'}</div>
              <DonutChart percent={Math.round((busiest?.workload||0) / Math.max(1, totalWork) * 100)} />
              <div className="trainers-spotlight-footer">
                <span>{busiest?.workload ?? 0} clases esta semana</span>
                <span>{busiest?.assignedCount ?? 0} clientes</span>
              </div>
            </div>
          </div>

          <div className="card trainers-pulse-card">
            <div className="card-body trainers-pulse-body">
              <h4>Pulso del equipo</h4>
              <div className="trainers-pulse-list">
                <div className="trainers-pulse-item">
                  <span>Disponibilidad</span>
                  <strong>{availableCount}/{trainers.length || 1}</strong>
                </div>
                <div className="trainers-pulse-item">
                  <span>Cobertura semanal</span>
                  <strong>{totalWork} bloques</strong>
                </div>
                <div className="trainers-pulse-item">
                  <span>Promedio por entrenador</span>
                  <strong>{averageLoad}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="trainers-roster-head">
        <div>
          <h3>Plantilla</h3>
          <p className="muted">Tarjetas con disponibilidad, carga y acceso a acciones rápidas.</p>
        </div>
      </div>

      <div className="card-list trainers-grid">
        {trainers.map(t => (
          <TrainerCard
            key={t.id}
            id={t.id}
            nombre={t.nombre}
            especialidad={t.especialidad}
            sedeHoy={t.sedeHoy}
            workload={t.workload}
            assignedCount={t.assignedCount}
            rating={t.rating}
            availability={t.availability}
            onViewSchedule={() => setScheduleOpen(t)}
            onEdit={() => startEdit(t)}
            onDelete={() => handleDelete(t)}
            editableImage
          />
        ))}
        <article className="add-card floating-add trainer-add-card" onClick={startCreate}>
          <div className="plus">+</div>
          <div>
            <strong>Agregar entrenador</strong>
            <p className="muted">Crea un nuevo perfil y asígnalo al equipo.</p>
          </div>
        </article>
      </div>

      {openForm && (
        <div className="modal-overlay" onClick={() => setOpenForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editingId ? 'Editar entrenador' : 'Agregar entrenador'}</h3>
            <input className="input" placeholder="Nombre" value={form.nombre} onChange={e => setForm(prev => ({ ...prev, nombre: e.target.value }))} />
            <input className="input" placeholder="Correo" value={form.correo} onChange={e => setForm(prev => ({ ...prev, correo: e.target.value }))} />
            <input className="input" type="date" value={form.fechaNacimiento} onChange={e => setForm(prev => ({ ...prev, fechaNacimiento: e.target.value }))} />
            <input className="input" placeholder="Especialidad" value={form.especialidad} onChange={e => setForm(prev => ({ ...prev, especialidad: e.target.value }))} />
            <select className="input" value={form.estadoLaboral} onChange={e => setForm(prev => ({ ...prev, estadoLaboral: e.target.value }))}>
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
              <option value="Vacaciones">Vacaciones</option>
            </select>
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={handleSubmit} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
              <button className="btn ghost" onClick={() => setOpenForm(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {scheduleOpen && (
        <div className="modal-overlay" onClick={() => setScheduleOpen(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Horario — {scheduleOpen.nombre}</h3>
            <p className="muted">Agenda obtenida desde la programación de actividades:</p>
            <ul>
              {scheduleOpen.schedule.length > 0 ? scheduleOpen.schedule.map(item => (
                <li key={item.id}>{new Date(item.horario).toLocaleString('es-HN')} - {item.actividad} - {item.sede}</li>
              )) : <li>Sin clases asignadas.</li>}
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
