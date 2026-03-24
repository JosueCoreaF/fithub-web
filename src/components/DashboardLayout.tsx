import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import HelpAssistant from './HelpAssistant';
import NotificationCenter from './NotificationCenter';
import SessionWatchdog from './SessionWatchdog';
import { useUI, type ThemeMode } from '../context/UIContext';
import { useAuth } from '../context/AuthContext';

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Panel', subtitle: 'Resumen operativo del hotel.' },
  '/habitaciones': { title: 'Habitaciones', subtitle: 'Inventario, disponibilidad y ocupacion actual.' },
  '/reservas': { title: 'Reservas', subtitle: 'Seguimiento diario de reservas, disponibilidad y ocupacion.' },
  '/pagos': { title: 'Cobros', subtitle: 'Caja operativa, movimientos registrados y seguimiento de ingresos.' },
  '/tarifas': { title: 'Tarifas', subtitle: 'Tarifa actual, tarifas personalizadas y tipo de cambio aplicado a reservas.' },
  '/usuarios': { title: 'Directorio', subtitle: 'Alta y mantenimiento de personas base, con vínculo a huéspedes y personal.' },
  '/huespedes': { title: 'Huespedes', subtitle: 'Gestion de huespedes y actividad de reservas.' },
  '/personal': { title: 'Personal', subtitle: 'Equipo operativo, disponibilidad y carga semanal.' },
  '/hoteles': { title: 'Hoteles', subtitle: 'Cobertura, ocupacion y detalle por propiedad.' },
  '/accesos': { title: 'Accesos', subtitle: 'Gestión de roles y cuentas con privilegios elevados.' },
  '/perfil': { title: 'Perfil', subtitle: 'Identidad, preferencias y ajustes internos del panel.' },
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

    return pageMeta[location.pathname] ?? { title: 'FitHub', subtitle: 'Administracion hotelera.' };
  }, [location.pathname, role]);
  const roleLabel = role === 'super_admin' ? 'Super admin' : 'Admin';

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
              <span className="topbar-kicker">{role === 'super_admin' ? 'FitHub Direccion' : 'FitHub Hotel'}</span>
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
