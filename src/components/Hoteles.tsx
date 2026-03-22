import React, { useMemo, useState } from 'react';
import EditableEntityImage from './EditableEntityImage';
import { useHotelData } from '../context/HotelDataContext';

export const Hoteles: React.FC = () => {
	const { data, loading, error } = useHotelData();
	const hotels = data?.hotelesView ?? [];
	const rooms = data?.habitacionesView ?? [];
	const reservations = data?.reservasView ?? [];
	const staff = data?.personalView ?? [];
	const [query, setQuery] = useState('');
	const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);

	const filteredHotels = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();

		return hotels
			.filter((hotel) => {
				if (!normalizedQuery) return true;
				return hotel.nombre.toLowerCase().includes(normalizedQuery) || hotel.ubicacion.toLowerCase().includes(normalizedQuery);
			})
			.sort((left, right) => right.reservas - left.reservas || right.habitaciones - left.habitaciones);
	}, [query, hotels]);

	const topHotel = useMemo(() => [...hotels].sort((left, right) => right.reservas - left.reservas)[0] ?? null, [hotels]);
	const totalReservations = hotels.reduce((sum, hotel) => sum + hotel.reservas, 0);
	const totalRooms = hotels.reduce((sum, hotel) => sum + hotel.habitaciones, 0);
	const totalStaff = hotels.reduce((sum, hotel) => sum + hotel.personalAsignado, 0);
	const averageReservations = hotels.length > 0 ? Math.round(totalReservations / hotels.length) : 0;

	const selectedHotel = selectedHotelId ? hotels.find((hotel) => hotel.id === selectedHotelId) ?? null : null;

	const selectedHotelDetail = useMemo(() => {
		if (!selectedHotel) return null;

		const hotelRooms = rooms
			.filter((room) => room.hotel === selectedHotel.nombre)
			.slice()
			.sort((left, right) => new Date(left.fechaISO).getTime() - new Date(right.fechaISO).getTime());

		const hotelReservations = reservations
			.filter((reservation) => reservation.hotel === selectedHotel.nombre)
			.slice()
			.sort((left, right) => new Date(right.fecha).getTime() - new Date(left.fecha).getTime());

		const hotelStaff = staff.filter((member) =>
			member.hotelHoy === selectedHotel.nombre || member.schedule.some((item) => item.hotel === selectedHotel.nombre),
		);

		return {
			staff: hotelStaff,
			nextAvailability: hotelRooms.filter((room) => new Date(room.fechaISO) >= new Date()).slice(0, 4),
			recentReservations: hotelReservations.slice(0, 5),
		};
	}, [rooms, reservations, selectedHotel, staff]);

	const getHotelStatus = (roomCount: number, reservationCount: number) => {
		if (reservationCount >= 10 || roomCount >= 5) return 'Alta ocupación';
		if (reservationCount >= 4 || roomCount >= 2) return 'Operación estable';
		return 'Baja ocupación';
	};

	const getHotelStatusClass = (status: string) => {
		if (status === 'Alta ocupación') return 'warn';
		if (status === 'Operación estable') return 'ok';
		return 'muted';
	};

	const formatDateTime = (value: string) => new Date(value).toLocaleString('es-HN');

	return (
		<div className="page">
			<div className="sedes-page-head">
				<div>
					<h2>Hoteles</h2>
					<p className="muted">Vista operativa de propiedades, inventario y cobertura del equipo.</p>
				</div>
			</div>
			{error && <p className="muted">{error}</p>}
			{loading && <p className="muted">Cargando hoteles...</p>}

			<div className="sedes-overview-grid">
				<div className="card sedes-overview-card">
					<span className="sedes-kicker">Resumen</span>
					<h3>Red de hoteles</h3>
					<div className="sedes-overview-stats">
						<div className="sedes-mini-stat">
							<span>Total hoteles</span>
							<strong>{hotels.length}</strong>
						</div>
						<div className="sedes-mini-stat">
							<span>Reservas acumuladas</span>
							<strong>{totalReservations}</strong>
						</div>
						<div className="sedes-mini-stat">
							<span>Unidades activas</span>
							<strong>{totalRooms}</strong>
						</div>
						<div className="sedes-mini-stat">
							<span>Personal asignado</span>
							<strong>{totalStaff}</strong>
						</div>
					</div>
				</div>

				<div className="card sedes-highlight-card">
					<span className="sedes-kicker">Top hotel</span>
					<h3>{topHotel?.nombre ?? 'Sin datos'}</h3>
					<p className="muted">{topHotel?.ubicacion ?? 'Sin ubicación registrada'}</p>
					<div className="sedes-highlight-metrics">
						<span>{topHotel?.reservas ?? 0} reservas</span>
						<span>{topHotel?.habitaciones ?? 0} unidades</span>
					</div>
					<div className="sedes-highlight-status">Promedio por hotel: {averageReservations} reservas</div>
				</div>
			</div>

			<div className="sedes-toolbar">
				<input
					className="input search-neon"
					placeholder="Buscar por hotel o ubicación..."
					value={query}
					onChange={(event) => setQuery(event.target.value)}
				/>
				<div className="muted sedes-results">{filteredHotels.length} hoteles visibles</div>
			</div>

			<div className="card members-table-card">
				<div className="members-table-scroll">
					<table className="table dark sedes-table">
						<thead>
							<tr>
								<th>Hotel</th>
								<th>Ubicación</th>
								<th>Estado</th>
								<th>Unidades</th>
								<th>Personal</th>
								<th>Reservas</th>
								<th>Acciones</th>
							</tr>
						</thead>
						<tbody>
							{filteredHotels.map((hotel) => {
								const status = getHotelStatus(hotel.habitaciones, hotel.reservas);

								return (
									<tr key={hotel.id}>
										<td>
											<div className="sedes-name-wrap">
												<EditableEntityImage
													kind="hotel"
													entityId={hotel.id}
													alt={`Foto de ${hotel.nombre}`}
													fallback={hotel.nombre.slice(0, 2).toUpperCase()}
													variant="square"
													className="sede-table-image"
												/>
												<strong>{hotel.nombre}</strong>
											</div>
										</td>
										<td>{hotel.ubicacion}</td>
										<td><span className={`sedes-status ${getHotelStatusClass(status)}`}>{status}</span></td>
										<td>{hotel.habitaciones}</td>
										<td>{hotel.personalAsignado}</td>
										<td>{hotel.reservas}</td>
										<td>
											<button className="btn small" onClick={() => setSelectedHotelId(hotel.id)}>Ver detalle</button>
										</td>
									</tr>
								);
							})}
							{!loading && filteredHotels.length === 0 && (
								<tr>
									<td colSpan={7} className="muted members-table-empty">No hay hoteles que coincidan con la búsqueda.</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>

			{selectedHotel && selectedHotelDetail && (
				<div className="modal-overlay" onClick={() => setSelectedHotelId(null)}>
					<div className="modal sedes-modal" onClick={(event) => event.stopPropagation()}>
						<div className="sedes-modal-head">
							<div>
								<EditableEntityImage
									kind="hotel"
									entityId={selectedHotel.id}
									alt={`Foto de ${selectedHotel.nombre}`}
									fallback={selectedHotel.nombre.slice(0, 2).toUpperCase()}
									variant="banner"
									className="sede-modal-image"
								/>
								<h3>{selectedHotel.nombre}</h3>
								<p className="muted">{selectedHotel.ubicacion}</p>
							</div>
							<span className={`sedes-status ${getHotelStatusClass(getHotelStatus(selectedHotel.habitaciones, selectedHotel.reservas))}`}>
								{getHotelStatus(selectedHotel.habitaciones, selectedHotel.reservas)}
							</span>
						</div>

						<div className="sedes-modal-grid">
							<div className="sedes-modal-card">
								<h4>Indicadores</h4>
								<div className="sede-stats">
									<div className="muted"><span>Unidades:</span> <strong>{selectedHotel.habitaciones}</strong></div>
									<div className="muted"><span>Personal:</span> <strong>{selectedHotel.personalAsignado}</strong></div>
									<div className="muted"><span>Reservas:</span> <strong>{selectedHotel.reservas}</strong></div>
									<div className="muted"><span>Próximas disponibilidades:</span> <strong>{selectedHotelDetail.nextAvailability.length}</strong></div>
								</div>
							</div>

							<div className="sedes-modal-card">
								<h4>Personal asignado</h4>
								<ul>
									{selectedHotelDetail.staff.length > 0 ? selectedHotelDetail.staff.map((member) => (
										<li key={member.id}>{member.nombre} · {member.especialidad}</li>
									)) : <li>Sin personal vinculado.</li>}
								</ul>
							</div>

							<div className="sedes-modal-card">
								<h4>Próximas disponibilidades</h4>
								<ul>
									{selectedHotelDetail.nextAvailability.length > 0 ? selectedHotelDetail.nextAvailability.map((room) => (
										<li key={room.id}>{formatDateTime(room.fechaISO)} · {room.nombre}</li>
									)) : <li>Sin disponibilidad próxima.</li>}
								</ul>
							</div>

							<div className="sedes-modal-card">
								<h4>Reservas recientes</h4>
								<ul>
									{selectedHotelDetail.recentReservations.length > 0 ? selectedHotelDetail.recentReservations.map((reservation) => (
										<li key={reservation.id}>{reservation.huesped} · {reservation.habitacion} · {formatDateTime(reservation.fecha)}</li>
									)) : <li>Sin reservas recientes.</li>}
								</ul>
							</div>
						</div>

						<div className="member-modal-actions" style={{ marginTop: 16 }}>
							<button className="btn" onClick={() => setSelectedHotelId(null)}>Cerrar</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default Hoteles;