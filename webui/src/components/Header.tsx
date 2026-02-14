import { getCurrentUser } from '../api/auth';

type HeaderProps = {
  title: string;
  onMenuClick?: () => void;
};

const MenuIcon = () => (
  <svg className="header-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

export function Header({ title, onMenuClick }: HeaderProps) {
  const user = getCurrentUser();

  return (
    <header className="header">
      <button type="button" className="header-menu-btn" onClick={onMenuClick} aria-label="Open menu">
        <MenuIcon />
      </button>
      <h1 className="header-title">{title}</h1>
      {user?.email && (
        <span className="header-user" title={`Signed in as ${user.email}`}>
          {user.email}
        </span>
      )}
    </header>
  );
}
