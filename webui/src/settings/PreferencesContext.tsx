import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadPreferences, savePreferences, type Preferences } from './preferences';

type SetPreferences = (prev: Preferences) => Preferences;

const PreferencesContext = createContext<{
  preferences: Preferences;
  setPreferences: (fn: SetPreferences) => void;
} | null>(null);

function getResolvedTheme(pref: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setState] = useState<Preferences>(loadPreferences);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', getResolvedTheme(preferences.theme));
  }, [preferences.theme]);

  useEffect(() => {
    if (preferences.theme !== 'system') return;
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => document.documentElement.setAttribute('data-theme', getResolvedTheme('system'));
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, [preferences.theme]);

  const setPreferences = useCallback((fn: SetPreferences) => {
    setState((prev) => {
      const next = fn(prev);
      savePreferences(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ preferences, setPreferences }),
    [preferences, setPreferences]
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
