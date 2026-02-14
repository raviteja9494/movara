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
  };
  return titles[path] ?? 'Movara';
}

export function Layout() {
  const location = useLocation();
  const path = location.pathname;
  const title = pageTitle(path);

  return (
    <div className="layout">
      <Sidebar />
      <div className="layout-main">
        <Header title={title} />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
