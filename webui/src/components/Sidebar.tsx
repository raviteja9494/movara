import { NavLink, useNavigate } from 'react-router-dom';
import { clearToken } from '../api/tokenStorage';

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/tracking', label: 'Tracking' },
  { to: '/vehicles', label: 'Vehicles' },
  { to: '/devices', label: 'Devices' },
  { to: '/maintenance', label: 'Maintenance' },
  { to: '/settings', label: 'Settings' },
];

type SidebarProps = {
  open?: boolean;
  onClose?: () => void;
  onNavigate?: () => void;
};

export function Sidebar({ open = false, onClose, onNavigate }: SidebarProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearToken();
    navigate('/login', { replace: true });
    onClose?.();
  };

  return (
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`} style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="sidebar-brand">
        Movara
        <button type="button" className="sidebar-close" onClick={onClose} aria-label="Close menu">×</button>
      </div>
      <nav className="sidebar-nav" style={{ flex: 1 }}>
        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
            end={to === '/'}
            onClick={onNavigate}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button type="button" className="btn-link sidebar-logout" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
