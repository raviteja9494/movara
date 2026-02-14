import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

function pageTitle(path: string): string {
  if (path === '/') return 'Overview';
  if (path.startsWith('/vehicles/')) return 'Vehicle';
  const titles: Record<string, string> = {
    '/vehicles': 'Vehicles',
    '/devices': 'Devices',
    '/maintenance': 'Maintenance',
    '/tracking': 'Tracking',
    '/raw-log': 'Raw log',
    '/settings': 'Settings',
  };
  return titles[path] ?? 'Movara';
}

export function Layout() {
  const location = useLocation();
  const path = location.pathname;
  const title = pageTitle(path);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="layout">
      <div className={`sidebar-overlay ${sidebarOpen ? 'sidebar-overlay-visible' : ''}`} aria-hidden="true" onClick={() => setSidebarOpen(false)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onNavigate={() => setSidebarOpen(false)} />
      <div className="layout-main">
        <Header title={title} onMenuClick={() => setSidebarOpen((v) => !v)} />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
