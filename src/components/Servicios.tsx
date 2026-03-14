import React, { useMemo, useState } from 'react';
import AreaChartNeon from './AreaChartNeon';
import EditableEntityImage from './EditableEntityImage';
import { createReservation, createServiceSession, deleteServiceSession, type ServiceFormInput, type ServicioView } from '../lib/api';
import { useGymData } from '../context/GymDataContext';

export const Servicios: React.FC = () => {
  const { data, loading, error, refresh } = useGymData();
  const serviciosState = data?.serviciosView ?? [];
  const miembros = data?.miembrosView ?? [];
  const sedesData = data?.sedes ?? [];
  const entrenadores = data?.entrenadoresView ?? [];
  const [filterSede, setFilterSede] = useState<string>('Todas');
  const [openCreate, setOpenCreate] = useState(false);
  const [openSignup, setOpenSignup] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ServiceFormInput>({
    nombre: '',
    descripcion: '',
    tipo: 'Clase grupal',
    sedeId: '',
    entrenadorId: '',
    horario: '',
    cupoMaximo: 10,
    costo: 0,
  });

  const sedes = useMemo(() => {
    const setS = new Set<string>(['Todas']);
    serviciosState.forEach(s => setS.add(s.sede));
    return Array.from(setS);
  }, [serviciosState]);

  const upcomingSessions = useMemo(
    () => serviciosState
      .slice()
      .sort((a, b) => new Date(a.fechaISO).getTime() - new Date(b.fechaISO).getTime())
      .slice(0, 8)
      .map(item => ({
        id: item.id,
        servicio: item.nombre,
        fecha: new Date(item.fechaISO).toLocaleString('es-HN'),
        sede: item.sede,
      })),
    [serviciosState],
  );

  const demandSeries = useMemo(() => {
    const counts = new Array(24).fill(0);
    serviciosState.forEach((service) => {
      const hour = new Date(service.fechaISO).getHours();
      counts[hour] += service.inscritos;
    });
    return counts;
  }, [serviciosState]);

  const getEstado = (s: ServicioView) => {
    const ratio = (s.inscritos / s.capacidad) * 100;
    if (s.inscritos >= s.capacidad) return 'AGOTADO';
    if (ratio >= 90) return 'ÚLTIMOS CUPOS';
    return 'DISPONIBLE';
  };

  const peakHourIndex = demandSeries.reduce((best, value, index, arr) => value > arr[best] ? index : best, 0);
  const mostDemanded = serviciosState.reduce((best, current) => current.inscritos > best.inscritos ? current : best, serviciosState[0] ?? null);

  return (
    <div className="page">
      <h2>Servicios</h2>
      <p className="muted">Panel de actividades. Tarjetas interactivas con indicador de capacidad.</p>
      {error && <p className="muted">{error}</p>}
      {loading && <p className="muted">Cargando servicios...</p>}
      {actionMessage && <p className="muted">{actionMessage}</p>}
      {actionError && <p className="muted">{actionError}</p>}

      <div className="header-actions" style={{ marginBottom: 12 }}>
        <button className="cta-button" onClick={() => setOpenCreate(true)}>Nueva sesión</button>
      </div>

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
              <EditableEntityImage
                kind="service"
                entityId={s.id}
                alt={`Imagen de ${s.nombre}`}
                fallback={s.nombre.slice(0, 2).toUpperCase()}
                variant="banner"
                className="service-image-editor"
              />
              <div className="card-top">
                <div className="service-name">{s.nombre}</div>
                <div className={`state-pill ${isFull ? 'danger' : percent >= 90 ? 'warn' : 'ok'}`}>{estado}</div>
              </div>

              <div className="service-meta">
                <div className="meta-left">
                  <div className="meta-line"><strong>Instructor:</strong> {s.instructor}</div>
                  <div className="meta-line"><strong>Sede:</strong> {s.sede}</div>
                  <div className="meta-line"><strong>Horario:</strong> {new Date(s.fechaISO).toLocaleString('es-HN')}</div>
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
                  <button className="btn" onClick={() => { setOpenSignup(s.id); setSelectedMemberId(miembros[0]?.id ?? ''); }}>Inscribir miembro</button>
                ) : (
                  <button className="btn ghost" disabled>Completo</button>
                )}
                <button className="btn ghost" onClick={async () => {
                  if (!window.confirm(`Eliminar la sesión ${s.nombre}?`)) return;
                  setActionError(null);
                  setActionMessage(null);
                  try {
                    await deleteServiceSession(s.id);
                    await refresh();
                    setActionMessage('Sesión eliminada.');
                  } catch (deleteError) {
                    setActionError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar la sesión.');
                  }
                }}>Eliminar</button>
              </div>
            </article>
          );
        })}
      </section>

      {openSignup && (
        <div className="modal-overlay" onClick={() => setOpenSignup(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Inscribir en sesión</h3>
            <select className="input" value={selectedMemberId} onChange={e => setSelectedMemberId(e.target.value)}>
              {miembros.map(member => <option key={member.id} value={member.id}>{member.nombre} - {member.plan}</option>)}
            </select>
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={async () => {
                if (!selectedMemberId) return;
                setSubmitting(true);
                setActionError(null);
                setActionMessage(null);
                try {
                  await createReservation({ clienteId: selectedMemberId, actividadId: openSignup, estado: 'confirmada' });
                  await refresh();
                  setActionMessage('Reserva creada correctamente.');
                  setOpenSignup(null);
                } catch (signupError) {
                  setActionError(signupError instanceof Error ? signupError.message : 'No se pudo crear la reserva.');
                } finally {
                  setSubmitting(false);
                }
              }} disabled={submitting}>{submitting ? 'Guardando...' : 'Confirmar'}</button>
              <button className="btn ghost" onClick={() => setOpenSignup(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {openCreate && (
        <div className="modal-overlay" onClick={() => setOpenCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Nueva sesión</h3>
            <input className="input" placeholder="Nombre de actividad" value={form.nombre} onChange={e => setForm(prev => ({ ...prev, nombre: e.target.value }))} />
            <input className="input" placeholder="Descripción" value={form.descripcion} onChange={e => setForm(prev => ({ ...prev, descripcion: e.target.value }))} />
            <select className="input" value={form.tipo} onChange={e => setForm(prev => ({ ...prev, tipo: e.target.value as ServiceFormInput['tipo'] }))}>
              <option value="Clase grupal">Clase grupal</option>
              <option value="Servicio">Servicio</option>
            </select>
            <select className="input" value={form.sedeId} onChange={e => setForm(prev => ({ ...prev, sedeId: e.target.value }))}>
              <option value="">Selecciona sede</option>
              {sedesData.map(sede => <option key={sede.id_sede} value={sede.id_sede}>{sede.nombre_sede}</option>)}
            </select>
            <select className="input" value={form.entrenadorId} onChange={e => setForm(prev => ({ ...prev, entrenadorId: e.target.value }))}>
              <option value="">Selecciona entrenador</option>
              {entrenadores.map(entrenador => <option key={entrenador.id} value={entrenador.id}>{entrenador.nombre}</option>)}
            </select>
            <input className="input" type="datetime-local" value={form.horario} onChange={e => setForm(prev => ({ ...prev, horario: e.target.value }))} />
            <input className="input" type="number" min="1" value={form.cupoMaximo} onChange={e => setForm(prev => ({ ...prev, cupoMaximo: Number(e.target.value) }))} />
            <input className="input" type="number" min="0" step="0.01" value={form.costo} onChange={e => setForm(prev => ({ ...prev, costo: Number(e.target.value) }))} />
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={async () => {
                setSubmitting(true);
                setActionError(null);
                setActionMessage(null);
                try {
                  await createServiceSession({ ...form, horario: new Date(form.horario).toISOString() });
                  await refresh();
                  setActionMessage('Sesión creada correctamente.');
                  setOpenCreate(false);
                  setForm({ nombre: '', descripcion: '', tipo: 'Clase grupal', sedeId: '', entrenadorId: '', horario: '', cupoMaximo: 10, costo: 0 });
                } catch (createError) {
                  setActionError(createError instanceof Error ? createError.message : 'No se pudo crear la sesión.');
                } finally {
                  setSubmitting(false);
                }
              }} disabled={submitting}>{submitting ? 'Guardando...' : 'Crear'}</button>
              <button className="btn ghost" onClick={() => setOpenCreate(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

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
              <AreaChartNeon data={demandSeries.map((v, i) => ({ name: `${String(i).padStart(2, '0')}:00`, reservas: v }))} />
            </div>
            <div className="metrics-info">
              <div>Hora pico: {String(peakHourIndex).padStart(2, '0')}:00</div>
              <div>Servicio más solicitado: {mostDemanded?.nombre ?? 'Sin datos'}</div>
            </div>
          </div>
        </section>
    </div>
  );
};

export default Servicios;
