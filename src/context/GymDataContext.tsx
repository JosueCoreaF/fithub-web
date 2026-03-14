import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchGymData } from '../lib/api';

type GymDataBundle = Awaited<ReturnType<typeof fetchGymData>>;

type GymDataContextValue = {
  data: GymDataBundle | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const GymDataContext = createContext<GymDataContextValue | undefined>(undefined);

export const GymDataProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [data, setData] = useState<GymDataBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextData = await fetchGymData();
      setData(nextData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error cargando datos';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo(() => ({ data, loading, error, refresh }), [data, loading, error]);

  return <GymDataContext.Provider value={value}>{children}</GymDataContext.Provider>;
};

export function useGymData() {
  const context = useContext(GymDataContext);
  if (!context) {
    throw new Error('useGymData debe usarse dentro de GymDataProvider');
  }
  return context;
}