import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchHotelData } from '../lib/api';

export type HotelDataBundle = Awaited<ReturnType<typeof fetchHotelData>>;

type HotelDataContextValue = {
	data: HotelDataBundle | null;
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
};

const HotelDataContext = createContext<HotelDataContextValue | undefined>(undefined);

export const HotelDataProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
	const [data, setData] = useState<HotelDataBundle | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refresh = async () => {
		setLoading(true);
		setError(null);
		try {
			const nextData = await fetchHotelData();
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

	return <HotelDataContext.Provider value={value}>{children}</HotelDataContext.Provider>;
};

export function useHotelData() {
	const context = useContext(HotelDataContext);
	if (!context) {
		throw new Error('useHotelData debe usarse dentro del proveedor de datos operativos');
	}
	return context;
}