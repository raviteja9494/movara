import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { loadPreferences, savePreferences, type Preferences } from './preferences';

type SetPreferences = (prev: Preferences) => Preferences;

const PreferencesContext = createContext<{
  preferences: Preferences;
  setPreferences: (fn: SetPreferences) => void;
} | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setState] = useState<Preferences>(loadPreferences);

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
