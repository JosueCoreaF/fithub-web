import React, { useEffect, useMemo, useState } from 'react';
import DonutChart from './DonutChart';
import { downloadCsv } from '../lib/export';
import { type HuespedView } from '../lib/api';
import { useHotelData } from '../context/HotelDataContext';

export const Huespedes: React.FC = () => {
	const [query, setQuery] = useState('');
	const [filterCity, setFilterCity] = useState<'Todas' | string>('Todas');
	const { data, loading, error } = useHotelData();
	const guests = data?.huespedesView ?? [];
	const [activeProfile, setActiveProfile] = useState<HuespedView | null>(null);
	const distributionColors = ['#06b6d4', '#7c3aed', '#06d6a0', '#ff7ab6', '#f59e0b', '#38bdf8'];

	const formatDate = (value?: string) => {
		if (!value) return 'N/D';
		return new Date(value).toLocaleDateString('es-HN');
	};

	const shortId = (value: string) => value.slice(0, 8);

	const cities = useMemo(() => {
		const values = new Set<string>(['Todas']);
		guests.forEach((guest) => {
			if (guest.ciudad) values.add(guest.ciudad);
		});
		return Array.from(values).sort((left, right) => {
			if (left === 'Todas') return -1;
			if (right === 'Todas') return 1;
			return left.localeCompare(right, 'es');
		});
	}, [guests]);

	const cityDistribution = useMemo(() => {
		const counts = new Map<string, number>();
		guests.forEach((guest) => {
			const label = guest.ciudad || 'Sin ciudad';
			counts.set(label, (counts.get(label) ?? 0) + 1);
		});

		return Array.from(counts.entries())
			.sort(([, left], [, right]) => right - left)
			.map(([label, value], index) => ({
				label,
				value,
				color: distributionColors[index % distributionColors.length],
			}));
	}, [guests]);

	const maxDistributionCount = useMemo(
		() => Math.max(1, ...cityDistribution.map((segment) => segment.value)),
		[cityDistribution],
	);

	const filteredGuests = guests.filter((guest) => {
		const normalizedQuery = query.toLowerCase();
		const matchesQuery = guest.nombre.toLowerCase().includes(normalizedQuery) || guest.id.toLowerCase().includes(normalizedQuery);
		const matchesCity = filterCity === 'Todas' ? true : guest.ciudad === filterCity;
		return matchesQuery && matchesCity;
	});

	const counts = {
		conCobros: guests.filter((guest) => guest.pagos.length > 0).length,
		sinCobros: guests.filter((guest) => guest.pagos.length === 0).length,
	};

	useEffect(() => {
		if (!activeProfile) return;
		const updatedProfile = guests.find((guest) => guest.id === activeProfile.id) ?? null;
		setActiveProfile(updatedProfile);
	}, [guests, activeProfile?.id]);

	const handleExportGuests = () => {
		downloadCsv(filteredGuests, [
			{ header: 'ID', value: (guest) => guest.id },
			{ header: 'Huesped', value: (guest) => guest.nombre },
			{ header: 'Correo', value: (guest) => guest.correo },
			{ header: 'Telefono', value: (guest) => guest.telefono ?? '' },
			{ header: 'Ciudad', value: (guest) => guest.ciudad },
			{ header: 'Estado', value: (guest) => guest.estado },
			{ header: 'Fecha Registro', value: (guest) => guest.fechaRegistro ? new Date(guest.fechaRegistro).toLocaleDateString('es-HN') : '' },
			{ header: 'Cobros Registrados', value: (guest) => guest.pagos.length },
		], 'huespedes');
	};

	return (
		<div className="page">
			<div className="dashboard-header" style={{ marginBottom: 12 }}>
				<div>
					<h2>Huéspedes</h2>
					<p className="muted">Directorio operativo de huéspedes registrados.</p>
				</div>
				<div className="header-actions">
					<button className="btn ghost" onClick={handleExportGuests} disabled={filteredGuests.length === 0}>
						Exportar CSV
					</button>
				</div>
			</div>
			{error && <p className="muted">{error}</p>}
			{loading && <p className="muted">Cargando huéspedes...</p>}

			<div className="members-header">
				<div className="widgets">
					<div className="widget">
						<div className="widget-title">Con cobros registrados</div>
						<div className="widget-value">{counts.conCobros}</div>
					</div>
					<div className="widget">
						<div className="widget-title">Sin cobros</div>
						<div className="widget-value">{counts.sinCobros}</div>
					</div>
				</div>

				<div className="list-controls members-filters">
					<input className="input search-neon" placeholder="Buscar por huésped o ID..." value={query} onChange={(event) => setQuery(event.target.value)} />
					<select className="input" value={filterCity} onChange={(event) => setFilterCity(event.target.value)}>
						{cities.map((city) => <option key={city} value={city}>{city}</option>)}
					</select>
					<button
						className="btn ghost"
						onClick={() => {
							setQuery('');
							setFilterCity('Todas');
						}}
					>
						Limpiar
					</button>
				</div>
			</div>

			<div className="members-results-bar">
				<span className="muted">{filteredGuests.length} resultados</span>
			</div>

			<div className="members-metrics">
				<div className="card small member-metric-card">
					<div className="card-body">
						<h4>Huespedes con movimiento</h4>
						<DonutChart percent={Math.round((counts.conCobros / Math.max(1, guests.length)) * 100)} />
					</div>
				</div>

				<div className="card small member-metric-card member-distribution-card">
					<div className="card-body member-distribution-body">
						<h4>Distribucion por ciudad</h4>
						{cityDistribution.length > 0 ? (
							<div className="member-distribution-bars">
								{cityDistribution.map((segment) => {
									const percentage = Math.round((segment.value / Math.max(1, guests.length)) * 100);
									const width = Math.max(8, Math.round((segment.value / maxDistributionCount) * 100));

									return (
										<div key={segment.label} className="member-distribution-row">
											<div className="member-distribution-rowHead">
												<div className="member-distribution-labelWrap">
													<span className="member-distribution-dot" style={{ backgroundColor: segment.color }} />
													<span className="member-distribution-label" title={segment.label}>{segment.label}</span>
												</div>
												<span className="muted member-distribution-value">{segment.value} • {percentage}%</span>
											</div>
											<div className="member-distribution-track">
												<div className="member-distribution-fill" style={{ width: `${width}%`, background: `linear-gradient(90deg, ${segment.color}, ${segment.color}cc)` }} />
											</div>
										</div>
									);
								})}
							</div>
						) : (
							<p className="muted">Sin datos de ciudades.</p>
						)}
					</div>
				</div>
			</div>

			<div className="card members-table-card" style={{ marginTop: 14 }}>
				<div className="members-table-scroll">
					<table className="table dark members-table">
						<thead>
							<tr>
								<th>ID</th>
								<th>Huésped</th>
								<th>Estado</th>
								<th>Ciudad</th>
								<th>Cobros</th>
								<th>Acciones</th>
							</tr>
						</thead>
						<tbody>
							{filteredGuests.map((guest) => (
								<tr key={guest.id}>
									<td className="members-table-id">{shortId(guest.id)}</td>
									<td>
										<div className="members-table-nameWrap">
											<strong className="members-table-name" title={guest.nombre}>{guest.nombre}</strong>
											<span className="muted members-table-email" title={guest.correo}>{guest.correo}</span>
										</div>
									</td>
									<td>
										<span className={`member-status ${guest.estado === 'Activo' ? 'active' : 'expired'}`}>{guest.estado}</span>
									</td>
									<td>{guest.ciudad}</td>
									<td>{guest.pagos.length}</td>
									<td>
										<div className="members-table-actions">
											<button className="btn small" onClick={() => setActiveProfile(guest)}>Gestionar</button>
										</div>
									</td>
								</tr>
							))}
							{filteredGuests.length === 0 && (
								<tr>
									<td colSpan={6} className="muted members-table-empty">No hay huéspedes que coincidan con el filtro.</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>

			{activeProfile && (
				<div className="modal-overlay" onClick={() => setActiveProfile(null)}>
					<div className="modal" onClick={(event) => event.stopPropagation()}>
						<h3>{activeProfile.nombre}</h3>
						<div className="member-modal-grid">
							<p>Correo: {activeProfile.correo}</p>
							<p>Ciudad: {activeProfile.ciudad}</p>
							<p>Estado: {activeProfile.estado}</p>
							<p>Cobros registrados: {activeProfile.pagos.length}</p>
							<p>ID: {shortId(activeProfile.id)}</p>
						</div>
						<h4>Historial de cobros</h4>
						<ul>
							{activeProfile.pagos.length > 0 ? activeProfile.pagos.map((payment) => (
								<li key={payment.id}>{formatDate(payment.fecha)} - {payment.metodo} - {payment.monto.toFixed(2)} USD</li>
							)) : <li>Sin pagos asociados.</li>}
						</ul>
						<div className="member-modal-actions" style={{ marginTop: 12 }}>
							{activeProfile.telefono && (
								<a className="btn ghost" href={`https://wa.me/${activeProfile.telefono.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>
							)}
							<button className="btn" onClick={() => setActiveProfile(null)}>Cerrar</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default Huespedes;