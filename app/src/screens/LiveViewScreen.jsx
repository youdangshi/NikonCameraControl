import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App.jsx';
import { camera } from '../api.js';
import PoseLibrary from '../components/PoseLibrary.jsx';
import CameraControlPanel from '../components/CameraControlPanel.jsx';
import CompositionGuides, { COMPOSITION_MODES } from '../components/CompositionGuides.jsx';
import {
  ArrowLeft, Aperture, Camera, Crosshair, Focus, Grid3X3, Maximize2, Minimize2,
  SlidersHorizontal, UserRound, Wifi,
} from 'lucide-react';

const INITIAL_QUICK = {
  expMode: '--',
  iso: '--',
  shutter: '--',
  aperture: '--',
  ev: 0,
};

const GUIDE_STORAGE = 'nini_composition_guide';

function initialGuide() {
  try {
    const saved = JSON.parse(localStorage.getItem(GUIDE_STORAGE) || 'null');
    if (saved && COMPOSITION_MODES.some(item => item.id === saved.mode)) return saved;
  } catch {}
  return { mode: 'thirds', opacity: 0.42 };
}

export default function LiveViewScreen() {
  const { state, updatePoseGuides } = useContext(AppContext);
  const navigate = useNavigate();
  const [lvOn, setLvOn] = useState(false);
  const [frame, setFrame] = useState(null);
  const [captured, setCaptured] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [lvError, setLvError] = useState('');
  const [fps, setFps] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [posePanelOpen, setPosePanelOpen] = useState(false);
  const [guidePanelOpen, setGuidePanelOpen] = useState(false);
  const [previewFit, setPreviewFit] = useState('contain');
  const [quick, setQuick] = useState(INITIAL_QUICK);
  const [guide, setGuide] = useState(initialGuide);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const lvRef = useRef(null);
  const lvTimerRef = useRef(null);
  const restartTimerRef = useRef(null);
  const lvRunningRef = useRef(false);
  const lvStartingRef = useRef(false);
  const frameStatsRef = useRef({ count: 0, startedAt: performance.now() });
  const mountedRef = useRef(true);
  const connected = state.connectionState === 'session_open';

  useEffect(() => {
    const unsubscribe = camera.on('captured', data => {
      if (!data?.success) return;
      setCaptured(true);
      setTimeout(() => mountedRef.current && setCaptured(false), 900);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    camera.setFullscreen(true);
    return () => { camera.setFullscreen(false); };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(GUIDE_STORAGE, JSON.stringify(guide)); } catch {}
  }, [guide]);

  useEffect(() => {
    const update = () => {
      const node = lvRef.current;
      if (node) setViewport({ width: node.clientWidth, height: node.clientHeight });
    };
    update();
    window.addEventListener('resize', update);
    let observer = null;
    if (typeof ResizeObserver !== 'undefined' && lvRef.current) {
      observer = new ResizeObserver(update);
      observer.observe(lvRef.current);
    }
    return () => {
      window.removeEventListener('resize', update);
      if (observer) observer.disconnect();
    };
  }, []);

  const startLV = async () => {
    if (lvRunningRef.current || lvStartingRef.current) return;
    lvStartingRef.current = true;
    setLvError('');
    try {
      await camera.startLiveView();
      if (!mountedRef.current) return;
      setLvOn(true);
      lvRunningRef.current = true;
      frameStatsRef.current = { count: 0, startedAt: performance.now() };

      const loop = async () => {
        if (!lvRunningRef.current || !mountedRef.current) return;
        try {
          const result = await camera.getLiveViewFrame();
          if (!mountedRef.current || !lvRunningRef.current) return;
          if (result?.frame) {
            setFrame(result.frame);
            const stats = frameStatsRef.current;
            stats.count += 1;
            const elapsed = performance.now() - stats.startedAt;
            if (elapsed >= 1000) {
              setFps(Math.max(1, Math.round((stats.count * 1000) / elapsed)));
              frameStatsRef.current = { count: 0, startedAt: performance.now() };
            }
          }
          if (result?.code) setLvError(`取景帧读取失败：PTP 0x${Number(result.code).toString(16)}`);
        } catch (e) {
          if (mountedRef.current) setLvError(`取景中断：${e.message || e}`);
        }
        if (lvRunningRef.current && mountedRef.current) lvTimerRef.current = setTimeout(loop, 65);
      };
      loop();
    } catch (e) {
      lvRunningRef.current = false;
      if (mountedRef.current) {
        setLvOn(false);
        setLvError(`启动实时取景失败：${e.message || e}`);
      }
    } finally {
      lvStartingRef.current = false;
    }
  };

  const stopLV = async (clearFrame = true) => {
    lvRunningRef.current = false;
    if (lvTimerRef.current) {
      clearTimeout(lvTimerRef.current);
      lvTimerRef.current = null;
    }
    await camera.stopLiveView().catch(() => {});
    if (mountedRef.current) {
      setLvOn(false);
      setFps(0);
      if (clearFrame) setFrame(null);
    }
  };

  useEffect(() => {
    if (!connected) return undefined;
    const timer = setTimeout(startLV, 220);
    return () => clearTimeout(timer);
    // The refs prevent duplicate starts when the connection state is unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => () => {
    mountedRef.current = false;
    lvRunningRef.current = false;
    lvStartingRef.current = false;
    if (lvTimerRef.current) clearTimeout(lvTimerRef.current);
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    camera.stopLiveView().catch(() => {});
  }, []);

  const doCapture = async () => {
    if (!connected || capturing) return;
    setCapturing(true);
    setLvError('');
    try {
      let result = await camera.capture();
      if (!result?.success && result?.code === 0x2019 && lvRunningRef.current) {
        await stopLV(false);
        await new Promise(resolve => setTimeout(resolve, 320));
        result = await camera.capture();
      }
      if (!result?.success) throw new Error(result?.code != null ? `PTP 0x${Number(result.code).toString(16)}` : '相机没有确认拍照');
      setCaptured(true);
      setTimeout(() => mountedRef.current && setCaptured(false), 900);
      if (lvRunningRef.current) await stopLV(false);
      restartTimerRef.current = setTimeout(() => {
        if (mountedRef.current && state.connectionState === 'session_open') startLV();
      }, 1000);
    } catch (e) {
      setLvError(`拍照失败：${e.message || e}`);
    } finally {
      if (mountedRef.current) setCapturing(false);
    }
  };

  const doAF = async () => {
    if (!connected) return;
    try {
      await camera.autoFocus();
      setLvError('');
    } catch (e) {
      setLvError(`自动对焦失败：${e.message || e}`);
    }
  };

  const handleTap = async (event) => {
    if (event.target.closest('button') || panelOpen || posePanelOpen || guidePanelOpen) return;
    const host = lvRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    await doAF();
    const dot = document.createElement('div');
    dot.className = 'absolute w-7 h-7 border border-[var(--accent)] rounded-full pointer-events-none z-30';
    dot.style.cssText = `left:${x}px;top:${y}px;transform:translate(-50%,-50%);animation:pulse 1s ease-out forwards`;
    host.appendChild(dot);
    setTimeout(() => dot.remove(), 1000);
  };

  const handleBack = async () => {
    await stopLV();
    navigate('/camera');
  };

  const guideLabel = COMPOSITION_MODES.find(item => item.id === guide.mode)?.label || '构图线';
  let guideRect = null;
  if (frame && viewport.width > 0 && viewport.height > 0 && imageSize.width > 0 && imageSize.height > 0) {
    if (previewFit === 'cover') {
      guideRect = { left: 0, top: 0, width: viewport.width, height: viewport.height };
    } else {
      const imageAspect = imageSize.width / imageSize.height;
      const viewAspect = viewport.width / viewport.height;
      let width;
      let height;
      if (imageAspect > viewAspect) {
        width = viewport.width;
        height = width / imageAspect;
      } else {
        height = viewport.height;
        width = height * imageAspect;
      }
      guideRect = { left: (viewport.width - width) / 2, top: (viewport.height - height) / 2, width, height };
    }
  }

  return (
    <div className="h-full w-full relative overflow-hidden bg-black text-white">
      <div ref={lvRef} className="absolute inset-0 cursor-crosshair" onClick={handleTap}>
        {frame ? (
          <img
            src={frame.startsWith('data:') ? frame : `data:image/jpeg;base64,${frame}`}
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: previewFit }}
            onLoad={event => setImageSize({ width: event.currentTarget.naturalWidth || 1, height: event.currentTarget.naturalHeight || 1 })}
            alt="实时取景"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            {!connected ? (
              <div className="text-center px-6">
                <Camera size={42} className="mx-auto text-white/25" strokeWidth={1.3} />
                <p className="text-sm text-white/60 mt-4">相机未连接</p>
                <button className="btn btn-primary mt-5" onClick={() => navigate('/camera')}>前往连接</button>
              </div>
            ) : (
              <div className="text-center">
                <Aperture size={40} className="mx-auto text-white/30 animate-spin" strokeWidth={1.2} />
                <p className="text-sm text-white/65 mt-4">{lvError ? '取景未启动' : '正在启动实时取景'}</p>
                {lvError && <button className="btn btn-primary mt-5" onClick={startLV}>重新启动</button>}
              </div>
            )}
          </div>
        )}

        {guideRect && (
          <div className="absolute pointer-events-none" style={guideRect}>
            <CompositionGuides mode={guide.mode} opacity={guide.opacity} color="#ffffff" />
          </div>
        )}

        <div className="absolute top-0 left-0 right-0 z-30 px-3 pt-3 pb-14 bg-gradient-to-b from-black/80 via-black/35 to-transparent pointer-events-none">
          <div className="flex items-center gap-2.5 pointer-events-auto">
            <button className="w-10 h-10 rounded-full bg-black/40 border border-white/15 flex items-center justify-center" onClick={handleBack} aria-label="返回">
              <ArrowLeft size={20} />
            </button>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-[var(--green)]' : 'bg-white/30'}`} />
            <span className="text-[11px] font-semibold whitespace-nowrap">{connected ? '相机已连接' : '未连接'}</span>
            <span className="text-[10px] text-white/45">Z30</span>
            <div className="ml-auto flex items-end gap-4">
              <div className="text-right leading-none">
                <div className="mono text-base font-semibold">{fps || '--'}<span className="text-[9px] ml-1">FPS</span></div>
                <div className="text-[9px] text-white/45 mt-1">实时</div>
              </div>
              <div className="text-right leading-none">
                <div className={`text-[12px] font-bold ${lvOn ? 'text-[var(--green)]' : 'text-white/35'}`}>LIVE</div>
                <div className="text-[9px] text-white/45 mt-1">{lvOn ? '取景中' : '待机'}</div>
              </div>
            </div>
          </div>
        </div>

        {lvError && frame && (
          <div className="absolute left-3 right-3 top-[84px] z-30 rounded-md bg-[var(--red)]/90 px-3 py-2 text-[11px] text-white shadow-lg">
            {lvError}
          </div>
        )}

        {posePanelOpen && (
          <PoseLibrary
            active={lvOn && state.poseGuides.enabled}
            pose={state.poseGuides.mode}
            opacity={state.poseGuides.opacity}
            color={state.poseGuides.color}
            scale={state.poseGuides.scale || 1}
            showTrigger={false}
            panelOpen
            onPanelOpenChange={setPosePanelOpen}
            onSelect={mode => updatePoseGuides({ mode })}
            onOpacityChange={opacity => updatePoseGuides({ opacity })}
            onColorChange={color => updatePoseGuides({ color })}
            onScaleChange={scale => updatePoseGuides({ scale })}
            onToggle={() => updatePoseGuides({ enabled: !state.poseGuides.enabled })}
          />
        )}

        {state.poseGuides.enabled && !posePanelOpen && (
          <PoseLibrary
            active={lvOn}
            pose={state.poseGuides.mode}
            opacity={state.poseGuides.opacity}
            color={state.poseGuides.color}
            scale={state.poseGuides.scale || 1}
            showTrigger={false}
            panelOpen={false}
            onPanelOpenChange={setPosePanelOpen}
          />
        )}

        {captured && (
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center z-40 pointer-events-none">
            <div className="w-16 h-16 rounded-full border border-white/40 bg-black/45 flex items-center justify-center">
              <Camera size={28} />
            </div>
          </div>
        )}
      </div>

      <button
        className="absolute left-3 right-3 bottom-[102px] z-40 h-11 rounded-md bg-black/60 backdrop-blur border border-white/10 flex items-center justify-center gap-4 px-4"
        onClick={() => { setGuidePanelOpen(false); setPosePanelOpen(false); setPanelOpen(value => !value); }}
      >
        {[quick.expMode, quick.shutter, quick.iso, quick.aperture].map((value, index) => (
          <span key={index} className="min-w-0 flex-1 text-center leading-none">
            <span className="mono block text-[12px] font-semibold truncate">{index === 2 && value !== '--' ? `ISO ${value}` : value}</span>
            <span className="block text-[8px] text-white/45 mt-1">{['模式', '快门', 'ISO', '光圈'][index]}</span>
          </span>
        ))}
        <SlidersHorizontal size={14} className="text-white/55 flex-shrink-0" />
      </button>

      <div className={`absolute left-0 right-0 bottom-[98px] z-40 border-t border-white/10 bg-[#0d1012]/98 ${panelOpen ? '' : 'hidden'}`} style={{ maxHeight: '62vh' }}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/8">
          <span className="text-[11px] font-semibold text-white/80">相机参数 · 实时生效</span>
          <button className="btn-icon w-8 h-8" onClick={() => setPanelOpen(false)} aria-label="收起参数">×</button>
        </div>
        <div className="overflow-auto" style={{ maxHeight: 'calc(62vh - 42px)' }}>
          <CameraControlPanel compact onStateChange={setQuick} />
        </div>
      </div>

      {guidePanelOpen && (
        <div className="absolute left-3 right-3 bottom-[102px] z-50 rounded-md border border-white/15 bg-[#111417]/98 p-3 shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold">构图辅助</span>
            <span className="text-[9px] text-white/45">{guideLabel}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {COMPOSITION_MODES.map(item => (
              <button key={item.id} className={`grid-chip ${guide.mode === item.id ? 'active' : ''}`} onClick={() => setGuide(value => ({ ...value, mode: item.id }))}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-[9px] text-white/45 mb-1"><span>线条透明度</span><span className="mono">{Math.round(guide.opacity * 100)}%</span></div>
            <input type="range" min="0.08" max="0.8" step="0.02" value={guide.opacity} onChange={event => setGuide(value => ({ ...value, opacity: Number(event.target.value) }))} className="w-full accent-[var(--accent)]" />
          </div>
        </div>
      )}

      <div className="absolute left-0 right-0 bottom-0 z-50 h-[96px] px-3 pt-2 pb-3 bg-gradient-to-t from-black via-black/90 to-transparent">
        <div className="relative h-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              className={`w-11 h-11 rounded-full border flex items-center justify-center ${guidePanelOpen ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)]' : 'bg-white/8 border-white/12 text-white/75'}`}
              onClick={() => { setPanelOpen(false); setPosePanelOpen(false); setGuidePanelOpen(value => !value); }}
              aria-label="构图辅助"
            >
              <Grid3X3 size={18} />
            </button>
            <button
              className={`w-11 h-11 rounded-full border flex items-center justify-center ${state.poseGuides.enabled ? 'bg-white/18 border-white/25 text-white' : 'bg-white/8 border-white/12 text-white/70'}`}
              onClick={() => { setPanelOpen(false); setGuidePanelOpen(false); setPosePanelOpen(value => !value); }}
              aria-label="人像姿势"
            >
              <UserRound size={18} />
            </button>
          </div>

          <button
            className="absolute left-1/2 -translate-x-1/2 w-[74px] h-[74px] rounded-full flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
            style={{ border: '4px solid rgba(255,255,255,.92)', background: 'rgba(0,0,0,.22)' }}
            onClick={doCapture}
            disabled={!connected || capturing}
            aria-label="拍照"
          >
            <span className="w-[56px] h-[56px] rounded-full bg-white block" style={{ transform: capturing ? 'scale(.78)' : 'scale(1)', transition: 'transform .12s' }} />
          </button>

          <div className="flex items-center gap-2">
            <button
              className={`w-11 h-11 rounded-full border flex items-center justify-center ${panelOpen ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)]' : 'bg-white/8 border-white/12 text-white/75'}`}
              onClick={() => { setGuidePanelOpen(false); setPosePanelOpen(false); setPanelOpen(value => !value); }}
              aria-label="相机参数"
            >
              <SlidersHorizontal size={18} />
            </button>
            <button
              className="w-11 h-11 rounded-full bg-white/8 border border-white/12 text-white/75 flex items-center justify-center"
              onClick={() => setPreviewFit(value => value === 'contain' ? 'cover' : 'contain')}
              aria-label="画面比例"
            >
              {previewFit === 'contain' ? <Maximize2 size={17} /> : <Minimize2 size={17} />}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
