import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type ThemeMode = 'midnight' | 'slate' | 'paper';

type UIContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  sidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
  mobileSidebarOpen: boolean;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
};

const UIContext = createContext<UIContextValue | undefined>(undefined);

const THEME_KEY = 'fithub-theme';
const SIDEBAR_KEY = 'fithub-sidebar-collapsed';

const isThemeMode = (value: string | null): value is ThemeMode => value === 'midnight' || value === 'slate' || value === 'paper';

const getStoredTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'midnight';
  }

  const storedTheme = window.localStorage.getItem(THEME_KEY);
  return isThemeMode(storedTheme) ? storedTheme : 'midnight';
};

const getStoredSidebarCollapsed = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(SIDEBAR_KEY) === 'true';
};

if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', getStoredTheme());
}

export const UIProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredTheme());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => getStoredSidebarCollapsed());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const firstThemeRenderRef = useRef(true);

  useEffect(() => {
    const root = document.documentElement;

    root.setAttribute('data-theme', theme);
    window.localStorage.setItem(THEME_KEY, theme);

    if (firstThemeRenderRef.current) {
      firstThemeRenderRef.current = false;
      return;
    }

    root.classList.remove('theme-changing');
    void root.offsetWidth;
    root.classList.add('theme-changing');

    const timeoutId = window.setTimeout(() => {
      root.classList.remove('theme-changing');
    }, 420);

    return () => {
      window.clearTimeout(timeoutId);
      root.classList.remove('theme-changing');
    };
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const value = useMemo<UIContextValue>(() => ({
    theme,
    setTheme: setThemeState,
    sidebarCollapsed,
    toggleSidebarCollapsed: () => setSidebarCollapsed((current) => !current),
    mobileSidebarOpen,
    openMobileSidebar: () => setMobileSidebarOpen(true),
    closeMobileSidebar: () => setMobileSidebarOpen(false),
  }), [mobileSidebarOpen, sidebarCollapsed, theme]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};

export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI debe usarse dentro de UIProvider');
  }
  return context;
}