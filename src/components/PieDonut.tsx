import React from 'react';

interface Segment { label: string; value: number; color?: string }
interface Props { segments: Segment[]; size?: number; stroke?: number }

const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
  const angleRad = (angleDeg - 90) * Math.PI / 180.0;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
};

const describeArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
};

export const PieDonut: React.FC<Props> = ({ segments, size = 160, stroke = 28 }) => {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const padding = Math.max(14, Math.ceil(stroke / 2) + 4);
  const radius = Math.max(0, (size - stroke - padding * 2) / 2);
  let acc = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="xMidYMid meet" className="pie-donut" style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}>
      <defs>
        <filter id="pdGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <g transform={`translate(${size / 2},${size / 2})`}>
        {segments.map((seg, i) => {
          const startAngle = (acc / total) * 360;
          acc += seg.value;
          const endAngle = (acc / total) * 360;
          const path = describeArc(0, 0, radius, startAngle, endAngle);
          return (
            <path key={i} d={path} fill="none" stroke={seg.color || `hsl(${i*60},70%,60%)`} strokeWidth={stroke} strokeLinecap="butt" style={{ filter: 'url(#pdGlow)' }} />
          );
        })}
        <circle r={radius - stroke/2} fill="rgba(0,0,0,0.12)" />
      </g>
    </svg>
  );
};

export default PieDonut;
