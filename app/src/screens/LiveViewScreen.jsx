import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App.jsx';
import { camera } from '../api.js';
import PoseLibrary from '../components/PoseLibrary.jsx';
import CameraControlPanel from '../components/CameraControlPanel.jsx';
import HistogramChart from '../components/HistogramChart.jsx';
import CompositionGuides, { COMPOSITION_MODES } from '../components/CompositionGuides.jsx';
import { computeHistogramFromImage } from '../histogram.js';
import {
  EXPOSURE_MODE_OPTIONS,
  buildControlCatalog,
} from '../cameraControlCatalog.js';
import {
  PTP_PROP,
  EXPOSURE_PROGRAM_CODES,
  shutterLabelToMicros,
  apertureLabelToHundredths,
  exposureProgramLabel,
  exposureTimeMicrosToLabel,
  fNumberLabel,
} from '../nikonProperties.js';
import {
  ArrowLeft, Aperture, BarChart3, Camera, Grid3X3, Monitor, RotateCcw, SlidersHorizontal, UserRound,
} from 'lucide-react';

const INITIAL_QUICK = {
  expMode: '--',
  iso: null,
  shutter: '--',
  aperture: '--',
  ev: 0,
};

const GUIDE_STORAGE = 'nini_composition_guide';
const MONITOR_STORAGE = 'nini_monitor_mode';
const HISTOGRAM_STORAGE = 'nini_live_histogram';

function initialGuide() {
  try {
    const saved = JSON.parse(localStorage.getItem(GUIDE_STORAGE) || 'null');
    if (saved && COMPOSITION_MODES.some(item => item.id === saved.mode)) return saved;
  } catch {}
  return { mode: 'thirds', opacity: 0.42 };
}

function initialMonitorMode() {
  try {
    return localStorage.getItem(MONITOR_STORAGE) === 'true';
  } catch {
    return false;
  }
}

