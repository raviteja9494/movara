import { useState, useRef, useEffect } from 'react';
import { getCurrentUser, clearToken } from '../api/auth';
import { useNavigate } from 'react-router-dom';
import { usePreferences } from '../settings/PreferencesContext';

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

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export function Header({ title, onMenuClick }: HeaderProps) {
  const user = getCurrentUser();
  const { preferences, setPreferences } = usePreferences();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const resolvedDark = preferences.theme === 'dark' || (preferences.theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

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

  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.1.0';

  return (
    <header className="header">
      <button type="button" className="header-menu-btn" onClick={onMenuClick} aria-label="Open menu">
        <MenuIcon />
      </button>
      <h1 className="header-title">
        <span className="header-brand">Movara</span>
        {title && (
          <>
            <span className="header-title-sep" aria-hidden> · </span>
            <span>{title}</span>
          </>
        )}
      </h1>
      <span className="header-version muted" style={{ fontSize: '0.75rem', flexShrink: 0 }} aria-hidden>
        v{appVersion}
      </span>
      <button
        type="button"
        className="header-theme-btn"
        onClick={() => setPreferences((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }))}
        aria-label={resolvedDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={resolvedDark ? 'Light mode' : 'Dark mode'}
      >
        {resolvedDark ? <SunIcon /> : <MoonIcon />}
      </button>
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
