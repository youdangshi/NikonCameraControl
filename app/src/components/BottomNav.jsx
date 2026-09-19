import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Camera, FolderOpen, Home, Images, RefreshCw } from 'lucide-react';

const TABS = [
  { path: '/', label: '控制台', Icon: Home },
  { path: '/camera', label: '相机', Icon: Camera },
  { path: '/photos', label: '相机照片', Icon: Images },
  { path: '/sync', label: '同步', Icon: RefreshCw },
  { path: '/local', label: '本地', Icon: FolderOpen },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="bottom-nav">
      {TABS.map(({ path, label, Icon }) => {
        const active = location.pathname === path;
        return (
          <button
            key={path}
            type="button"
            className={`bottom-nav-item ${active ? 'active' : ''}`}
            onClick={() => navigate(path)}
          >
            <Icon size={19} strokeWidth={active ? 2.3 : 1.8} />
            <span className="truncate max-w-full px-1">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
