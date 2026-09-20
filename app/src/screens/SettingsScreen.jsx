import React, { useContext, useState } from 'react';
import { AppContext } from '../App.jsx';
import { AI_PROVIDERS } from '../ai.js';
import { POSE_ITEMS } from '../components/PoseLibrary.jsx';
import {
  Bot, Cable, Check, Info, KeyRound, Palette, Save, SlidersHorizontal, UserRound,
} from 'lucide-react';

function Section({ icon: Icon, title, description, children }) {
  return (
    <section className="panel">
      <div className="px-4 py-3 border-b border-[var(--line)] flex items-start gap-3">
        <Icon size={17} className="text-[var(--text-soft)] flex-shrink-0 mt-0.5" />
        <div>
          <p className="section-title">{title}</p>
          {description && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function SettingsScreen() {
  const { state, updateState, updatePoseGuides, updateAiSettings } = useContext(AppContext);
  const [apiKey, setApiKey] = useState(state.aiApiKey);
  const [saved, setSaved] = useState(false);
  const pose = state.poseGuides;

  const saveKey = () => {
    updateState({ aiApiKey: apiKey });
    localStorage.setItem('nikon_ai_key', apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="page">
      <div className="page-inner space-y-4">
        <div>
          <p className="section-label">偏好设置</p>
          <h1 className="text-xl font-bold mt-1">设置</h1>
        </div>

        <Section icon={KeyRound} title="AI 服务密钥" description="用于本地照片分析与人像修图建议">
          <div className="flex gap-2">
            <input className="input flex-1" type="password" placeholder="API Key" value={apiKey} onChange={event => setApiKey(event.target.value)} />
            <button className={`btn ${saved ? 'btn-secondary' : 'btn-primary'}`} onClick={saveKey}>
              {saved ? <Check size={15} /> : <Save size={15} />}{saved ? '已保存' : '保存'}
            </button>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-2">密钥只保存在当前设备，不会上传到相机或妮妮服务器。</p>
        </Section>

        <Section icon={Bot} title="AI 模型" description="支持 DeepSeek 或其他 OpenAI 兼容接口">
          <label className="block text-[10px] text-[var(--text-muted)] mb-1.5">服务提供商</label>
          <select className="select mb-3" value={state.aiSettings.provider} onChange={event => updateAiSettings({ provider: event.target.value })}>
            {AI_PROVIDERS.map(provider => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
          </select>
          <label className="block text-[10px] text-[var(--text-muted)] mb-1.5">接口地址</label>
          <input className="input mono mb-3" placeholder="https://api.deepseek.com/v1/chat/completions" value={state.aiSettings.endpoint} onChange={event => updateAiSettings({ endpoint: event.target.value })} />
          <label className="block text-[10px] text-[var(--text-muted)] mb-1.5">模型名称</label>
          <input className="input mono" placeholder="deepseek-chat" value={state.aiSettings.model} onChange={event => updateAiSettings({ model: event.target.value })} />
        </Section>

        <Section icon={Cable} title="相机连接" description="默认网络地址和 PTP/IP 端口">
          <div className="grid grid-cols-[1fr_104px] gap-3">
            <div>
              <label className="block text-[10px] text-[var(--text-muted)] mb-1.5">默认 IP</label>
              <input className="input mono" defaultValue="192.168.1.1" />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--text-muted)] mb-1.5">端口</label>
              <input className="input mono" defaultValue="15740" inputMode="numeric" />
            </div>
          </div>
        </Section>

        <Section icon={UserRound} title="人像姿势框线" description="在实时取景中叠加人物姿态参考">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px]">启用姿势框线</span>
            <button
              type="button"
              className={`w-11 h-6 rounded-full border relative transition-colors ${pose.enabled ? 'bg-[var(--accent)] border-[var(--accent)]' : 'bg-[#171b1f] border-[var(--line-strong)]'}`}
              onClick={() => updatePoseGuides({ enabled: !pose.enabled })}
              aria-label="切换姿势框线"
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${pose.enabled ? 'left-[22px] bg-[var(--accent-ink)]' : 'left-0.5 bg-[var(--text-muted)]'}`} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {POSE_ITEMS.map(item => (
              <button key={item.id} className={`grid-chip ${pose.mode === item.id ? 'active' : ''}`} onClick={() => updatePoseGuides({ mode: item.id })}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-2"><span>透明度</span><span className="mono">{Math.round((pose.opacity || 0) * 100)}%</span></div>
            <input type="range" min="0.1" max="1" step="0.05" value={pose.opacity || 0.55} onChange={event => updatePoseGuides({ opacity: Number(event.target.value) })} className="w-full accent-[var(--accent)]" />
          </div>
        </Section>

        <Section icon={Palette} title="界面与画质">
          {['保留原始文件', '拍摄后生成分析提示', '高质量导出'].map((label, index) => (
            <label key={label} className="flex items-center gap-3 py-2.5 border-b last:border-b-0 border-[var(--line)]">
              <input type="checkbox" defaultChecked={index !== 0} className="w-4 h-4 accent-[var(--accent)]" />
              <span className="text-[11px]">{label}</span>
            </label>
          ))}
        </Section>

        <Section icon={Info} title="关于妮妮" description="Android 相机控制与修图应用">
          <div className="space-y-2 text-[10px] text-[var(--text-soft)]">
            <div className="flex justify-between"><span>版本</span><span className="mono">1.4.2</span></div>
            <div className="flex justify-between"><span>相机协议</span><span className="mono">PTP / PTP-IP</span></div>
            <div className="flex justify-between"><span>图像处理</span><span>本地画布引擎</span></div>
          </div>
        </Section>
      </div>
    </div>
  );
}
