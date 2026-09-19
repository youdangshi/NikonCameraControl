import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App.jsx';
import { ArrowRight, CheckCircle2, CloudUpload, FolderSync, HardDrive, RefreshCw, Wifi } from 'lucide-react';

export default function SyncScreen() {
  const { state } = useContext(AppContext);
  const navigate = useNavigate();
  const connected = state.connectionState === 'session_open';

  return (
    <div className="page">
      <div className="page-inner space-y-4">
        <div>
          <p className="section-label">TRANSFER QUEUE</p>
          <h1 className="text-xl font-bold mt-1">同步任务</h1>
        </div>

        <section className="panel overflow-hidden">
          <div className="p-5 flex items-start gap-4">
            <div className="w-11 h-11 rounded-lg bg-[var(--surface-raised)] border border-[var(--line)] flex items-center justify-center flex-shrink-0">
              <CloudUpload size={21} className={connected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold">{connected ? '同步通道已就绪' : '等待相机连接'}</h2>
              <p className="text-[11px] leading-5 text-[var(--text-soft)] mt-1">
                {connected ? '从相机照片中选择项目即可加入传输队列。' : '连接相机后才能开始传输相机存储卡中的照片和视频。'}
              </p>
              <button className="btn btn-primary mt-4" onClick={() => navigate(connected ? '/photos' : '/camera')}>
                {connected ? '选择相机照片' : '连接相机'} <ArrowRight size={14} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 border-t border-[var(--line)]">
            {[
              [RefreshCw, '队列', '0'],
              [FolderSync, '已完成', '0'],
              [HardDrive, '缓存', '0 MB'],
            ].map(([Icon, label, value]) => (
              <div key={label} className="py-3 text-center border-r last:border-r-0 border-[var(--line)]">
                <Icon size={15} className="mx-auto text-[var(--text-muted)]" />
                <p className="mono text-sm font-semibold mt-1">{value}</p>
                <p className="text-[9px] text-[var(--text-muted)] mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="px-4 py-3 border-b border-[var(--line)]">
            <p className="section-label">PREFERENCES</p>
            <p className="section-title mt-1">传输规则</p>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {[
              [Wifi, '仅通过 WiFi 传输', connected ? '已启用' : '等待连接'],
              [CheckCircle2, '完成后自动生成修图预览', '已启用'],
              [HardDrive, '保留原始文件', '已启用'],
            ].map(([Icon, label, status]) => (
              <div key={label} className="px-4 py-3 flex items-center gap-3">
                <Icon size={16} className="text-[var(--text-muted)]" />
                <span className="text-[11px] flex-1">{label}</span>
                <span className="text-[10px] text-[var(--text-muted)]">{status}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
