import React, { useState, useContext, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App.jsx';
import { camera } from '../api.js';
import PoseLibrary from '../components/PoseLibrary.jsx';

export default function LiveViewScreen() {
  const { state, updatePoseGuides } = useContext(AppContext);
  const navigate = useNavigate();
  const [lvOn, setLvOn] = useState(false);
  const [frame, setFrame] = useState(null);
  const [captured, setCaptured] = useState(null);
  const [landscape, setLandscape] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [snap, setSnap] = useState(null);
  const lvRef = useRef(null);

  useEffect(() => {
    const u = camera.on('captured', d => {
      if(d?.success){ setCaptured(Date.now()); setTimeout(()=>setCaptured(null),1200); }
    });
    return () => u();
  }, []);

  const startLV = async () => {
    await camera.startLiveView();
    setLvOn(true);
    lvRef.current = setInterval(async () => {
      try {
        const r = await camera.getLiveViewFrame();
        if (r?.frame) setFrame(r.frame);
        if (camera.isDemo?.()) setSnap(camera.demoSnapshot?.() || null);
      } catch {}
    }, 66);
  };

  const stopLV = async () => {
    if(lvRef.current){ clearInterval(lvRef.current); lvRef.current = null; }
    await camera.stopLiveView();
    setLvOn(false); setFrame(null);
  };

  const doCapture = async () => { await camera.capture(); };
  const doAF = async () => {
    if (!connected) return;
    try { await camera.autoFocus(); } catch {}
  };

  const handleTap = async (e) => {
    if (e.target.closest('button')) return;
    const host = e.currentTarget;
    const r = host.getBoundingClientRect();
    const x = (e.clientX-r.left)/r.width, y = (e.clientY-r.top)/r.height;
    await doAF();
    const dot = document.createElement('div');
    dot.className = 'absolute w-6 h-6 border-2 border-blue-400 rounded-full pointer-events-none';
    dot.style.cssText = `left:${e.clientX-r.left}px;top:${e.clientY-r.top}px;transform:translate(-50%,-50%);animation:pulse 1s ease-out forwards`;
    host.appendChild(dot);
    setTimeout(()=>dot.remove(),1000);
  };

  useEffect(() => () => { if(lvRef.current) clearInterval(lvRef.current); }, []);

  const connected = state.connectionState === 'session_open';

  return (
    <div className="h-full flex flex-col bg-black relative">
      {/* 取景画面 */}
      <div ref={lvRef} className="flex-1 relative bg-black cursor-crosshair overflow-hidden" onClick={handleTap}>
        {lvOn && frame ? (
          <img src={frame.startsWith('data:') ? frame : `data:image/jpeg;base64,${frame}`} className="w-full h-full object-contain" alt="Live" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#0a0a10]">
            {!connected ? (
              <div className="text-center"><span className="text-6xl block mb-4 opacity-30">📷</span><p className="text-[#585870] text-sm">相机未连接</p><button className="btn btn-primary mt-4" onClick={()=>navigate('/')}>前往连接</button></div>
            ) : !lvOn ? (
              <div className="text-center"><span className="text-6xl block mb-4 opacity-30">📷</span><p className="text-[#9898ac] text-sm">取景未启动</p><p className="text-[#585870] text-xs mt-1">点击下方 ▶ 取景 按钮</p></div>
            ) : (
              <div className="text-center"><div className="w-12 h-12 mx-auto mb-4 border-3 border-white/10 border-t-blue-500 rounded-full animate-spin" /><p className="text-[#9898ac] text-sm">等待画面…</p></div>
            )}
          </div>
        )}

        {/* 人像姿势悬浮窗：可选姿势 + 拖动 + 缩放 + 透明度 */}
        {state.poseGuides.enabled && (
          <PoseLibrary
            active={lvOn}
            pose={state.poseGuides.mode}
            opacity={state.poseGuides.opacity}
            color={state.poseGuides.color}
            scale={state.poseGuides.scale || 1}
            onSelect={mode => updatePoseGuides({ mode })}
            onOpacityChange={opacity => updatePoseGuides({ opacity })}
            onColorChange={color => updatePoseGuides({ color })}
            onScaleChange={scale => updatePoseGuides({ scale })}
            onToggle={() => updatePoseGuides({ enabled: !state.poseGuides.enabled })}
          />
        )}

        {/* 拍摄反馈 */}
        {captured && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center anim-fade z-20">
            <span className="text-8xl drop-shadow-2xl">📸</span>
          </div>
        )}

        {/* 信息叠加层 */}
        {showInfo && (
          <div className="absolute top-3 left-3 flex flex-col gap-1">
            <span className="bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-[11px] text-white/70 font-mono">{lvOn?'LIVE • 15fps':'STANDBY'}</span>
            <span className="bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg text-[11px] text-white/70 font-mono">
              {snap ? `${snap.shutter} ${snap.aperture} ISO${snap.iso} EV${snap.ev >= 0 ? '+' : ''}${snap.ev}` : '1/125 F5.6 ISO400'}
            </span>
          </div>
        )}

        {/* 右上角控制按钮 */}
        <div className="absolute top-3 right-3 flex gap-1.5 z-10">
          <button className="btn-icon text-sm" onClick={()=>updatePoseGuides({enabled:!state.poseGuides.enabled})} title="姿势框线">
            {state.poseGuides.enabled ? '📐' : '⊡'}
          </button>
          <button className="btn-icon text-sm" onClick={()=>setShowInfo(!showInfo)} title="信息">{showInfo?'🛈':'◻'}</button>
          <button className="btn-icon text-sm" onClick={()=>setLandscape(!landscape)} title="旋转">{landscape?'📱':'🔄'}</button>
          <button className="btn-icon text-sm" onClick={()=>navigate('/control')} title="参数">🎛</button>
        </div>

        {/* 底部提示 */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
          <span className="text-[10px] text-white/30 bg-black/40 px-2 py-0.5 rounded">点击画面对焦</span>
        </div>
      </div>

      {/* 底部控制栏 */}
      <div className="flex-shrink-0 bg-[#0e0e18]/95 backdrop-blur-xl border-t border-white/5 px-4 py-3">
        <div className="flex items-center justify-between max-w-sm mx-auto">
          <button className={`btn ${lvOn?'btn-danger':'btn-primary'} px-5`} onClick={lvOn?stopLV:startLV}>
            {lvOn?'⏹ 停止':'▶ 取景'}
          </button>

          {/* 快门按钮 */}
          <button className="w-[68px] h-[68px] rounded-full flex items-center justify-center transition-all active:scale-90 shadow-2xl"
            style={{border:'4px solid rgba(255,255,255,0.75)',background:'transparent'}}
            onClick={doCapture} disabled={!connected}>
            <div style={{width:50,height:50,borderRadius:'50%',background:'radial-gradient(circle at 38% 38%, #4b5563, #111827)',border:'1px solid rgba(255,255,255,0.1)'}} />
          </button>

          <button className="btn btn-secondary px-5" onClick={doAF}>🔍 AF</button>
        </div>
      </div>
    </div>
  );
}
