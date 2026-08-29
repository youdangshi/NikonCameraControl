import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App.jsx';
import { camera } from '../api.js';

export default function GalleryScreen() {
  const { state } = useContext(AppContext);
  const navigate = useNavigate();
  const [images, setImages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [dl, setDl] = useState(false);

  const doDownload = async () => {
    setDl(true);
    try { const imgs = await camera.getImages(); setImages(prev=>[...(imgs||[]),...prev]); }
    catch {} finally { setDl(false); }
  };

  const doAI = async (img) => {
    if(!state.aiApiKey){ alert('请先在设置中配置 DeepSeek API Key'); return; }
    setSelected(img); setAiLoading(true); setAiResult(null);
    try {
      const res = await fetch('https://api.deepseek.com/v1/chat/completions',{
        method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${state.aiApiKey}`},
        body:JSON.stringify({model:'deepseek-chat',messages:[{role:'user',content:'分析这张照片的曝光、色彩、构图,用中文给出简短专业的后期建议,100字以内'}]}),
      });
      const d = await res.json(); setAiResult(d.choices?.[0]?.message?.content||'AI分析暂不可用');
    } catch(e) { setAiResult('分析失败: '+e.message); }
    finally { setAiLoading(false); }
  };

  const openEditor = async (img) => {
    let data = img.dataUrl;
    if (!data) {
      try { data = await camera.getImageData(img.handle); } catch {}
    }
    if (data) {
      navigate('/editor', { state: { src: data, name: img.fileName || `DSC_${img.handle}.NEF` } });
      return;
    }
    alert('当前照片暂未取到图片数据，请先使用演示模式或确认相机已连接。');
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">🖼 相册</h2>
          <button className="btn btn-primary text-xs" disabled={dl} onClick={doDownload}>{dl?'⏳ 传输中…':'📥 下载最新'}</button>
        </div>
        {images.length===0 ? (
          <div className="text-center py-20"><span className="text-6xl block mb-4 opacity-20">🖼</span><p className="text-[#9898ac]">暂无照片</p><p className="text-[#585870] text-xs mt-1">点击"下载最新"从相机获取</p></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {images.map((img,i)=>(
              <div key={i} className="glass-sm overflow-hidden cursor-pointer group relative" onClick={()=>setSelected(img)}>
                <div className="aspect-square bg-[#111] flex items-center justify-center text-4xl group-hover:scale-105 transition-transform">
                  {img.thumb || img.dataUrl
                    ? <img src={img.thumb || img.dataUrl} className="w-full h-full object-cover" alt="" />
                    : '🏔'}
                </div>
                <div className="p-2"><p className="text-[11px] font-medium truncate">{img.fileName||'DSC_'+img.handle+'.NEF'}</p></div>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="w-8 h-8 rounded-lg bg-black/60 backdrop-blur border border-white/10 text-sm flex items-center justify-center"
                    onClick={e=>{e.stopPropagation();openEditor(img);}}>✨</button>
                  <button className="w-8 h-8 rounded-lg bg-black/60 backdrop-blur border border-white/10 text-sm flex items-center justify-center"
                    onClick={e=>{e.stopPropagation();doAI(img);}}>🪄</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {(selected||aiResult) && (
          <div className="glass mt-4 p-5 anim-slide-up">
            <div className="flex justify-between mb-3"><h3 className="font-bold text-sm">{aiLoading?'🤖 AI 分析中…':'🤖 AI 修图建议'}</h3><button className="text-[#9898ac] hover:text-white" onClick={()=>{setSelected(null);setAiResult(null);}}>✕</button></div>
            {aiLoading && <div className="flex items-center justify-center py-8 gap-3"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/><span className="text-[#9898ac] text-sm">DeepSeek 分析中…</span></div>}
            {aiResult && <><pre className="text-xs text-[#e4e4ec] bg-white/5 p-4 rounded-xl whitespace-pre-wrap">{aiResult}</pre><div className="flex gap-2 mt-3"><button className="btn btn-primary flex-1 text-xs">✨ 应用 AI 增强</button><button className="btn btn-secondary text-xs">📋 复制建议</button></div></>}
          </div>
        )}
      </div>
    </div>
  );
}
