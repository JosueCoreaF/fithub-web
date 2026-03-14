import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot, Legend } from 'recharts';

interface DataPoint {
  name: string;
  reservas: number;
  [key: string]: string | number;
}

interface SeriesConfig {
  key: string;
  label: string;
  color: string;
  fillOpacity?: number;
}

interface Props {
  data: DataPoint[];
  series?: SeriesConfig[];
  height?: number;
}

const defaultSeries: SeriesConfig[] = [
  { key: 'reservas', label: 'Reservas', color: '#00f2fe', fillOpacity: 0.3 },
];

export const AreaChartNeon: React.FC<Props> = ({ data, series = defaultSeries, height = 300 }) => {
  const primarySeries = series[0] ?? defaultSeries[0];

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            {series.map((item) => (
              <linearGradient key={item.key} id={`area-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={item.color} stopOpacity={item.fillOpacity ?? 0.22} />
                <stop offset="95%" stopColor={item.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#26293d" vertical={false} />

          <XAxis 
            dataKey="name" 
            stroke="#8e92bc" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={20}
          />

          <YAxis 
            stroke="#8e92bc" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12 }}
          />

          <Tooltip 
            contentStyle={{ backgroundColor: '#191c2c', border: '1px solid #2a2d45', borderRadius: '8px' }}
            itemStyle={{ color: '#e8ecff' }}
            formatter={(value: number | string, name: string) => [`${Number(value).toFixed(2)} USD`, name]}
          />

          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: '#c6caeb' }} />}

          {series.map((item, index) => (
            <Area
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={item.color}
              strokeWidth={index === 0 ? 3 : 2.4}
              fillOpacity={1}
              fill={`url(#area-${item.key})`}
              dot={{ r: index === 0 ? 4 : 3, fill: '#11121d', stroke: item.color, strokeWidth: 2 }}
              activeDot={{ r: 6 }}
            />
          ))}

          {data && data.length > 0 && primarySeries && (
            (() => {
              const maxPoint = data.reduce((max, point) => Number(point[primarySeries.key] ?? 0) > Number(max[primarySeries.key] ?? 0) ? point : max, data[0]);
              return <ReferenceDot x={maxPoint.name} y={Number(maxPoint[primarySeries.key] ?? 0)} r={6} fill="#ff41bb" stroke="none" />;
            })()
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AreaChartNeon;
