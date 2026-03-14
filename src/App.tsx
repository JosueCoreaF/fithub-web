// src/App.tsx
import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter as Router, Navigate, Routes, Route } from 'react-router-dom';

import { useAuth, AuthProvider, type UserRole } from './context/AuthContext';
import { GymDataProvider } from './context/GymDataContext';
import { UIProvider } from './context/UIContext';

const AuthPage = lazy(() => import('./components/AuthPage'));
const DashboardLayout = lazy(() => import('./components/DashboardLayout'));
const AdminHome = lazy(() => import('./components/AdminHome'));
const ClientHome = lazy(() => import('./components/ClientHome'));
const Servicios = lazy(() => import('./components/Servicios'));
const Reservas = lazy(() => import('./components/Reservas'));
const Pagos = lazy(() => import('./components/Pagos'));
const MembresiaCliente = lazy(() => import('./components/MembresiaCliente'));
const Usuarios = lazy(() => import('./components/Usuarios'));
const Miembros = lazy(() => import('./components/Miembros'));
const Entrenadores = lazy(() => import('./components/Entrenadores'));
const Sedes = lazy(() => import('./components/Sedes'));
const PerfilUsuario = lazy(() => import('./components/PerfilUsuario'));
const SuperAdminAccesos = lazy(() => import('./components/SuperAdminAccesos'));

const RouteFallback = () => <div className="auth-boot">Cargando módulo...</div>;

function ProtectedApp() {
	const { session, loading } = useAuth();

	if (loading) {
		return <div className="auth-boot">Validando acceso...</div>;
	}

	if (!session) {
		return <Navigate to="/auth" replace />;
	}

	return (
		<GymDataProvider>
			<DashboardLayout />
		</GymDataProvider>
	);
}

function RoleGate({ children, allowedRoles }: { children: ReactNode; allowedRoles: UserRole[] }) {
	const { loading, session, role } = useAuth();

	if (loading) {
		return <div className="auth-boot">Validando permisos...</div>;
	}

	if (!session) {
		return <Navigate to="/auth" replace />;
	}

	if (!allowedRoles.includes(role)) {
		return <Navigate to="/" replace />;
	}

	return <>{children}</>;
}

function HomeRoute() {
	const { role } = useAuth();

	if (role === 'client') {
		return <ClientHome />;
	}

	return <AdminHome />;
}

function App() {
	return (
		<AuthProvider>
			<UIProvider>
				<Router>
					<Suspense fallback={<RouteFallback />}>
						<Routes>
							<Route path="/auth" element={<AuthPage />} />
							<Route path="/" element={<ProtectedApp />}>
								<Route index element={<HomeRoute />} />
								<Route path="servicios" element={<RoleGate allowedRoles={['admin', 'super_admin']}><Servicios /></RoleGate>} />
								<Route path="reservas" element={<Reservas />} />
								<Route path="pagos" element={<RoleGate allowedRoles={['client', 'admin', 'super_admin']}><Pagos /></RoleGate>} />
								<Route path="membresia" element={<RoleGate allowedRoles={['client']}><MembresiaCliente /></RoleGate>} />
								<Route path="usuarios" element={<RoleGate allowedRoles={['admin', 'super_admin']}><Usuarios /></RoleGate>} />
								<Route path="miembros" element={<RoleGate allowedRoles={['admin', 'super_admin']}><Miembros /></RoleGate>} />
								<Route path="entrenadores" element={<RoleGate allowedRoles={['admin', 'super_admin']}><Entrenadores /></RoleGate>} />
								<Route path="sedes" element={<RoleGate allowedRoles={['admin', 'super_admin']}><Sedes /></RoleGate>} />
								<Route path="accesos" element={<RoleGate allowedRoles={['super_admin']}><SuperAdminAccesos /></RoleGate>} />
								<Route path="perfil" element={<PerfilUsuario />} />
							</Route>
							<Route path="*" element={<Navigate to="/" replace />} />
						</Routes>
					</Suspense>
				</Router>
			</UIProvider>
		</AuthProvider>
	);
}

export default App;