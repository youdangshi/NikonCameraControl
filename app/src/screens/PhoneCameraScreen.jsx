import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import {
  Camera,
  CameraDirection,
  CameraResultType,
  CameraSource,
} from '@capacitor/camera';
import {
  ArrowLeft, Camera as CameraIcon, Images, RefreshCw, SlidersHorizontal, SwitchCamera,
} from 'lucide-react';

export default function PhoneCameraScreen() {
  const navigate = useNavigate();
  const fallbackInputRef = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [direction, setDirection] = useState('rear');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const readFallbackFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto({
        src: String(reader.result),
        name: file.name || `phone-${Date.now()}.jpg`,
        savedToGallery: false,
      });
      setError('');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const takePhoto = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (!Capacitor.isNativePlatform()) {
        fallbackInputRef.current?.click();
        return;
      }

      const permission = await Camera.checkPermissions();
      if (permission.camera !== 'granted' && permission.camera !== 'limited') {
        const requested = await Camera.requestPermissions({ permissions: ['camera'] });
        if (requested.camera !== 'granted' && requested.camera !== 'limited') {
          throw new Error('没有获得手机相机权限，请在系统设置中允许妮妮使用相机。');
        }
      }

      const captured = await Camera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.DataUrl,
        direction: direction === 'front' ? CameraDirection.Front : CameraDirection.Rear,
        quality: 94,
        correctOrientation: true,
        allowEditing: false,
        saveToGallery: true,
        promptLabelHeader: '手机相机',
        promptLabelPicture: '拍照',
      });
      if (!captured.dataUrl) throw new Error('相机没有返回照片数据。');
      setPhoto({
        src: captured.dataUrl,
        name: `手机照片_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`,
        savedToGallery: true,
      });
    } catch (captureError) {
      const message = captureError?.message || String(captureError);
      if (/cancel/i.test(message)) setError('');
      else setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-black text-white overflow-hidden">
      <div className="flex-shrink-0 h-[58px] px-3 flex items-center gap-3 border-b border-white/10 bg-[#0a0c0e]">
        <button className="btn-icon" onClick={() => navigate(-1)} aria-label="返回"><ArrowLeft size={19} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">手机相机</p>
          <p className="text-[9px] text-white/45 mt-0.5">使用手机镜头拍照并保存到系统相册</p>
        </div>
        <button
          type="button"
          className="h-9 px-3 rounded-md border border-white/12 bg-white/5 flex items-center gap-2 text-[10px] font-semibold"
          onClick={() => setDirection(current => current === 'rear' ? 'front' : 'rear')}
          disabled={busy}
        >
          <SwitchCamera size={15} />
          {direction === 'rear' ? '后置' : '前置'}
        </button>
      </div>

      <div className="flex-1 min-h-0 relative bg-[#07090a] flex items-center justify-center">
        {photo ? (
          <img src={photo.src} alt="手机拍摄照片" className="w-full h-full object-contain" />
        ) : (
          <div className="text-center px-8 max-w-sm">
            <div className="w-20 h-20 rounded-full border border-white/12 bg-white/5 mx-auto flex items-center justify-center">
              <CameraIcon size={36} className="text-white/55" strokeWidth={1.4} />
            </div>
            <h1 className="text-lg font-semibold mt-5">使用手机镜头拍照</h1>
            <p className="text-[11px] leading-5 text-white/50 mt-2">
              点击下方快门后进入系统相机。拍摄完成会自动保存到相册，并返回妮妮进行预览和修图。
            </p>
          </div>
        )}
        {error && <div className="absolute left-4 right-4 top-4 rounded-md border border-red-400/30 bg-red-950/80 px-3 py-2 text-[10px] leading-4 text-red-100">{error}</div>}
        {busy && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><span className="text-xs text-white/70">正在打开手机相机…</span></div>}
      </div>

      <div className="flex-shrink-0 px-4 pt-3 pb-4 border-t border-white/10 bg-[#0a0c0e]" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div className="max-w-[760px] mx-auto">
          <div className="flex items-center justify-center">
            <button
              type="button"
              className="w-20 h-20 rounded-full border-[5px] border-white bg-white flex items-center justify-center disabled:opacity-50"
              onClick={takePhoto}
              disabled={busy}
              aria-label="拍照"
            >
              <span className="w-14 h-14 rounded-full border-2 border-black/30" />
            </button>
          </div>
          {photo && (
            <div className="grid grid-cols-3 gap-2 mt-4">
              <button className="btn btn-secondary" onClick={takePhoto} disabled={busy}><RefreshCw size={14} /> 重拍</button>
              <button className="btn btn-primary" onClick={() => navigate('/editor', { state: { src: photo.src, name: photo.name } })}><SlidersHorizontal size={15} /> 修图</button>
              <button className="btn btn-secondary" onClick={() => navigate('/local')}><Images size={15} /> 本地照片</button>
            </div>
          )}
          {photo && (
            <p className="text-center text-[9px] text-white/40 mt-3">
              {photo.savedToGallery ? '已保存到系统相册，可继续修图或返回本地照片。' : '照片已载入妮妮，请在系统相册中确认保存状态。'}
            </p>
          )}
        </div>
      </div>

      <input ref={fallbackInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={readFallbackFile} />
    </div>
  );
}
