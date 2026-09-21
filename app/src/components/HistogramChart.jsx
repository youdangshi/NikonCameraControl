import React from 'react';
import { histogramPath } from '../histogram.js';

export default function HistogramChart({ histogram, compact = false, className = '' }) {
  return (
    <div className={`rounded-md border border-white/10 bg-black/70 overflow-hidden ${compact ? 'w-[126px] p-1.5' : 'p-2'} ${className}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-white/55">直方图</span>
        <span className="text-[8px] text-white/35">RGB 通道</span>
      </div>
      <svg viewBox="0 0 128 52" className={compact ? 'w-full h-[48px]' : 'w-full h-[72px]'} preserveAspectRatio="none">
        <path d={histogramPath(histogram?.lum)} fill="rgba(255,255,255,.12)" />
        <path d={histogramPath(histogram?.r)} fill="none" stroke="rgba(255,90,90,.82)" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
        <path d={histogramPath(histogram?.g)} fill="none" stroke="rgba(75,222,128,.82)" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
        <path d={histogramPath(histogram?.b)} fill="none" stroke="rgba(85,145,255,.9)" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
