import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  STYLE_PRESETS, PORTRAIT_STEPS, GENRE_GUIDE,
  DEFAULT_ADJ, DEFAULT_PORTRAIT, DEFAULT_MASK,
} from '../editor/presets.js';
import { renderPreview, exportEdited, loadImage } from '../editor/imageEngine.js';
import {
  ArrowLeft, BookOpen, Check, Download, ImageOff, Palette, RotateCcw, ScanLine,
  SlidersHorizontal, Sparkles, UserRound,
} from 'lucide-react';

const TABS = [
  { id: 'portrait', label: '一键人像', Icon: UserRound },
  { id: 'basic', label: '基础调色', Icon: SlidersHorizontal },
  { id: 'ps', label: '专业修图（PS）', Icon: Palette },
  { id: 'mask', label: '局部蒙版', Icon: ScanLine },
  { id: 'presets', label: '风格预设', Icon: Sparkles },
  { id: 'guide', label: '修图指南', Icon: BookOpen },
];

const BASIC_ITEMS = [
  ['exposure', '曝光'], ['contrast', '对比度'], ['highlights', '高光'], ['shadows', '阴影'],
  ['whites', '白色'], ['blacks', '黑色'], ['temperature', '色温'], ['tint', '色调'],
  ['saturation', '饱和度'], ['vibrance', '自然饱和'], ['clarity', '清晰度'], ['sharpen', '锐化'],
  ['vignette', '暗角'], ['grain', '颗粒'], ['fade', '褪色'],
];

const PORTRAIT_ITEMS = [
  ['smooth', '磨皮'], ['whiten', '美白'], ['rosy', '红润'], ['skinBrighten', '肤色提亮'],
  ['blemish', '瑕疵修复'], ['teethWhite', '牙齿美白'], ['lipColor', '唇色'], ['eyeLarge', '大眼'],
  ['faceSlim', '瘦脸'],
];

const MASK_ITEMS = [
  ['exposure', '曝光'], ['contrast', '对比度'], ['saturation', '饱和度'], ['temperature', '色温'],
];

const PS_GROUPS = [
  {
    id: 'light',
    label: '光影',
    title: '光影',
    items: [
      ['exposure', '曝光'], ['contrast', '对比度'], ['highlights', '高光'], ['shadows', '阴影'],
      ['whites', '白色'], ['blacks', '黑色'],
    ],
  },
  {
    id: 'color',
    label: '颜色',
    title: '颜色',
    items: [
      ['temperature', '色温'], ['tint', '色调'], ['vibrance', '自然饱和'], ['saturation', '饱和度'],
    ],
  },
  {
    id: 'effects',
    label: '效果',
    title: '细节与效果',
    items: [
      ['clarity', '清晰度'], ['texture', '纹理'], ['dehaze', '去雾'], ['sharpen', '锐化'],
      ['denoise', '降噪'], ['vignette', '暗角'], ['grain', '颗粒'], ['fade', '褪色'],
    ],
  },
  {
    id: 'curve',
    label: '曲线',
    title: '五点曲线',
    items: [
      ['toneBlack', '黑色'], ['toneShadow', '阴影'], ['toneMid', '中间调'],
      ['toneHighlight', '高光'], ['toneWhite', '白色'],
    ],
  },
  { id: 'mix', label: '混色', title: '颜色混合', items: [] },
];

const COLOR_MIX_ITEMS = [
  ['red', '红色', '#ef4444'],
  ['orange', '橙色', '#f97316'],
  ['yellow', '黄色', '#eab308'],
  ['green', '绿色', '#22c55e'],
  ['blue', '蓝色', '#3b82f6'],
  ['purple', '紫色', '#a855f7'],
];

