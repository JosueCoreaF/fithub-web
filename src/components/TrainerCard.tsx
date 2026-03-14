import React from 'react';
import EditableEntityImage from './EditableEntityImage';

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
  editableImage?: boolean;
}

export const TrainerCard: React.FC<Props> = ({ id, nombre, especialidad, sedeHoy, workload, assignedCount = 0, rating = 0, availability = 'Disponible', onEdit, onDelete, onViewSchedule, editableImage = false }) => {
  const safeName = nombre.trim() || 'Entrenador';
  const shortId = id ? `${id.slice(0, 8)}...` : '—';
  const initials = safeName.split(' ').map(n => n[0]).slice(0,2).join('');
  const normalizedAvailability = availability.replace(/\s+/g,'').toLowerCase();

  return (
    <article className="trainer-card detailed">
      <div className="trainer-card-top">
        <div className="trainer-left">
          {id ? (
            <EditableEntityImage
              kind="trainer"
              entityId={id}
              alt={`Foto de ${safeName}`}
              fallback={initials}
              variant="square"
              className="trainer-image-editor"
              editable={editableImage}
            />
          ) : (
            <div className="avatar trainer-avatar">{initials}</div>
          )}
          <div className="trainer-info">
            <span className="trainer-kicker">Perfil</span>
            <strong title={safeName}>{safeName}</strong>
            <div className="muted trainer-subline">
              <span>{especialidad}</span>
              <span className="muted-id" title={id || 'Sin ID'}>ID: {shortId}</span>
            </div>
          </div>
        </div>
        <div className={`availability ${normalizedAvailability}`}>{availability}</div>
      </div>

      <div className="trainer-facts-grid">
        <div className="trainer-fact-card">
          <span>Sede</span>
          <strong>{sedeHoy || 'Sin sede'}</strong>
        </div>
        <div className="trainer-fact-card">
          <span>Carga semanal</span>
          <strong>{workload} clases</strong>
        </div>
        <div className="trainer-fact-card">
          <span>Clientes</span>
          <strong>{assignedCount}</strong>
        </div>
        <div className="trainer-fact-card">
          <span>Valoración</span>
          <strong className="rating">{'★'.repeat(Math.round(rating))}{'☆'.repeat(5-Math.round(rating))}</strong>
        </div>
      </div>

      <div className="trainer-actions">
        {onViewSchedule && <button className="btn small" onClick={onViewSchedule}>Ver horario</button>}
        {onEdit && <button className="btn small ghost" onClick={onEdit}>Editar</button>}
        {onDelete && <button className="btn small ghost trainer-delete" onClick={onDelete}>Eliminar</button>}
      </div>
    </article>
  );
};

export default TrainerCard;
