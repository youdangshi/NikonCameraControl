import React, { useState, useContext } from 'react';
import { AppContext } from '../App.jsx';
import { AI_PROVIDERS } from '../ai.js';
import { POSE_ITEMS } from '../components/PoseLibrary.jsx';

export default function SettingsScreen() {
  const { state, updateState, updatePoseGuides, updateAiSettings } = useContext(AppContext);
  const [apiKey, setApiKey] = useState(state.aiApiKey);
  const [saved, setSaved] = useState(false);
  const pg = state.poseGuides;

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-lg mx-auto p-4 space-y-3">
        <h2 className="text-lg font-bold">⚙ 设置</h2>
        <div className="glass p-5">
          <div className="text-[11px] font-semibold text-[#9898ac] mb-3">🤖 DeepSeek API Key（AI 修图）</div>
          <div className="flex gap-2">
            <input className="input flex-1" type="password" placeholder="sk-xxxxxxxxxxxxxxxx" value={apiKey} onChange={e=>setApiKey(e.target.value)} />
            <button className={`btn ${saved?'bg-green-600 text-white':'btn-primary'}`} onClick={()=>{updateState({aiApiKey:apiKey});localStorage.setItem('nikon_ai_key',apiKey);setSaved(true);setTimeout(()=>setSaved(false),2000);}}>{saved?'✓ 已保存':'保存'}</button>
          </div>
          <p className="text-[10px] text-[#585870] mt-2">在 platform.deepseek.com 获取 API Key</p>
        </div>
        <div className="glass p-5">
          <div className="text-[11px] font-semibold text-[#9898ac] mb-3">🧠 AI 模型选择</div>
          <div className="mb-3">
            <label className="text-[10px] text-[#585870]">提供商</label>
            <select className="select w-full mt-1 text-xs" value={state.aiSettings.provider}
              onChange={e => updateAiSettings({ provider: e.target.value })}>
              {AI_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="mb-3">
            <label className="text-[10px] text-[#585870]">接口地址（兼容 OpenAI /chat/completions）</label>
            <input className="input w-full mt-1 text-xs mono" placeholder="https://api.deepseek.com/v1/chat/completions"
              value={state.aiSettings.endpoint} onChange={e => updateAiSettings({ endpoint: e.target.value })} />
          </div>
          <div>
            <label className="text-[10px] text-[#585870]">模型名</label>
            <input className="input w-full mt-1 text-xs" placeholder="deepseek-chat"
              value={state.aiSettings.model} onChange={e => updateAiSettings({ model: e.target.value })} />
          </div>
          <p className="text-[10px] text-[#585870] mt-2">DeepSeek 或任意 OpenAI 兼容模型均可；支持视觉的模型会接收图片。</p>
        </div>
        <div className="glass p-5">
          <div className="text-[11px] font-semibold text-[#9898ac] mb-3">📡 默认连接参数</div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] text-[#585870]">默认 IP</label><input className="input w-full mt-1" defaultValue="192.168.1.1" /></div>
            <div><label className="text-[10px] text-[#585870]">端口</label><input className="input w-full mt-1" defaultValue="15740" type="number" /></div>
          </div>
        </div>
        <div className="glass p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] font-semibold text-[#9898ac]">📐 人像姿势框线</div>
            <label className="flex items-center gap-2 text-xs text-[#e4e4ec]">
              <input type="checkbox" className="accent-blue-500 w-4 h-4" checked={pg.enabled}
                onChange={e=>updatePoseGuides({enabled:e.target.checked})} />
              启用
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {POSE_ITEMS.map(p => (
              <button key={p.id} className={`btn text-[11px] py-2 ${pg.mode===p.id?'bg-blue-600 text-white':'bg-white/5 text-[#9898ac]'}`}
                onClick={()=>updatePoseGuides({mode:p.id})}>{p.icon} {p.label}</button>
            ))}
          </div>
          <div className="mb-3">
            <div className="flex items-center justify-between text-[10px] text-[#9898ac] mb-1">
              <span>透明度</span><span className="mono">{Math.round((pg.opacity||0)*100)}%</span>
            </div>
            <input type="range" min="0.1" max="1" step="0.05" value={pg.opacity||0.55}
              onChange={e=>updatePoseGuides({opacity:parseFloat(e.target.value)})}
              className="w-full accent-blue-500" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#9898ac]">线条颜色</span>
            <div className="flex items-center gap-2">
              {['#ffffff','#fbbf24','#60a5fa','#f87171'].map(c => (
                <button key={c} className="w-6 h-6 rounded-full border-2"
                  style={{background:c, borderColor:pg.color===c?'#ffffff':'rgba(255,255,255,0.2)'}}
                  onClick={()=>updatePoseGuides({color:c})} aria-label={`颜色 ${c}`} />
              ))}
              <input type="color" value={pg.color||'#ffffff'} onChange={e=>updatePoseGuides({color:e.target.value})}
                className="w-7 h-7 bg-transparent border-0 cursor-pointer" aria-label="自定义颜色" />
            </div>
          </div>
          <p className="text-[10px] text-[#585870] mt-3">打开实时取景后生效，取景与拍照时都会显示。</p>
        </div>
        <div className="glass p-5">
          <div className="text-[11px] font-semibold text-[#9898ac] mb-3">🪄 AI 修图选项</div>
          {['拍摄后自动 AI 分析','保持原始 Raw 文件','批量 AI 处理'].map((l,i)=>(
            <div key={i} className="flex items-center gap-2 py-2"><input type="checkbox" defaultChecked={i===1} className="accent-blue-500 w-4 h-4 rounded" /><span className="text-sm text-[#e4e4ec]">{l}</span></div>
          ))}
        </div>
        <div className="glass p-5">
          <div className="text-[11px] font-semibold text-[#9898ac] mb-3">ℹ 关于</div>
          <div className="text-xs text-[#9898ac] space-y-1"><p className="text-[#e4e4ec] font-semibold">Nikon Camera Control v1.0.0</p><p>跨平台无线相机控制 · Windows / macOS / Android</p><p>PTP/IP · React · Capacitor · DeepSeek AI</p></div>
        </div>
      </div>
    </div>
  );
}
