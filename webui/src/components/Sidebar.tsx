import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/tracking', label: 'Tracking' },
  { to: '/vehicles', label: 'Vehicles' },
  { to: '/trips', label: 'Trips' },
  { to: '/devices', label: 'Devices' },
  { to: '/logs', label: 'Logs' },
  { to: '/maintenance', label: 'Maintenance' },
  { to: '/settings', label: 'Settings' },
  { to: '/help', label: 'Help' },
];

type SidebarProps = {
  open?: boolean;
  onClose?: () => void;
  onNavigate?: () => void;
};

export function Sidebar({ open = false, onClose, onNavigate }: SidebarProps) {
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
        <span className="muted" style={{ fontSize: '0.8rem' }}>v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.2.4'}</span>
      </div>
    </aside>
  );
}
