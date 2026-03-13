import React, { useMemo, useState } from 'react';
import LineChart from './LineChart';
import AreaChartNeon from './AreaChartNeon';

type Servicio = {
  id: string;
  nombre: string;
  tipo: string;
  costo: string;
  instructor: string;
  sede: string;
  horario: string;
  capacidad: number;
  inscritos: number;
};

export const Servicios: React.FC = () => {
  const [serviciosState, setServiciosState] = useState<Servicio[]>([
    { id: 's1', nombre: 'Entrenamiento Personal', tipo: 'Uno a uno', costo: '25 USD', instructor: 'Pedro Salinas', sede: 'Centro', horario: '08:00 - 09:00', capacidad: 10, inscritos: 2 },
    { id: 's2', nombre: 'Clase de Yoga', tipo: 'Grupo', costo: '8 USD', instructor: 'Laura Méndez', sede: 'Norte', horario: '10:00 - 11:00', capacidad: 20, inscritos: 18 },
    { id: 's3', nombre: 'Spinning', tipo: 'Grupo', costo: '10 USD', instructor: 'Diego Cano', sede: 'Sur', horario: '18:00 - 19:00', capacidad: 16, inscritos: 15 },
    { id: 's4', nombre: 'Pilates', tipo: 'Grupo', costo: '9 USD', instructor: 'Ana Torres', sede: 'Centro', horario: '12:00 - 13:00', capacidad: 12, inscritos: 12 },
  ]);

  const [upcomingSessions, setUpcomingSessions] = useState([
    { id: 'u1', servicio: 'Spinning', fecha: '2026-03-14 09:00', sede: 'Sur' },
    { id: 'u2', servicio: 'Yoga', fecha: '2026-03-14 11:00', sede: 'Norte' },
    { id: 'u3', servicio: 'Entrenamiento Personal', fecha: '2026-03-15 08:00', sede: 'Centro' },
  ]);

  const [filterSede, setFilterSede] = useState<string>('Todas');
  const [openSignup, setOpenSignup] = useState<string | null>(null);

  const sedes = useMemo(() => {
    const setS = new Set<string>(['Todas']);
    serviciosState.forEach(s => setS.add(s.sede));
    return Array.from(setS);
  }, [serviciosState]);

  // compute demandSeries from upcomingSessions (mock of last 12 periods)
  const demandSeries = useMemo(() => {
    // for demo, aggregate counts per day in upcomingSessions by simple buckets
    const counts = new Array(12).fill(0);
    upcomingSessions.forEach((u, i) => {
      counts[i % 12] += 1;
    });
    return counts;
  }, [upcomingSessions]);

  const getEstado = (s: Servicio) => {
    const ratio = (s.inscritos / s.capacidad) * 100;
    if (s.inscritos >= s.capacidad) return 'AGOTADO';
    if (ratio >= 90) return 'ÚLTIMOS CUPOS';
    return 'DISPONIBLE';
  };

  const handleQuickSignup = (serviceId: string, nombre: string) => {
    setServiciosState(prev => prev.map(s => s.id === serviceId ? { ...s, inscritos: Math.min(s.capacidad, s.inscritos + 1) } : s));
    // add a mock upcoming session/record to update metrics
    const svc = serviciosState.find(s => s.id === serviceId);
    if (svc) {
      setUpcomingSessions(prev => [{ id: `u${Date.now()}`, servicio: svc.nombre, fecha: new Date().toISOString(), sede: svc.sede }, ...prev]);
    }
    setOpenSignup(null);
  };

  return (
    <div className="page">
      <h2>Servicios</h2>
      <p className="muted">Panel de actividades. Tarjetas interactivas con indicador de capacidad.</p>

      <div className="sede-controls">
        <div className="sede-tabs">
          {sedes.map(sd => (
            <button key={sd} className={`sede-tab ${filterSede === sd ? 'active' : ''}`} onClick={() => setFilterSede(sd)}>{sd}</button>
          ))}
        </div>
      </div>

      <section className="service-grid">
        {serviciosState.filter(s => filterSede === 'Todas' ? true : s.sede === filterSede).map(s => {
          const percent = Math.round((s.inscritos / s.capacidad) * 100);
          const estado = getEstado(s);
          const cls = estado === 'AGOTADO' ? 'agotado' : estado === 'ÚLTIMOS CUPOS' ? 'ultimos-cupos' : 'disponible';
          const isFull = s.inscritos >= s.capacidad;
          return (
            <article key={s.id} className={`service-card ${cls}`}>
              <div className="card-top">
                <div className="service-name">{s.nombre}</div>
                <div className={`state-pill ${isFull ? 'danger' : percent >= 90 ? 'warn' : 'ok'}`}>{estado}</div>
              </div>

              <div className="service-meta">
                <div className="meta-left">
                  <div className="meta-line"><strong>Instructor:</strong> {s.instructor}</div>
                  <div className="meta-line"><strong>Sede:</strong> {s.sede}</div>
                  <div className="meta-line"><strong>Horario:</strong> {s.horario}</div>
                </div>
                <div className="meta-right">
                  <div className="price">{s.costo}</div>
                </div>
              </div>

              <div className="capacity">
                <div className="cap-label">Cupo: {s.inscritos}/{s.capacidad}</div>
                <div className="progress-outer">
                  <div className="progress-inner" style={{ width: `${percent}%` }} data-percent={percent}></div>
                </div>
              </div>

              <div className="card-actions">
                {!isFull ? (
                  <>
                    <button className="btn" onClick={() => setOpenSignup(openSignup === s.id ? null : s.id)}>Inscribirse</button>
                    {openSignup === s.id && (
                      <div className="signup-inline">
                        <input placeholder="Nombre" className="input" id={`name-${s.id}`} />
                        <button className="btn" onClick={() => {
                          const el = document.getElementById(`name-${s.id}`) as HTMLInputElement | null;
                          const nombre = el?.value || 'Anónimo';
                          handleQuickSignup(s.id, nombre);
                        }}>Confirmar</button>
                      </div>
                    )}
                  </>
                ) : (
                  <button className="btn ghost" disabled>Completo</button>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section className="upcoming">
        <h3>Próximas sesiones</h3>
        <div className="card">
          <table className="table dark">
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Fecha</th>
                <th>Sede</th>
              </tr>
            </thead>
            <tbody>
              {upcomingSessions.map(u => (
                <tr key={u.id}>
                  <td>{u.servicio}</td>
                  <td>{u.fecha}</td>
                  <td>{u.sede}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

        <section className="metrics">
          <h3>Métricas de demanda — Horas pico</h3>
          <div className="card metrics-row">
            <div className="metrics-chart">
              {/* convertir demandSeries (buckets) a formato para AreaChartNeon */}
              <AreaChartNeon data={demandSeries.map((v,i)=>({ name: `P${i+1}`, reservas: v }))} />
            </div>
            <div className="metrics-info">
              <div>Hora pico: 18:00</div>
              <div>Servicio más solicitado: Spinning</div>
            </div>
          </div>
        </section>
    </div>
  );
};

export default Servicios;
