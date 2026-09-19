import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App.jsx';
import { camera } from '../api.js';
import {
  Camera, Film, Image as ImageIcon, Images, RefreshCw, SlidersHorizontal, Sparkles, X,
} from 'lucide-react';

const FILTERS = [
  { id: 'all', label: '全部', icon: Images },
  { id: 'photo', label: '照片', icon: ImageIcon },
  { id: 'video', label: '视频', icon: Film },
];

function isVideo(item) {
  return /\.(MOV|MP4|M4V|AVI)$/i.test(item.fileName || '');
}

export default function CameraPhotosScreen() {
  const { state } = useContext(AppContext);
  const navigate = useNavigate();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const cancelledRef = useRef(false);
  const connected = state.connectionState === 'session_open';

  const load = useCallback(async () => {
    cancelledRef.current = false;
    setLoading(true);
    setLoadError('');
    try {
      const list = (await camera.getImages()) || [];
      if (cancelledRef.current) return;
      setImages(list);
      for (const img of list.slice(0, 60)) {
        if (cancelledRef.current) return;
        try {
          const thumb = await camera.getThumbnail(img.handle);
          if (cancelledRef.current || !thumb?.dataUrl) continue;
          setImages(previous => previous.map(item => item.handle === img.handle ? { ...item, thumb: thumb.dataUrl } : item));
        } catch {}
      }
    } catch (e) {
      if (!cancelledRef.current) {
        setImages([]);
        setLoadError(e?.message || String(e));
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (connected) load();
    return () => { cancelledRef.current = true; };
  }, [connected, load]);

  const visibleImages = useMemo(() => images.filter(item => {
    if (filter === 'photo') return !isVideo(item);
    if (filter === 'video') return isVideo(item);
    return true;
  }), [images, filter]);

  const openEditor = async (img) => {
    const data = img.dataUrl || await camera.getImageData(img.handle).catch(() => null);
    if (data) navigate('/editor', { state: { src: data, name: img.fileName || `DSC_${img.handle}.JPG` } });
    else setLoadError('未能读取照片原始数据，请重新连接相机后再试。');
  };

  return (
    <div className="page">
      <div className="page-inner space-y-4 pb-24">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="section-label">CAMERA MEDIA</p>
            <h1 className="text-xl font-bold mt-1">相机存储卡</h1>
          </div>
          <button className="btn-icon" onClick={load} disabled={!connected || loading} aria-label="刷新">
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {!connected ? (
          <section className="panel py-20 px-6 text-center">
            <Camera size={38} className="mx-auto text-[var(--text-muted)]" strokeWidth={1.4} />
            <h2 className="text-sm font-semibold mt-4">相机尚未连接</h2>
            <p className="text-[11px] leading-5 text-[var(--text-soft)] mt-2">连接 WiFi 热点、STA 局域网或 USB Type-C 后即可读取存储卡。</p>
            <button className="btn btn-primary mt-5" onClick={() => navigate('/camera')}>连接相机</button>
          </section>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-2 overflow-x-auto">
                {FILTERS.map(({ id, label, icon: Icon }) => (
                  <button key={id} className={`grid-chip flex items-center gap-1.5 ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">{visibleImages.length} 项</span>
            </div>

            {loadError && (
              <div className="panel px-4 py-3 text-[11px] leading-5 text-[#ffb4b4]">{loadError}</div>
            )}

            {visibleImages.length === 0 ? (
              <section className="panel py-20 px-6 text-center">
                {loading ? <RefreshCw size={34} className="mx-auto text-[var(--text-muted)] animate-spin" /> : <Images size={38} className="mx-auto text-[var(--text-muted)]" strokeWidth={1.4} />}
                <h2 className="text-sm font-semibold mt-4">{loading ? '正在读取存储卡' : '没有可显示的项目'}</h2>
                <p className="text-[11px] text-[var(--text-soft)] mt-2">{loading ? '正在枚举目录并生成缩略图' : '请切换筛选条件或重新刷新。'}</p>
              </section>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2">
                {visibleImages.map(img => (
                  <button key={img.handle} type="button" className="relative aspect-square overflow-hidden rounded-md bg-[#0e1113] border border-[var(--line)]" onClick={() => setSelected(img)}>
                    {img.thumb || img.dataUrl ? (
                      <img src={img.thumb || img.dataUrl} className="w-full h-full object-cover" alt={img.fileName || ''} />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                        {isVideo(img) ? <Film size={22} /> : <ImageIcon size={22} />}
                      </span>
                    )}
                    <span className="absolute left-1 bottom-1 px-1.5 py-0.5 rounded bg-black/70 text-[8px] font-semibold text-white/90">
                      {isVideo(img) ? 'VIDEO' : 'JPEG'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {selected && (
        <div className="fixed left-0 right-0 bottom-0 z-50 border-t border-[var(--line)] bg-[#111417] px-4 pt-3 pb-4 shadow-2xl" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <div className="max-w-[760px] mx-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{selected.fileName || `DSC_${selected.handle}.JPG`}</p>
                <p className="mono text-[9px] text-[var(--text-muted)] mt-1">
                  {selected.width ? `${selected.width} × ${selected.height}` : '尺寸读取中'} · {selected.size ? `${(selected.size / 1024 / 1024).toFixed(1)} MB` : '大小未知'}
                </p>
              </div>
              <button className="btn-icon" onClick={() => setSelected(null)} aria-label="关闭"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <button className="btn btn-primary" onClick={() => openEditor(selected)}><SlidersHorizontal size={15} /> 修图</button>
              <button className="btn btn-secondary" onClick={() => navigate('/local')}><Sparkles size={15} /> AI 分析</button>
              <button className="btn btn-secondary" onClick={() => navigate('/liveview')}><Camera size={15} /> 继续拍摄</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