function initialHistogramVisible() {
  try {
    return localStorage.getItem(HISTOGRAM_STORAGE) !== 'false';
  } catch {
    return true;
  }
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
  const [landscape, setLandscape] = useState(true);
  const [monitorMode, setMonitorMode] = useState(initialMonitorMode);
  const [histogramVisible, setHistogramVisible] = useState(initialHistogramVisible);
  const [histogram, setHistogram] = useState(null);
  const [quick, setQuick] = useState(INITIAL_QUICK);
  const [quickCatalog, setQuickCatalog] = useState(() => buildControlCatalog());
  const [quickError, setQuickError] = useState('');
  const [guide, setGuide] = useState(initialGuide);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const lvRef = useRef(null);
  const lvTimerRef = useRef(null);
  const restartTimerRef = useRef(null);
  const lvRunningRef = useRef(false);
  const lvStartingRef = useRef(false);
  const frameStatsRef = useRef({ count: 0, startedAt: performance.now() });
  const lastFrameAtRef = useRef(0);
  const lastHistogramAtRef = useRef(0);
  const monitorRestartingRef = useRef(false);
  const mountedRef = useRef(true);
  const connected = state.connectionState === 'session_open';
  const staTransferOnly = state.connectionMode === 'sta';

  useEffect(() => {
    const unsubscribe = camera.on('captured', data => {
      if (!data?.success) return;
      setCaptured(true);
      setTimeout(() => mountedRef.current && setCaptured(false), 900);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    camera.setLandscape(true).catch(() => {});
    const fullscreenTimer = setTimeout(() => {
      camera.setFullscreen(true).catch(() => {});
    }, 120);
    return () => {
      clearTimeout(fullscreenTimer);
      camera.setFullscreen(false).catch(() => {});
      camera.setLandscape(false).catch(() => {});
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(GUIDE_STORAGE, JSON.stringify(guide)); } catch {}
  }, [guide]);

  useEffect(() => {
    try { localStorage.setItem(MONITOR_STORAGE, String(monitorMode)); } catch {}
    camera.setKeepAwake(Boolean(monitorMode && connected)).catch(() => {});
    return () => {
      camera.setKeepAwake(false).catch(() => {});
    };
  }, [monitorMode, connected]);

  useEffect(() => {
    try { localStorage.setItem(HISTOGRAM_STORAGE, String(histogramVisible)); } catch {}
    if (!histogramVisible) setHistogram(null);
  }, [histogramVisible]);

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
    if (staTransferOnly) {
      setLvOn(false);
      setLvError('Nikon Z30 在 STA 模式下启动实时取景会退出当前网络。请改用相机 WiFi 热点或 USB Type-C。STA 可继续用于照片传输和控制。');
      return;
    }
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
            lastFrameAtRef.current = performance.now();
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
    if (!connected || !monitorMode) return undefined;

    const resume = async () => {
      if (monitorRestartingRef.current || !mountedRef.current) return;
      const now = performance.now();
      const stale = lvRunningRef.current && now - (lastFrameAtRef.current || 0) > 5000;
      const stopped = !lvRunningRef.current && !lvStartingRef.current;
      if (!stale && !stopped) return;

      monitorRestartingRef.current = true;
      setLvError(stale ? '监视器正在恢复取景…' : '');
      try {
        if (lvRunningRef.current) await stopLV(false);
        await new Promise(resolve => setTimeout(resolve, 900));
        if (mountedRef.current && state.connectionState === 'session_open') await startLV();
      } finally {
        monitorRestartingRef.current = false;
      }
    };

    const timer = setInterval(resume, 2500);
    const handleVisibility = () => {
      if (!document.hidden) resume();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // startLV/stopLV intentionally use the latest refs and connection state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, monitorMode, state.connectionState]);

  useEffect(() => {
    if (!connected) return undefined;
    const timer = setTimeout(startLV, 220);
    return () => clearTimeout(timer);
    // The refs prevent duplicate starts when the connection state is unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
    if (!connected || panelOpen) return undefined;
    let cancelled = false;
    let timer = null;

    const read = async (propCode) => {
      try {
        const result = await camera.getProp(propCode);
        return result?.code === 0x2001 ? result.value : null;
      } catch {
        return null;
      }
    };

    const sync = async () => {
      const [modeRaw, isoRaw, shutterRaw, apertureRaw] = await Promise.all([
        read(PTP_PROP.ExposureProgramMode),
        read(PTP_PROP.ExposureIndex),
        read(PTP_PROP.ExposureTime),
        read(PTP_PROP.FNumber),
      ]);
      if (cancelled) return;
      setQuick(previous => ({
        ...previous,
        expMode: modeRaw == null ? previous.expMode : exposureProgramLabel(modeRaw),
        iso: isoRaw == null ? previous.iso : Number(isoRaw),
        shutter: shutterRaw == null ? previous.shutter : exposureTimeMicrosToLabel(shutterRaw),
        aperture: apertureRaw == null ? previous.aperture : fNumberLabel(apertureRaw),
      }));
      timer = setTimeout(sync, 3000);
    };

    Promise.all([
      camera.getPropDesc?.(PTP_PROP.ExposureIndex),
      camera.getPropDesc?.(PTP_PROP.ExposureTime),
      camera.getPropDesc?.(PTP_PROP.FNumber),
    ]).then(([iso, shutter, aperture]) => {
      if (!cancelled) setQuickCatalog(buildControlCatalog({ iso, shutter, aperture }));
    }).catch(() => {});
    sync();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [connected, panelOpen]);

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
    if (staTransferOnly) {
      setLvError('当前是 STA 智能设备传输模式，不能遥控拍照。请在相机端选择“连接到电脑”，并重新连接“PC 控制”。');
      return;
    }
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
    if (staTransferOnly) return;
    try {
      await camera.autoFocus();
      setLvError('');
    } catch (e) {
      setLvError(`自动对焦失败：${e.message || e}`);
    }
  };

  const handleTap = async (event) => {
    if (event.target.closest('button') || panelOpen || posePanelOpen || guidePanelOpen) return;
    if (staTransferOnly) return;
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

  const handleFrameLoad = (event) => {
    const image = event.currentTarget;
    setImageSize({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    if (!histogramVisible) return;
    const now = performance.now();
    if (now - lastHistogramAtRef.current < 250) return;
    lastHistogramAtRef.current = now;
    try {
      setHistogram(computeHistogramFromImage(image, 160));
    } catch {}
  };

  const handleBack = async () => {
    await stopLV();
    navigate('/camera');
  };

  const guideLabel = COMPOSITION_MODES.find(item => item.id === guide.mode)?.label || '构图线';
  const toggleOrientation = async () => {
    const next = !landscape;
    setLandscape(next);
    await camera.setLandscape(next).catch(() => {});
    const updateViewport = () => {
      const node = lvRef.current;
      if (node) setViewport({ width: node.clientWidth, height: node.clientHeight });
    };
    setTimeout(updateViewport, 120);
    setTimeout(updateViewport, 420);
  };

  const setQuickProp = async (propCode, value, label) => {
    setQuickError('');
    try {
      const result = await camera.setProp(propCode, value);
      if (!result?.success) {
        if (result?.code === 0x200F && /^U[123]$/.test(quick.expMode)) {
          setQuickError(`当前是 ${quick.expMode} 用户模式，相机不允许远程修改曝光参数。请先切到 M、A、S 或 P。`);
        } else {
          setQuickError(`${label}写入失败：PTP ${result?.code != null ? `0x${Number(result.code).toString(16)}` : '无响应'}`);
        }
        return false;
      }
      if (result.verified === false) {
        setQuickError(`${label}已发送，但相机读回不一致`);
      }
      return true;
    } catch (error) {
      setQuickError(`${label}写入失败：${error.message || error}`);
      return false;
    }
  };

  const adjustQuick = async (kind, direction) => {
    if (staTransferOnly) return;
    if ((kind === 'shutter' || kind === 'aperture') && (quick.expMode === 'P')) return;
    if (kind === 'shutter' && quick.expMode === 'A') return;
    if (kind === 'aperture' && quick.expMode === 'S') return;
    if (kind === 'iso' && quick.expMode === 'AUTO') return;

    if (kind === 'mode') {
      const index = EXPOSURE_MODE_OPTIONS.indexOf(quick.expMode);
      const nextIndex = index < 0 ? 0 : Math.max(0, Math.min(EXPOSURE_MODE_OPTIONS.length - 1, index + direction));
      const mode = EXPOSURE_MODE_OPTIONS[nextIndex];
      if (mode && await setQuickProp(PTP_PROP.ExposureProgramMode, EXPOSURE_PROGRAM_CODES[mode], '曝光模式')) {
        setQuick(previous => ({ ...previous, expMode: mode }));
      }
      return;
    }

    if (kind === 'iso') {
      const values = quickCatalog.isoOptions;
      const index = values.findIndex(value => Number(value) === Number(quick.iso));
      const nextIndex = index < 0 ? 0 : Math.max(0, Math.min(values.length - 1, index + direction));
      const value = values[nextIndex];
      if (value != null && await setQuickProp(PTP_PROP.ExposureIndex, value, 'ISO')) {
        setQuick(previous => ({ ...previous, iso: value }));
      }
      return;
    }

    if (kind === 'shutter') {
      const values = quickCatalog.shutterOptions;
      const index = values.indexOf(quick.shutter);
      const nextIndex = index < 0 ? 0 : Math.max(0, Math.min(values.length - 1, index + direction));
      const value = values[nextIndex];
      if (value && await setQuickProp(PTP_PROP.ExposureTime, shutterLabelToMicros(value), '快门')) {
        setQuick(previous => ({ ...previous, shutter: value }));
      }
      return;
    }

    if (kind === 'aperture') {
      const values = quickCatalog.apertureOptions;
      const index = values.indexOf(quick.aperture);
      const nextIndex = index < 0 ? 0 : Math.max(0, Math.min(values.length - 1, index + direction));
      const value = values[nextIndex];
      if (value && await setQuickProp(PTP_PROP.FNumber, apertureLabelToHundredths(value), '光圈')) {
        setQuick(previous => ({ ...previous, aperture: value }));
      }
    }
  };
  let guideRect = null;
  if (frame && viewport.width > 0 && viewport.height > 0 && imageSize.width > 0 && imageSize.height > 0) {
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

  return (
    <div className="h-full w-full relative overflow-hidden bg-black text-white">
      <div ref={lvRef} className="absolute inset-0 cursor-crosshair" onClick={handleTap}>
        {frame ? (
          <img
            src={frame.startsWith('data:') ? frame : `data:image/jpeg;base64,${frame}`}
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: 'contain' }}
            onLoad={handleFrameLoad}
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
              <div className="text-center px-8 max-w-md">
                <Aperture size={40} className="mx-auto text-white/30 animate-spin" strokeWidth={1.2} />
                <p className="text-sm text-white/65 mt-4">{lvError ? '当前连接不支持实时取景' : '正在启动实时取景'}</p>
                {lvError && <p className="text-[11px] leading-5 text-amber-200/85 mt-3">{lvError}</p>}
                {lvError && <button className="btn btn-secondary mt-5" onClick={() => navigate('/camera')}>切换连接方式</button>}
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
                <div className="mono text-base font-semibold">{fps || '--'}<span className="text-[9px] ml-1">帧/秒</span></div>
                <div className="text-[9px] text-white/45 mt-1">实时</div>
              </div>
              <div className="text-right leading-none">
                <div className={`text-[12px] font-bold ${lvOn ? 'text-[var(--green)]' : 'text-white/35'}`}>实时</div>
                <div className="text-[9px] text-white/45 mt-1">{monitorMode ? '监视器' : lvOn ? '取景中' : '待机'}</div>
              </div>
            </div>
          </div>
        </div>

        {lvError && frame && (
          <div className="absolute left-3 right-3 top-[84px] z-30 rounded-md bg-[var(--red)]/90 px-3 py-2 text-[11px] text-white shadow-lg">
            {lvError}
          </div>
        )}

        {histogramVisible && histogram && (
          <div className="absolute right-3 top-[104px] z-30 pointer-events-none">
            <HistogramChart histogram={histogram} compact />
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

      {quickError && (
        <div className="absolute left-3 right-3 bottom-[164px] z-50 rounded-md bg-[var(--red)]/90 px-3 py-2 text-[10px] text-white shadow-lg">
          {quickError}
        </div>
      )}

      <div className="absolute left-3 right-3 bottom-[102px] z-40 h-[56px] rounded-md bg-black/65 backdrop-blur border border-white/10 grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-stretch overflow-hidden">
        {[
          { kind: 'mode', label: '模式', value: quick.expMode },
          { kind: 'shutter', label: '快门', value: quick.shutter },
          { kind: 'iso', label: 'ISO', value: quick.iso == null ? '--' : quick.iso },
          { kind: 'aperture', label: '光圈', value: quick.aperture },
        ].map(item => (
          <div key={item.kind} className="min-w-0 border-r border-white/8 flex items-center">
            <button
              type="button"
              className="w-8 h-full flex items-center justify-center text-white/65 active:bg-white/10"
              onClick={() => adjustQuick(item.kind, -1)}
              aria-label={`${item.label}减小`}
            >
              −
            </button>
            <button
              type="button"
              className="min-w-0 flex-1 h-full text-center leading-none"
              onClick={() => { setGuidePanelOpen(false); setPosePanelOpen(false); setPanelOpen(true); }}
              title={`${item.label}：${item.value}`}
            >
              <span className="mono block text-[12px] font-semibold truncate">{item.value}</span>
              <span className="block text-[8px] text-white/45 mt-1">{item.label}</span>
            </button>
            <button
              type="button"
              className="w-8 h-full flex items-center justify-center text-white/65 active:bg-white/10"
              onClick={() => adjustQuick(item.kind, 1)}
              aria-label={`${item.label}增大`}
            >
              +
            </button>
          </div>
        ))}
        <button
          type="button"
          className="w-12 flex items-center justify-center text-white/60 active:bg-white/10"
          onClick={() => { setGuidePanelOpen(false); setPosePanelOpen(false); setPanelOpen(value => !value); }}
          aria-label="展开全部参数"
        >
          <SlidersHorizontal size={16} />
        </button>
      </div>

      {panelOpen && (
        <div className="absolute left-0 right-0 bottom-[98px] z-40 border-t border-white/10 bg-[#0d1012]/98" style={{ maxHeight: '62vh' }}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/8">
            <span className="text-[11px] font-semibold text-white/80">相机参数 · 实时生效</span>
            <button className="btn-icon w-8 h-8" onClick={() => setPanelOpen(false)} aria-label="收起参数">×</button>
          </div>
          <div className="overflow-auto" style={{ maxHeight: 'calc(62vh - 42px)' }}>
            <CameraControlPanel compact onStateChange={setQuick} />
          </div>
        </div>
      )}

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
              className={`w-11 h-11 rounded-full border flex items-center justify-center ${monitorMode ? 'bg-[var(--green)]/20 border-[var(--green)] text-[var(--green)]' : 'bg-white/8 border-white/12 text-white/70'}`}
              onClick={() => setMonitorMode(value => !value)}
              aria-label={monitorMode ? '关闭监视器模式' : '开启监视器模式'}
              title={monitorMode ? '关闭监视器模式' : '监视器模式：屏幕常亮并自动重连'}
            >
              <Monitor size={18} />
            </button>
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
            <button
              className={`w-11 h-11 rounded-full border flex items-center justify-center ${histogramVisible ? 'bg-[var(--blue)]/20 border-[var(--blue)] text-[var(--blue)]' : 'bg-white/8 border-white/12 text-white/70'}`}
              onClick={() => setHistogramVisible(value => !value)}
              aria-label={histogramVisible ? '关闭实时直方图' : '开启实时直方图'}
              title={histogramVisible ? '关闭实时直方图' : '开启实时直方图'}
            >
              <BarChart3 size={18} />
            </button>
          </div>

          <button
            className="absolute left-1/2 -translate-x-1/2 w-[74px] h-[74px] rounded-full flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
            style={{ border: '4px solid rgba(255,255,255,.92)', background: 'rgba(0,0,0,.22)' }}
            onClick={doCapture}
            disabled={!connected || capturing || staTransferOnly}
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
              onClick={toggleOrientation}
              aria-label={landscape ? '切换竖屏' : '切换横屏'}
              title={landscape ? '切换竖屏' : '切换横屏'}
            >
              <RotateCcw size={17} className={landscape ? '' : 'rotate-90'} />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
