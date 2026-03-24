import React, { useMemo, useState } from 'react';
import AreaChartNeon from './AreaChartNeon';
import EditableEntityImage from './EditableEntityImage';
import { createEstadia, createHabitacion, deleteHabitacion, type HabitacionFormInput, type HabitacionView } from '../lib/api';
import { useHotelData } from '../context/HotelDataContext';

const roomTypeLabels: Record<HabitacionFormInput['tipo'], string> = {
	'Clase grupal': 'Estándar',
	Servicio: 'Suite',
};

const roomStatusLabels: Record<HabitacionFormInput['estadoOperativo'], string> = {
	disponible: 'Disponible',
	ocupada: 'Ocupada',
	mantenimiento: 'Mantenimiento',
	bloqueada: 'Bloqueada',
	limpieza: 'Limpieza',
};

const toDateTimeLocalValue = (date: Date) => {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	const hours = `${date.getHours()}`.padStart(2, '0');
	const minutes = `${date.getMinutes()}`.padStart(2, '0');
	return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const buildDefaultStayDates = () => {
	const checkIn = new Date();
	checkIn.setHours(14, 0, 0, 0);
	if (checkIn.getTime() < Date.now()) {
		checkIn.setDate(checkIn.getDate() + 1);
	}
	const checkOut = new Date(checkIn);
	checkOut.setDate(checkOut.getDate() + 1);
	checkOut.setHours(12, 0, 0, 0);
	return {
		checkIn: toDateTimeLocalValue(checkIn),
		checkOut: toDateTimeLocalValue(checkOut),
	};
};

export const Habitaciones: React.FC = () => {
	const { data, loading, error, refresh } = useHotelData();
	const rooms = data?.habitacionesView ?? [];
	const guests = data?.huespedesView ?? [];
	const hotels = data?.hoteles ?? data?.sedes ?? [];
	const staff = data?.personalView ?? [];
	const [filterHotel, setFilterHotel] = useState<string>('Todas');
	const [openCreate, setOpenCreate] = useState(false);
	const [openAssignment, setOpenAssignment] = useState<string | null>(null);
	const [selectedGuestId, setSelectedGuestId] = useState<string>('');
	const [assignmentCheckIn, setAssignmentCheckIn] = useState<string>(() => buildDefaultStayDates().checkIn);
	const [assignmentCheckOut, setAssignmentCheckOut] = useState<string>(() => buildDefaultStayDates().checkOut);
	const [assignmentNotes, setAssignmentNotes] = useState<string>('');
	const [actionMessage, setActionMessage] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [form, setForm] = useState<HabitacionFormInput>({
		codigo: '',
		nombre: '',
		descripcion: '',
		tipo: 'Clase grupal',
		hotelId: '',
		responsableId: '',
		horario: toDateTimeLocalValue(new Date()),
		piso: 1,
		cupoMaximo: 10,
		costo: 0,
		estadoOperativo: 'disponible',
	});

	const availableHotels = useMemo(() => {
		const values = new Set<string>(['Todas']);
		rooms.forEach((room) => values.add(room.hotel));
		return Array.from(values);
	}, [rooms]);

	const upcomingAvailability = useMemo(
		() => rooms
			.slice()
			.sort((left, right) => new Date(left.fechaISO).getTime() - new Date(right.fechaISO).getTime())
			.slice(0, 8)
			.map((room) => ({
				id: room.id,
				habitacion: room.nombre,
				fecha: new Date(room.fechaISO).toLocaleString('es-HN'),
				hotel: room.hotel,
			})),
		[rooms],
	);

	const demandSeries = useMemo(() => {
		const counts = new Array(24).fill(0);
		rooms.forEach((room) => {
			const hour = new Date(room.fechaISO).getHours();
			counts[hour] += room.inscritos;
		});
		return counts;
	}, [rooms]);

	const getRoomStatus = (room: HabitacionView) => {
		const ratio = (room.inscritos / room.capacidad) * 100;
		if (room.inscritos >= room.capacidad) return 'OCUPADA';
		if (ratio >= 90) return 'ALTA DEMANDA';
		return 'DISPONIBLE';
	};

	const peakHourIndex = demandSeries.reduce((best, value, index, values) => value > values[best] ? index : best, 0);
	const mostDemanded = rooms.reduce((current, candidate) => candidate.inscritos > current.inscritos ? candidate : current, rooms[0] ?? null);

	const openAssignmentModal = (roomId: string) => {
		const defaults = buildDefaultStayDates();
		setOpenAssignment(roomId);
		setSelectedGuestId(guests[0]?.id ?? '');
		setAssignmentCheckIn(defaults.checkIn);
		setAssignmentCheckOut(defaults.checkOut);
		setAssignmentNotes('');
	};

	const validateRoomForm = () => {
		if (!form.codigo.trim()) return 'El código de la habitación es obligatorio.';
		if (!/^[A-Za-z0-9-]+$/.test(form.codigo.trim())) return 'El código solo puede incluir letras, números y guiones.';
		if (form.nombre.trim().length < 3) return 'El nombre de la habitación debe tener al menos 3 caracteres.';
		if (form.descripcion.trim().length < 3) return 'La descripción debe tener al menos 3 caracteres.';
		if (!form.hotelId) return 'Selecciona el hotel al que pertenece la habitación.';
		if (!form.horario) return 'Indica la fecha de alta o disponibilidad inicial.';
		if (!Number.isInteger(form.piso) || form.piso < 0) return 'El piso debe ser un número entero igual o mayor que 0.';
		if (!Number.isInteger(form.cupoMaximo) || form.cupoMaximo < 1) return 'La capacidad debe ser un número entero mayor que 0.';
		if (form.costo < 0) return 'La tarifa no puede ser negativa.';
		return null;
	};

	return (
		<div className="page">
			<h2>Habitaciones</h2>
			<p className="muted">Inventario operativo de habitaciones y disponibilidad por hotel.</p>
			{error && <p className="muted">{error}</p>}
			{loading && <p className="muted">Cargando habitaciones...</p>}
			{actionMessage && <p className="muted">{actionMessage}</p>}
			{actionError && <p className="muted">{actionError}</p>}

			<div className="header-actions" style={{ marginBottom: 12 }}>
				<button className="cta-button" onClick={() => setOpenCreate(true)}>Nueva habitación</button>
			</div>

			<div className="sede-controls">
				<div className="sede-tabs">
					{availableHotels.map((hotel) => (
						<button key={hotel} className={`sede-tab ${filterHotel === hotel ? 'active' : ''}`} onClick={() => setFilterHotel(hotel)}>{hotel}</button>
					))}
				</div>
			</div>

			<section className="service-grid">
				{rooms.filter((room) => filterHotel === 'Todas' ? true : room.hotel === filterHotel).map((room) => {
					const percent = Math.round((room.inscritos / room.capacidad) * 100);
					const status = getRoomStatus(room);
					const cardClass = status === 'OCUPADA' ? 'agotado' : status === 'ALTA DEMANDA' ? 'ultimos-cupos' : 'disponible';
					const isFull = room.inscritos >= room.capacidad;
					return (
						<article key={room.id} className={`service-card ${cardClass}`}>
							<EditableEntityImage
								kind="habitacion"
								entityId={room.id}
								alt={`Imagen de ${room.nombre}`}
								fallback={room.nombre.slice(0, 2).toUpperCase()}
								variant="banner"
								className="service-image-editor"
							/>
							<div className="card-top">
								<div className="service-name">{room.nombre}</div>
								<div className={`state-pill ${isFull ? 'danger' : percent >= 90 ? 'warn' : 'ok'}`}>{status}</div>
							</div>

							<div className="service-meta">
								<div className="meta-left">
									<div className="meta-line"><strong>Responsable:</strong> {room.responsable}</div>
									<div className="meta-line"><strong>Hotel:</strong> {room.hotel}</div>
									<div className="meta-line"><strong>Disponibilidad:</strong> {new Date(room.fechaISO).toLocaleString('es-HN')}</div>
								</div>
								<div className="meta-right">
									<div className="price">{room.costo}</div>
								</div>
							</div>

							<div className="capacity">
								<div className="cap-label">Ocupación: {room.inscritos}/{room.capacidad}</div>
								<div className="progress-outer">
									<div className="progress-inner" style={{ width: `${percent}%` }} data-percent={percent}></div>
								</div>
							</div>

							<div className="card-actions">
								{!isFull ? (
									<button className="btn" onClick={() => openAssignmentModal(room.id)}>Asignar huésped</button>
								) : (
									<button className="btn ghost" disabled>Sin disponibilidad</button>
								)}
								<button className="btn ghost" onClick={async () => {
									if (!window.confirm(`Eliminar la unidad ${room.nombre}?`)) return;
									setActionError(null);
									setActionMessage(null);
									try {
										await deleteHabitacion(room.id);
										await refresh();
										setActionMessage('Unidad eliminada.');
									} catch (deleteError) {
										setActionError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar la unidad.');
									}
								}}>Eliminar</button>
							</div>
						</article>
					);
				})}
			</section>

			{openAssignment && (
				<div className="modal-overlay" onClick={() => setOpenAssignment(null)}>
					<div className="modal" onClick={(event) => event.stopPropagation()}>
						<h3>Asignar huésped</h3>
						<select className="input" value={selectedGuestId} onChange={(event) => setSelectedGuestId(event.target.value)}>
							{guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.nombre} - {guest.estado}</option>)}
						</select>
						<input className="input" type="datetime-local" value={assignmentCheckIn} onChange={(event) => setAssignmentCheckIn(event.target.value)} />
						<input className="input" type="datetime-local" value={assignmentCheckOut} min={assignmentCheckIn} onChange={(event) => setAssignmentCheckOut(event.target.value)} />
						<textarea className="input" placeholder="Observaciones de la estadía" value={assignmentNotes} onChange={(event) => setAssignmentNotes(event.target.value)} rows={3} style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box' }} />
						<div style={{ marginTop: 12 }}>
							<button className="btn" onClick={async () => {
								if (!selectedGuestId) return;
								if (new Date(assignmentCheckOut).getTime() <= new Date(assignmentCheckIn).getTime()) {
									setActionError('La fecha de salida debe ser posterior al check-in.');
									return;
								}
								setSubmitting(true);
								setActionError(null);
								setActionMessage(null);
								try {
									await createEstadia({
										huespedId: selectedGuestId,
										habitacionId: openAssignment,
										estado: 'confirmada',
										checkIn: new Date(assignmentCheckIn).toISOString(),
										checkOut: new Date(assignmentCheckOut).toISOString(),
										observaciones: assignmentNotes.trim() || undefined,
									});
									await refresh();
									setActionMessage('Reserva registrada correctamente.');
									setOpenAssignment(null);
									setAssignmentNotes('');
								} catch (assignmentError) {
									setActionError(assignmentError instanceof Error ? assignmentError.message : 'No se pudo crear la reserva.');
								} finally {
									setSubmitting(false);
								}
							}} disabled={submitting}>{submitting ? 'Guardando...' : 'Confirmar'}</button>
							<button className="btn ghost" onClick={() => setOpenAssignment(null)}>Cancelar</button>
						</div>
					</div>
				</div>
			)}

			{openCreate && (
				<div className="modal-overlay" onClick={() => setOpenCreate(false)}>
					<div className="modal" onClick={(event) => event.stopPropagation()}>
						<h3>Nueva habitación</h3>
						<input className="input" placeholder="Código interno de la habitación" value={form.codigo} onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value.toUpperCase() }))} />
						<input className="input" placeholder="Nombre de la habitación" value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} />
						<input className="input" placeholder="Descripción comercial" value={form.descripcion} onChange={(event) => setForm((current) => ({ ...current, descripcion: event.target.value }))} />
						<select className="input" value={form.tipo} onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value as HabitacionFormInput['tipo'] }))}>
							<option value="Clase grupal">{roomTypeLabels['Clase grupal']}</option>
							<option value="Servicio">{roomTypeLabels.Servicio}</option>
						</select>
						<select className="input" value={form.hotelId} onChange={(event) => setForm((current) => ({ ...current, hotelId: event.target.value }))}>
							<option value="">Selecciona hotel</option>
							{hotels.map((hotel) => <option key={hotel.id_sede} value={hotel.id_sede}>{hotel.nombre_sede}</option>)}
						</select>
						<select className="input" value={form.responsableId} onChange={(event) => setForm((current) => ({ ...current, responsableId: event.target.value }))}>
							<option value="">Selecciona responsable</option>
							{staff.map((member) => <option key={member.id} value={member.id}>{member.nombre}</option>)}
						</select>
						<select className="input" value={form.estadoOperativo} onChange={(event) => setForm((current) => ({ ...current, estadoOperativo: event.target.value as HabitacionFormInput['estadoOperativo'] }))}>
							{Object.entries(roomStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
						</select>
						<input className="input" type="datetime-local" value={form.horario} onChange={(event) => setForm((current) => ({ ...current, horario: event.target.value }))} />
						<input className="input" type="number" min="0" step="1" value={form.piso} onChange={(event) => setForm((current) => ({ ...current, piso: Number(event.target.value) }))} />
						<input className="input" type="number" min="1" value={form.cupoMaximo} onChange={(event) => setForm((current) => ({ ...current, cupoMaximo: Number(event.target.value) }))} />
						<input className="input" type="number" min="0" step="0.01" value={form.costo} onChange={(event) => setForm((current) => ({ ...current, costo: Number(event.target.value) }))} />
						<div style={{ marginTop: 12 }}>
							<button className="btn" onClick={async () => {
								const validationError = validateRoomForm();
								if (validationError) {
									setActionError(validationError);
									return;
								}
								setSubmitting(true);
								setActionError(null);
								setActionMessage(null);
								try {
									await createHabitacion({ ...form, horario: new Date(form.horario).toISOString() });
									await refresh();
									setActionMessage('Habitación registrada correctamente.');
									setOpenCreate(false);
									setForm({ codigo: '', nombre: '', descripcion: '', tipo: 'Clase grupal', hotelId: '', responsableId: '', horario: toDateTimeLocalValue(new Date()), piso: 1, cupoMaximo: 10, costo: 0, estadoOperativo: 'disponible' });
								} catch (createError) {
									setActionError(createError instanceof Error ? createError.message : 'No se pudo crear la habitación.');
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
				<h3>Próximas disponibilidades</h3>
				<div className="card">
					<table className="table dark">
						<thead>
							<tr>
								<th>Habitación</th>
								<th>Fecha</th>
								<th>Hotel</th>
							</tr>
						</thead>
						<tbody>
							{upcomingAvailability.map((room) => (
								<tr key={room.id}>
									<td>{room.habitacion}</td>
									<td>{room.fecha}</td>
									<td>{room.hotel}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			<section className="metrics">
				<h3>Métricas de demanda — Franjas con mayor ocupación</h3>
				<div className="card metrics-row">
					<div className="metrics-chart">
						<AreaChartNeon data={demandSeries.map((value, index) => ({ name: `${String(index).padStart(2, '0')}:00`, reservas: value }))} />
					</div>
					<div className="metrics-info">
						<div>Hora pico: {String(peakHourIndex).padStart(2, '0')}:00</div>
						<div>Habitación más solicitada: {mostDemanded?.nombre ?? 'Sin datos'}</div>
					</div>
				</div>
			</section>
		</div>
	);
};

export default Habitaciones;