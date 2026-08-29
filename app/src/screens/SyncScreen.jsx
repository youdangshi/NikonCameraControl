import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App.jsx';

export default function SyncScreen() {
  const { state } = useContext(AppContext);
  const navigate = useNavigate();
  const [tasks] = useState([]);
  const connected = state.connectionState === 'session_open';

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <h2 className="text-lg font-bold mb-4">同步任务</h2>
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <span className="text-6xl mb-5 opacity-25">↻</span>
            <h3 className="font-bold text-sm mb-2">没有可同步的文件</h3>
            <p className="text-xs text-[#9898ac]">连接相机并选择照片后，可在这里查看同步进度。</p>
            <button className="btn btn-primary mt-6" onClick={() => navigate(connected ? '/photos' : '/camera')}>
              {connected ? '查看相机照片' : '连接相机'}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((t, i) => (
              <div key={i} className="glass-sm p-4">
                <div className="flex justify-between text-sm"><span>{t.name}</span><span className="text-[#9898ac]">{t.progress}%</span></div>
                <div className="h-1.5 rounded-full bg-white/10 mt-2 overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${t.progress}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
