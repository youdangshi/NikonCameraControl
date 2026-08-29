import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App.jsx';
import { camera } from '../api.js';

const MODES = [
  { value: 'wifi', label: 'WiFi 热点', hint: '相机开 Wi-Fi → 手机连相机热点（如 Nikon_Z30_1234），默认地址 192.168.1.1:15740。相机无线模式需设为「允许计算机控制」。' },
  { value: 'sta', label: 'STA 局域网', hint: '相机和手机连同一个家庭 Wi-Fi，在相机无线菜单查看并输入它显示的 IP，端口默认 15740。' },
  { value: 'usb', label: 'USB Type-C', hint: '手机用 OTG 线连接相机 Type-C，相机 USB 模式选 MTP/PTP。首次连接需在手机弹出窗口允许 USB 调试/权限。' },
  { value: 'demo', label: '实验模式', hint: '无需真机：用内置模拟相机跑通连接、实时取景、遥控拍摄、传图与修图。' },
];

export default function MyCameraScreen() {
  const { state, updateState } = useContext(AppContext);
  const navigate = useNavigate();
  const [mode, setMode] = useState('wifi');
  const [host, setHost] = useState('192.168.1.1');
  const [port, setPort] = useState('15740');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    const u1 = camera.on('status', d => {
      updateState({ connectionState: d.state, connectionMode: d.mode });
      if (d.state === 'session_open') setError(null);
    });
    const u2 = camera.on('error', e => setError(typeof e === 'string' ? e : e.error || JSON.stringify(e)));
    const u3 = camera.on('diagnostic', m => setLogs(x => [...x, m]));
    return () => { u1(); u2(); u3(); };
  }, []);

  const connected = state.connectionState === 'session_open';

  const changeMode = (v) => {
    setMode(v); setError(null);
    if (v === 'wifi') setHost('192.168.1.1');
    if (v === 'sta') setHost('');
    if (v === 'usb') setHost('');
  };

  const connect = async () => {
    setBusy(true); setError(null); setLogs([]);
    const h = mode === 'wifi' ? host : host;
    try {
      const r = await camera.connectCamera(mode, h || '192.168.1.1', port);
      if (!r.success && r.error) setError(r.error);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    await camera.disconnect();
    updateState({ connectionState: 'disconnected', connectionMode: null, connectedCamera: null });
  };

  const copyLogs = async () => {
    try { await navigator.clipboard.writeText(logs.join('\n')); } catch {}
  };

  const modeMeta = MODES.find(m => m.value === mode);
  const storageTotal = 116.1, storageFree = 113.6;
  const storagePct = ((storageTotal - storageFree) / storageTotal * 100).toFixed(1);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-lg mx-auto p-4 sm:p-6">
        <h2 className="text-lg font-bold mb-4">我的相机</h2>

        {error && (
          <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs whitespace-pre-wrap">
            {error}
          </div>
        )}

        {/* 相机卡片 */}
        <div className="glass p-5 mb-3 anim-fade">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] tracking-widest text-[#9898ac]">LAST CAMERA</p>
              <h3 className="text-2xl font-extrabold mt-1">Nikon Z 30</h3>
              <span className={`badge text-[10px] mt-2 ${connected ? 'badge-green' : 'badge-yellow'}`}>
                {connected ? '● 已连接' : '● 未连接'}
              </span>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-3xl font-bold">N</div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="rounded-xl bg-black/35 p-3"><p className="text-[10px] text-[#9898ac]">品牌</p><p className="text-sm font-semibold mt-1">Nikon</p></div>
            <div className="rounded-xl bg-black/35 p-3"><p className="text-[10px] text-[#9898ac]">型号</p><p className="text-sm font-semibold mt-1">Z 30</p></div>
          </div>
          <button className="btn btn-primary w-full mt-4" onClick={connected ? disconnect : connect} disabled={busy}>
            {busy ? '⏳ 连接中…' : connected ? '断开连接' : mode === 'usb' ? '🔌 连接相机' : mode === 'demo' ? '▶ 启动实验' : '📶 连接相机'}
          </button>
        </div>

        {/* 镜头信息 */}
        <div className="glass p-4 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><span className="text-lg">🔍</span><div><p className="text-xs text-[#9898ac]">已连接镜头</p><p className="font-bold mt-0.5">16-50mm · ƒ/3.5-6.3</p></div></div>
            <span className="badge badge-green text-[10px]">已识别</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[
              ['焦距范围', '16-50 mm'],
              ['光圈范围', 'ƒ/3.5-6.3'],
              ['镜头 ID', 'Lens ID 11'],
              ['当前焦距', '16 mm'],
              ['当前光圈', 'ƒ/3.5'],
              ['类型', '标准变焦'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-black/30 p-2"><p className="text-[9px] text-[#9898ac]">{k}</p><p className="text-[11px] font-semibold mt-1">{v}</p></div>
            ))}
          </div>
        </div>

        {/* 存储卡 */}
        <div className="glass p-4 mb-3">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-bold">存储卡</p><p className="text-[10px] text-[#9898ac] mt-0.5">剩余 113.6 GB</p></div>
            <span className={`badge text-[10px] ${connected ? 'badge-green' : 'badge-yellow'}`}>{connected ? '● 已连接' : '● 未连接'}</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${storagePct}%` }} /></div>
          <div className="flex justify-between text-[10px] text-[#9898ac] mt-2"><span>卡槽 1 [Slot 1]</span><span>{storagePct}%</span></div>
        </div>

        {/* 连接详情 */}
        <div className="glass p-4 mb-3">
          <p className="text-sm font-bold mb-3">连接详情</p>
          <div className="text-xs space-y-2">
            <Row k="连接状态" v={connected ? '已连接' : '未连接'} />
            <Row k="连接方式" v={modeMeta?.label} />
            <Row k="协议" v="PTP/IP" />
            <Row k="地址" v={mode === 'sta' ? '局域网（需输入相机 IP）' : `${host}:${port}`} />
          </div>
        </div>

        {/* 模式选择 */}
        <div className="glass p-4 mb-3">
          <p className="text-sm font-bold mb-3">连接方式</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {MODES.map(m => (
              <button key={m.value} className={`btn text-[11px] py-2 ${mode === m.value ? 'bg-blue-600 text-white' : 'bg-white/5 text-[#9898ac]'}`} onClick={() => changeMode(m.value)}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[#9898ac] mb-3">{modeMeta?.hint}</p>
          {mode !== 'usb' && mode !== 'demo' && (
            <div className="grid grid-cols-[1fr_82px] gap-2">
              <input className="input text-xs mono" placeholder={mode === 'sta' ? '相机 IP，如 192.168.31.10' : '192.168.1.1'} value={host} onChange={e => setHost(e.target.value)} disabled={busy} />
              <input className="input text-xs mono" placeholder="15740" value={port} onChange={e => setPort(e.target.value)} disabled={busy} />
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button className="btn btn-secondary flex-1 text-xs" onClick={() => { setLogs([]); setError(null); }}>重新检测</button>
            <button className="btn btn-primary flex-1 text-xs" onClick={connect} disabled={busy}>连接相机</button>
          </div>
        </div>

        {/* 诊断 */}
        <div className="glass p-4 mb-3">
          <button className="w-full flex items-center justify-between text-xs text-[#9898ac]" onClick={() => setShowLog(s => !s)}>
            <span>PTP/IP 握手诊断</span><span>{showLog ? '收起' : '展开'}</span>
          </button>
          {showLog && (
            <div className="mt-2 p-2 rounded-lg bg-black/40 text-[10px] mono text-emerald-300/90 max-h-40 overflow-auto">
              {logs.length === 0 ? <span className="text-[#585870]">暂无日志</span> : logs.map((l, i) => <div key={i} className="break-all">{l}</div>)}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button className="btn btn-secondary text-xs" onClick={() => navigate('/liveview')}>📷 实时取景</button>
          <button className="btn btn-secondary text-xs" onClick={() => navigate('/control')}>🎛 参数控制</button>
        </div>
        <button className="btn btn-secondary w-full mt-3 text-xs" onClick={copyLogs}>📤 复制连接日志</button>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return <div className="flex justify-between border-b border-white/5 pb-2"><span className="text-[#9898ac]">{k}</span><span className="font-medium text-right">{v}</span></div>;
}
