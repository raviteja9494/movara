import { useState, useRef, useEffect } from 'react';
import { getCurrentUser, clearToken } from '../api/auth';
import { useNavigate } from 'react-router-dom';

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

const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export function Header({ title, onMenuClick }: HeaderProps) {
  const user = getCurrentUser();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!dropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [dropdownOpen]);

  const handleSignOut = () => {
    clearToken();
    setDropdownOpen(false);
    navigate('/login', { replace: true });
  };

  return (
    <header className="header">
      <button type="button" className="header-menu-btn" onClick={onMenuClick} aria-label="Open menu">
        <MenuIcon />
      </button>
      <h1 className="header-title">{title}</h1>
      {user?.email && (
        <div className="header-user-wrap" ref={dropdownRef}>
          <button
            type="button"
            className="header-user-btn"
            onClick={() => setDropdownOpen((o) => !o)}
            aria-label="User menu"
            aria-expanded={dropdownOpen}
          >
            <span className="header-user-icon">
              <UserIcon />
            </span>
          </button>
          {dropdownOpen && (
            <div className="header-user-dropdown">
              <div className="header-user-dropdown-email">{user.email}</div>
              <button type="button" className="header-user-dropdown-item" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
