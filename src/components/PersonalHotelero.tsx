import React, { useMemo, useState } from 'react';
import TrainerCard from './TrainerCard';
import DonutChart from './DonutChart';
import { createPersonal, deletePersonal, updatePersonal, type PersonalFormInput, type PersonalView } from '../lib/api';
import { useHotelData } from '../context/HotelDataContext';

export const PersonalHotelero: React.FC = () => {
	const { data, loading, error, refresh } = useHotelData();
	const staff = data?.personalView ?? [];
	const personas = data?.personas ?? [];
	const [openForm, setOpenForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	const [actionMessage, setActionMessage] = useState<string | null>(null);
	const [scheduleOpen, setScheduleOpen] = useState<PersonalView | null>(null);
	const [form, setForm] = useState<PersonalFormInput>({
		nombre: '',
		correo: '',
		fechaNacimiento: '1990-01-01',
		especialidad: '',
		estadoLaboral: 'Activo',
	});

	const workloads = useMemo(() => staff.map((member) => member.workload), [staff]);
	const totalWork = workloads.reduce((left, right) => left + right, 0);
	const availableCount = staff.filter((member) => member.availability === 'Disponible').length;
	const uniqueSpecialties = new Set(staff.map((member) => member.especialidad)).size;
	const averageLoad = staff.length > 0 ? (totalWork / staff.length).toFixed(1) : '0.0';
	const workloadRanking = useMemo(
		() => [...staff].sort((left, right) => right.workload - left.workload).slice(0, 5),
		[staff],
	);
	const topWorkload = Math.max(1, ...workloadRanking.map((member) => member.workload));
	const busiest = staff.length > 0 ? staff.reduce((current, candidate) => candidate.workload > current.workload ? candidate : current, staff[0]) : null;

	const startCreate = () => {
		setEditingId(null);
		setForm({ nombre: '', correo: '', fechaNacimiento: '1990-01-01', especialidad: '', estadoLaboral: 'Activo' });
		setActionError(null);
		setOpenForm(true);
	};

	const startEdit = (member: PersonalView) => {
		const persona = personas.find((item) => item.id_persona === member.id);
		setEditingId(member.id);
		setForm({
			nombre: member.nombre,
			correo: persona?.correo ?? '',
			fechaNacimiento: persona?.fecha_nacimiento ?? '1990-01-01',
			especialidad: member.especialidad,
			estadoLaboral: member.estadoLaboral,
		});
		setActionError(null);
		setOpenForm(true);
	};

	const handleSubmit = async () => {
		setSaving(true);
		setActionError(null);
		setActionMessage(null);
		try {
			if (editingId) {
				await updatePersonal(editingId, form);
				setActionMessage('Miembro del personal actualizado.');
			} else {
				await createPersonal(form);
				setActionMessage('Miembro del personal creado.');
			}
			await refresh();
			setOpenForm(false);
		} catch (submitError) {
			setActionError(submitError instanceof Error ? submitError.message : 'No se pudo guardar el registro del personal.');
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (member: PersonalView) => {
		if (!window.confirm(`Eliminar a ${member.nombre} del personal?`)) return;
		setActionError(null);
		setActionMessage(null);
		try {
			await deletePersonal(member.id);
			await refresh();
			setActionMessage('Miembro del personal eliminado.');
		} catch (deleteError) {
			setActionError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar el registro del personal.');
		}
	};

	return (
		<div className="page">
			<div className="trainers-page-head">
				<div>
					<h2>Personal</h2>
					<p className="muted">Equipo operativo responsable de hoteles, reservas e inventario.</p>
				</div>
				<button className="cta-button trainers-cta" onClick={startCreate}>Agregar personal</button>
			</div>
			{error && <p className="muted">{error}</p>}
			{loading && <p className="muted">Cargando personal...</p>}
			{actionMessage && <p className="muted">{actionMessage}</p>}
			{actionError && <p className="muted">{actionError}</p>}

			<div className="trainers-hero">
				<div className="hero-left">
					<div className="card trainers-overview-card">
						<div className="trainers-overview-top">
							<div>
								<span className="trainers-eyebrow">Vista general</span>
								<h3>Carga semanal del equipo</h3>
							</div>
							<div className="trainers-overview-total">{totalWork} bloques</div>
						</div>

						<div className="trainers-overview-stats">
							<div className="trainers-mini-stat">
								<span>Personal activo</span>
								<strong>{staff.length}</strong>
							</div>
							<div className="trainers-mini-stat">
								<span>Disponibles ahora</span>
								<strong>{availableCount}</strong>
							</div>
							<div className="trainers-mini-stat">
								<span>Áreas</span>
								<strong>{uniqueSpecialties}</strong>
							</div>
							<div className="trainers-mini-stat">
								<span>Promedio semanal</span>
								<strong>{averageLoad}</strong>
							</div>
						</div>

						<div className="trainers-load-board">
							<div className="trainers-load-head">
								<h4>Distribución de carga</h4>
								<span className="muted">Top del personal por bloques asignados</span>
							</div>
							{workloadRanking.length > 0 ? workloadRanking.map((member) => {
								const width = Math.max(10, Math.round((member.workload / topWorkload) * 100));

								return (
									<div key={member.id} className="trainers-load-row">
										<div className="trainers-load-rowHead">
											<div className="trainers-load-nameWrap">
												<strong title={member.nombre}>{member.nombre}</strong>
												<span>{member.especialidad}</span>
											</div>
											<span className="trainers-load-value">{member.workload} bloques</span>
										</div>
										<div className="trainers-load-track">
											<div className="trainers-load-fill" style={{ width: `${width}%` }} />
										</div>
									</div>
								);
							}) : <p className="muted">Sin carga asignada.</p>}
						</div>
					</div>
				</div>
				<div className="hero-right">
					<div className="card trainers-spotlight-card">
						<div className="card-body trainers-spotlight-body">
							<span className="trainers-eyebrow">Spotlight</span>
							<h4>Responsable con mayor carga</h4>
							<div className="trainers-spotlight-name">{busiest?.nombre ?? 'Sin datos'}</div>
							<div className="muted">{busiest?.especialidad ?? 'Sin área'} · {busiest?.sedeHoy ?? 'Sin hotel'}</div>
							<DonutChart percent={Math.round((busiest?.workload || 0) / Math.max(1, totalWork) * 100)} />
							<div className="trainers-spotlight-footer">
								<span>{busiest?.workload ?? 0} bloques esta semana</span>
								<span>{busiest?.assignedCount ?? 0} reservas</span>
							</div>
						</div>
					</div>

					<div className="card trainers-pulse-card">
						<div className="card-body trainers-pulse-body">
							<h4>Pulso del equipo</h4>
							<div className="trainers-pulse-list">
								<div className="trainers-pulse-item">
									<span>Disponibilidad</span>
									<strong>{availableCount}/{staff.length || 1}</strong>
								</div>
								<div className="trainers-pulse-item">
									<span>Cobertura semanal</span>
									<strong>{totalWork} bloques</strong>
								</div>
								<div className="trainers-pulse-item">
									<span>Promedio por responsable</span>
									<strong>{averageLoad}</strong>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div className="trainers-roster-head">
				<div>
					<h3>Equipo operativo</h3>
					<p className="muted">Tarjetas con disponibilidad, carga y acceso a acciones rápidas.</p>
				</div>
			</div>

			<div className="card-list trainers-grid">
				{staff.map((member) => (
					<TrainerCard
						key={member.id}
						id={member.id}
						nombre={member.nombre}
						especialidad={member.especialidad}
						sedeHoy={member.sedeHoy}
						workload={member.workload}
						assignedCount={member.assignedCount}
						rating={member.rating}
						availability={member.availability}
						onViewSchedule={() => setScheduleOpen(member)}
						onEdit={() => startEdit(member)}
						onDelete={() => handleDelete(member)}
						editableImage
					/>
				))}
				<article className="add-card floating-add trainer-add-card" onClick={startCreate}>
					<div className="plus">+</div>
					<div>
						<strong>Agregar personal</strong>
						<p className="muted">Crea un nuevo perfil y asígnalo al equipo.</p>
					</div>
				</article>
			</div>

			{openForm && (
				<div className="modal-overlay" onClick={() => setOpenForm(false)}>
					<div className="modal" onClick={(event) => event.stopPropagation()}>
						<h3>{editingId ? 'Editar personal' : 'Agregar personal'}</h3>
						<input className="input" placeholder="Nombre" value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} />
						<input className="input" placeholder="Correo" value={form.correo} onChange={(event) => setForm((current) => ({ ...current, correo: event.target.value }))} />
						<input className="input" type="date" value={form.fechaNacimiento} onChange={(event) => setForm((current) => ({ ...current, fechaNacimiento: event.target.value }))} />
						<input className="input" placeholder="Área operativa" value={form.especialidad} onChange={(event) => setForm((current) => ({ ...current, especialidad: event.target.value }))} />
						<select className="input" value={form.estadoLaboral} onChange={(event) => setForm((current) => ({ ...current, estadoLaboral: event.target.value }))}>
							<option value="Activo">Activo</option>
							<option value="Inactivo">Inactivo</option>
							<option value="Vacaciones">Vacaciones</option>
						</select>
						<div style={{ marginTop: 12 }}>
							<button className="btn" onClick={handleSubmit} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
							<button className="btn ghost" onClick={() => setOpenForm(false)}>Cancelar</button>
						</div>
					</div>
				</div>
			)}

			{scheduleOpen && (
				<div className="modal-overlay" onClick={() => setScheduleOpen(null)}>
					<div className="modal" onClick={(event) => event.stopPropagation()}>
						<h3>Agenda operativa — {scheduleOpen.nombre}</h3>
						<p className="muted">Agenda obtenida desde la programación operativa actual:</p>
						<ul>
							{scheduleOpen.schedule.length > 0 ? scheduleOpen.schedule.map((item) => (
								<li key={item.id}>{new Date(item.horario).toLocaleString('es-HN')} - {item.actividad} - {item.sede}</li>
							)) : <li>Sin bloques asignados.</li>}
						</ul>
						<div style={{ marginTop: 12 }}>
							<button className="btn" onClick={() => setScheduleOpen(null)}>Cerrar</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default PersonalHotelero;