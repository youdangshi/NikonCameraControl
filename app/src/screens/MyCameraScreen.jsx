import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App.jsx';
import { camera } from '../api.js';
import { CAMERA_BRANDS } from '../cameraBrands.js';
import {
  Cable, CheckCircle2, ChevronDown, ChevronUp, FlaskConical, Info, Network,
  PlugZap, RefreshCw, Settings2, Unplug, Wifi, XCircle,
} from 'lucide-react';

const MODES = [
  { value: 'wifi', label: 'WiFi 热点', icon: Wifi },
  { value: 'sta', label: 'STA 局域网', icon: Network },
  { value: 'usb', label: 'USB Type-C', icon: Cable },
  { value: 'demo', label: '实验模式', icon: FlaskConical },
];

const BRAND_OPTIONS = [
  { value: 'auto', label: '自动识别' },
  ...Object.values(CAMERA_BRANDS).filter(brand => brand.id !== 'generic').map(brand => ({
    value: brand.id,
    label: brand.label,
    status: brand.status,
  })),
];

const GUIDES = {
  wifi: {
    title: 'WiFi 热点连接',
    intro: '由相机创建热点，手机直接连接，不经过路由器。',
    steps: ['相机进入无线连接菜单，选择允许计算机控制。', '在相机屏幕确认热点名称。', '手机连接 Nikon 相机热点。', '返回妮妮，确认地址为 192.168.1.1，端口 15740。', '点击连接并等待 PTP/IP 会话建立。'],
    tips: '手机连接相机热点后可能无法访问互联网，这是正常现象。双 WiFi 手机可同时保留家庭网络。',
  },
  staPc: {
    title: 'STA · PC 控制',
    intro: '相机和手机连接同一个网络，用于相机会话、照片传输和控制。Nikon Z30 的 STA 实时取景会导致相机退出网络。',
    steps: ['手机连接家庭或工作 WiFi。', '相机无线菜单选择“连接到电脑”，再连接到同一个网络。', '在相机屏幕查看分配的 IP 地址。', '返回妮妮填写相机 IP，选择“PC 控制”，端口保持 15740。', '点击连接后使用照片传输或控制；实时取景请切换到相机热点或 USB。'],
    tips: '手机与相机必须处于同一网段，路由器不能开启客户端隔离。当前 Z30 真机验证中，STA 取景命令会导致相机断开热点或路由器。',
  },
  staDevice: {
    title: 'STA · 智能设备',
    intro: '相机通过“发送到智能设备/连接智能手机”加入当前网络。该模式用于浏览和传输相机照片。',
    steps: ['手机连接家庭或工作 WiFi。', '相机无线菜单选择“发送到智能设备”或“连接智能手机”。', '在相机屏幕查看分配的 IP 地址。', '返回妮妮填写相机 IP，选择“智能设备”，端口保持 15740。', '点击连接并进入相机照片。'],
    tips: '该模式通常不允许实时取景和遥控拍摄。需要完整控制时，请在相机端改选“连接到电脑”。',
  },
  usb: {
    title: 'USB Type-C 连接',
    intro: '手机作为 USB Host，通过数据线直接控制相机。',
    steps: ['使用支持数据传输的 Type-C 线。', '相机开机，USB 模式设为 MTP 或 PTP。', '连接相机与手机。', '系统请求 USB 权限时选择允许。', '点击连接 USB，确认检测到 Nikon VID 04B0。'],
    tips: '纯充电线不会出现在 USB 设备列表中。连接异常时可点击重新检测。',
  },
  demo: {
    title: '实验模式',
    intro: '使用内置模拟相机检查界面和修图流程，不访问真实相机。',
    steps: ['选择实验模式。', '点击启动实验。', '进入实时取景、参数控制和照片页面。', '拍摄后可直接进入修图器。'],
    tips: '实验模式不会读写相机存储卡。',
  },
};

const CONNECTION_CONFIG_KEY = 'nini_connection_configs';
const CONNECTION_PROFILES_KEY = 'nini_connection_profiles_v2';

