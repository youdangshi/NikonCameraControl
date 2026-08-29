import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const TABS = [
  { p: '/', i: '▦', l: '首页' },
  { p: '/camera', i: '📷', l: '我的相机' },
  { p: '/photos', i: '🖼', l: '相机照片' },
  { p: '/sync', i: '↻', l: '同步' },
  { p: '/local', i: '🖼', l: '本地照片' },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const loc = useLocation();
  return (
    <nav className="flex-shrink-0 flex items-stretch justify-around bg-[#0b0b14]/95 backdrop-blur-xl border-t border-white/5 px-1 pb-[max(4px,env(safe-area-inset-bottom))]">
      {TABS.map(t => {
        const active = loc.pathname === t.p;
        return (
          <button key={t.p}
            className={`flex flex-col items-center justify-center flex-1 py-2 text-[10px] transition-colors ${active ? 'text-white' : 'text-[#585870]'}`}
            onClick={() => navigate(t.p)}>
            <span className={`w-9 h-6 flex items-center justify-center rounded-full text-base ${active ? 'bg-white/10' : ''}`}>{t.i}</span>
            <span className="mt-0.5">{t.l}</span>
          </button>
        );
      })}
    </nav>
  );
}
