import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App.jsx';
import {
  Camera, ChevronRight, Images, MonitorPlay, RefreshCw, ShieldCheck, Wifi,
} from 'lucide-react';

function Stat({ value, label }) {
  return (
    <div className="min-w-0">
      <p className="metric-value truncate">{value}</p>
      <p className="metric-label truncate">{label}</p>
    </div>
  );
}

export default function HomeScreen() {
  const { state } = useContext(AppContext);
  const navigate = useNavigate();
  const [stats, setStats] = useState({ synced: 0, pending: 0, files: 0, capacity: 0 });
  const connected = state.connectionState === 'session_open';
  const staMode = connected && state.connectionMode === 'sta';
  const staTransferOnly = staMode;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('nikon_sync_stats') || 'null');
      if (saved) setStats(saved);
    } catch {}
  }, []);

  const mode = state.connectionMode === 'usb' ? 'USB Type-C' : state.connectionMode === 'sta' ? 'STA 局域网' : 'WiFi 热点';

  return (
    <div className="page">
      <div className="page-inner space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="section-label">尼康遥控</p>
            <h1 className="text-xl font-bold mt-1">拍摄控制台</h1>
          </div>
          <span className={`badge ${connected ? 'badge-green' : 'badge-yellow'}`}>
            <span className={`dot ${connected ? 'dot-green' : 'dot-yellow'}`} />
            {connected ? '相机在线' : '等待连接'}
          </span>
        </div>

        <section className="panel overflow-hidden">
          <div className="p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--surface-raised)] border border-[var(--line)] flex items-center justify-center flex-shrink-0">
              {connected ? <ShieldCheck size={20} className="text-[var(--green)]" /> : <Camera size={20} className="text-[var(--text-muted)]" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="section-label">当前设备</p>
              <p className="text-base font-semibold mt-0.5 truncate">{connected ? 'Nikon Z30' : '未连接相机'}</p>
              <p className="text-xs text-[var(--text-soft)] mt-1">
                {connected ? `${mode} · ${staTransferOnly ? '智能设备传输' : '遥控会话已建立'}` : '通过 WiFi 热点、STA 或 USB Type-C 建立连接'}
              </p>
            </div>
            {!connected && (
              <button className="btn btn-primary flex-shrink-0" onClick={() => navigate('/camera')}>连接</button>
            )}
          </div>
          {connected && (
            <div className="grid grid-cols-3 border-t border-[var(--line)]">
              {[
                ['实时取景', MonitorPlay, '/liveview'],
                ['相机照片', Images, '/photos'],
                ['同步任务', RefreshCw, '/sync'],
              ].map(([label, Icon, path]) => (
                <button
                  key={label}
                  type="button"
                  className="h-16 flex items-center justify-center gap-2 text-xs font-semibold text-[var(--text-soft)] border-r last:border-r-0 border-[var(--line)] disabled:opacity-40"
                  disabled={staTransferOnly && path === '/liveview'}
                  onClick={() => navigate(path)}
                >
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="panel overflow-hidden">
          <button
            type="button"
            className="w-full p-4 flex items-center gap-3 text-left"
            onClick={() => navigate('/phone-camera')}
          >
            <span className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] border border-[rgba(255,212,0,.24)] flex items-center justify-center flex-shrink-0">
              <Camera size={20} className="text-[var(--accent)]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold">手机相机</span>
              <span className="block text-[10px] text-[var(--text-muted)] mt-1">使用手机前后镜头拍照，自动保存并进入修图</span>
            </span>
            <ChevronRight size={16} className="text-[var(--text-muted)]" />
          </button>
        </section>

        <section className="panel">
          <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
            <div>
              <p className="section-label">传输同步</p>
              <p className="section-title mt-1">同步概况</p>
            </div>
            <button className="text-[11px] text-[var(--text-soft)] flex items-center" onClick={() => navigate('/sync')}>
              查看队列 <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-3 px-4 py-4">
            <Stat value={stats.synced || 0} label="今日已完成" />
            <div className="border-l border-[var(--line)] pl-4"><Stat value={stats.pending || 0} label="等待同步" /></div>
            <div className="border-l border-[var(--line)] pl-4"><Stat value={stats.files || 0} label="本次文件" /></div>
          </div>
          <div className="px-4 pb-4">
            <div className="h-1.5 rounded-full bg-[#242a2f] overflow-hidden">
              <div className="h-full bg-[var(--accent)]" style={{ width: stats.pending ? '42%' : '0%' }} />
            </div>
            <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-2">
              <span>{stats.pending ? '有任务等待处理' : '暂无待处理任务'}</span>
              <span>{(Number(stats.capacity || 0) / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="px-4 py-3 border-b border-[var(--line)]">
            <p className="section-label">连接方式</p>
            <p className="section-title mt-1">连接方式</p>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {[
              { icon: Wifi, title: '相机 WiFi 热点', desc: '相机直连，无需路由器', mode: 'wifi' },
              { icon: RefreshCw, title: 'STA 局域网', desc: '相机与手机处于同一网络', mode: 'sta' },
              { icon: Camera, title: 'USB Type-C', desc: '稳定、低延迟的有线控制', mode: 'usb' },
            ].map(({ icon: Icon, title, desc, mode: connectionMode }) => (
              <button key={connectionMode} type="button" className="w-full px-4 py-3 flex items-center gap-3 text-left" onClick={() => navigate('/camera')}>
                <Icon size={18} className="text-[var(--text-soft)] flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-semibold">{title}</span>
                  <span className="block text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{desc}</span>
                </span>
                <ChevronRight size={15} className="text-[var(--text-muted)]" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
