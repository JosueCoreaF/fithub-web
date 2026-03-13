// src/App.tsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import { DashboardLayout } from './components/DashboardLayout';
import { AdminHome } from './components/AdminHome';
import { Servicios } from './components/Servicios';
import { Reservas } from './components/Reservas';
import { Miembros } from './components/Miembros';
import { Entrenadores } from './components/Entrenadores';
import { Sedes } from './components/Sedes';

function App() {
	return (
		<Router>
			<Routes>
				<Route path="/" element={<DashboardLayout />}>
					<Route index element={<AdminHome />} />
					<Route path="servicios" element={<Servicios />} />
					<Route path="reservas" element={<Reservas />} />
					<Route path="miembros" element={<Miembros />} />
					<Route path="entrenadores" element={<Entrenadores />} />
					<Route path="sedes" element={<Sedes />} />
				</Route>
			</Routes>
		</Router>
	);
}

export default App;