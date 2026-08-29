import React, { useEffect, useRef, useState } from 'react';

/**
 * 人像拍照姿势悬浮窗
 *
 * 在取景画面上叠加「常见姿势框线」，只保留人物轮廓（stroke，不填充）。
 * 支持：选择姿势、拖动位置、缩放大小、调节透明度/颜色、一键关闭。
 *
 * Props:
 *   active      是否显示姿势框线
 *   pose        当前姿势 id
 *   opacity     0..1
 *   color       线条颜色
 *   scale       0.5..2.4
 *   onSelect / onOpacityChange / onColorChange / onScaleChange / onToggle
 */

export const POSE_ITEMS = [
  { id: 'standing', label: '站姿', icon: '🧍' },
  { id: 'sitting', label: '坐姿', icon: '🪑' },
  { id: 'lean', label: '靠墙', icon: '🚪' },
  { id: 'lookback', label: '回头', icon: '👀' },
  { id: 'walking', label: '走路', icon: '🚶' },
  { id: 'squatting', label: '蹲姿', icon: '🧎' },
  { id: 'peace', label: '比耶', icon: '✌️' },
  { id: 'side', label: '侧身', icon: '↔️' },
  { id: 'half', label: '半身', icon: '🟰' },
  { id: 'full', label: '全身', icon: '🫂' },
  { id: 'headshot', label: '头部', icon: '🗣' },
  { id: 'thirds', label: '三分', icon: '⊞' },
];

