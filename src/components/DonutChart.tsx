import React from 'react';

interface Props { percent: number; size?: number; color?: string }

export const DonutChart: React.FC<Props> = ({ percent, size = 120, color = '#06b6d4' }) => {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="xMidYMid meet" className="donut-chart" style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}>
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <g transform={`translate(${size/2},${size/2})`}>
        <circle r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={12} />
        <circle r={radius} fill="none" stroke={color} strokeWidth={12} strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={offset} strokeLinecap="round" transform="rotate(-90)" style={{ filter: 'url(#glow)' }} />
        <circle r={radius - 18} fill="rgba(0,0,0,0.06)" />
        <text x="0" y="6" textAnchor="middle" fill="#fff" style={{fontWeight:700}}>{percent}%</text>
      </g>
    </svg>
  );
};

export default DonutChart;
