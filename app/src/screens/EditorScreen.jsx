import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  STYLE_PRESETS, PORTRAIT_STEPS, GENRE_GUIDE,
  DEFAULT_ADJ, DEFAULT_PORTRAIT,
} from '../editor/presets.js';
import { renderPreview, exportEdited, loadImage } from '../editor/imageEngine.js';

const TABS = [
  { id: 'basic', label: '基础调色', icon: '🎛' },
  { id: 'presets', label: '风格预设', icon: '✨' },
  { id: 'portrait', label: '人像精修', icon: '👤' },
  { id: 'guide', label: '修图指南', icon: '📖' },
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

export default function EditorScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const stateSrc = location.state?.src;
  const stateName = location.state?.name || '未命名照片';
  const [source, setSource] = useState(stateSrc || '');
  const [name, setName] = useState(stateName);
  const [tab, setTab] = useState('basic');
  const [adj, setAdj] = useState({ ...DEFAULT_ADJ });
  const [portrait, setPortrait] = useState({ ...DEFAULT_PORTRAIT });
  const [preview, setPreview] = useState('');
  const [original, setOriginal] = useState('');
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
    if (!source) return;
    setRendering(true);
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(async () => {
      try {
        const canvas = await renderPreview(source, { adj, portrait });
        setPreview(canvas.toDataURL('image/jpeg', 0.88));
      } catch (e) {
        setMsg('预览失败：' + (e.message || String(e)));
      } finally {
        setRendering(false);
      }
    }, 140);
    return () => { if (renderTimer.current) clearTimeout(renderTimer.current); };
  }, [source, adj, portrait]);

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setSource(url); setName(file.name); setMsg('');
      setAdj({ ...DEFAULT_ADJ }); setPortrait({ ...DEFAULT_PORTRAIT }); setOriginal('');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const reset = () => { setAdj({ ...DEFAULT_ADJ }); setPortrait({ ...DEFAULT_PORTRAIT }); setMsg('已重置'); };
  const setAdjField = (k, v) => setAdj(a => ({ ...a, [k]: v }));
  const setPortraitField = (k, v) => setPortrait(p => ({ ...p, [k]: v }));

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
      const dataUrl = await exportEdited(source, { adj, portrait });
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

  return (
    <div className="h-full flex flex-col bg-black overflow-hidden">
      {/* 顶部栏 */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#0d0d17]">
        <button className="btn-icon text-sm" onClick={() => navigate(-1)} title="返回">←</button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">修图工作台</p>
          <p className="text-[10px] text-[#585870] truncate">{name}</p>
        </div>
        <button className="btn btn-ghost text-xs" onClick={reset}>重置</button>
        <button className="btn btn-primary text-xs" onClick={doExport} disabled={!source || exporting}>
          {exporting ? '导出中…' : '导出'}
        </button>
      </div>

      {/* 预览区 */}
      <div className="relative flex-1 min-h-0 bg-[#05050a] overflow-hidden">
        {!source ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center">
            <span className="text-6xl mb-4 opacity-25">🖼</span>
            <p className="text-sm text-[#9898ac]">请选择一张照片开始修图</p>
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
            {compare && <span className="absolute top-3 left-3 px-2 py-1 rounded bg-black/60 text-[10px]">原图</span>}
            {!compare && <span className="absolute top-3 left-3 px-2 py-1 rounded bg-black/60 text-[10px]">效果预览</span>}
            {rendering && <span className="absolute bottom-3 right-3 text-[10px] text-[#60a5fa]">处理中…</span>}
          </div>
        )}
      </div>

      {/* 底部工具区 */}
      <div className="flex-shrink-0 h-[46%] min-h-[270px] flex flex-col bg-[#0d0d17] border-t border-white/5">
        <div className="flex gap-2 px-3 pt-2 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'bg-white/5 text-[#9898ac]'}`}
              onClick={() => setTab(t.id)}
            >
              {t.icon} {t.label}
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

          {tab === 'presets' && (
            <div className="space-y-4">
              {Object.entries(categoryGroups).map(([category, presets]) => (
                <div key={category}>
                  <p className="text-[11px] font-semibold text-[#9898ac] mb-2">共 {presets.length} 个 · {category}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {presets.map(p => (
                      <button key={p.id} className="glass-sm p-3 text-left hover:border-blue-500/50 transition-all" onClick={() => applyPreset(p)}>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                {PORTRAIT_ITEMS.map(([k, label]) => (
                  <Slider key={k} label={label} value={portrait[k]} min={0} max={100} onChange={v => setPortraitField(k, v)} accent="#f472b6" />
                ))}
              </div>
              <div className="mt-3">
                <p className="text-[11px] font-semibold text-[#9898ac] mb-2">推荐修图顺序（点击应用该步骤）</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PORTRAIT_STEPS.map(step => (
                    <button key={step.key} className="glass-sm p-2 text-left" onClick={() => applyStep(step)}>
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
                <div key={g.genre} className="glass-sm p-3">
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

      {msg && <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-blue-600/90 text-[11px] text-white z-20 anim-fade">{msg}</div>}
      <input ref={fileInput} type="file" className="hidden" onChange={pickFile} />
    </div>
  );
}
