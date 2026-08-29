import React from 'react';

/**
 * 人像拍照姿势框线叠加层
 *
 * 模式：
 *   - thirds          标准三分线构图
 *   - portrait_half   半身人像（头部在上三分之一，肩/胸线参考）
 *   - portrait_full   全身人像（头部 + 躯干 + 比例参考）
 *   - headshot        头部特写（头肩裁切参考）
 *   - grid            密集对焦网格
 *
 * 透明度、颜色和开/关由调用方控制，组件只负责绘制。
 */
export default function PoseGuideOverlay({ mode = 'portrait_half', opacity = 0.55, color = '#ffffff', className = '' }) {
  const o = Math.max(0, Math.min(1, Number(opacity) || 0.55));
  const s = { stroke: color, strokeOpacity: o, strokeWidth: 0.35, fill: 'none', vectorEffect: 'non-scaling-stroke' };
  const thin = { ...s, strokeWidth: 0.18 };

  let content;
  if (mode === 'thirds') {
    content = (
      <>
        <line x1="33.33" y1="0" x2="33.33" y2="100" {...thin} />
        <line x1="66.67" y1="0" x2="66.67" y2="100" {...thin} />
        <line x1="0" y1="33.33" x2="100" y2="33.33" {...thin} />
        <line x1="0" y1="66.67" x2="100" y2="66.67" {...thin} />
        <circle cx="50" cy="50" r="2.5" strokeOpacity={o * 0.65} stroke={color} strokeWidth="0.2" fill="none" />
      </>
    );
  } else if (mode === 'grid') {
    content = (
      <>
        {[20, 40, 60, 80].map(x => <line key={`v${x}`} x1={x} y1="0" x2={x} y2="100" {...thin} />)}
        {[20, 40, 60, 80].map(y => <line key={`h${y}`} x1="0" y1={y} x2="100" y2={y} {...thin} />)}
        <rect x="0" y="0" width="100" height="100" {...thin} />
      </>
    );
  } else if (mode === 'portrait_full') {
    content = (
      <>
        <rect x="30" y="3" width="40" height="94" rx="1" {...s} />
        <circle cx="50" cy="14" r="8.8" {...s} />
        <line x1="30" y1="43" x2="70" y2="43" {...thin} />
        <line x1="30" y1="70" x2="70" y2="70" {...thin} />
        <line x1="50" y1="3" x2="50" y2="97" {...thin} />
        <path d="M 32 27 Q 50 17 68 27" {...s} />
      </>
    );
  } else if (mode === 'headshot') {
    content = (
      <>
        <rect x="25" y="10" width="50" height="80" rx="1" {...s} />
        <ellipse cx="50" cy="40" rx="14" ry="18" {...s} />
        <path d="M 25 62 Q 50 38 75 62" {...s} />
        <line x1="25" y1="62" x2="75" y2="62" {...thin} />
        <line x1="50" y1="10" x2="50" y2="90" {...thin} />
      </>
    );
  } else {
    // portrait_half / 默认半身
    content = (
      <>
        <rect x="28" y="5" width="44" height="80" rx="1" {...s} />
        <circle cx="50" cy="25" r="11" {...s} />
        <path d="M 30 48 Q 50 30 70 48" {...s} />
        <line x1="28" y1="48" x2="72" y2="48" {...thin} />
        <line x1="28" y1="68" x2="72" y2="68" {...thin} />
        <line x1="50" y1="5" x2="50" y2="85" {...thin} />
      </>
    );
  }

  return (
    <svg className={`absolute inset-0 w-full h-full pointer-events-none ${className}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {content}
    </svg>
  );
}