function Slider({ label, value = 0, onChange, min = -100, max = 100, step = 1, accent = '#3b82f6' }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-[#9898ac]">{label}</span>
        <span className="text-[11px] mono" style={{ color: value === 0 ? '#585870' : accent }}>{value > 0 ? '+' : ''}{value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 appearance-none rounded-full bg-white/10 outline-none"
        style={{ background: `linear-gradient(90deg, ${accent} ${pct}%, rgba(255,255,255,0.1) ${pct}%)` }}
      />
    </label>
  );
}

function ColorMixer({ adj, onChange }) {
  const [color, setColor] = useState('red');
  const current = COLOR_MIX_ITEMS.find(item => item[0] === color) || COLOR_MIX_ITEMS[0];
  return (
    <div>
      <div className="grid grid-cols-6 gap-2 mb-4">
        {COLOR_MIX_ITEMS.map(([key, label, swatch]) => (
          <button
            key={key}
            type="button"
            className={`rounded-md border px-1 py-2 ${color === key ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-[var(--surface)]'}`}
            onClick={() => setColor(key)}
          >
            <span className="mx-auto block w-4 h-4 rounded-full border border-white/20" style={{ background: swatch }} />
            <span className="block text-[9px] text-center mt-1">{label}</span>
          </button>
        ))}
      </div>
      <Slider label={`${current[1]} · 色相`} value={adj[`${color}Hue`]} onChange={value => onChange(`${color}Hue`, value)} accent={current[2]} />
      <Slider label={`${current[1]} · 饱和度`} value={adj[`${color}Sat`]} onChange={value => onChange(`${color}Sat`, value)} accent={current[2]} />
      <Slider label={`${current[1]} · 明度`} value={adj[`${color}Lum`]} onChange={value => onChange(`${color}Lum`, value)} accent={current[2]} />
    </div>
  );
}

const HISTOGRAM_BINS = 128;

function histogramPath(bins, width = 128, height = 52, fill = false) {
  if (!bins?.length) return '';
  const max = Math.max(1, ...bins);
  const points = bins.map((value, index) => {
    const x = (index / (bins.length - 1)) * width;
    const y = height - (value / max) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M ${points.join(' L ')}`;
  return fill ? `${line} L ${width},${height} L 0,${height} Z` : line;
}

function HistogramChart({ histogram, compact = false }) {
  return (
    <div className={`rounded-md border border-white/10 bg-black/70 overflow-hidden ${compact ? 'w-[126px] p-1.5' : 'p-2'}`}>
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

const CURVE_POINTS = [
  ['toneBlack', 0],
  ['toneShadow', 1],
  ['toneMid', 2],
  ['toneHighlight', 3],
  ['toneWhite', 4],
];

function CurveEditor({ adj, histogram, onChange }) {
  const [dragging, setDragging] = useState(null);
  const width = 320;
  const height = 178;
  const pad = 18;
  const coordinates = CURVE_POINTS.map(([key], index) => {
    const x = pad + index * ((width - pad * 2) / (CURVE_POINTS.length - 1));
    const y = pad + (1 - (clampValue(adj[key]) + 100) / 200) * (height - pad * 2);
    return { key, x, y };
  });

  const updatePoint = (event, index) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const localY = (event.clientY - rect.top) * (height / rect.height);
    const t = clampValue(1 - (localY - pad) / (height - pad * 2));
    onChange(CURVE_POINTS[index][0], Math.round((t * 2 - 1) * 100));
  };

  const linePath = coordinates.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');

  return (
    <div className="mb-4 rounded-md border border-[var(--line)] bg-[#0b0e11] p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs font-semibold">曲线</p>
          <p className="text-[9px] text-[var(--text-muted)] mt-0.5">拖动五个控制点调整黑场到白场</p>
        </div>
        <HistogramChart histogram={histogram} compact />
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full touch-none select-none"
        onPointerMove={event => dragging != null && updatePoint(event, dragging)}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
      >
        {[1, 2, 3, 4].map(i => (
          <line key={`v${i}`} x1={(width / 5) * i} y1={pad} x2={(width / 5) * i} y2={height - pad} stroke="rgba(255,255,255,.06)" />
        ))}
        {[1, 2, 3, 4].map(i => (
          <line key={`h${i}`} x1={pad} y1={(height / 5) * i} x2={width - pad} y2={(height / 5) * i} stroke="rgba(255,255,255,.06)" />
        ))}
        <line x1={pad} y1={height - pad} x2={width - pad} y2={pad} stroke="rgba(255,255,255,.12)" strokeDasharray="4 5" />
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2.2" />
        {coordinates.map((point, index) => (
          <circle
            key={point.key}
            cx={point.x}
            cy={point.y}
            r={dragging === index ? 8 : 6}
            fill="var(--accent)"
            stroke="#0b0e11"
            strokeWidth="2"
            className="cursor-ns-resize"
            onPointerDown={event => {
              event.preventDefault();
              event.currentTarget.setPointerCapture?.(event.pointerId);
              setDragging(index);
            }}
          />
        ))}
      </svg>
      <div className="grid grid-cols-5 gap-1 text-center mt-2">
        {CURVE_POINTS.map(([key, index]) => (
          <div key={key}>
            <p className="text-[9px] text-[var(--text-muted)]">{PS_GROUPS[3].items[index][1]}</p>
            <p className="mono text-[10px] mt-0.5">{adj[key] > 0 ? '+' : ''}{adj[key]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function clampValue(value) {
  return Math.max(-100, Math.min(100, Number(value) || 0));
}

export default function EditorScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const stateSrc = location.state?.src;
  const stateName = location.state?.name || '未命名照片';
  const [source, setSource] = useState(stateSrc || '');
  const [name, setName] = useState(stateName);
  const [tab, setTab] = useState('portrait');
  const [psGroup, setPsGroup] = useState('light');
  const [quickStrength, setQuickStrength] = useState(70);
  const [adj, setAdj] = useState({ ...DEFAULT_ADJ });
  const [portrait, setPortrait] = useState({ ...DEFAULT_PORTRAIT });
  const [mask, setMask] = useState({ ...DEFAULT_MASK });
  const [preview, setPreview] = useState('');
  const [original, setOriginal] = useState('');
  const [histogram, setHistogram] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [compare, setCompare] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState('');
  const [fileInput, setFileInput] = useState(null);
  const fileRef = useRef(null);
  const renderTimer = useRef(null);

  useEffect(() => {
    if (!source && fileRef.current) {} // no-op，占位避免 lint
  }, [source]);

  useEffect(() => {
    if (!source) return;
    if (!original) {
      loadImage(source).then(img => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 800;
        c.height = img.naturalHeight || 600;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        setOriginal(c.toDataURL('image/jpeg', 0.9));
      }).catch(() => setOriginal(source));
    }
  }, [source, original]);

  useEffect(() => {
    if (!preview) return undefined;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = Math.max(1, Math.round(256 * (img.naturalHeight || 1) / (img.naturalWidth || 1)));
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const bins = { r: new Array(HISTOGRAM_BINS).fill(0), g: new Array(HISTOGRAM_BINS).fill(0), b: new Array(HISTOGRAM_BINS).fill(0), lum: new Array(HISTOGRAM_BINS).fill(0) };
      for (let i = 0; i < data.length; i += 4) {
        bins.r[Math.min(HISTOGRAM_BINS - 1, Math.floor(data[i] / 2))] += 1;
        bins.g[Math.min(HISTOGRAM_BINS - 1, Math.floor(data[i + 1] / 2))] += 1;
        bins.b[Math.min(HISTOGRAM_BINS - 1, Math.floor(data[i + 2] / 2))] += 1;
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        bins.lum[Math.min(HISTOGRAM_BINS - 1, Math.floor(lum / 2))] += 1;
      }
      setHistogram(bins);
    };
    img.src = preview;
    return () => { cancelled = true; img.onload = null; };
  }, [preview]);

  useEffect(() => {
    if (!source) return;
    setRendering(true);
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(async () => {
      try {
        const canvas = await renderPreview(source, { adj, portrait, mask });
        setPreview(canvas.toDataURL('image/jpeg', 0.88));
      } catch (e) {
        setMsg('预览失败：' + (e.message || String(e)));
      } finally {
        setRendering(false);
      }
    }, 140);
    return () => { if (renderTimer.current) clearTimeout(renderTimer.current); };
  }, [source, adj, portrait, mask]);

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setSource(url); setName(file.name); setMsg('');
      setAdj({ ...DEFAULT_ADJ }); setPortrait({ ...DEFAULT_PORTRAIT }); setMask({ ...DEFAULT_MASK }); setOriginal('');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const reset = () => { setAdj({ ...DEFAULT_ADJ }); setPortrait({ ...DEFAULT_PORTRAIT }); setMask({ ...DEFAULT_MASK }); setMsg('已重置'); };
  const setAdjField = (k, v) => setAdj(a => ({ ...a, [k]: v }));
  const setPortraitField = (k, v) => setPortrait(p => ({ ...p, [k]: v }));
  const setMaskField = (k, v) => setMask(current => ({ ...current, [k]: v }));

  const applyPreset = (preset) => {
    if (preset.category === '人像') {
      const portraitMap = {
        smooth: 38, whiten: 18, rosy: 8, skinBrighten: 6, blemish: 10, teethWhite: 8, lipColor: 6,
      };
      setPortrait({ ...DEFAULT_PORTRAIT, ...portraitMap });
    }
    setAdj({ ...DEFAULT_ADJ, ...preset.params });
    setMsg(`已应用「${preset.name}」`);
  };

  const applyStep = (step) => {
    const nextPortrait = { ...DEFAULT_PORTRAIT, ...portrait };
    if (step.params.smooth != null) nextPortrait.smooth = step.params.smooth;
    if (step.params.blemish != null) nextPortrait.blemish = step.params.blemish;
    if (step.params.skinBrighten != null) nextPortrait.skinBrighten = step.params.skinBrighten;
    if (step.params.whiten != null) nextPortrait.whiten = step.params.whiten;
    if (step.params.rosy != null) nextPortrait.rosy = step.params.rosy;
    if (step.params.teethWhite != null) nextPortrait.teethWhite = step.params.teethWhite;
    if (step.params.lipColor != null) nextPortrait.lipColor = step.params.lipColor;
    setPortrait(nextPortrait);
    setAdj({ ...DEFAULT_ADJ, ...adj, ...step.params });
    setMsg(`已应用步骤「${step.name}」`);
  };

  const doExport = async () => {
    if (!source) return;
    setExporting(true); setMsg('');
    try {
      const dataUrl = await exportEdited(source, { adj, portrait, mask });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = (name.replace(/\.[^.]+$/, '') || 'photo') + '_edited.jpg';
      document.body.appendChild(a); a.click(); a.remove();
      setMsg('已导出编辑后的照片');
    } catch (e) { setMsg('导出失败：' + (e.message || String(e))); }
    finally { setExporting(false); }
  };

  const categoryGroups = useMemo(() => {
    const groups = {};
    STYLE_PRESETS.forEach(p => {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    });
    return groups;
  }, []);

  const quickLooks = useMemo(() => STYLE_PRESETS.filter(preset => preset.category === '人像'), []);

  const applyQuickLook = (preset) => {
    const scale = quickStrength / 100;
    const scaled = Object.fromEntries(Object.entries(preset.params || {}).map(([key, value]) => [key, Math.round(Number(value) * scale)]));
    setAdj({ ...DEFAULT_ADJ, ...scaled });
    setMsg(`已应用「${preset.name}」· ${quickStrength}%`);
  };

  return (
    <div className="h-full flex flex-col bg-[var(--app-bg)] overflow-hidden">
      {/* 顶部栏 */}
      <div className="flex-shrink-0 h-[54px] flex items-center gap-2 px-3 border-b border-[var(--line)] bg-[#0d1012]">
        <button className="btn-icon" onClick={() => navigate(-1)} title="返回"><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">修图工作台</p>
          <p className="text-[10px] text-[var(--text-muted)] truncate">{name}</p>
        </div>
        <button className="btn btn-ghost text-xs" onClick={reset}><RotateCcw size={14} /> 重置</button>
        <button className="btn btn-primary text-xs" onClick={doExport} disabled={!source || exporting}>
          {exporting ? <Check size={14} /> : <Download size={14} />}{exporting ? '导出中' : '导出'}
        </button>
      </div>

      {/* 预览区 */}
      <div className="relative flex-1 min-h-0 bg-black overflow-hidden">
        {!source ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center">
            <ImageOff size={42} className="text-[var(--text-muted)] mb-4" strokeWidth={1.3} />
            <p className="text-sm text-[var(--text-soft)]">请选择一张照片开始修图</p>
            <button className="btn btn-primary mt-5" onClick={() => fileRef.current?.click()}>选择照片</button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
          </div>
        ) : (
          <div
            className="w-full h-full flex items-center justify-center relative cursor-crosshair"
            onPointerDown={() => setCompare(false)}
            onPointerUp={() => setCompare(true)}
            onPointerLeave={() => setCompare(false)}
          >
            <img
              src={compare && original ? original : preview}
              alt="预览"
              className="max-w-full max-h-full object-contain"
              style={{ opacity: rendering ? 0.55 : 1, transition: 'opacity .15s' }}
            />
            {compare && <span className="absolute top-3 left-3 px-2 py-1 rounded bg-black/70 border border-white/10 text-[10px]">原图</span>}
            {!compare && <span className="absolute top-3 left-3 px-2 py-1 rounded bg-black/70 border border-white/10 text-[10px]">效果预览</span>}
            {histogram && (
              <div className="absolute top-3 right-3 z-10">
                <HistogramChart histogram={histogram} compact />
              </div>
            )}
            {rendering && <span className="absolute bottom-3 right-3 mono text-[10px] text-[var(--accent)]">处理中</span>}
          </div>
        )}
      </div>

      {/* 底部工具区 */}
      <div className="flex-shrink-0 h-[46%] min-h-[270px] flex flex-col bg-[#0d1012] border-t border-[var(--line)]">
        <div className="flex gap-2 px-3 pt-2 pb-2 overflow-x-auto border-b border-[var(--line)]">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`grid-chip flex items-center gap-1.5 ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <t.Icon size={13} /> {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
          {tab === 'basic' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              {BASIC_ITEMS.map(([k, label]) => (
                <Slider key={k} label={label} value={adj[k]} onChange={v => setAdjField(k, v)} />
              ))}
            </div>
          )}

          {tab === 'ps' && (
            <div>
              <div className="flex gap-2 overflow-x-auto pb-3">
                {PS_GROUPS.map(group => (
                  <button
                    key={group.id}
                    className={`grid-chip ${psGroup === group.id ? 'active' : ''}`}
                    onClick={() => setPsGroup(group.id)}
                  >
                    {group.label}
                  </button>
                ))}
              </div>
              {psGroup === 'curve' ? (
                <>
                  <CurveEditor adj={adj} histogram={histogram} onChange={setAdjField} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                    {(PS_GROUPS.find(group => group.id === 'curve')?.items || []).map(([key, label]) => (
                      <Slider key={key} label={label} value={adj[key]} onChange={value => setAdjField(key, value)} />
                    ))}
                  </div>
                </>
              ) : psGroup === 'mix' ? (
                <ColorMixer adj={adj} onChange={setAdjField} />
              ) : (
                <>
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-3">
                    {PS_GROUPS.find(group => group.id === psGroup)?.title}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                    {(PS_GROUPS.find(group => group.id === psGroup)?.items || []).map(([key, label]) => (
                      <Slider key={key} label={label} value={adj[key]} onChange={value => setAdjField(key, value)} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'mask' && (
            <div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  ['none', '关闭'],
                  ['radial', '径向蒙版'],
                  ['linear', '线性蒙版'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={`grid-chip ${mask.type === value ? 'active' : ''}`}
                    onClick={() => setMaskField('type', value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mask.type === 'none' ? (
                <div className="panel p-4 text-center">
                  <ScanLine size={22} className="mx-auto text-[var(--text-muted)]" />
                  <p className="text-[11px] text-[var(--text-soft)] mt-2">选择径向或线性蒙版后，可只调整画面局部。</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-semibold text-[var(--text-muted)]">蒙版范围</p>
                    <label className="flex items-center gap-2 text-[11px] text-[var(--text-soft)]">
                      <input type="checkbox" checked={mask.invert} onChange={e => setMaskField('invert', e.target.checked)} />
                      反向蒙版
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                    {mask.type === 'radial' && (
                      <>
                        <Slider label="中心水平" value={mask.centerX} min={0} max={100} onChange={value => setMaskField('centerX', value)} />
                        <Slider label="中心垂直" value={mask.centerY} min={0} max={100} onChange={value => setMaskField('centerY', value)} />
                        <Slider label="范围大小" value={mask.radius} min={5} max={100} onChange={value => setMaskField('radius', value)} />
                        <Slider label="羽化" value={mask.feather} min={0} max={100} onChange={value => setMaskField('feather', value)} />
                      </>
                    )}
                    {mask.type === 'linear' && (
                      <>
                        <Slider label="渐变位置" value={mask.position} min={0} max={100} onChange={value => setMaskField('position', value)} />
                        <Slider label="渐变角度" value={mask.angle} min={-180} max={180} onChange={value => setMaskField('angle', value)} />
                        <Slider label="过渡范围" value={mask.feather} min={0} max={100} onChange={value => setMaskField('feather', value)} />
                      </>
                    )}
                  </div>
                  <div className="divider my-3" />
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-3">蒙版内调整</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                    {MASK_ITEMS.map(([key, label]) => (
                      <Slider key={key} label={label} value={mask[key]} onChange={value => setMaskField(key, value)} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'presets' && (
            <div className="space-y-4">
              {Object.entries(categoryGroups).map(([category, presets]) => (
                <div key={category}>
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-2">共 {presets.length} 个 · {category}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {presets.map(p => (
                      <button key={p.id} className="panel p-3 text-left hover:border-[var(--line-strong)] transition-colors" onClick={() => applyPreset(p)}>
                        <p className="text-xs font-bold">{p.name}</p>
                        <p className="text-[10px] text-[#585870] mt-1 leading-4">{p.desc.slice(0, 52)}{p.desc.length > 52 ? '…' : ''}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'portrait' && (
            <div>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs font-semibold">一键人像</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">选择风格后仍可继续细调</p>
                  </div>
                  <span className="mono text-[10px] text-[var(--accent)]">{quickStrength}%</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {quickLooks.map(preset => (
                    <button key={preset.id} className="panel p-3 text-left hover:border-[var(--line-strong)]" onClick={() => applyQuickLook(preset)}>
                      <div className="h-10 rounded-md bg-[#0b0d0f] border border-[var(--line)] flex items-center justify-center mb-2">
                        <UserRound size={17} className="text-[var(--text-soft)]" />
                      </div>
                      <p className="text-[11px] font-semibold truncate">{preset.name.replace('人像·', '')}</p>
                      <p className="text-[9px] text-[var(--text-muted)] mt-1 line-clamp-2 leading-3">{preset.desc.slice(0, 34)}</p>
                    </button>
                  ))}
                </div>
                <div className="mt-3 panel px-3 py-2.5">
                  <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1"><span>整体强度</span><span className="mono">{quickStrength}%</span></div>
                  <input type="range" min="20" max="100" step="5" value={quickStrength} onChange={e => setQuickStrength(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                {PORTRAIT_ITEMS.map(([k, label]) => (
                  <Slider key={k} label={label} value={portrait[k]} min={0} max={100} onChange={v => setPortraitField(k, v)} accent="#f472b6" />
                ))}
              </div>
              <div className="mt-3">
                <p className="text-[11px] font-semibold text-[#9898ac] mb-2">推荐修图顺序（点击应用该步骤）</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PORTRAIT_STEPS.map(step => (
                    <button key={step.key} className="panel p-2 text-left" onClick={() => applyStep(step)}>
                      <p className="text-[11px] font-bold">{step.name}</p>
                      <p className="text-[9px] text-[#585870] mt-0.5 leading-3">{step.desc.slice(0, 44)}{step.desc.length > 44 ? '…' : ''}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'guide' && (
            <div className="space-y-4 pb-4">
              <p className="text-[11px] leading-5 text-[#9898ac]">
                修图顺序：先校白平衡与曝光，再调明暗层次和色彩，最后做细节 / 人像精修。不同题材侧重不同，以下为整理后的修图知识库。
              </p>
              {GENRE_GUIDE.map(g => (
                <div key={g.genre} className="panel p-3">
                  <p className="text-xs font-bold">{g.icon} {g.genre}</p>
                  <p className="text-[10px] text-[#60a5fa] mt-1">流程：{g.order.join(' → ')}</p>
                  <ul className="mt-2 space-y-1">
                    {g.points.map((pt, i) => <li key={i} className="text-[10px] text-[#9898ac] leading-4">· {pt}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {msg && <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-[var(--accent)] text-[11px] text-[var(--accent-ink)] z-20 anim-fade">{msg}</div>}
      <input ref={fileInput} type="file" className="hidden" onChange={pickFile} />
    </div>
  );
}
