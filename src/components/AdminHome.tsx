import React from 'react';
import StatCard from './StatCard';
import AreaChartNeon from './AreaChartNeon';
import DonutChart from './DonutChart';
import BarChart from './BarChart';

export const AdminHome: React.FC = () => {
  const members = '1,248';
  const reservasHoy = '87';
  const clases = '14';

  const dataMensual = [
    { name: 'Ene', reservas: 45 },
    { name: 'Feb', reservas: 52 },
    { name: 'Mar', reservas: 48 },
    { name: 'Abr', reservas: 70 },
    { name: 'May', reservas: 65 },
    { name: 'Jun', reservas: 58 },
  ];
  const week = [40, 55, 28, 72, 60, 90, 50];

  return (
    <div>
      <header className="dashboard-header">
        <h2>Panel de administrador</h2>
        <div className="header-actions">
          <button className="cta-button">Nuevo servicio</button>
        </div>
      </header>

      <section className="dashboard-grid">
          <div className="left-col">
            <div className="card horizontal">
              <div className="card-body">
                <div className="cards-row">
                  <StatCard title="Miembros" value={members} small="Activos" />
                  <StatCard title="Reservas hoy" value={reservasHoy} small="En curso" />
                  <StatCard title="Clases" value={clases} small="Disponibles" />
                </div>

                <div className="chart-wrap">
                  <h3>Tendencia de Reservas</h3>
                  <AreaChartNeon data={dataMensual} />
                </div>
              </div>
            </div>

            <div className="card small-cards">
              <div className="card-body">
                <div className="small-grid">
                  <div className="small-item">
                    <h4>Retención</h4>
                    <DonutChart percent={76} />
                  </div>
                  <div className="small-item">
                    <h4>Actividad semanal</h4>
                    <BarChart values={week} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="right-col">
            <div className="card">
              <div className="card-body">
                <h3>Resumen rápido</h3>
                <ul className="summary-list">
                  <li>Miembros nuevos: 24</li>
                  <li>Pagos pendientes: 6</li>
                  <li>Clases llenas: 2</li>
                </ul>
              </div>
            </div>

            <div className="card">
              <div className="card-body">
                <h3>Actividad reciente</h3>
                <ol className="activity-list">
                  <li>Reserva creada — Juan Pérez</li>
                  <li>Pago recibido — María López</li>
                  <li>Clase cancelada — Sala A</li>
                </ol>
              </div>
            </div>
          </aside>
        </section>
    </div>
  );
};

export default AdminHome;
