import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App.jsx';
import { camera } from '../api.js';

export default function CameraPhotosScreen() {
  const { state } = useContext(AppContext);
  const navigate = useNavigate();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const connected = state.connectionState === 'session_open';

  useEffect(() => {
    if (connected) load();
  }, [connected]);

  const load = async () => {
    setLoading(true);
    try { setImages((await camera.getImages()) || []); }
    catch {} finally { setLoading(false); }
  };

  const openEditor = async (img) => {
    const data = img.dataUrl || await camera.getImageData(img.handle).catch(() => null);
    if (data) {
      navigate('/editor', { state: { src: data, name: img.fileName || `DSC_${img.handle}.NEF` } });
    } else {
      alert('暂未取到照片数据，请使用实验模式或确认相机连接。');
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">相机照片</h2>
          <span className={`badge text-[10px] ${connected ? 'badge-green' : 'badge-yellow'}`}>{connected ? '● 已连接' : '● 未连接'}</span>
        </div>

        {!connected ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-6xl mb-5 opacity-25">📷</span>
            <h3 className="font-bold text-sm mb-2">正在检测相机服务中</h3>
            <p className="text-xs text-[#9898ac] leading-5 max-w-xs">
              未发现相机服务。请先连接相机 Wi-Fi，并确认相机处于传输模式。<br />若使用 STA，请连接相机并输入相机屏幕显示的 IP。
            </p>
            <button className="btn btn-primary w-56 mt-6" onClick={() => navigate('/camera')}>连接相机</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-[#9898ac]">连接相机后会自动加载照片列表</p>
              <button className="btn btn-secondary text-xs" onClick={load} disabled={loading}>{loading ? '⏳' : '↻ 刷新'}</button>
            </div>
            {images.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <span className="text-6xl mb-5 opacity-25">🖼</span>
                <h3 className="font-bold text-sm mb-2">暂无相机照片</h3>
                <p className="text-xs text-[#9898ac]">点击刷新从相机获取照片列表</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {images.map((img, i) => (
                  <div key={i} className="glass-sm p-2 cursor-pointer" onClick={() => setSelected(img)}>
                    <div className="aspect-square rounded-lg bg-[#111] flex items-center justify-center text-3xl overflow-hidden">
                      {img.thumb || img.dataUrl
                        ? <img src={img.thumb || img.dataUrl} className="w-full h-full object-cover" alt="" />
                        : '🏔'}
                    </div>
                    <p className="text-[10px] mt-2 truncate">{img.fileName || `DSC_${img.handle}.NEF`}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {selected && (
          <div className="glass mt-4 p-4">
            <div className="flex justify-between items-center">
              <p className="text-sm font-bold">{selected.fileName || `DSC_${selected.handle}.NEF`}</p>
              <button className="text-[#9898ac]" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button className="btn btn-primary text-xs" onClick={() => openEditor(selected)}>✨ 进入修图</button>
              <button className="btn btn-primary text-xs" onClick={() => navigate('/local')}>🤖 AI 修图</button>
              <button className="btn btn-secondary text-xs" onClick={() => navigate('/liveview')}>📷 继续拍摄</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
