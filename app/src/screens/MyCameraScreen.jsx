import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App.jsx';
import { camera } from '../api.js';

const MODES = [
  { value: 'wifi', label: 'WiFi 热点', icon: '📶', color: '#60a5fa' },
  { value: 'sta', label: 'STA 局域网', icon: '🛜', color: '#34d399' },
  { value: 'usb', label: 'USB Type-C', icon: '🔌', color: '#fbbf24' },
  { value: 'demo', label: '实验模式', icon: '🔬', color: '#c084fc' },
];

const GUIDES = {
  wifi: {
    title: 'WiFi 热点连接教程',
    intro: '这种连接方式由相机开热点，手机直接连相机，不需要路由器。',
    steps: [
      '相机开机，进入菜单设置无线连接。',
      '选择「建立 Wi-Fi 连接」或「允许计算机控制」。',
      '记下相机热点名称（如 Nikon_Z30_1234）。',
      '手机打开 WiFi，连接这个热点。',
      '回到「妮妮」，选择 WiFi 热点，点连接相机。',
      '如果失败，展开 PTP/IP 握手诊断，把日志发出来。',
    ],
    tips: '相机热点默认地址 192.168.1.1，端口 15740。',
  },
  sta: {
    title: 'STA 局域网连接教程',
    intro: '相机和手机连接同一个家庭 WiFi，App 输入相机显示的 IP。',
    steps: [
      '手机连接家庭 WiFi。',
      '相机进入无线菜单，选择「连接到路由器」。',
      '相机连接同一个 WiFi。',
      '在相机屏幕查看它的 IP 地址。',
      '回到「妮妮」，选择 STA 局域网，填相机 IP。',
      '点连接相机，端口保持 15740。',
    ],
    tips: '相机和手机必须在同一个网段，否则无法连接。',
  },
  usb: {
    title: 'USB Type-C 连接教程',
    intro: '手机用 Type-C 数据线（支持 OTG）连相机，手机作为 USB Host。',
    steps: [
      '确认手机支持 USB Host / OTG。',
      '使用支持数据传输的 Type-C 数据线，不能是纯充电线。',
      '相机开机，USB 模式设为 MTP / PTP。',
      '数据线连接相机 Type-C 口和手机 Type-C 口。',
      'App 选 USB Type-C，点连接相机。',
      '系统弹出 USB 权限时点允许。',
      '如果仍失败，点重新检测，看手机是否已经识别到 0x04B0。',
    ],
    tips: 'Type-C 对 Type-C 线如果是纯充电线，手机读不到任何设备。',
  },
  demo: {
    title: '实验模式说明',
    intro: '没有相机时，用内置模拟相机测试 App 功能。',
    steps: [
      '选择实验模式。',
      '点启动实验。',
      '进入实时取景、参数控制、相机照片。',
      '拍摄后会生成模拟照片，可直接进入修图器。',
    ],
    tips: '实验模式不会读写真实相机。',
  },
};

