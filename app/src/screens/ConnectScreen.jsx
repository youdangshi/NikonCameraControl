import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App.jsx';
import { camera } from '../api.js';

export default function ConnectScreen() {
  const { state, updateState } = useContext(AppContext);
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [mode, setMode] = useState(null);
  const [host, setHost] = useState('192.168.1.1');
  const [port, setPort] = useState('15740');
  const [logs, setLogs] = useState([]);
  const [showLog, setShowLog] = useState(false);

  const native = camera.isNative();

  useEffect(() => {
    const u1 = camera.on('status', d => {
      updateState({ connectionState: d.state, connectionMode: d.mode });
      if (d.state === 'session_open') navigate('/liveview');
    });
    const u2 = camera.on('error', e => setError(typeof e === 'string' ? e : e.error || JSON.stringify(e)));
    const u3 = camera.on('diagnostic', m => {
      setLogs(prev => [...prev, m]);
    });
    return () => { u1(); u2(); u3(); };
  }, []);

  /** WiFi 连接：原生直连相机 / 桌面走后端 */
  const doWifi = async () => {
    setConnecting(true); setError(null); setMode('wifi'); setLogs([]);
    try {
      const r = await camera.connectWifi(host.trim(), port.trim());
      if (!r.success && r.error) setError(r.error);
    } catch (e) { setError(e.message); }
    finally { setConnecting(false); setMode(null); }
  };

  /** USB 有线连接（桌面备选） */
  const doUsb = async () => {
    setConnecting(true); setError(null); setMode('usb');
    try { const r = await camera.connectUsb(); if (!r.success) setError(r.error); }
    catch (e) { setError(e.message); }
    finally { setConnecting(false); setMode(null); }
  };

  /** 断开 */
  const doDisc = async () => {
    await camera.disconnect();
    updateState({ connectionState: 'disconnected', connectedCamera: null, connectionMode: null });
  };

  const conn = state.connectionState === 'session_open';

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-lg mx-auto p-4 sm:p-8 flex flex-col items-center justify-center min-h-full">

        {/* Logo */}
        <div className="text-center mb-6 anim-fade">
          <div style={{width:72,height:72,margin:'0 auto 16px',borderRadius:20,background:'linear-gradient(135deg,#3b82f6,#7c3aed)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 32px rgba(59,130,246,0.25)'}}>
            <span className="text-3xl">📷</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">妮妮</h1>
          <p className="text-sm text-[#9898ac] mt-1">Nikon Z30 无线遥控 · AI 修图 {native ? '· 手机版' : ''}</p>
          {conn && <div className="mt-3"><span className="badge badge-green text-xs">✅ 已连接 {state.connectionMode==='wifi'?'WiFi':'USB'} · 就绪</span></div>}
        </div>

        {/* 错误 */}
        {error && (
          <div className="w-full mb-4 p-4 rounded-xl bg-red-500/8 border border-red-500/20 text-red-300 text-sm anim-fade">
            <div className="flex gap-2">
              <span>❌</span>
              <div className="flex-1">
                <p className="font-semibold mb-1">连接失败</p>
                <p className="text-xs text-red-400 whitespace-pre-wrap">{error}</p>
              </div>
              <button onClick={()=>setError(null)} className="text-red-400">✕</button>
            </div>
          </div>
        )}

        {/* 使用说明 */}
        <div className="w-full mb-4 p-4 rounded-xl bg-blue-500/8 border border-blue-500/20 text-blue-300/90 text-xs anim-fade">
          <p className="font-semibold mb-1">📶 WiFi 无线遥控（主路径）</p>
          <p className="text-blue-400/70">相机无线模式设为「<strong className="text-white">允许计算机控制</strong>」，然后让本机连接到相机热点（形如 <code>Nikon_Z30_XXX</code>）。连接成功后无需电脑中转即可遥控拍摄。</p>
        </div>

        {/* WiFi 无线连接 — 主连接方式 */}
        <div className="glass w-full p-5 mb-3 anim-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📶</span>
            <h2 className="font-semibold text-sm">WiFi 无线连接（遥控拍摄）</h2>
          </div>

          <div className="grid grid-cols-[1fr_88px] gap-2 mb-3">
            <label className="block">
              <span className="text-[10px] text-[#9898ac]">相机 IP</span>
              <input value={host} onChange={e=>setHost(e.target.value)} disabled={connecting||conn}
                className="input w-full mt-1 text-xs mono" />
            </label>
            <label className="block">
              <span className="text-[10px] text-[#9898ac]">端口</span>
              <input value={port} onChange={e=>setPort(e.target.value)} disabled={connecting||conn}
                className="input w-full mt-1 text-xs mono" />
            </label>
          </div>

          <button className={`w-full py-4 rounded-xl font-semibold text-sm transition-all ${
            conn ? 'bg-white/5 text-[#585870] cursor-not-allowed'
              : connecting && mode === 'wifi' ? 'bg-blue-600/80 text-white animate-pulse'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 active:scale-[0.98]'
          }`} disabled={connecting || conn} onClick={doWifi}>
            {connecting && mode === 'wifi' ? (native ? '⏳ 直连相机…' : '⏳ 连接相机…') : (native ? '📶 直连相机 WiFi' : '📶 WiFi 连接相机')}
          </button>

          {conn && (
            <div className="flex gap-2 mt-2">
              <button className="btn btn-secondary flex-1 text-xs" onClick={()=>navigate('/liveview')}>▶ 进入取景</button>
              <button className="btn btn-danger flex-1" onClick={doDisc}>断开连接</button>
            </div>
          )}

          {native && (
            <button className={`w-full mt-2 text-[11px] ${showLog?'text-blue-300':'text-[#9898ac]'}`} onClick={()=>setShowLog(s=>!s)}>
              {showLog ? '收起握手诊断' : '显示握手诊断（真机验证用）'}
            </button>
          )}

          {showLog && (
            <div className="mt-2 p-3 rounded-lg bg-black/40 border border-white/10 text-[11px] mono text-emerald-300/90 max-h-40 overflow-auto">
              {logs.length === 0 ? <span className="text-[#585870]">等待握手输出…</span> :
                logs.map((l, i) => <div key={i} className="break-all">{l}</div>)}
            </div>
          )}

          <div className="mt-3 p-3 rounded-lg bg-blue-500/8 border border-blue-500/15 text-[11px] text-blue-300/80 space-y-1">
            <p><strong>连接前请确认：</strong></p>
            <p>1. 相机无线模式设为「允许计算机控制」</p>
            <p>2. 手机/电脑连接到相机热点 <code>Nikon_Z30_XXX</code></p>
            <p>3. 设备 IP 一般即 <code>192.168.1.1</code>，端口 <code>15740</code></p>
          </div>
        </div>

        {/* USB 有线连接 — 备选 */}
        <div className="glass w-full p-5 anim-slide-up" style={{animationDelay:'0.1s'}}>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🔌</span>
            <h2 className="font-semibold text-sm">USB 有线连接（备选）</h2>
          </div>
          <button className={`w-full py-4 rounded-xl font-semibold text-sm transition-all ${
            conn ? 'bg-white/5 text-[#585870] cursor-not-allowed'
              : connecting && mode === 'usb' ? 'bg-yellow-600/80 text-white animate-pulse'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 active:scale-[0.98]'
          }`} disabled={connecting || conn} onClick={doUsb}>
            {connecting && mode === 'usb' ? '⏳ 检测相机…' : '🔌 USB 连接相机'}
          </button>
          <div className="mt-3 p-3 rounded-lg bg-emerald-500/8 border border-emerald-500/15 text-[11px] text-emerald-300/80 space-y-1">
            <p><strong>使用提示：</strong></p>
            <p>相机开机，USB 模式设为 <strong>MTP/PTP</strong>；Windows 需用 <strong>Zadig</strong> 把驱动换成 WinUSB。</p>
          </div>
        </div>

      </div>
    </div>
  );
}
