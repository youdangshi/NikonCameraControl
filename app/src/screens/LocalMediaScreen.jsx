import React, { useContext, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App.jsx';
import { analyzePhoto } from '../ai.js';

export default function LocalMediaScreen() {
  const { state } = useContext(AppContext);
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const pick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const item = { name: file.name, dataUrl: String(reader.result), size: file.size };
      setItems(x => [item, ...x]);
      setSelected(item);
      setResult(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const doAI = async () => {
    if (!selected) return;
    setLoading(true); setResult(null);
    try {
      const text = await analyzePhoto(
        { apiKey: state.aiApiKey, settings: state.aiSettings },
        '请分析这张照片的曝光、色彩、构图和人物姿势，用中文给出简短专业的后期建议，100字以内。',
        selected.dataUrl,
      );
      setResult(text);
    } catch (e) {
      setResult('分析失败：' + (e.message || String(e)));
    } finally { setLoading(false); }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">本地媒体</h2>
          <button className="btn-icon" title="设置" onClick={() => navigate('/settings')}>⚙️</button>
        </div>

        <div className="flex gap-2 mb-4">
          <button className="btn btn-primary flex-1 text-xs" onClick={() => inputRef.current?.click()}>➕ 选择本地照片</button>
          <button className="btn btn-secondary text-xs" onClick={() => setSelected(null)}>刷新</button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pick} />
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-6xl mb-5 opacity-25">🖼</span>
            <h3 className="font-bold text-sm mb-2">暂无本地媒体</h3>
            <p className="text-xs text-[#9898ac] leading-5 max-w-xs">选择照片后可进行 AI 修图与模特姿势建议。</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map((item, i) => (
              <button key={i} className={`glass-sm p-2 text-left ${selected === item ? 'ring-2 ring-blue-500' : ''}`} onClick={() => { setSelected(item); setResult(null); }}>
                <img src={item.dataUrl} className="aspect-square w-full object-cover rounded-lg" alt={item.name} />
                <p className="text-[10px] mt-2 truncate">{item.name}</p>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="glass mt-4 p-4 anim-slide-up">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-bold">{selected.name}</p>
                <p className="text-[10px] text-[#9898ac] mt-0.5">模型：{state.aiSettings?.model || 'deepseek-chat'}</p>
              </div>
              <button className="btn btn-primary text-xs" onClick={doAI} disabled={loading}>
                {loading ? '⏳ 分析中…' : '🤖 AI 修图建议'}
              </button>
              <button
                className="btn btn-secondary text-xs"
                onClick={() => navigate('/editor', { state: { src: selected.dataUrl, name: selected.name } })}
              >
                ✨ 进入修图
              </button>
            </div>
            {loading && <div className="text-xs text-[#9898ac] py-4 text-center">正在调用模型…</div>}
            {result && <pre className="text-xs text-[#e4e4ec] bg-white/5 p-4 rounded-xl whitespace-pre-wrap">{result}</pre>}
            <p className="text-[10px] text-[#585870] mt-3">模型与接口可在设置中切换，需在设置中配置 API Key。</p>
          </div>
        )}
      </div>
    </div>
  );
}
