import React from 'react';

interface Props {
  nombre: string;
  plan: string;
  estado: 'Activo' | 'Vencido' | string;
  telefono?: string;
  onViewProfile?: () => void;
  onRenew?: () => void;
}

export const MemberCard: React.FC<Props> = ({ nombre, plan, estado, telefono, onViewProfile, onRenew }) => {
  const initials = nombre
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('');

  return (
    <article className={`member-card ${estado === 'Activo' ? 'active' : 'expired'}`}>
      <div className="member-avatar">{initials}</div>
      <div className="member-info">
        <h4 className="member-name">{nombre}</h4>
        <div className="member-plan">Plan: {plan}</div>
      </div>

      <div className="member-actions">
        <span className={`member-status ${estado === 'Activo' ? 'active' : 'expired'}`}>{estado}</span>
        <button className="btn small" onClick={onViewProfile}>Ver Perfil</button>
      </div>

      <div className="quick-menu">
        {estado !== 'Activo' && (
          <button className="btn icon" title="Renovar" onClick={(e) => { e.stopPropagation(); onRenew && onRenew(); }}>Renovar</button>
        )}
        {telefono && (
          <a className="btn icon" title="WhatsApp" href={`https://wa.me/${telefono.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>WhatsApp</a>
        )}
      </div>
    </article>
  );
};

export default MemberCard;

