// src/App.tsx
import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter as Router, Navigate, Routes, Route } from 'react-router-dom';

import { useAuth, AuthProvider, type UserRole } from './context/AuthContext';
import { HotelDataProvider } from './context/HotelDataContext';
import { UIProvider } from './context/UIContext';


const AuthPage = lazy(() => import('./components/AuthPage'));
const DashboardLayout = lazy(() => import('./components/DashboardLayout'));
const AdminHome = lazy(() => import('./components/AdminHome'));
const Habitaciones = lazy(() => import('./components/Habitaciones'));
const Reservas = lazy(() => import('./components/Reservas'));
const Pagos = lazy(() => import('./components/Pagos'));
const Tarifas = lazy(() => import('./components/Tarifas'));
const Usuarios = lazy(() => import('./components/Usuarios'));
const Huespedes = lazy(() => import('./components/Huespedes'));
const PersonalHotelero = lazy(() => import('./components/PersonalHotelero'));
const Hoteles = lazy(() => import('./components/Hoteles'));
const PerfilUsuario = lazy(() => import('./components/PerfilUsuario'));
const SuperAdminAccesos = lazy(() => import('./components/SuperAdminAccesos'));

const HOTEL_CONSOLE_ROLES: UserRole[] = ['admin', 'super_admin'];

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
		<HotelDataProvider>
			<DashboardLayout />
		</HotelDataProvider>
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

	if (!HOTEL_CONSOLE_ROLES.includes(role)) {
		return <Navigate to="/perfil" replace />;
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
								<Route path="habitaciones" element={<RoleGate allowedRoles={HOTEL_CONSOLE_ROLES}><Habitaciones /></RoleGate>} />
								<Route path="reservas" element={<RoleGate allowedRoles={HOTEL_CONSOLE_ROLES}><Reservas /></RoleGate>} />
								<Route path="pagos" element={<RoleGate allowedRoles={HOTEL_CONSOLE_ROLES}><Pagos /></RoleGate>} />
								<Route path="tarifas" element={<RoleGate allowedRoles={HOTEL_CONSOLE_ROLES}><Tarifas /></RoleGate>} />
								<Route path="usuarios" element={<RoleGate allowedRoles={HOTEL_CONSOLE_ROLES}><Usuarios /></RoleGate>} />
								<Route path="huespedes" element={<RoleGate allowedRoles={HOTEL_CONSOLE_ROLES}><Huespedes /></RoleGate>} />
								<Route path="personal" element={<RoleGate allowedRoles={HOTEL_CONSOLE_ROLES}><PersonalHotelero /></RoleGate>} />
								<Route path="hoteles" element={<RoleGate allowedRoles={HOTEL_CONSOLE_ROLES}><Hoteles /></RoleGate>} />
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