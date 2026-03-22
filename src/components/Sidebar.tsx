import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth, type UserRole } from '../context/AuthContext';

const IconPanel = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" fill="currentColor" />
  </svg>
);

const IconServices = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 16.5zm3 1.5h8m-8 3h8m-8 3h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const IconReservations = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 4v3M17 4v3M5 9h14M6.5 6h11A1.5 1.5 0 0 1 19 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 17.5v-10A1.5 1.5 0 0 1 6.5 6z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconPayments = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5zm0 3.5h16M8 14h3m2 0h3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconMembers = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 12a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 12 12zm-6 7a6 6 0 0 1 12 0M18 12.5a2.5 2.5 0 1 0-1.6-4.4M19 19a4.8 4.8 0 0 0-2.1-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconUsers = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm7 1a2.5 2.5 0 1 0-2.5-2.5A2.5 2.5 0 0 0 16 12zm-7 7a5 5 0 0 1 10 0M4 19a5 5 0 0 1 3.2-4.66" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconTrainers = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5l6 3-6 3-6-3zm-4 5.5v3L12 16l4-2.5v-3M6 18h12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconLocations = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 20s6-4.35 6-10a6 6 0 1 0-12 0c0 5.65 6 10 6 10zm0-8a2 2 0 1 0-2-2 2 2 0 0 0 2 2z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconProfile = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-7 7a7 7 0 0 1 14 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconShield = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3l7 3v5c0 5-2.9 8.9-7 10-4.1-1.1-7-5-7-10V6l7-3zM9.5 12.5l1.8 1.8 3.7-4.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconChevron = ({ collapsed }: { collapsed: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {collapsed ? (
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    ) : (
      <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

const items: Array<{ to: string; label: string; icon: React.FC; roles: UserRole[] }> = [
  { to: '/', label: 'Panel', icon: IconPanel, roles: ['admin', 'super_admin'] },
  { to: '/habitaciones', label: 'Habitaciones', icon: IconServices, roles: ['admin', 'super_admin'] },
  { to: '/reservas', label: 'Reservas', icon: IconReservations, roles: ['admin', 'super_admin'] },
  { to: '/pagos', label: 'Cobros', icon: IconPayments, roles: ['admin', 'super_admin'] },
  { to: '/usuarios', label: 'Usuarios', icon: IconUsers, roles: ['admin', 'super_admin'] },
  { to: '/huespedes', label: 'Huespedes', icon: IconMembers, roles: ['admin', 'super_admin'] },
  { to: '/personal', label: 'Personal', icon: IconTrainers, roles: ['admin', 'super_admin'] },
  { to: '/hoteles', label: 'Hoteles', icon: IconLocations, roles: ['admin', 'super_admin'] },
  { to: '/accesos', label: 'Accesos', icon: IconShield, roles: ['super_admin'] },
  { to: '/perfil', label: 'Perfil', icon: IconProfile, roles: ['admin', 'super_admin'] },
];

const getItemLabel = (path: string, role: UserRole, fallback: string) => {
  if (role === 'super_admin' && path === '/pagos') return 'Ingresos';
  return fallback;
};

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggleCollapse: () => void;
};

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, mobileOpen, onCloseMobile, onToggleCollapse }) => {
  const { role } = useAuth();
  const visibleItems = items.filter((item) => item.roles.includes(role));

  return (
    <>
      <div className={`sidebar-backdrop ${mobileOpen ? 'open' : ''}`} onClick={onCloseMobile} />
      <div className={`sidebar-cluster ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-top">
            <button className="sidebar-toggle mobile-only" onClick={onCloseMobile} aria-label="Cerrar sidebar">
              X
            </button>
          </div>

          <div className="brand-lockup sidebar-brand-lockup">
            <div className="brand-badge">FH</div>
            <div className="brand-copy">
              <strong className="brand">FitHub</strong>
              <span>Hotel Control</span>
            </div>
          </div>

          <nav className="menu">
            {visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                className={({ isActive }) => isActive ? 'menu-item active' : 'menu-item'}
              >
                <span className="menu-icon"><item.icon /></span>
                <span className="menu-label">{getItemLabel(item.to, role, item.label)}</span>
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-footer">
            <span>Panel operativo</span>
          </div>
        </aside>

        <aside className="sidebar-rail desktop-only" aria-label="Accesos rapidos">
          <div className="sidebar-rail-head">
            <button className="sidebar-rail-toggle" onClick={onToggleCollapse} aria-label={collapsed ? 'Expandir sidebar' : 'Contraer sidebar'}>
              <IconChevron collapsed={collapsed} />
            </button>
          </div>

          <nav className="sidebar-rail-menu">
            {visibleItems.map((item) => (
              <NavLink
                key={`rail-${item.to}`}
                to={item.to}
                onClick={onCloseMobile}
                className={({ isActive }) => isActive ? 'sidebar-rail-item active' : 'sidebar-rail-item'}
                title={getItemLabel(item.to, role, item.label)}
              >
                <span className="sidebar-rail-icon"><item.icon /></span>
              </NavLink>
            ))}
          </nav>
        </aside>
      </div>
    </>
  );
};

export default Sidebar;
