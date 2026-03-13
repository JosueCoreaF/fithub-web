import React from 'react';

interface Props { data: number[]; color?: string }

const catmullRom2bezier = (points: {x:number,y:number}[]) => {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const bp1x = p1.x + (p2.x - p0.x) / 6;
    const bp1y = p1.y + (p2.y - p0.y) / 6;
    const bp2x = p2.x - (p3.x - p1.x) / 6;
    const bp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${bp1x} ${bp1y}, ${bp2x} ${bp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
};

export const LineChart: React.FC<Props> = ({ data, color = '#06b6d4' }) => {
  const width = 520;
  const height = 160;
  const max = Math.max(...data, 1);
  const pts = data.map((d, i) => ({ x: (i / (data.length - 1)) * width, y: height - (d / max) * height }));
  const path = catmullRom2bezier(pts);
  const areaPath = path + ` L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="line-chart" preserveAspectRatio="none">
      <defs>
        <linearGradient id="lineGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#lineGrad)" />
      <path d={path} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export default LineChart;
