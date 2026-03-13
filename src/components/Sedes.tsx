import React from 'react';

export const Sedes: React.FC = () => {
  const sedes = [
    { id: 'sd1', nombre: 'FitHub Centro', ubicacion: 'Av. Principal 123' },
    { id: 'sd2', nombre: 'FitHub Norte', ubicacion: 'Calle Norte 45' },
    { id: 'sd3', nombre: 'FitHub Sur', ubicacion: 'Bulevar Sur 9' },
  ];

  return (
    <div className="page">
      <h2>Sedes</h2>
      <p className="muted">Sedes y ubicaciones.</p>

      <div className="card-list">
        {sedes.map(s => (
          <article key={s.id} className="entity-card">
            <div className="entity-header">
              <strong>{s.nombre}</strong>
            </div>
            <div className="entity-body">
              <div className="muted">{s.ubicacion}</div>
              <div className="actions">
                <button className="btn">Ver</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default Sedes;
