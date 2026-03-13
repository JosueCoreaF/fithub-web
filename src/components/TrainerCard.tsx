import React from 'react';

interface Props {
  id?: string;
  nombre: string;
  especialidad: string;
  sedeHoy?: string;
  workload: number; // clases asignadas en la semana
  assignedCount?: number;
  rating?: number; // 0-5
  availability?: 'Disponible' | 'En Clase' | 'Fuera de Horario' | string;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewSchedule?: () => void;
}

export const TrainerCard: React.FC<Props> = ({ id, nombre, especialidad, sedeHoy, workload, assignedCount = 0, rating = 0, availability = 'Disponible', onEdit, onDelete, onViewSchedule }) => {
  const initials = nombre.split(' ').map(n => n[0]).slice(0,2).join('');
  return (
    <article className="trainer-card detailed">
      <div className="trainer-left">
        <div className="avatar">{initials}</div>
        <div className="trainer-info">
          <strong>{nombre}</strong>
          <div className="muted">{especialidad} — <span className="muted-id">ID: {id || '—'}</span></div>
        </div>
      </div>

      <div className="trainer-meta">
        <div className={`availability ${availability.replace(/\s+/g,'').toLowerCase()}`}>{availability}</div>
        <div className="sede-pill">{sedeHoy || '—'}</div>
        <div className="work-badge">{workload} clases/sem</div>
        <div className="assigned-count">{assignedCount} clientes</div>
        <div className="rating">{'★'.repeat(Math.round(rating))}{'☆'.repeat(5-Math.round(rating))}</div>

        <div className="trainer-actions">
          <button className="btn small" onClick={onViewSchedule}>Horario</button>
          <button className="btn small" onClick={onEdit}>✎</button>
          <button className="btn small ghost" onClick={onDelete}>🗑</button>
        </div>
      </div>
    </article>
  );
};

export default TrainerCard;
