import React, { useContext, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App.jsx';
import { analyzePhoto } from '../ai.js';
import AiAnalysisPanel from '../components/AiAnalysisPanel.jsx';
import { FileImage, ImagePlus, SlidersHorizontal, Sparkles, Trash2, Upload } from 'lucide-react';

export default function LocalMediaScreen() {
  const { state } = useContext(AppContext);
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [aiError, setAiError] = useState('');

  const pick = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const item = { name: file.name, dataUrl: String(reader.result), size: file.size };
      setItems(previous => [item, ...previous]);
      setSelected(item);
      setResult(null);
      setAiError('');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const doAI = async () => {
    if (!selected) return;
    setLoading(true);
    setResult(null);
    setAiError('');
    try {
      const analysisResult = await analyzePhoto(
        { apiKey: state.aiApiKey, settings: state.aiSettings },
        '',
        selected.dataUrl,
        { mode: 'auto' },
      );
      setResult(analysisResult);
    } catch (e) {
      setAiError(`分析失败：${e.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-inner space-y-4 pb-24">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="section-label">本地摄影库</p>
            <h1 className="text-xl font-bold mt-1">本地照片</h1>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => navigate('/phone-camera')}><FileImage size={15} /> 手机拍照</button>
            <button className="btn btn-primary" onClick={() => inputRef.current?.click()}><ImagePlus size={15} /> 导入</button>
          </div>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pick} />
        </div>

        {items.length === 0 ? (
          <button type="button" className="panel w-full py-20 px-6 text-center border-dashed" onClick={() => inputRef.current?.click()}>
            <Upload size={38} className="mx-auto text-[var(--text-muted)]" strokeWidth={1.4} />
            <h2 className="text-sm font-semibold mt-4">导入本地照片</h2>
            <p className="text-[11px] leading-5 text-[var(--text-soft)] mt-2">支持从手机相册或文件中选择图片，进入调色、人像精修或 AI 分析。</p>
          </button>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 sm:gap-2">
            {items.map((item, index) => (
              <button
                key={`${item.name}-${index}`}
                type="button"
                className={`relative aspect-square overflow-hidden rounded-md bg-[#0e1113] border ${selected === item ? 'border-[var(--accent)]' : 'border-[var(--line)]'}`}
                onClick={() => { setSelected(item); setResult(null); setAiError(''); }}
              >
                <img src={item.dataUrl} className="w-full h-full object-cover" alt={item.name} />
              </button>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <section className="panel">
            <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
              <div>
                <p className="section-label">本地图库</p>
                <p className="section-title mt-1">{items.length} 个本地项目</p>
              </div>
              <button className="btn-icon" onClick={() => { setItems([]); setSelected(null); setResult(null); }} aria-label="清空"><Trash2 size={16} /></button>
            </div>
          </section>
        )}
      </div>

      {selected && (
        <div className="fixed left-0 right-0 bottom-0 z-50 border-t border-[var(--line)] bg-[#111417] px-4 pt-3 pb-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <div className="max-w-[760px] mx-auto">
            <div className="flex items-start gap-3">
              <img src={selected.dataUrl} className="w-14 h-14 rounded-md object-cover border border-[var(--line)]" alt="" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{selected.name}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">{state.aiSettings?.model || 'AI 模型未配置'}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <button className="btn btn-primary" onClick={doAI} disabled={loading}><Sparkles size={15} /> {loading ? '分析中' : 'AI 分析'}</button>
              <button className="btn btn-secondary" onClick={() => navigate('/editor', { state: { src: selected.dataUrl, name: selected.name } })}><SlidersHorizontal size={15} /> 修图</button>
              <button className="btn btn-secondary" onClick={() => { setSelected(null); setResult(null); }}><FileImage size={15} /> 收起</button>
            </div>
            {aiError && <p className="mt-3 rounded-md border border-red-400/25 bg-red-950/35 px-3 py-2 text-[10px] leading-4 text-red-100">{aiError}</p>}
            {result && (
              <div className="mt-3 max-h-[48vh] overflow-y-auto rounded-md border border-[var(--line)] bg-black/15 p-3">
                <AiAnalysisPanel
                  result={result}
                  onApply={recommendations => navigate('/editor', {
                    state: {
                      src: selected.dataUrl,
                      name: selected.name,
                      aiAnalysis: {
                        ...result,
                        analysis: { ...result.analysis, recommendations },
                      },
                    },
                  })}
                  onApplyOne={recommendation => navigate('/editor', {
                    state: {
                      src: selected.dataUrl,
                      name: selected.name,
                      aiAnalysis: {
                        ...result,
                        analysis: { ...result.analysis, recommendations: [recommendation] },
                      },
                    },
                  })}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