function loadLast() {
  try {
    const raw = localStorage.getItem('nini_last_connection');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/5 py-2">
      <span className="text-[#9898ac] text-xs">{k}</span>
      <span className="text-xs font-medium text-right">{v}</span>
    </div>
  );
}

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
  const [showGuide, setShowGuide] = useState(false);
  const [currentInfo, setCurrentInfo] = useState(null);
  const [lastConn, setLastConn] = useState(loadLast());
  const [usbDevices, setUsbDevices] = useState([]);
  const [usbSupport, setUsbSupport] = useState(null);
  const [usbError, setUsbError] = useState('');

  const connected = state.connectionState === 'session_open';

  useEffect(() => {
    const u1 = camera.on('status', d => {
      updateState({ connectionState: d.state, connectionMode: d.mode });
      if (d.state === 'session_open') {
        setError(null);
        const next = { mode: d.mode, time: Date.now(), host: d.host || host };
        setLastConn(next);
        try { localStorage.setItem('nini_last_connection', JSON.stringify(next)); } catch {}
      }
    });
    const u2 = camera.on('error', e => setError(typeof e === 'string' ? e : e.error || JSON.stringify(e)));
    const u3 = camera.on('diagnostic', m => setLogs(x => [...x, m]));
    const u4 = camera.on('camera_info', info => setCurrentInfo(info));
    let u5 = () => {};
    try {
      if (camera.isNative()) u5 = camera.onUsbDevices(d => {
        setUsbDevices(d.devices || []);
        setUsbSupport(true);
      });
    } catch {}
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, [host]);

  const changeMode = (v) => {
    setMode(v); setError(null); setShowGuide(false);
    if (v === 'wifi') setHost('192.168.1.1');
    if (v === 'sta') setHost('');
    if (v === 'usb') { setHost(''); detectUsb(); }
    if (v === 'demo') setHost('');
  };

  const detectUsb = async () => {
    if (!camera.isNative()) {
      setUsbSupport(false);
      setUsbError('USB 设备检测需要在手机 App 中使用。');
      return;
    }
    setUsbError(''); setUsbDevices([]);
    try {
      const r = await camera.listUsbDevices();
      setUsbSupport(!!r.usbHostSupported);
      setUsbDevices(r.devices || []);
      if (!r.usbHostSupported) setUsbError('这台手机不支持 USB Host / OTG。');
    } catch (e) {
      setUsbError('USB 检测失败：' + (e.message || String(e)));
    }
  };

  const connect = async () => {
    setBusy(true); setError(null); setLogs([]);
    try {
      const r = await camera.connectCamera(mode, host || '192.168.1.1', port);
      if (!r.success && r.error) setError(r.error);
    } catch (e) {
      setError(e.message || String(e));
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    await camera.disconnect();
    updateState({ connectionState: 'disconnected', connectionMode: null, connectedCamera: null });
    setCurrentInfo(null);
  };

  const copyLogs = async () => {
    try { await navigator.clipboard.writeText(logs.join('\n')); } catch {}
  };

  const modeMeta = MODES.find(m => m.value === mode);
  const guide = GUIDES[mode];
  const realMode = connected ? mode : null;

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-3">
        <h2 className="text-lg font-bold">我的相机</h2>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs whitespace-pre-wrap">
            {error}
          </div>
        )}

        {/* 当前实时状态 */}
        <div className="glass p-5 anim-fade">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] tracking-widest text-[#9898ac]">当前状态 · 实时</p>
            <span className={`badge text-[10px] ${connected ? 'badge-green' : 'badge-yellow'}`}>
              {connected ? '● 已连接' : '● 未连接'}
            </span>
          </div>
          <Row k="连接方式" v={modeMeta?.label || '未选择'} />
          <Row k="地址 / 端口" v={mode === 'usb' || mode === 'demo' ? modeMeta?.label : `${host || '未填写'}:${port}`} />
          <Row
            k="相机型号"
            v={connected
              ? (currentInfo?.model || (mode === 'demo' ? '妮妮 Z30 (模拟)' : 'Nikon Z30'))
              : '未检测到'}
          />
          <Row k="镜头信息" v={connected ? (currentInfo?.lens || '已连接，待读取') : '未连接，不读取'} />
        </div>

        {/* 历史连接记录 */}
        <div className="glass p-4">
          <p className="text-sm font-bold mb-2">历史连接记录</p>
          {lastConn ? (
            <>
              <Row k="上次连接方式" v={MODES.find(m => m.value === lastConn.mode)?.label || lastConn.mode} />
              <Row
                k="上次连接时间"
                v={new Date(lastConn.time).toLocaleString('zh-CN')}
              />
            </>
          ) : (
            <p className="text-xs text-[#585870]">暂无历史连接记录</p>
          )}
        </div>

        {/* 连接方式 */}
        <div className="glass p-4">
          <p className="text-sm font-bold mb-3">连接方式</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {MODES.map(m => (
              <button
                key={m.value}
                className={`btn text-[11px] py-2 ${mode === m.value ? 'bg-blue-600 text-white' : 'bg-white/5 text-[#9898ac]'}`}
                onClick={() => changeMode(m.value)}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>

          {mode !== 'usb' && mode !== 'demo' && (
            <div className="grid grid-cols-[1fr_82px] gap-2">
              <input
                className="input text-xs mono"
                placeholder={mode === 'sta' ? '相机 IP，如 192.168.31.10' : '192.168.1.1'}
                value={host}
                onChange={e => setHost(e.target.value)}
                disabled={busy}
              />
              <input
                className="input text-xs mono"
                placeholder="15740"
                value={port}
                onChange={e => setPort(e.target.value)}
                disabled={busy}
              />
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <button className="btn btn-secondary flex-1 text-xs" onClick={() => { setLogs([]); setError(null); if (mode === 'usb') detectUsb(); }}>
              重新检测
            </button>
            <button className="btn btn-primary flex-1 text-xs" onClick={connected ? disconnect : connect} disabled={busy}>
              {busy ? '连接中…' : connected ? '断开连接' : mode === 'usb' ? '连接 USB' : mode === 'demo' ? '启动实验' : '连接相机'}
            </button>
          </div>

          <button
            className="btn btn-secondary w-full mt-3 text-xs"
            onClick={() => setShowGuide(s => !s)}
          >
            {showGuide ? '收起教程' : `查看「${modeMeta?.label}」连接教程`}
          </button>

          {showGuide && guide && (
            <div className="mt-3 rounded-xl bg-black/30 p-3 border border-white/5 anim-scale">
              <p className="text-xs font-bold">{guide.title}</p>
              <p className="text-[10px] text-[#9898ac] mt-1">{guide.intro}</p>
              <ol className="mt-3 space-y-2">
                {guide.steps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-[11px] leading-5">
                    <span className="w-5 h-5 flex-shrink-0 rounded-full bg-blue-600/20 text-blue-300 text-[10px] flex items-center justify-center">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <p className="text-[10px] text-amber-300/80 mt-3">提示：{guide.tips}</p>
            </div>
          )}
        </div>

        {/* USB 设备诊断 */}
        {mode === 'usb' && (
          <div className="glass p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold">USB 设备诊断</p>
              <button className="btn btn-secondary text-xs" onClick={detectUsb}>检测设备</button>
            </div>
            <Row k="USB Host 支持" v={usbSupport === true ? '支持' : usbSupport === false ? '不支持' : '未检测'} />
            {usbError && <p className="text-[11px] text-red-300 mt-2">{usbError}</p>}
            {usbDevices.length === 0 ? (
              <p className="text-[11px] text-[#585870] mt-2">当前手机没有检测到 USB 设备。请确认数据线和相机开机。</p>
            ) : (
              <div className="mt-2 space-y-1">
                {usbDevices.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] bg-black/25 rounded-lg p-2">
                    <span className={d.isNikon ? 'text-emerald-300' : 'text-[#9898ac]'}>
                      {d.isNikon ? '✓ Nikon 相机' : '其他设备'} · {d.vendor}:{d.product}
                    </span>
                    <span className="text-[#585870]">{d.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 诊断日志 */}
        <div className="glass p-4">
          <button className="w-full flex items-center justify-between text-xs text-[#9898ac]" onClick={() => setShowLog(s => !s)}>
            <span>连接诊断日志</span><span>{showLog ? '收起' : '展开'}</span>
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
        <button className="btn btn-secondary w-full text-xs" onClick={copyLogs}>📤 复制诊断日志</button>
      </div>
    </div>
  );
}
