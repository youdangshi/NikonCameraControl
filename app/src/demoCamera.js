/**
 * 演示相机模拟器
 *
 * 没有真机也能端到端跑通：连接 / 取景器实时画面 / 遥控拍摄 / 照片列表 / 参数读写。
 * 它生成「相机预览」与若干示例照片，仅供演示与开发联调。
 *
 * 真机验证以 PTP/IP 为准，本模块在 api.js 中按 demo 模式路由，不影响真实连接。
 */

import { generateSample } from './editor/imageEngine.js';

const SCOPE = {
  isoSegments: [100, 200, 400, 800, 1600, 3200, 6400],
  shutterSegments: ['1/60', '1/125', '1/250', '1/500', '1/1000'],
  apertureSegments: ['F2.8', 'F4', 'F5.6', 'F8', 'F11'],
};

export function createDemoCamera() {
  const state = {
    connected: false,
    iso: 400,
    shutter: '1/125',
    aperture: 'F5.6',
    ev: 0,
    wb: 'AUTO',
    focus: 'AF-S',
    liveView: false,
    frame: null,
    images: [],
    n: 1,
    interval: null,
    callbacks: {},
    frames: 0,
  };

  // 预生成示例照片
  const seed = () => [
    { name: 'DSC_0001.NEF', dataUrl: generateSample('portrait') },
    { name: 'DSC_0002.NEF', dataUrl: generateSample('landscape') },
    { name: 'DSC_0003.NEF', dataUrl: generateSample('night') },
    { name: 'DSC_0004.NEF', dataUrl: generateSample('bridge') },
    { name: 'DSC_0005.NEF', dataUrl: generateSample('portrait') },
  ].map((it, idx) => ({ ...it, handle: idx + 1, size: 3200000, thumb: it.dataUrl }));
  state.images = seed();

  const on = (ev, fn) => {
    if (!state.callbacks[ev]) state.callbacks[ev] = [];
    state.callbacks[ev].push(fn);
    return () => { state.callbacks[ev] = (state.callbacks[ev] || []).filter(f => f !== fn); };
  };
  const emit = (ev, data) => (state.callbacks[ev] || []).forEach(f => { try { f(data); } catch {} });

  // ── 取景器帧生成：一个会动的"相机预览" ──
  function renderViewFinder() {
    const w = 720, h = 480;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const t = state.frames * 0.04;
    // 天空
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    if (state.iso > 1600) {
      sky.addColorStop(0, '#182445'); sky.addColorStop(1, '#2d3f63');
    } else {
      sky.addColorStop(0, '#9ec9e8'); sky.addColorStop(1, '#cfe0ec');
    }
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

    // 移动的云 / 光
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(((t * 30) % (w + 200)) - 100, h * 0.2 + Math.sin(t) * 8, 100, 26, 0, 0, Math.PI * 2); ctx.fill();

    // 山/城市剪影
    ctx.fillStyle = 'rgba(40,60,80,0.6)';
    ctx.beginPath(); ctx.moveTo(0, h * 0.62);
    for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h * 0.62 - Math.sin(x * 0.02 + t) * 40 - (state.iso > 1600 ? 10 : 0));
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();

    // 对焦框
    ctx.strokeStyle = 'rgba(80,200,120,0.9)'; ctx.lineWidth = 2;
    const fx = w * 0.5 + Math.sin(t * 1.2) * 20, fy = h * 0.5 + Math.cos(t * 0.9) * 16;
    const fs = 44;
    ctx.strokeRect(fx - fs / 2, fy - fs / 2, fs, fs);
    ctx.beginPath(); ctx.moveTo(fx, fy - fs / 2); ctx.lineTo(fx, fy + fs / 2); ctx.moveTo(fx - fs / 2, fy); ctx.lineTo(fx + fs / 2, fy); ctx.stroke();

    // 网格
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
    [1 / 3, 2 / 3].forEach(k => { ctx.beginPath(); ctx.moveTo(w * k, 0); ctx.lineTo(w * k, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, h * k); ctx.lineTo(w, h * k); ctx.stroke(); });

    // 叠加参数
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, h - 48, w, 48);
    ctx.fillStyle = '#fff'; ctx.font = '14px monospace';
    ctx.fillText(`ISO ${state.iso}  ${state.shutter}  ${state.aperture}  EV${state.ev>=0?'+':''}${state.ev}  ${state.wb}`, 12, h - 20);
    ctx.fillStyle = 'rgba(120,220,120,0.9)';
    ctx.fillText(state.liveView ? '● LIVE 实时取景' : '○ STANDBY', w - 150, h - 20);
    ctx.restore && ctx.restore();
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  function applySettingsToFrame() { state.frame = renderViewFinder(); }
  applySettingsToFrame();

  function startLiveView(v) {
    state.liveView = true;
    state.frames = 0;
    emit('liveview', { running: true });
    state.interval = setInterval(() => { state.frames++; state.frame = renderViewFinder(); }, 66);
  }
  function stopLiveView(v) {
    state.liveView = false;
    if (state.interval) clearInterval(state.interval);
    state.interval = null;
    emit('liveview', { running: false });
  }

  return {
    state,
    on,

    async connect() {
      state.connected = true;
      emit('status', { state: 'session_open', mode: 'demo', host: '实验尼康相机', port: 0 });
      emit('camera_info', { model: '实验尼康 Z30 (模拟)', connection: '实验', ip: '本地模拟' });
      return { success: true, model: '实验尼康 Z30 (模拟)' };
    },

    async disconnect() {
      state.connected = false;
      stopLiveView();
      emit('status', { state: 'disconnected' });
      return { success: true };
    },

    async capture() {
      // 把当前取景画面作为一张新照片，追加到列表
      state.n += 1;
      const frame = state.frame || (state.images[0] && state.images[0].dataUrl);
      const item = { name: `DSC_${String(state.n).padStart(4, '0')}.NEF`, handle: state.n, size: 3400000, thumb: frame, dataUrl: frame };
      state.images.unshift(item);
      emit('captured', { success: true, time: Date.now(), item });
      return { success: true, code: 0x2001 };
    },

    async getImages() {
      return state.images.map(it => ({ handle: it.handle, fileName: it.name, size: it.size, thumb: it.dataUrl }));
    },

    async getImageData(handle) {
      const it = state.images.find(x => x.handle === handle) || state.images[0];
      return it ? it.dataUrl : null;
    },

    async getProp(propCode) {
      const map = { 0x500F: state.iso, 0x500D: state.shutter, 0x5007: state.aperture, 0x5010: state.ev, 0x5005: state.wb, 0x500E: 'M' };
      return { value: map[propCode] ?? 0 };
    },

    async setProp(propCode, value) {
      if (propCode === 0x500F && SCOPE.isoSegments.includes(value)) state.iso = value;
      else if (propCode === 0x500D) state.shutter = String(value);
      else if (propCode === 0x5007) state.aperture = String(value);
      else if (propCode === 0x5010) state.ev = Number(value);
      else if (propCode === 0x5005) state.wb = String(value);
      applySettingsToFrame();
      return { success: true, code: 0x2001 };
    },

    async autofocus() { return { success: true }; },

    async startLiveView() { startLiveView(); return { success: true }; },
    async stopLiveView() { stopLiveView(); return { success: true }; },
    async getLiveViewFrame() { return { frame: state.frame, direct: true }; },

    // 直接可读的取景数据（供取景界面展示参数）
    getSnapshot() { return { iso: state.iso, shutter: state.shutter, aperture: state.aperture, ev: state.ev, wb: state.wb }; },
  };
}
