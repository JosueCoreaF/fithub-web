import React from 'react';

interface Props {
  values: number[];
  labels?: string[];
}

export const BarChart: React.FC<Props> = ({ values, labels }) => {
  const max = Math.max(...values, 1);
  return (
    <div className="bar-chart neon">
      {values.map((v, i) => {
        const isMax = v === Math.max(...values);
        return (
          <div className="bar-chart-column" key={i}>
            <div className={`bar ${isMax ? 'max' : ''}`} style={{ height: `${(v / max) * 100}%` }} />
            {labels?.[i] && <span className="bar-label">{labels[i]}</span>}
          </div>
        );
      })}
    </div>
  );
};

export default BarChart;
