import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export const DashboardLayout: React.FC = () => {
  return (
    <div className="dashboard-root">
      <Sidebar />
      <div className="dashboard-main">
        <Outlet />
      </div>
    </div>
  );
};

export default DashboardLayout;
