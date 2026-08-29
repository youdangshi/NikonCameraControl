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

const POSE_STORAGE_KEY = 'nikon_pose_guides';
const AI_SETTINGS_KEY = 'nikon_ai_settings';
const DEFAULT_POSE_GUIDES = { enabled: true, mode: 'standing', opacity: 0.55, color: '#ffffff', scale: 1 };
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
    <AppContext.Provider value={{ state: st, updateState, updatePoseGuides, updateAiSettings }}>
      <HashRouter>
        <Shell />
      </HashRouter>
    </AppContext.Provider>
  );
}

function Shell() {
  const loc = useLocation();
  const hideNav = ['/liveview', '/control', '/editor'].includes(loc.pathname);
  return (
    <div className="h-screen w-screen flex flex-col bg-[#08080e] overflow-hidden">
      <TopBar />
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
    disconnected: { cls: 'dot-gray', label: '未连接', col: '#585870' },
    connecting: { cls: 'dot-yellow', label: '连接中…', col: '#fbbf24' },
    connected: { cls: 'dot-green', label: '已连接', col: '#4ade80' },
    session_open: { cls: 'dot-green', label: '就绪', col: '#4ade80' },
    error: { cls: 'dot-red', label: '错误', col: '#f87171' },
  }[state.connectionState] || { cls: 'dot-gray', label: '', col: '#585870' };

  return (
    <div className="glass-sm flex items-center justify-between px-4 py-2.5 mx-2 my-2 flex-shrink-0" style={{ borderRadius: 12 }}>
      <div className="flex items-center gap-3">
        <span className="text-base">📷</span>
        <span className="font-bold text-sm">实验尼康</span>
        <div className="flex items-center gap-2 pl-3 border-l border-white/10">
          <span className={`dot ${cfg.cls}`} />
          <span className="text-xs font-medium" style={{ color: cfg.col }}>{cfg.label}</span>
          {state.connectionMode && <span className="badge badge-blue text-[10px]">{state.connectionMode === 'usb' ? '🔌 USB' : state.connectionMode === 'demo' ? '🔬 实验' : '📶 ' + state.connectionMode.toUpperCase()}</span>}
        </div>
      </div>
      <button className="btn-icon" onClick={() => navigate('/settings')} title="设置">⚙️</button>
    </div>
  );
}
