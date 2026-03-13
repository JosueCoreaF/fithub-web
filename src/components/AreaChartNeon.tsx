import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';

interface DataPoint {
  name: string;
  reservas: number;
}

interface Props {
  data: DataPoint[];
}

export const AreaChartNeon: React.FC<Props> = ({ data }) => {
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            {/* Definimos el degradado: de Cyan brillante a transparente */}
            <linearGradient id="colorReservas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00f2fe" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#00f2fe" stopOpacity={0}/>
            </linearGradient>
          </defs>
          
          <CartesianGrid strokeDasharray="3 3" stroke="#26293d" vertical={false} />
          
          <XAxis 
            dataKey="name" 
            stroke="#8e92bc" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd" // Esto evita que las fechas se traslapen
            minTickGap={20} // Espacio mínimo entre fechas
          />
          
          <YAxis 
            stroke="#8e92bc" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12 }}
          />

          <Tooltip 
            contentStyle={{ backgroundColor: '#191c2c', border: '1px solid #2a2d45', borderRadius: '8px' }}
            itemStyle={{ color: '#00f2fe' }}
          />

          <Area 
            type="monotone" 
            dataKey="reservas" 
            stroke="#00f2fe" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorReservas)" 
            dot={{ r: 4, fill: '#11121d', stroke: '#00f2fe', strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />

          {/* Ejemplo de ReferenceDot para resaltar un pico; ajustable según datos */}
          {data && data.length > 0 && (
            (() => {
              const maxPoint = data.reduce((m, p) => p.reservas > m.reservas ? p : m, data[0]);
              return (<ReferenceDot x={maxPoint.name} y={maxPoint.reservas} r={6} fill="#ff41bb" stroke="none" />);
            })()
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AreaChartNeon;
