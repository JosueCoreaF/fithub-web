import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import HelpAssistant from './HelpAssistant';
import NotificationCenter from './NotificationCenter';
import SessionWatchdog from './SessionWatchdog';
import { useUI, type ThemeMode } from '../context/UIContext';
import { useAuth } from '../context/AuthContext';

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Panel', subtitle: 'Resumen operativo del gimnasio.' },
  '/servicios': { title: 'Servicios', subtitle: 'Sesiones, cupos y demanda actual.' },
  '/reservas': { title: 'Reservas', subtitle: 'Seguimiento diario de reservas y ocupación.' },
  '/pagos': { title: 'Pagos', subtitle: 'Caja operativa, cobros registrados y seguimiento de ingresos.' },
  '/membresia': { title: 'Membresía', subtitle: 'Estado del plan, vigencia y cobertura de pagos.' },
  '/usuarios': { title: 'Usuarios', subtitle: 'Perfiles operativos y configuracion base de la operacion.' },
  '/miembros': { title: 'Miembros', subtitle: 'Gestión de membresías y actividad de clientes.' },
  '/entrenadores': { title: 'Entrenadores', subtitle: 'Carga semanal, disponibilidad y equipo.' },
  '/sedes': { title: 'Sedes', subtitle: 'Cobertura, actividad y detalle por ubicación.' },
  '/accesos': { title: 'Accesos', subtitle: 'Gestión de roles y cuentas con privilegios elevados.' },
  '/perfil': { title: 'Perfil', subtitle: 'Identidad, preferencias y ajustes internos para administradores.' },
};

const themes: Array<{ value: ThemeMode; label: string }> = [
  { value: 'midnight', label: 'Midnight' },
  { value: 'slate', label: 'Slate' },
  { value: 'paper', label: 'Paper' },
];

export const DashboardLayout: React.FC = () => {
  const location = useLocation();
  const { role } = useAuth();
  const {
    theme,
    setTheme,
    sidebarCollapsed,
    toggleSidebarCollapsed,
    mobileSidebarOpen,
    openMobileSidebar,
    closeMobileSidebar,
  } = useUI();

  const currentPage = React.useMemo(() => {
    if (role === 'super_admin' && location.pathname === '/pagos') {
      return { title: 'Ingresos', subtitle: 'Visión ejecutiva de ventas, cobranza y flujo registrado.' };
    }

    if (role === 'client' && location.pathname === '/') {
      return { title: 'Mi panel', subtitle: 'Tus reservas, membresía y próximos entrenamientos.' };
    }

    if (role === 'client' && location.pathname === '/reservas') {
      return { title: 'Mis reservas', subtitle: 'Seguimiento de clases reservadas, estado y próximos horarios.' };
    }

    if (role === 'client' && location.pathname === '/pagos') {
      return { title: 'Mis pagos', subtitle: 'Historial de cobros, estado de membresía y movimientos vinculados a tu cuenta.' };
    }

    if (role === 'client' && location.pathname === '/membresia') {
      return { title: 'Mi membresía', subtitle: 'Cobertura pagada, vigencia del plan y actividad vinculada a tu cuenta.' };
    }

    if (role === 'client' && location.pathname === '/perfil') {
      return { title: 'Mi perfil', subtitle: 'Tus datos personales, preferencias y estado de membresía.' };
    }

    if (role === 'trainer' && location.pathname === '/') {
      return { title: 'Mi panel', subtitle: 'Agenda, alumnos y pendientes de tu jornada.' };
    }

    if (role === 'trainer' && location.pathname === '/reservas') {
      return { title: 'Mi agenda', subtitle: 'Sesiones asignadas, reservas y ocupación del día.' };
    }

    if (role === 'trainer' && location.pathname === '/perfil') {
      return { title: 'Mi perfil', subtitle: 'Identidad, disponibilidad y ajustes de trabajo.' };
    }

    return pageMeta[location.pathname] ?? { title: 'FitHub', subtitle: 'Administración central.' };
  }, [location.pathname, role]);
  const roleLabel = role === 'super_admin' ? 'Super admin' : role === 'admin' ? 'Admin' : role === 'trainer' ? 'Entrenador' : 'Cliente';

  return (
    <div className={`dashboard-root ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar collapsed={sidebarCollapsed} mobileOpen={mobileSidebarOpen} onCloseMobile={closeMobileSidebar} onToggleCollapse={toggleSidebarCollapsed} />
      <div className="dashboard-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button className="topbar-iconButton mobile-only" onClick={openMobileSidebar} aria-label="Abrir navegación">
              Menu
            </button>
            <div className="topbar-heading">
              <span className="topbar-kicker">{role === 'client' ? 'FitHub Cliente' : role === 'super_admin' ? 'FitHub Dirección' : 'FitHub Admin'}</span>
              <strong>{currentPage.title}</strong>
              <span>{currentPage.subtitle}</span>
            </div>
          </div>

          <div className="topbar-right">
            <NotificationCenter />
            <span className="topbar-role-pill">{roleLabel}</span>
            <nav className="theme-switcher" aria-label="Seleccionar tema">
              {themes.map((option) => (
                <button
                  key={option.value}
                  className={`theme-chip ${theme === option.value ? 'active' : ''}`}
                  onClick={() => setTheme(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <div className="dashboard-main">
          <div key={location.pathname} className="dashboard-route-stage">
            <Outlet />
          </div>
        </div>
        <HelpAssistant />
        <SessionWatchdog />
      </div>
    </div>
  );
};

export default DashboardLayout;
