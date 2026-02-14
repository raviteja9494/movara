import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/vehicles', label: 'Vehicles' },
  { to: '/devices', label: 'Devices' },
  { to: '/maintenance', label: 'Maintenance' },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">Movara</div>
      <nav className="sidebar-nav">
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
    </aside>
  );
}
