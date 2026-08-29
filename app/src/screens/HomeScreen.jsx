import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App.jsx';

export default function HomeScreen() {
  const { state } = useContext(AppContext);
  const navigate = useNavigate();
  const [stats, setStats] = useState({ synced: 0, pending: 0, files: 0, capacity: 0 });

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('nikon_sync_stats') || 'null');
      if (s) setStats(s);
    } catch {}
  }, []);

  const connected = state.connectionState === 'session_open';

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">同步总览</h2>
          <button className="btn-icon" title="通知" onClick={() => {}}>🔔</button>
        </div>

        <div className="glass p-5 mb-4 anim-fade">
          <div className="flex items-center justify-between">
            <span className="text-[10px] tracking-widest text-[#9898ac]">CAMERA SYNC</span>
            <span className={`badge text-[10px] ${connected ? 'badge-green' : 'badge-yellow'}`}>{connected ? '● 已连接' : '● 未开始'}</span>
          </div>
          <h3 className="text-xl font-bold mt-1">同步仪表盘</h3>

          <div className="relative w-40 h-40 mx-auto my-6">
            <div className="absolute inset-0 rounded-full border-[12px] border-white/10" />
            <div className="absolute inset-0 rounded-full border-[12px] border-blue-500" style={{ clipPath: 'inset(0 100% 0 0)', transform: `rotate(${stats.pending ? 45 : 0}deg)` }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-extrabold">{stats.pending ? Math.min(99, Math.round(stats.pending)) : 0}%</span>
              <span className="text-xs text-[#9898ac] mt-1">{stats.pending ? '同步中' : '待同步'}</span>
            </div>
          </div>

          <h4 className="font-bold text-sm mb-1">{stats.pending ? '正在同步' : '暂无同步任务'}</h4>
          <p className="text-xs text-[#9898ac] mb-4">{stats.pending ? `${stats.files} 个文件正在同步` : '连接相机后，选择照片即可开始同步。'}</p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl bg-black/35 p-3">
              <p className="text-[10px] text-[#9898ac]">文件</p>
              <p className="text-lg font-bold">{stats.files}/0</p>
            </div>
            <div className="rounded-xl bg-black/35 p-3">
              <p className="text-[10px] text-[#9898ac]">容量</p>
              <p className="text-lg font-bold">{(stats.capacity / 1024 / 1024).toFixed(0)} MB / 0 MB</p>
            </div>
          </div>

          <button className="btn btn-primary w-full" onClick={() => navigate('/settings')}>登录</button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            ['今日已同步', stats.synced],
            ['待同步', stats.pending],
            ['剩余', '—'],
          ].map(([label, value]) => (
            <div key={label} className="glass-sm p-4 text-center">
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-[10px] text-[#9898ac] mt-1">{label}</p>
            </div>
          ))}
        </div>

        {!connected && (
          <button className="btn btn-primary w-full" onClick={() => navigate('/camera')}>📷 连接相机</button>
        )}
      </div>
    </div>
  );
}
