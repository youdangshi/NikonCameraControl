import React, { useState, useCallback, createContext, useContext } from 'react';
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import HomeScreen from './screens/HomeScreen.jsx';
import MyCameraScreen from './screens/MyCameraScreen.jsx';
import CameraPhotosScreen from './screens/CameraPhotosScreen.jsx';
import SyncScreen from './screens/SyncScreen.jsx';
import LocalMediaScreen from './screens/LocalMediaScreen.jsx';
import LiveViewScreen from './screens/LiveViewScreen.jsx';
import ControlScreen from './screens/ControlScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import EditorScreen from './screens/EditorScreen.jsx';
import BottomNav from './components/BottomNav.jsx';
import { Aperture, Settings } from 'lucide-react';

const POSE_STORAGE_KEY = 'nikon_pose_guides_v2';
const AI_SETTINGS_KEY = 'nikon_ai_settings';
const DEFAULT_POSE_GUIDES = { enabled: false, mode: 'standing', opacity: 0.55, color: '#ffffff', scale: 1 };
const DEFAULT_AI_SETTINGS = {
  provider: 'deepseek',
  endpoint: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-chat',
};

function loadJSON(key, fallback) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    return saved ? { ...fallback, ...saved } : fallback;
  } catch { return fallback; }
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    try { console.error('[妮妮] 页面渲染异常', error, info); } catch {}
  }

  render() {
    if (this.state.error) {
      const text = this.state.error?.message || String(this.state.error);
      return (
        <div className="h-screen w-screen app-shell text-white flex items-center justify-center p-6">
          <div className="panel max-w-sm w-full p-5 text-center">
            <h1 className="text-base font-bold">页面遇到错误</h1>
            <p className="text-xs text-[var(--text-soft)] leading-5 mt-2 break-all">{text}</p>
            <button className="btn btn-primary w-full mt-4" onClick={() => location.reload()}>重新打开</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const AppContext = createContext({
  state: {
    connectionState: 'disconnected', connectedCamera: null, connectionMode: null,
    aiApiKey: '', poseGuides: DEFAULT_POSE_GUIDES, aiSettings: DEFAULT_AI_SETTINGS,
  },
  updateState: () => {},
  updatePoseGuides: () => {},
  updateAiSettings: () => {},
});

export default function App() {
  const [st, setSt] = useState({
    connectionState: 'disconnected', connectedCamera: null, connectionMode: null,
    aiApiKey: localStorage.getItem('nikon_ai_key') || '',
    poseGuides: loadJSON(POSE_STORAGE_KEY, DEFAULT_POSE_GUIDES),
    aiSettings: loadJSON(AI_SETTINGS_KEY, DEFAULT_AI_SETTINGS),
  });
  const updateState = useCallback(p => setSt(s => ({ ...s, ...p })), []);
  const updatePoseGuides = useCallback(p => setSt(s => {
    const poseGuides = { ...s.poseGuides, ...p };
    try { localStorage.setItem(POSE_STORAGE_KEY, JSON.stringify(poseGuides)); } catch {}
    return { ...s, poseGuides };
  }), []);
  const updateAiSettings = useCallback(p => setSt(s => {
    const aiSettings = { ...s.aiSettings, ...p };
    try { localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(aiSettings)); } catch {}
    return { ...s, aiSettings };
  }), []);

  return (
    <AppErrorBoundary>
      <AppContext.Provider value={{ state: st, updateState, updatePoseGuides, updateAiSettings }}>
        <HashRouter>
          <Shell />
        </HashRouter>
      </AppContext.Provider>
    </AppErrorBoundary>
  );
}

function Shell() {
  const loc = useLocation();
  const hideNav = ['/liveview', '/control', '/editor'].includes(loc.pathname);
  const hideTopBar = loc.pathname === '/liveview';
  return (
    <div className="h-screen w-screen flex flex-col app-shell overflow-hidden">
      {!hideTopBar && <TopBar />}
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/camera" element={<MyCameraScreen />} />
          <Route path="/photos" element={<CameraPhotosScreen />} />
          <Route path="/sync" element={<SyncScreen />} />
          <Route path="/local" element={<LocalMediaScreen />} />
          <Route path="/liveview" element={<LiveViewScreen />} />
          <Route path="/control" element={<ControlScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/editor" element={<EditorScreen />} />
        </Routes>
      </div>
      {!hideNav && <BottomNav />}
    </div>
  );
}

function TopBar() {
  const { state } = useContext(AppContext);
  const navigate = useNavigate();
  const cfg = {
    disconnected: { cls: 'dot-gray', label: '未连接', col: 'var(--text-muted)' },
    connecting: { cls: 'dot-yellow', label: '连接中', col: 'var(--warning)' },
    connected: { cls: 'dot-green', label: '已连接', col: 'var(--green)' },
    session_open: { cls: 'dot-green', label: '就绪', col: 'var(--green)' },
    error: { cls: 'dot-red', label: '错误', col: 'var(--red)' },
  }[state.connectionState] || { cls: 'dot-gray', label: '', col: 'var(--text-muted)' };

  const modeLabel = state.connectionMode === 'usb'
    ? 'USB'
    : state.connectionMode === 'demo'
      ? '模拟'
      : state.connectionMode
        ? state.connectionMode.toUpperCase()
        : null;

  return (
    <header className="top-bar">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="brand-mark"><Aperture size={18} strokeWidth={2.2} /></span>
        <span className="font-bold text-[15px] tracking-wide">妮妮</span>
        <div className="flex items-center gap-2 pl-2.5 ml-1 border-l border-[var(--line)] min-w-0">
          <span className={`dot ${cfg.cls}`} />
          <span className="text-[11px] font-semibold truncate" style={{ color: cfg.col }}>{cfg.label}</span>
          {modeLabel && <span className="badge badge-blue">{modeLabel}</span>}
        </div>
      </div>
      <button className="btn-icon ml-auto" onClick={() => navigate('/settings')} title="设置" aria-label="设置">
        <Settings size={17} />
      </button>
    </header>
  );
}