function formatLogLine(record) {
  if (typeof record === 'string') return record;
  const time = record?.timestamp ? new Date(record.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) : '';
  const level = record?.level ? `[${record.level.toUpperCase()}]` : '';
  return `${time} ${level} ${record?.message || JSON.stringify(record)}`.trim();
}

function loadConnectionConfigs() {
  try {
    return JSON.parse(localStorage.getItem(CONNECTION_CONFIG_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveConnectionConfig(mode, host, port, profile = null, brand = 'auto') {
  try {
    const configs = loadConnectionConfigs();
    configs[mode] = {
      host: host || '',
      port: Number.parseInt(port, 10) || 15740,
      profile: profile || configs[mode]?.profile || 'pc',
      brand: brand || configs[mode]?.brand || 'auto',
    };
    localStorage.setItem(CONNECTION_CONFIG_KEY, JSON.stringify(configs));
  } catch {}
}

function loadConnectionProfiles() {
  try {
    const profiles = JSON.parse(localStorage.getItem(CONNECTION_PROFILES_KEY) || '[]');
    return Array.isArray(profiles) ? profiles : [];
  } catch {
    return [];
  }
}

function persistConnectionProfiles(profiles) {
  try {
    localStorage.setItem(CONNECTION_PROFILES_KEY, JSON.stringify(profiles.slice(0, 30)));
  } catch {}
}

function profileKey(item) {
  return [item.mode, item.brand || 'auto', item.host || '', Number(item.port) || 15740, item.profile || ''].join('|');
}

function profileLabel(item) {
  const brand = CAMERA_BRANDS[item.brand]?.label || '自动识别';
  const mode = MODES.find(option => option.value === item.mode)?.label || item.mode || '相机';
  const target = item.mode === 'usb'
    ? 'USB'
    : `${item.host || '未填写'}:${item.port || 15740}`;
  const profile = item.mode === 'sta'
    ? ` · ${item.profile === 'device' ? '智能设备' : 'PC 控制'}`
    : '';
  return `${brand} · ${mode} · ${target}${profile}`;
}

function upsertConnectionProfile(profiles, item) {
  const next = {
    ...item,
    port: Number.parseInt(item.port, 10) || 15740,
    lastUsedAt: Date.now(),
    id: profileKey(item),
  };
  return [next, ...profiles.filter(existing => profileKey(existing) !== next.id)]
    .sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0))
    .slice(0, 30);
}

function loadLast() {
  try {
    const raw = localStorage.getItem('nini_last_connection');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b last:border-b-0 border-[var(--line)]">
      <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0">{label}</span>
      <span className={`text-[11px] font-medium text-right truncate ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  );
}

export default function MyCameraScreen() {
  const { state, updateState } = useContext(AppContext);
  const navigate = useNavigate();
  const savedConfigs = loadConnectionConfigs();
  const initialLast = loadLast();
  const initialMode = initialLast?.mode === 'sta' ? 'sta' : 'wifi';
  const initialConfig = savedConfigs[initialMode] || {};
  const [mode, setMode] = useState(initialMode);
  const [host, setHost] = useState(initialConfig.host || (initialMode === 'sta' ? '' : '192.168.1.1'));
  const [port, setPort] = useState(String(initialConfig.port || 15740));
  const [staProfile, setStaProfile] = useState(initialConfig.profile === 'device' ? 'device' : 'pc');
  const [brand, setBrand] = useState(initialConfig.brand || 'auto');
  const [profiles, setProfiles] = useState(loadConnectionProfiles);
  const [selectedProfileId, setSelectedProfileId] = useState('');
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
  const modeProfiles = profiles.filter(item => item.mode === mode);
  const selectedProfile = modeProfiles.find(item => item.id === selectedProfileId) || null;

  const applyProfile = (item) => {
    if (!item) return;
    setMode(item.mode);
    setHost(item.host || (item.mode === 'sta' ? '' : '192.168.1.1'));
    setPort(String(item.port || 15740));
    setStaProfile(item.profile === 'device' ? 'device' : 'pc');
    setBrand(item.brand || 'auto');
    setSelectedProfileId(item.id || profileKey(item));
    setError(null);
  };

  const saveCurrentProfile = () => {
    const item = {
      mode,
      host,
      port: Number.parseInt(port, 10) || 15740,
      profile: mode === 'sta' ? staProfile : null,
      brand,
    };
    const next = upsertConnectionProfile(profiles, item);
    setProfiles(next);
    persistConnectionProfiles(next);
    setSelectedProfileId(profileKey(item));
  };

  const removeSelectedProfile = () => {
    if (!selectedProfile) return;
    const next = profiles.filter(item => item.id !== selectedProfile.id);
    setProfiles(next);
    persistConnectionProfiles(next);
    setSelectedProfileId('');
  };

  useEffect(() => {
    const cleanups = [
      camera.on('status', data => {
        updateState({ connectionState: data.state, connectionMode: data.mode, connectionProfile: data.profile || null });
        if (data.state === 'session_open') {
          setError(null);
          const next = {
            mode: data.mode,
            time: Date.now(),
            host: data.host || '',
            port: data.port || 15740,
            profile: data.profile || null,
            brand: data.brand || brand,
          };
          setLastConn(next);
          saveConnectionConfig(data.mode, data.host, data.port, data.profile || null, data.brand || brand);
          setProfiles(previous => {
            const updated = upsertConnectionProfile(previous, next);
            persistConnectionProfiles(updated);
            return updated;
          });
          setSelectedProfileId(profileKey(next));
          try { localStorage.setItem('nini_last_connection', JSON.stringify(next)); } catch {}
        }
      }),
      camera.on('error', data => setError(typeof data === 'string' ? data : data.error || JSON.stringify(data))),
      camera.on('diagnostic', record => setLogs(items => [...items, record])),
      camera.on('camera_info', info => setCurrentInfo(info)),
    ];
    return () => cleanups.forEach(cleanup => typeof cleanup === 'function' && cleanup());
  }, [updateState, brand]);

  const changeMode = (value) => {
    setMode(value);
    setError(null);
    setShowGuide(false);
    const configs = loadConnectionConfigs();
    const saved = configs[value] || {};
    const recentProfile = profiles.find(item => item.mode === value);
    if (recentProfile) {
      applyProfile(recentProfile);
      return;
    }
    if (value === 'wifi') setHost(saved.host || '192.168.1.1');
    else if (value === 'sta') setHost(saved.host || '');
    else setHost('');
    setPort(String(saved.port || 15740));
    setStaProfile(saved.profile === 'device' ? 'device' : 'pc');
    setBrand(saved.brand || 'auto');
    setSelectedProfileId('');
  };

  const detectUsb = useCallback(async () => {
    if (!camera.isNative()) {
      setUsbSupport(false);
      setUsbError('USB 设备检测需要在手机 App 中使用。');
      return;
    }
    setUsbError('');
    setUsbDevices([]);
    try {
      const result = await camera.listUsbDevices();
      setUsbSupport(Boolean(result.usbHostSupported));
      setUsbDevices(result.devices || []);
      if (!result.usbHostSupported) setUsbError('这台手机不支持 USB Host / OTG。');
      else if (result.error) setUsbError(result.error);
      else if (!(result.devices || []).length) setUsbError('没有检测到 USB 设备，请检查数据线和相机状态。');
      else if (!result.hasNikon) setUsbError('已检测到 USB 设备，但没有发现 Nikon 相机。');
    } catch (e) {
      setUsbError(`USB 检测失败：${e.message || String(e)}`);
    }
  }, []);

  useEffect(() => {
    if (mode === 'usb') detectUsb();
  }, [mode, detectUsb]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    setLogs([]);
    try {
      const result = await camera.connectCamera(
        mode,
        host,
        Number.parseInt(port, 10) || 15740,
        { profile: mode === 'sta' ? staProfile : null, brand },
      );
      if (!result.success && result.error) setError(result.error);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    await camera.disconnect();
    updateState({ connectionState: 'disconnected', connectionMode: null, connectionProfile: null, connectedCamera: null });
    setCurrentInfo(null);
  };

  const copyLogs = async () => {
    const text = logs.map(formatLogLine).join('\n');
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  const exportDiagnostics = async () => {
    const payload = camera.getDiagnostics();
    const text = JSON.stringify(payload, null, 2);
    try {
      if (navigator.share) {
        await navigator.share({ title: '妮妮相机诊断日志', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setError('诊断日志已复制到剪贴板');
    } catch {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `nini-diagnostics-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  };

  const modeMeta = MODES.find(item => item.value === mode) || MODES[0];
  const guide = mode === 'sta'
    ? (staProfile === 'device' ? GUIDES.staDevice : GUIDES.staPc)
    : GUIDES[mode];
  const activeMode = connected ? (MODES.find(item => item.value === state.connectionMode) || modeMeta) : modeMeta;
  const activeModeLabel = state.connectionMode === 'sta'
    ? (state.connectionProfile ? `STA · ${state.connectionProfile === 'device' ? '智能设备传输' : 'PC 控制'}` : 'STA 局域网')
    : activeMode.label;
  const activeHost = currentInfo?.ip || lastConn?.host || host;
  const activePort = lastConn?.port || port || 15740;
  const selectedBrand = BRAND_OPTIONS.find(item => item.value === brand) || BRAND_OPTIONS[0];

  return (
    <div className="page">
      <div className="page-inner space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="section-label">相机连接</p>
            <h1 className="text-xl font-bold mt-1">相机连接</h1>
          </div>
          <button className="btn-icon" onClick={() => navigate('/settings')} aria-label="设置"><Settings2 size={17} /></button>
        </div>

        {error && (
          <div className="panel px-4 py-3 flex items-start gap-3 border-[rgba(255,107,107,.35)]">
            <XCircle size={17} className="text-[var(--red)] flex-shrink-0 mt-0.5" />
            <p className="text-[11px] leading-5 text-[#ffb4b4] whitespace-pre-wrap">{error}</p>
          </div>
        )}

        <section className="panel">
          <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
            <div>
              <p className="section-label">实时状态</p>
              <p className="section-title mt-1">连接状态</p>
            </div>
            <span className={`badge ${connected ? 'badge-green' : 'badge-yellow'}`}>
              {connected ? <CheckCircle2 size={12} /> : <Unplug size={12} />}
              {connected ? '已连接' : '未连接'}
            </span>
          </div>
          <div className="px-4">
            <DetailRow label="连接方式" value={activeModeLabel} />
            <DetailRow label="地址 / 端口" value={mode === 'usb' || mode === 'demo' ? activeMode.label : `${connected ? activeHost : (host || '未填写')}:${connected ? activePort : port}`} mono />
            <DetailRow label="相机品牌" value={connected ? (currentInfo?.brandLabel || selectedBrand.label) : selectedBrand.label} />
            <DetailRow label="相机型号" value={connected ? (currentInfo?.model || 'Nikon Z30') : '未检测到'} />
            <DetailRow label="镜头信息" value={connected ? (currentInfo?.lens || '已连接，等待读取') : '未读取'} />
          </div>
        </section>

        <section className="panel">
          <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
            <div>
              <p className="section-label">连接记录</p>
              <p className="section-title mt-1">最近连接</p>
            </div>
          </div>
          {lastConn ? (
            <div className="px-4">
              <DetailRow label="连接方式" value={MODES.find(item => item.value === lastConn.mode)?.label || lastConn.mode} />
              <DetailRow label="连接时间" value={new Date(lastConn.time).toLocaleString('zh-CN')} />
            </div>
          ) : (
            <p className="px-4 py-4 text-[11px] text-[var(--text-muted)]">暂无历史连接记录</p>
          )}
        </section>

        <section className="panel">
          <div className="px-4 py-3 border-b border-[var(--line)]">
            <p className="section-label">连接方式</p>
            <p className="section-title mt-1">连接方式</p>
          </div>
          <div className="p-3 grid grid-cols-2 gap-2">
            {MODES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                className={`min-h-12 px-3 rounded-md border flex items-center gap-2 text-xs font-semibold transition-colors ${mode === value ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)]' : 'bg-[#15191d] text-[var(--text-soft)] border-[var(--line)]'}`}
                onClick={() => changeMode(value)}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>

          {mode !== 'demo' && (
            <div className="px-3 pb-3">
              <label className="block text-[10px] text-[var(--text-muted)] mb-1.5">相机品牌</label>
              <select className="select" value={brand} onChange={event => setBrand(event.target.value)} disabled={busy || connected}>
                {BRAND_OPTIONS.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}{item.status === 'experimental' ? '（实验）' : ''}
                  </option>
                ))}
              </select>
              {selectedBrand.status === 'experimental' && (
                <p className="mt-2 text-[10px] leading-4 text-[var(--warning)]">
                  该品牌目前只接入通用 PTP 检测和照片浏览；取景、对焦、快门等私有能力未实现前会主动阻止发送。
                </p>
              )}
            </div>
          )}

          {mode !== 'demo' && (
            <div className="px-3 pb-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[10px] text-[var(--text-muted)]">连接档案</span>
                <span className="text-[9px] text-[var(--text-muted)]">{modeProfiles.length} 个已保存</span>
              </div>
              {modeProfiles.length > 0 ? (
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <select
                    className="select"
                    value={selectedProfile?.id || ''}
                    onChange={event => {
                      const item = modeProfiles.find(profile => profile.id === event.target.value);
                      if (item) applyProfile(item);
                    }}
                    disabled={busy || connected}
                  >
                    <option value="">选择已保存的相机</option>
                    {modeProfiles.map(item => (
                      <option key={item.id} value={item.id}>{profileLabel(item)}</option>
                    ))}
                  </select>
                  <button className="btn btn-secondary px-3" type="button" onClick={removeSelectedProfile} disabled={!selectedProfile || busy || connected} aria-label="删除连接档案">
                    删除
                  </button>
                </div>
              ) : (
                <p className="text-[10px] leading-4 text-[var(--text-muted)]">成功连接后会自动保存，下次可直接选择同一台相机。</p>
              )}
              <button className="btn btn-ghost w-full mt-1.5 text-[10px]" type="button" onClick={saveCurrentProfile} disabled={busy || mode === 'sta' && !host}>
                保存当前连接参数
              </button>
            </div>
          )}

          {mode !== 'usb' && mode !== 'demo' && (
            <div className="px-3 pb-3 grid grid-cols-[1fr_96px] gap-2">
              <input className="input mono" placeholder={mode === 'sta' ? '相机 IP，如 192.168.31.10' : '192.168.1.1'} value={host} onChange={e => setHost(e.target.value)} disabled={busy} />
              <input className="input mono" inputMode="numeric" placeholder="15740" value={port} onChange={e => setPort(e.target.value)} disabled={busy} />
            </div>
          )}

          {mode === 'sta' && (
            <div className="px-3 pb-3 grid grid-cols-2 gap-2">
              {[
                { value: 'pc', label: 'PC 控制', desc: '相机端选“连接到电脑”' },
                { value: 'device', label: '智能设备', desc: '仅照片浏览和传输' },
              ].map(item => (
                <button
                  key={item.value}
                  type="button"
                  disabled={busy}
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${staProfile === item.value ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-[var(--surface-raised)]'}`}
                  onClick={() => setStaProfile(item.value)}
                >
                  <span className={`block text-[11px] font-semibold ${staProfile === item.value ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>{item.label}</span>
                  <span className="block text-[9px] text-[var(--text-muted)] mt-1">{item.desc}</span>
                </button>
              ))}
            </div>
          )}

          <div className="px-3 pb-3 flex gap-2">
            <button className="btn btn-secondary flex-1" onClick={() => { setLogs([]); setError(null); if (mode === 'usb') detectUsb(); }}>
              <RefreshCw size={15} /> 重新检测
            </button>
            <button className="btn btn-primary flex-1" onClick={connected ? disconnect : connect} disabled={busy}>
              {busy ? <RefreshCw size={15} className="animate-spin" /> : <PlugZap size={15} />}
              {busy ? '连接中' : connected ? '断开连接' : mode === 'usb' ? '连接 USB' : mode === 'demo' ? '启动实验' : '连接相机'}
            </button>
          </div>

          <button className="w-full min-h-11 px-4 border-t border-[var(--line)] flex items-center justify-between text-[11px] text-[var(--text-soft)]" onClick={() => setShowGuide(value => !value)}>
            <span className="flex items-center gap-2"><Info size={14} /> {guide.title}</span>
            {showGuide ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {showGuide && (
            <div className="px-4 pb-4">
              <p className="text-[11px] text-[var(--text-soft)] leading-5">{guide.intro}</p>
              <ol className="mt-3 space-y-2">
                {guide.steps.map((step, index) => (
                  <li key={index} className="flex gap-3 text-[11px] leading-5">
                    <span className="mono w-5 h-5 flex-shrink-0 rounded bg-[var(--surface-raised)] border border-[var(--line)] flex items-center justify-center text-[9px] text-[var(--text-muted)]">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <p className="text-[10px] text-[var(--warning)] leading-4 mt-3">{guide.tips}</p>
            </div>
          )}
        </section>

        {mode === 'usb' && (
          <section className="panel">
            <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
              <div>
                <p className="section-label">USB 主机</p>
                <p className="section-title mt-1">设备诊断</p>
              </div>
              <button className="btn btn-secondary" onClick={detectUsb}><RefreshCw size={14} /> 检测</button>
            </div>
            <div className="px-4">
              <DetailRow label="USB Host 支持" value={usbSupport === true ? '支持' : usbSupport === false ? '不支持' : '未检测'} />
            </div>
            {usbError && <p className="px-4 pb-3 text-[10px] text-[var(--red)] leading-4">{usbError}</p>}
            {usbDevices.length > 0 && (
              <div className="px-4 pb-4 space-y-2">
                {usbDevices.map((device, index) => (
                  <div key={index} className="flex items-center justify-between gap-3 py-2 border-t border-[var(--line)] text-[10px]">
                    <span className={device.isNikon ? 'text-[var(--green)]' : 'text-[var(--text-soft)]'}>{device.isNikon ? 'Nikon 相机' : '其他设备'} · {device.vendor}:{device.product}</span>
                    <span className="mono text-[var(--text-muted)] truncate">{device.name}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="panel">
          <button className="w-full min-h-11 px-4 flex items-center justify-between text-[11px] text-[var(--text-soft)]" onClick={() => setShowLog(value => !value)}>
            <span>连接诊断日志</span>
            {showLog ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {showLog && (
            <div className="mx-4 mb-4 p-3 rounded-md bg-black/35 border border-[var(--line)] max-h-44 overflow-auto">
              {logs.length === 0
                ? <p className="text-[10px] text-[var(--text-muted)]">暂无日志</p>
                : logs.map((line, index) => <p key={index} className="mono text-[9px] leading-4 text-[#98c99f] break-all">{formatLogLine(line)}</p>)}
            </div>
          )}
          {logs.length > 0 && (
            <div className="grid grid-cols-2 border-t border-[var(--line)]">
              <button className="btn btn-ghost rounded-none text-[10px]" onClick={copyLogs}>复制日志</button>
              <button className="btn btn-ghost border-l border-[var(--line)] rounded-none text-[10px]" onClick={exportDiagnostics}>导出诊断</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
