import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface SedeData {
  name: string;
  value: number;
  color: string;
}

interface Props {
  data: SedeData[];
}

export const SedeDistributionChart: React.FC<Props> = ({ data }) => {
  const total = data.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div style={{ background: '#1e2136', border: '1px solid #2a2d45', borderRadius: 16, padding: 16 }}>
      <h3 style={{ color: '#fff', fontSize: 13, fontWeight: 700, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Distribución por Sede</h3>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ position: 'relative', width: 200, height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                innerRadius={70}
                outerRadius={95}
                paddingAngle={6}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    style={{ filter: `drop-shadow(0 0 8px ${entry.color}88)` }}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#191c2c', border: '1px solid #2a2d45', borderRadius: 8 }}
                itemStyle={{ color: '#fff' }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: 24, fontWeight: 800 }}>{total}</span>
            <span style={{ color: '#8e92bc', fontSize: 12, marginTop: 6, textTransform: 'uppercase' }}>Total Reservas</span>
          </div>
        </div>

        <div style={{ flex: 1, width: '100%' }}>
          {data.map((item, index) => (
            <div key={index} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 12, backgroundColor: item.color }} />
                  <span style={{ color: '#cbd5e1', fontSize: 13 }}>{item.name}</span>
                </div>
                <span style={{ color: '#fff', fontWeight: 700 }}>{((item.value / Math.max(1, total)) * 100).toFixed(1)}%</span>
              </div>
              <div style={{ width: '100%', background: '#26293d', height: 8, borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(item.value / Math.max(1, total)) * 100}%`, background: item.color, boxShadow: `0 0 10px ${item.color}55`, transition: 'width 600ms' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SedeDistributionChart;
