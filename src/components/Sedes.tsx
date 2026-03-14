import React, { useMemo, useState } from 'react';
import EditableEntityImage from './EditableEntityImage';
import { useGymData } from '../context/GymDataContext';

export const Sedes: React.FC = () => {
  const { data, loading, error } = useGymData();
  const sedes = data?.sedesView ?? [];
  const servicios = data?.serviciosView ?? [];
  const reservas = data?.reservasView ?? [];
  const entrenadores = data?.entrenadoresView ?? [];
  const [query, setQuery] = useState('');
  const [selectedSedeId, setSelectedSedeId] = useState<string | null>(null);

  const filteredSedes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sedes
      .filter((sede) => {
        if (!normalizedQuery) return true;
        return sede.nombre.toLowerCase().includes(normalizedQuery) || sede.ubicacion.toLowerCase().includes(normalizedQuery);
      })
      .sort((left, right) => right.reservas - left.reservas || right.actividades - left.actividades);
  }, [query, sedes]);

  const topSede = useMemo(() => [...sedes].sort((left, right) => right.reservas - left.reservas)[0] ?? null, [sedes]);
  const totalReservas = sedes.reduce((sum, sede) => sum + sede.reservas, 0);
  const totalActividades = sedes.reduce((sum, sede) => sum + sede.actividades, 0);
  const totalEntrenadores = sedes.reduce((sum, sede) => sum + sede.entrenadores, 0);
  const averageReservations = sedes.length > 0 ? Math.round(totalReservas / sedes.length) : 0;

  const selectedSede = selectedSedeId ? sedes.find((sede) => sede.id === selectedSedeId) ?? null : null;

  const selectedSedeDetail = useMemo(() => {
    if (!selectedSede) return null;

    const sedeServices = servicios
      .filter((service) => service.sede === selectedSede.nombre)
      .slice()
      .sort((left, right) => new Date(left.fechaISO).getTime() - new Date(right.fechaISO).getTime());

    const sedeReservations = reservas
      .filter((reserva) => reserva.sede === selectedSede.nombre)
      .slice()
      .sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime());

    const sedeTrainers = entrenadores.filter((trainer) =>
      trainer.sedeHoy === selectedSede.nombre || trainer.schedule.some((item) => item.sede === selectedSede.nombre),
    );

    return {
      trainers: sedeTrainers,
      nextSessions: sedeServices.filter((service) => new Date(service.fechaISO) >= new Date()).slice(0, 4),
      recentReservations: sedeReservations.slice(0, 5),
    };
  }, [entrenadores, reservas, selectedSede, servicios]);

  const getSedeStatus = (actividades: number, reservasCount: number) => {
    if (reservasCount >= 10 || actividades >= 5) return 'Alta demanda';
    if (reservasCount >= 4 || actividades >= 2) return 'Balanceada';
    return 'Baja actividad';
  };

  const getSedeStatusClass = (status: string) => {
    if (status === 'Alta demanda') return 'warn';
    if (status === 'Balanceada') return 'ok';
    return 'muted';
  };

  const formatDateTime = (value: string) => new Date(value).toLocaleString('es-HN');

  return (
    <div className="page">
      <div className="sedes-page-head">
        <div>
          <h2>Sedes</h2>
          <p className="muted">Vista operativa de ubicaciones, actividad y cobertura del equipo.</p>
        </div>
      </div>
      {error && <p className="muted">{error}</p>}
      {loading && <p className="muted">Cargando sedes...</p>}

      <div className="sedes-overview-grid">
        <div className="card sedes-overview-card">
          <span className="sedes-kicker">Resumen</span>
          <h3>Red de sedes</h3>
          <div className="sedes-overview-stats">
            <div className="sedes-mini-stat">
              <span>Total sedes</span>
              <strong>{sedes.length}</strong>
            </div>
            <div className="sedes-mini-stat">
              <span>Reservas acumuladas</span>
              <strong>{totalReservas}</strong>
            </div>
            <div className="sedes-mini-stat">
              <span>Actividades activas</span>
              <strong>{totalActividades}</strong>
            </div>
            <div className="sedes-mini-stat">
              <span>Entrenadores asignados</span>
              <strong>{totalEntrenadores}</strong>
            </div>
          </div>
        </div>

        <div className="card sedes-highlight-card">
          <span className="sedes-kicker">Top sede</span>
          <h3>{topSede?.nombre ?? 'Sin datos'}</h3>
          <p className="muted">{topSede?.ubicacion ?? 'Sin ubicación registrada'}</p>
          <div className="sedes-highlight-metrics">
            <span>{topSede?.reservas ?? 0} reservas</span>
            <span>{topSede?.actividades ?? 0} actividades</span>
          </div>
          <div className="sedes-highlight-status">Promedio por sede: {averageReservations} reservas</div>
        </div>
      </div>

      <div className="sedes-toolbar">
        <input
          className="input search-neon"
          placeholder="Buscar por sede o ubicación..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="muted sedes-results">{filteredSedes.length} sedes visibles</div>
      </div>

      <div className="card members-table-card">
        <div className="members-table-scroll">
          <table className="table dark sedes-table">
            <thead>
              <tr>
                <th>Sede</th>
                <th>Ubicación</th>
                <th>Estado</th>
                <th>Actividades</th>
                <th>Entrenadores</th>
                <th>Reservas</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredSedes.map((sede) => {
                const status = getSedeStatus(sede.actividades, sede.reservas);

                return (
                  <tr key={sede.id}>
                    <td>
                      <div className="sedes-name-wrap">
                        <EditableEntityImage
                          kind="sede"
                          entityId={sede.id}
                          alt={`Foto de ${sede.nombre}`}
                          fallback={sede.nombre.slice(0, 2).toUpperCase()}
                          variant="square"
                          className="sede-table-image"
                        />
                        <strong>{sede.nombre}</strong>
                      </div>
                    </td>
                    <td>{sede.ubicacion}</td>
                    <td><span className={`sedes-status ${getSedeStatusClass(status)}`}>{status}</span></td>
                    <td>{sede.actividades}</td>
                    <td>{sede.entrenadores}</td>
                    <td>{sede.reservas}</td>
                    <td>
                      <button className="btn small" onClick={() => setSelectedSedeId(sede.id)}>Ver detalle</button>
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredSedes.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted members-table-empty">No hay sedes que coincidan con la búsqueda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSede && selectedSedeDetail && (
        <div className="modal-overlay" onClick={() => setSelectedSedeId(null)}>
          <div className="modal sedes-modal" onClick={(event) => event.stopPropagation()}>
            <div className="sedes-modal-head">
              <div>
                <EditableEntityImage
                  kind="sede"
                  entityId={selectedSede.id}
                  alt={`Foto de ${selectedSede.nombre}`}
                  fallback={selectedSede.nombre.slice(0, 2).toUpperCase()}
                  variant="banner"
                  className="sede-modal-image"
                />
                <h3>{selectedSede.nombre}</h3>
                <p className="muted">{selectedSede.ubicacion}</p>
              </div>
              <span className={`sedes-status ${getSedeStatusClass(getSedeStatus(selectedSede.actividades, selectedSede.reservas))}`}>
                {getSedeStatus(selectedSede.actividades, selectedSede.reservas)}
              </span>
            </div>

            <div className="sedes-modal-grid">
              <div className="sedes-modal-card">
                <h4>Indicadores</h4>
                <div className="sede-stats">
                  <div className="muted"><span>Actividades:</span> <strong>{selectedSede.actividades}</strong></div>
                  <div className="muted"><span>Entrenadores:</span> <strong>{selectedSede.entrenadores}</strong></div>
                  <div className="muted"><span>Reservas:</span> <strong>{selectedSede.reservas}</strong></div>
                  <div className="muted"><span>Próximas sesiones:</span> <strong>{selectedSedeDetail.nextSessions.length}</strong></div>
                </div>
              </div>

              <div className="sedes-modal-card">
                <h4>Entrenadores asignados</h4>
                <ul>
                  {selectedSedeDetail.trainers.length > 0 ? selectedSedeDetail.trainers.map((trainer) => (
                    <li key={trainer.id}>{trainer.nombre} · {trainer.especialidad}</li>
                  )) : <li>Sin entrenadores vinculados.</li>}
                </ul>
              </div>

              <div className="sedes-modal-card">
                <h4>Próximas sesiones</h4>
                <ul>
                  {selectedSedeDetail.nextSessions.length > 0 ? selectedSedeDetail.nextSessions.map((service) => (
                    <li key={service.id}>{formatDateTime(service.fechaISO)} · {service.nombre}</li>
                  )) : <li>Sin sesiones próximas.</li>}
                </ul>
              </div>

              <div className="sedes-modal-card">
                <h4>Reservas recientes</h4>
                <ul>
                  {selectedSedeDetail.recentReservations.length > 0 ? selectedSedeDetail.recentReservations.map((reservation) => (
                    <li key={reservation.id}>{reservation.cliente} · {reservation.servicio} · {formatDateTime(reservation.fecha)}</li>
                  )) : <li>Sin reservas recientes.</li>}
                </ul>
              </div>
            </div>

            <div className="member-modal-actions" style={{ marginTop: 16 }}>
              <button className="btn" onClick={() => setSelectedSedeId(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sedes;
