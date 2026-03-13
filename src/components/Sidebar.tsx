import React from 'react';
import { NavLink } from 'react-router-dom';

export const Sidebar: React.FC = () => {
  return (
    <aside className="sidebar">
      <div className="brand">FitHub</div>
      <nav className="menu">
        <NavLink to="/" className={({isActive}) => isActive ? 'menu-item active' : 'menu-item'}>Panel</NavLink>
        <NavLink to="/servicios" className={({isActive}) => isActive ? 'menu-item active' : 'menu-item'}>Servicios</NavLink>
        <NavLink to="/reservas" className={({isActive}) => isActive ? 'menu-item active' : 'menu-item'}>Reservas</NavLink>
        <NavLink to="/miembros" className={({isActive}) => isActive ? 'menu-item active' : 'menu-item'}>Miembros</NavLink>
        <NavLink to="/entrenadores" className={({isActive}) => isActive ? 'menu-item active' : 'menu-item'}>Entrenadores</NavLink>
        <NavLink to="/sedes" className={({isActive}) => isActive ? 'menu-item active' : 'menu-item'}>Sedes</NavLink>
      </nav>
      <div className="sidebar-footer">v. Frontend</div>
    </aside>
  );
};

export default Sidebar;
