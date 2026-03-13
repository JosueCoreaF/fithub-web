import React from 'react';

interface Props { values: number[] }

export const BarChart: React.FC<Props> = ({ values }) => {
  const max = Math.max(...values, 1);
  return (
    <div className="bar-chart neon">
      {values.map((v, i) => {
        const isMax = v === Math.max(...values);
        return (
          <div className={`bar ${isMax ? 'max' : ''}`} key={i} style={{ height: `${(v / max) * 100}%` }} />
        );
      })}
    </div>
  );
};

export default BarChart;
