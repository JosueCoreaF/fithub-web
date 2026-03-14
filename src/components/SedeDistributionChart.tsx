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
    <div className="sede-distribution-card">
      <h3 className="sede-distribution-title">Distribución por Sede</h3>
      <div className="sede-distribution-layout">
        <div className="sede-distribution-chartWrap">
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
                contentStyle={{ backgroundColor: 'var(--shell-panel-strong)', border: '1px solid var(--shell-border)', borderRadius: 12, color: 'var(--text-h)' }}
                itemStyle={{ color: 'var(--text-h)' }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="sede-distribution-center">
            <span className="sede-distribution-total">{total}</span>
            <span className="sede-distribution-subtitle">Total Reservas</span>
          </div>
        </div>

        <div className="sede-distribution-legend">
          {data.map((item, index) => (
            <div key={index} className="sede-distribution-item">
              <div className="sede-distribution-itemHead">
                <div className="sede-distribution-nameWrap">
                  <div style={{ width: 12, height: 12, borderRadius: 12, backgroundColor: item.color }} />
                  <span className="sede-distribution-name">{item.name}</span>
                </div>
                <span className="sede-distribution-percent">{((item.value / Math.max(1, total)) * 100).toFixed(1)}%</span>
              </div>
              <div className="sede-distribution-track">
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
