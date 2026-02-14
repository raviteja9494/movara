import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/vehicles': 'Vehicles',
  '/devices': 'Devices',
  '/maintenance': 'Maintenance',
};

export function Layout() {
  const location = useLocation();
  const path = location.pathname;
  const title = pageTitles[path] ?? 'Movara';

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
