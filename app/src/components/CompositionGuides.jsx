import React from 'react';

export const COMPOSITION_MODES = [
  { id: 'none', label: '关闭' },
  { id: 'thirds', label: '三分线' },
  { id: 'golden', label: '黄金分割' },
  { id: 'grid', label: '精密网格' },
  { id: 'center', label: '中心构图' },
  { id: 'diagonals', label: '对角引导' },
  { id: 'level', label: '水平仪' },
];

export default function CompositionGuides({ mode = 'thirds', opacity = 0.42, color = '#ffffff', className = '' }) {
  if (!mode || mode === 'none') return null;
  const strokeOpacity = Math.max(0.08, Math.min(0.85, Number(opacity) || 0.42));
  const line = {
    stroke: color,
    strokeOpacity,
    strokeWidth: 1,
    fill: 'none',
    vectorEffect: 'non-scaling-stroke',
    shapeRendering: 'crispEdges',
  };
  const subtle = { ...line, strokeOpacity: strokeOpacity * 0.62 };
  const crisp = { ...line, strokeOpacity: Math.min(.9, strokeOpacity + .12) };

  let content = null;
  if (mode === 'thirds') {
    content = (
      <>
        <line x1="33.333" y1="0" x2="33.333" y2="100" {...line} />
        <line x1="66.667" y1="0" x2="66.667" y2="100" {...line} />
        <line x1="0" y1="33.333" x2="100" y2="33.333" {...line} />
        <line x1="0" y1="66.667" x2="100" y2="66.667" {...line} />
      </>
    );
  } else if (mode === 'golden') {
    content = (
      <>
        <line x1="38.2" y1="0" x2="38.2" y2="100" {...line} />
        <line x1="61.8" y1="0" x2="61.8" y2="100" {...line} />
        <line x1="0" y1="38.2" x2="100" y2="38.2" {...line} />
        <line x1="0" y1="61.8" x2="100" y2="61.8" {...line} />
        <circle cx="38.2" cy="38.2" r="1.2" {...crisp} />
        <circle cx="61.8" cy="61.8" r="1.2" {...crisp} />
      </>
    );
  } else if (mode === 'grid') {
    content = (
      <>
        {[16.667, 33.333, 50, 66.667, 83.333].map(value => <line key={`v-${value}`} x1={value} y1="0" x2={value} y2="100" {...subtle} />)}
        {[16.667, 33.333, 50, 66.667, 83.333].map(value => <line key={`h-${value}`} x1="0" y1={value} x2="100" y2={value} {...subtle} />)}
      </>
    );
  } else if (mode === 'center') {
    content = (
      <>
        <line x1="50" y1="0" x2="50" y2="100" {...subtle} />
        <line x1="0" y1="50" x2="100" y2="50" {...subtle} />
        <circle cx="50" cy="50" r="1.6" {...crisp} />
        <path d="M46 50H48M52 50H54M50 46V48M50 52V54" {...crisp} />
      </>
    );
  } else if (mode === 'diagonals') {
    content = (
      <>
        <line x1="0" y1="0" x2="100" y2="100" {...line} />
        <line x1="100" y1="0" x2="0" y2="100" {...line} />
        <line x1="50" y1="0" x2="100" y2="50" {...subtle} />
        <line x1="0" y1="50" x2="50" y2="100" {...subtle} />
      </>
    );
  } else if (mode === 'level') {
    content = (
      <>
        <line x1="8" y1="50" x2="44" y2="50" {...subtle} />
        <line x1="56" y1="50" x2="92" y2="50" {...subtle} />
        <circle cx="50" cy="50" r="2.2" {...crisp} />
        <line x1="50" y1="45.5" x2="50" y2="54.5" {...subtle} />
      </>
    );
  }

  return (
    <svg className={`absolute inset-0 w-full h-full pointer-events-none ${className}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {content}
    </svg>
  );
}
