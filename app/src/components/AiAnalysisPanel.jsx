import React from 'react';
import {
  AlertTriangle, CheckCircle2, Gauge, Sparkles, WandSparkles,
} from 'lucide-react';

function scoreLabel(value) {
  if (!Number.isFinite(Number(value))) return '--';
  return `${Math.round(Number(value))}`;
}

function Score({ label, value }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-black/20 px-2.5 py-2 text-center">
      <p className="mono text-sm font-bold">{scoreLabel(value)}</p>
      <p className="text-[9px] text-[var(--text-muted)] mt-0.5">{label}</p>
    </div>
  );
}

export default function AiAnalysisPanel({ result, onApply, onApplyOne }) {
  const analysis = result?.analysis;
  if (!analysis) return null;
  const scores = analysis.scores || {};
  const issues = analysis.issues || [];
  const recommendations = analysis.recommendations || [];
  const metrics = analysis.local?.metrics || analysis.metrics;

  return (
    <div className="space-y-3">
      <div className="panel p-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] border border-[rgba(255,212,0,.24)] flex items-center justify-center flex-shrink-0">
            <Sparkles size={18} className="text-[var(--accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold">AI 照片诊断</p>
              <span className="badge badge-blue">{analysis.source === 'local' ? '本地分析' : (result.usedVision ? '视觉模型' : '统计模型')}</span>
            </div>
            <p className="text-[10px] leading-5 text-[var(--text-soft)] mt-1">{analysis.summary || '分析完成。'}</p>
            {analysis.scene?.type && <p className="text-[9px] text-[var(--text-muted)] mt-1">场景：{analysis.scene.type} · {analysis.scene.lighting || analysis.scene.mood || '自动判断'}</p>}
          </div>
        </div>
        {result.warning && <p className="text-[9px] text-[var(--warning)] mt-3">{result.warning}</p>}
      </div>

      {(scores.exposure != null || scores.color != null || scores.composition != null || scores.focus != null) && (
        <div className="grid grid-cols-4 gap-2">
          <Score label="曝光" value={scores.exposure} />
          <Score label="色彩" value={scores.color} />
          <Score label="构图" value={scores.composition} />
          <Score label="清晰" value={scores.focus} />
        </div>
      )}

      {metrics && (
        <div className="panel p-3">
          <div className="flex items-center gap-2 mb-2">
            <Gauge size={15} className="text-[var(--text-soft)]" />
            <p className="text-[11px] font-semibold">本地测量</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-[9px]">
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">平均亮度</span><span className="mono">{metrics.mean ?? '--'}</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">动态范围</span><span className="mono">{metrics.dynamicRange ?? '--'}</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">高光溢出</span><span className="mono">{metrics.clippedHighRatio != null ? `${(metrics.clippedHighRatio * 100).toFixed(1)}%` : '--'}</span></div>
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">暗部压缩</span><span className="mono">{metrics.clippedLowRatio != null ? `${(metrics.clippedLowRatio * 100).toFixed(1)}%` : '--'}</span></div>
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div className="space-y-2">
          {issues.map((issue, index) => (
            <div key={`${issue.id || index}`} className="panel px-3 py-2.5 flex items-start gap-2.5">
              <AlertTriangle size={15} className={issue.severity === 'high' ? 'text-[var(--red)] mt-0.5' : 'text-[var(--warning)] mt-0.5'} />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold">{issue.title}</p>
                <p className="text-[9px] leading-4 text-[var(--text-muted)] mt-0.5">{issue.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold">可执行修图步骤</p>
            {onApply && (
              <button className="btn btn-primary px-3 py-1.5 text-[10px]" onClick={() => onApply(recommendations)}>
                <WandSparkles size={14} /> 一键套用全部
              </button>
            )}
          </div>
          {recommendations.map((item, index) => (
            <div key={item.id || index} className="panel p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold"><CheckCircle2 size={13} className="inline mr-1 text-[var(--green)]" />{item.label}</p>
                  <p className="text-[9px] leading-4 text-[var(--text-muted)] mt-1">{item.reason}</p>
                </div>
                {onApplyOne && <button className="btn btn-secondary px-3 py-1.5 text-[10px] flex-shrink-0" onClick={() => onApplyOne(item)}>应用</button>}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {Object.entries(item.adjustments || {}).map(([key, value]) => (
                  <span key={key} className="rounded border border-[var(--line)] bg-black/20 px-2 py-1 mono text-[9px] text-[var(--text-soft)]">
                    {key} {value > 0 ? '+' : ''}{value}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
