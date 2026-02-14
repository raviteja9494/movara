import { NavLink, useNavigate } from 'react-router-dom';
import { clearToken } from '../api/tokenStorage';

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/tracking', label: 'Tracking' },
  { to: '/vehicles', label: 'Vehicles' },
  { to: '/devices', label: 'Devices' },
  { to: '/maintenance', label: 'Maintenance' },
];

export function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearToken();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="sidebar-brand">Movara</div>
      <nav className="sidebar-nav" style={{ flex: 1 }}>
        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
            end={to === '/'}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-subtle)' }}>
        <button type="button" className="btn-link" onClick={handleLogout} style={{ padding: 0, fontSize: '0.9rem' }}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
