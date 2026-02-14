type HeaderProps = {
  title: string;
  onMenuClick?: () => void;
};

export function Header({ title, onMenuClick }: HeaderProps) {
  return (
    <header className="header">
      <button type="button" className="header-menu-btn" onClick={onMenuClick} aria-label="Open menu">
        <span className="header-menu-icon" aria-hidden>☰</span>
      </button>
      <h1 className="header-title">{title}</h1>
    </header>
  );
}
