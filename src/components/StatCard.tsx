import React from 'react';

interface Props { title: string; value: string; small?: string }

export const StatCard: React.FC<Props> = ({ title, value, small }) => {
  return (
    <div className="stat-card">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{value}</div>
      {small && <div className="stat-small">{small}</div>}
    </div>
  );
};

export default StatCard;