function PoseSvgInternal({ pose, opacity, color }) {
  const o = Math.max(0, Math.min(1, Number(opacity) || 0.55));
  const c = color || '#ffffff';
  const s = { stroke: c, strokeOpacity: o, strokeWidth: 2.4, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  let body;

  if (pose === 'sitting') {
    body = (
      <>
        <circle cx="50" cy="34" r="10" {...s} />
        <path d="M43 48 L39 84" {...s} />
        <path d="M43 48 C48 55 58 55 65 49" {...s} />
        <path d="M39 84 L14 84 M39 84 L67 84" {...s} />
        <path d="M37 88 L33 116 M33 116 L18 116 M59 88 L61 116 M61 116 L76 116" {...s} />
        <path d="M20 72 L5 84 M20 72 L5 72" {...s} />
      </>
    );
  } else if (pose === 'lean') {
    body = (
      <>
        <line x1="80" y1="8" x2="80" y2="152" {...s} />
        <circle cx="48" cy="32" r="10" {...s} />
        <path d="M46 47 L56 82 M46 47 L34 72" {...s} />
        <path d="M56 82 L76 78 M56 82 L42 118 M42 118 L30 142 M68 84 L80 142" {...s} />
        <path d="M34 72 L15 80 M34 72 L36 90" {...s} />
      </>
    );
  } else if (pose === 'lookback') {
    body = (
      <>
        <circle cx="60" cy="27" r="10" {...s} />
        <path d="M54 42 L49 76 M54 42 L68 65" {...s} />
        <path d="M49 76 L34 110 M49 76 L65 105 M65 105 L79 144 M34 110 L22 144" {...s} />
        <path d="M68 65 L82 55 M68 65 L70 87" {...s} />
      </>
    );
  } else if (pose === 'walking') {
    body = (
      <>
        <circle cx="50" cy="28" r="10" {...s} />
        <path d="M45 42 L43 80 M45 42 L60 67" {...s} />
        <path d="M43 80 L33 122 M43 80 L55 120 M55 120 L66 148 M33 122 L18 144" {...s} />
        <path d="M60 67 L78 58 M60 67 L60 94" {...s} />
      </>
    );
  } else if (pose === 'squatting') {
    body = (
      <>
        <circle cx="50" cy="38" r="10" {...s} />
        <path d="M44 50 L38 82 M44 50 L60 78" {...s} />
        <path d="M38 82 L24 108 M38 82 L58 112 M58 112 L75 134 M24 108 L37 133" {...s} />
        <path d="M60 78 L74 76 M60 78 L63 105" {...s} />
      </>
    );
  } else if (pose === 'peace') {
    body = (
      <>
        <circle cx="50" cy="38" r="11" {...s} />
        <path d="M43 53 L45 85 M43 53 L59 72" {...s} />
        <path d="M45 85 L35 120 M45 85 L60 120 M35 120 L25 148 M60 120 L73 150" {...s} />
        <path d="M68 39 L76 26 L80 42" {...s} />
        <path d="M68 39 L56 43" {...s} />
      </>
    );
  } else if (pose === 'side') {
    body = (
      <>
        <circle cx="53" cy="29" r="10" {...s} />
        <path d="M50 43 L46 82 M50 43 L65 64" {...s} />
        <path d="M46 82 L39 119 M46 82 L60 117 M60 117 L74 145 M39 119 L28 145" {...s} />
        <path d="M65 64 L78 56 M65 64 L67 89" {...s} />
      </>
    );
  } else if (pose === 'half') {
    body = (
      <>
        <rect x="25" y="8" width="50" height="85" rx="3" {...s} />
        <circle cx="50" cy="35" r="13" {...s} />
        <path d="M28 67 Q50 45 72 67" {...s} />
        <line x1="25" y1="68" x2="75" y2="68" {...s} />
        <line x1="50" y1="9" x2="50" y2="92" {...s} />
      </>
    );
  } else if (pose === 'full') {
    body = (
      <>
        <rect x="28" y="6" width="44" height="147" rx="3" {...s} />
        <circle cx="50" cy="30" r="14" {...s} />
        <path d="M31 65 Q50 48 69 65" {...s} />
        <line x1="28" y1="72" x2="72" y2="72" {...s} />
        <line x1="28" y1="128" x2="72" y2="128" {...s} />
        <line x1="50" y1="7" x2="50" y2="152" {...s} />
      </>
    );
  } else if (pose === 'headshot') {
    body = (
      <>
        <rect x="23" y="8" width="54" height="100" rx="3" {...s} />
        <ellipse cx="50" cy="52" rx="20" ry="25" {...s} />
        <path d="M22 85 Q50 54 78 85" {...s} />
        <line x1="22" y1="86" x2="78" y2="86" {...s} />
        <line x1="50" y1="9" x2="50" y2="107" {...s} />
      </>
    );
  } else if (pose === 'thirds') {
    body = (
      <>
        <line x1="33.3" y1="0" x2="33.3" y2="160" {...s} />
        <line x1="66.6" y1="0" x2="66.6" y2="160" {...s} />
        <line x1="0" y1="53.3" x2="100" y2="53.3" {...s} />
        <line x1="0" y1="106.6" x2="100" y2="106.6" {...s} />
        <circle cx="50" cy="80" r="5" {...s} />
      </>
    );
  } else {
    // standing / 默认站姿
    body = (
      <>
        <circle cx="50" cy="27" r="10" {...s} />
        <path d="M44 42 L46 83 M44 42 L60 65" {...s} />
        <path d="M46 83 L38 122 M46 83 L61 122 M61 122 L74 151 M38 122 L27 151" {...s} />
        <path d="M60 65 L76 58 M60 65 L62 91" {...s} />
      </>
    );
  }

  return (
    <svg viewBox="0 0 100 160" className="w-full h-full overflow-visible" aria-hidden="true">
      {body}
    </svg>
  );
}

export default function PoseLibrary({
  active = false,
  pose = 'standing',
  opacity = 0.55,
  color = '#ffffff',
  scale = 1,
  onSelect,
  onOpacityChange,
  onColorChange,
  onScaleChange,
  onToggle,
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const drag = useRef(null);

  useEffect(() => {
    const up = () => { drag.current = null; };
    const move = (e) => {
      if (!drag.current || !drag.current.box) return;
      const rect = drag.current.box.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
      setPos({ x, y });
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointermove', move);
    return () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointermove', move); };
  }, []);

  const startDrag = (e) => {
    drag.current = { box: e.currentTarget.parentElement };
    e.preventDefault();
  };

  return (
    <>
      {/* 姿势框线本体 */}
      {active && (
        <div
          className="absolute pointer-events-auto"
          style={{
            left: `${pos.x}%`, top: `${pos.y}%`,
            width: 170, height: 260,
            transform: `translate(-50%, -50%) scale(${scale})`,
            cursor: 'grab',
          }}
          onPointerDown={startDrag}
          title="拖动调整姿势位置"
        >
          <PoseSvgInternal pose={pose} opacity={opacity} color={color} />
        </div>
      )}

      {/* 打开姿势库按钮 */}
      <button
        className="absolute top-2 left-2 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/10 text-[11px] text-white/80 backdrop-blur"
        onClick={() => panelOpen ? setPanelOpen(false) : setPanelOpen(true)}
        title="人像姿势"
      >
        {panelOpen ? '✕ 收起' : '📐 姿势'}
      </button>

      {/* 姿势库面板 */}
      {panelOpen && (
        <div className="absolute left-2 top-11 z-30 w-[min(330px,88%)] max-h-[72%] overflow-y-auto rounded-2xl bg-[#14141f]/95 border border-white/10 shadow-2xl p-3 anim-scale">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold">人像姿势库</p>
            <button className="btn-icon w-7 h-7 text-xs" onClick={() => setPanelOpen(false)}>✕</button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {POSE_ITEMS.map(p => (
              <button
                key={p.id}
                className={`rounded-lg p-1.5 text-center text-[10px] transition-colors ${pose === p.id ? 'bg-blue-600 text-white' : 'bg-white/5 text-[#9898ac] hover:bg-white/10'}`}
                onClick={() => onSelect && onSelect(p.id)}
              >
                <div className="text-lg">{p.icon}</div>
                <div className="mt-0.5">{p.label}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 border-t border-white/5 pt-3">
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-[#9898ac]">透明度</span>
              <span className="text-[10px] mono">{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range" min="0" max="100" value={Math.round(opacity * 100)}
              onChange={e => onOpacityChange && onOpacityChange(Number(e.target.value) / 100)}
              className="w-full h-1.5 appearance-none rounded-full bg-white/10"
            />
            <div className="flex justify-between mb-1 mt-3">
              <span className="text-[10px] text-[#9898ac]">大小</span>
              <span className="text-[10px] mono">{scale.toFixed(1)}x</span>
            </div>
            <input
              type="range" min="0.4" max="2.4" step="0.1" value={scale}
              onChange={e => onScaleChange && onScaleChange(Number(e.target.value))}
              className="w-full h-1.5 appearance-none rounded-full bg-white/10"
            />
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[10px] text-[#9898ac]">颜色</span>
              <input
                type="color" value={color} className="w-8 h-7 rounded border border-white/10 bg-transparent"
                onChange={e => onColorChange && onColorChange(e.target.value)}
              />
              <button className={`ml-auto text-[11px] px-2 py-1 rounded-lg ${active ? 'bg-blue-600 text-white' : 'bg-white/5 text-[#9898ac]'}`} onClick={onToggle}>
                {active ? '显示中' : '已隐藏'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
