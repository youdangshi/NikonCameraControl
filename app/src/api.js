/**
 * 相机控制 API 层
 *
 * 双模式：
 *   - 桌面 / 浏览器：通过 HTTP + WebSocket 与后端（server.cjs）通信。
 *   - 手机 App（原生）：通过 Capacitor 原生 TCP 插件在设备上直连相机 PTP/IP（192.168.1.1:15740）。
 *
 * capture / 参数读写 / 对焦等核心命令在原生下透明路由到 on-device 会话。
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { openSession, openUsbSession, PtpIpSession, isNativeMobile } from './ptpip.js';
import { createDemoCamera } from './demoCamera.js';

const API = ''; // 相对路径，同源
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;

let ws = null;
let listeners = {};
let reconnectTimer = null;
let mobileSession = null; // 原生直连会话（仅手机 App）
let demoCam = null;       // 演示相机（无真机也能跑通）
const UsbPtp = registerPlugin('UsbPtp');

// ─── PTP 操作码 ───────────────────────────────────────
const OC = {
  GetDeviceInfo: 0x1001,
  OpenSession: 0x1002,
  GetStorageIDs: 0x1004,
  GetObjectHandles: 0x1007,
  GetDevicePropValue: 0x1015,
  SetDevicePropValue: 0x1016,
  NikonStartLiveView: 0x9201,
  NikonEndLiveView: 0x9202,
  NikonGetLiveViewImg: 0x9203,
  NikonAfDrive: 0x9205,
  NikonInitiateCaptureRecInMedia: 0x9207,
};

// ─── WebSocket ────────────────────────────────────────
function connectWS() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  try {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => { if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; } emit('ws:connected'); };
    ws.onmessage = (event) => { try { const msg = JSON.parse(event.data); emit(msg.type, msg.data); } catch {} };
    ws.onclose = () => { if (!reconnectTimer) reconnectTimer = setInterval(connectWS, 3000); };
    ws.onerror = () => {};
  } catch {}
}

async function fetchJSON(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  return res.json();
}

// ─── 事件系统 ─────────────────────────────────────────
function on(event, fn) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(fn);
  return () => { listeners[event] = listeners[event].filter(f => f !== fn); };
}
function emit(event, data) {
  (listeners[event] || []).forEach(fn => { try { fn(data); } catch {} });
}

// ─── 公开 API ─────────────────────────────────────────

export const camera = {
  /** 是否跑在原生 App（手机）里 */
  isNative: () => isNativeMobile(),

  /** 是否处于演示模式 */
  isDemo: () => !!demoCam,

  /** 初始化（桌面/浏览器连接 WS） */
  init() { connectWS(); },

  /** 演示模式：无真机也能端到端跑通连接/取景/拍摄/传图/修图 */
  async connectDemo() {
    demoCam = createDemoCamera();
    ['status', 'camera_info', 'captured', 'liveview', 'error'].forEach(ev =>
      demoCam.on(ev, data => emit(ev, data))
    );
    const r = await demoCam.connect();
    emit('status', { state: 'session_open', mode: 'demo' });
    emit('camera_info', { model: r.model, connection: 'Demo', ip: '本地模拟' });
    return r;
  },

  /** WiFi 连接 —— 桌面/浏览器走后端；手机原生走设备直连 */
  async connectWifi(host, port) {
    return this.connectCamera('wifi', host, port);
  },

  /**
   * 通用连接入口
   * mode: 'wifi' = 相机热点直连；'sta' = 相机已加入局域网；'usb' = 有线
   */
  async connectCamera(mode, host, port) {
    mode = mode || 'wifi';
    host = host || '192.168.1.1';
    port = port || 15740;

    if (mode === 'demo') return this.connectDemo();

    if (isNativeMobile()) {
      if (mode === 'usb') {
        return this.connectUsbDirect();
      }
      return this.connectWifiDirect(host, port);
    }

    if (mode === 'usb') return this.connectUsb();
    return fetchJSON('POST', '/api/connect/wifi', { host, port });
  },

  /** 手机 App：在设备上用原生 TCP 直连相机 PTP/IP */
  async connectWifiDirect(host, port) {
    host = host || '192.168.1.1'; port = port || 15740;
    emit('status', { state: 'connecting', mode: 'wifi', host, port, direct: true });
    const diag = msg => emit('diagnostic', msg);
    try {
      const session = await openSession(host, port, diag);
      mobileSession = session;
      // 尝试读取设备信息以拿到真实型号（失败也不阻塞）
      let model = 'Nikon Z30';
      try {
        const dev = await session.command(OC.GetDeviceInfo, [], 0);
        if (dev && dev.length > 0) model = 'Nikon (PTP/IP)';
      } catch {}
      emit('status', { state: 'session_open', mode: 'wifi', host, port, direct: true });
      emit('camera_info', { model, connection: 'WiFi', ip: host });
      return { success: true, model };
    } catch (e) {
      emit('status', { state: 'error', mode: 'wifi', error: e.message || String(e) });
      emit('error', { error: e.message || String(e), direct: true });
      return { success: false, error: e.message || String(e) };
    }
  },

  /** USB 连接（桌面） */
  async connectUsb() { return fetchJSON('POST', '/api/connect/usb'); },

  /** 手机 App：Type-C / OTG 原生 USB 直连 */
  async connectUsbDirect() {
    emit('status', { state: 'connecting', mode: 'usb', direct: true });
    const diag = msg => emit('diagnostic', msg);
    try {
      const session = await openUsbSession(diag);
      mobileSession = session;
      emit('status', { state: 'session_open', mode: 'usb', direct: true });
      emit('camera_info', { model: 'Nikon Z30 (USB)', connection: 'USB', ip: 'USB' });
      return { success: true, model: 'Nikon Z30 (USB)' };
    } catch (e) {
      emit('status', { state: 'error', mode: 'usb', error: e.message || String(e) });
      emit('error', { error: e.message || String(e), direct: true });
      return { success: false, error: e.message || String(e) };
    }
  },

  /** 断开 */
  async disconnect() {
    if (demoCam) { try { await demoCam.disconnect(); } catch {} demoCam = null; }
    if (mobileSession) { try { await mobileSession.close(); } catch {} mobileSession = null; }
    emit('status', { state: 'disconnected' });
    return fetchJSON('POST', '/api/disconnect');
  },

  /** 状态 */
  async getStatus() {
    if (demoCam) return { connected: true, mode: 'demo', direct: true };
    if (mobileSession) return { connected: true, mode: 'wifi', direct: true };
    return fetchJSON('GET', '/api/status');
  },

  /** 扫描（桌面/后端；原生下不扫描） */
  async scan() { return fetchJSON('GET', '/api/scan'); },

  /** 遥控拍摄 */
  async capture() {
    if (demoCam) return demoCam.capture();
    if (mobileSession) {
      const resp = await mobileSession.command(OC.NikonInitiateCaptureRecInMedia, [0xFFFFFFFF, 0]);
      const ok = resp.responseCode === 0x2001;
      emit('captured', { success: ok, time: Date.now() });
      return { success: ok, code: resp.responseCode };
    }
    return fetchJSON('POST', '/api/capture');
  },

  /** 读取属性 */
  async getProp(propCode) {
    if (demoCam) return demoCam.getProp(propCode);
    if (mobileSession) {
      const resp = await mobileSession.command(OC.GetDevicePropValue, [propCode]);
      return { value: resp.params[0] || 0, code: resp.responseCode };
    }
    return fetchJSON('POST', '/api/prop/get', { propCode });
  },

  /** 设置属性 */
  async setProp(propCode, value) {
    if (demoCam) return demoCam.setProp(propCode, value);
    if (mobileSession) {
      const resp = await mobileSession.command(OC.SetDevicePropValue, [propCode, value]);
      return { success: resp.responseCode === 0x2001, code: resp.responseCode };
    }
    return fetchJSON('POST', '/api/prop/set', { propCode, value });
  },

  /** 开始取景 */
  async startLiveView() {
    if (demoCam) return demoCam.startLiveView();
    if (mobileSession) {
      await mobileSession.command(OC.NikonStartLiveView, []);
      emit('liveview', { running: true });
      return { success: true };
    }
    return fetchJSON('POST', '/api/liveview/start');
  },

  /** 停止取景 */
  async stopLiveView() {
    if (demoCam) return demoCam.stopLiveView();
    if (mobileSession) {
      try { await mobileSession.command(OC.NikonEndLiveView, []); } catch {}
      emit('liveview', { running: false });
      return { success: true };
    }
    return fetchJSON('POST', '/api/liveview/stop');
  },

  /** 获取取景帧（原生下的数据阶段传输暂未接入，返回空并提示） */
  async getLiveViewFrame() {
    if (demoCam) return demoCam.getLiveViewFrame();
    if (mobileSession) {
      // TODO: 处理 StartData/Data/EndData 数据包传输
      return { frame: null, direct: true };
    }
    return fetchJSON('GET', '/api/liveview/frame');
  },

  /** 自动对焦 */
  async autoFocus() {
    if (demoCam) return demoCam.autofocus();
    if (mobileSession) {
      await mobileSession.command(OC.NikonAfDrive, [0x0001]);
      return { success: true };
    }
    return fetchJSON('POST', '/api/autofocus');
  },

  /** 获取图片列表 */
  async getImages() {
    if (demoCam) return demoCam.getImages();
    if (mobileSession) {
      try {
        const sResp = await mobileSession.command(OC.GetStorageIDs);
        const sid = sResp.params[0];
        const hResp = await mobileSession.command(OC.GetObjectHandles, [sid, 0, 0xFFFFFFFF]);
        return (hResp.params || []).filter(p => p).map(h => ({ handle: h, fileName: `DSC_${h}.NEF`, size: 0 }));
      } catch { return []; }
    }
    return fetchJSON('GET', '/api/images');
  },

  /** 获取某张图片的真实数据（用于相册缩略图 / 修图入口） */
  async getImageData(handle) {
    if (demoCam) return demoCam.getImageData(handle);
    return fetchJSON('GET', `/api/image?handle=${handle}`);
  },

  /** 演示相机当前参数（取景界面上叠加显示） */
  demoSnapshot() { return demoCam ? demoCam.getSnapshot() : null; },

  /** 手机端 USB 设备检测（Android 原生） */
  async listUsbDevices() {
    if (!isNativeMobile()) return { devices: [], usbHostSupported: false, native: false };
    try {
      return await UsbPtp.listDevices();
    } catch (e) {
      return { devices: [], usbHostSupported: false, error: e.message || String(e) };
    }
  },

  /** 手机端 USB 设备插拔事件 */
  onUsbDevices(fn) { return UsbPtp.addListener('usb_devices', fn); },

  /** 提交诊断日志回调（真机验证时展示握手细节） */
  onDiagnostic: (fn) => on('diagnostic', fn),

  /** 事件监听 */
  on,
};

// 自动初始化
connectWS();
