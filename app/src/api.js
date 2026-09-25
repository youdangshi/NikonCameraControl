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
import { openSession, openUsbSession, PtpIpSession, UsbPtp, isNativeMobile } from './ptpip.js';
import { createDemoCamera } from './demoCamera.js';
import { encodePropValue, decodePropValue, ptpPropertyLabel } from './nikonProperties.js';
import {
  CAMERA_BRANDS,
  brandSummary,
  detectCameraBrand,
  getBrandCapabilities,
} from './cameraBrands.js';
import { parseDevicePropDesc } from './ptpPropertyDesc.js';

const API = ''; // 相对路径，同源
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
const CameraUi = registerPlugin('CameraUi');

let ws = null;
let listeners = {};
let reconnectTimer = null;
let mobileSession = null; // 原生直连会话（仅手机 App）
let mobileSessionMode = null;
let mobileSessionProfile = null;
let mobileSessionBrand = null;
let mobileSessionModel = null;
let demoCam = null;       // 演示相机（无真机也能跑通）
let lastConnectRequest = null;
let autoReconnectTimer = null;
let autoReconnectAttempts = 0;
let manualDisconnect = false;

const MAX_DIAGNOSTIC_EVENTS = 200;
let diagnosticEvents = [];

// ─── PTP 操作码 ───────────────────────────────────────
const OC = {
  GetDeviceInfo: 0x1001,
  OpenSession: 0x1002,
  CloseSession: 0x1003,
  GetStorageIDs: 0x1004,
  GetObjectHandles: 0x1007,
  GetObjectInfo: 0x1008,
  GetObject: 0x1009,
  GetThumbnail: 0x100A,
  GetDevicePropDesc: 0x1014,
  InitiateCapture: 0x100E,
  GetDevicePropValue: 0x1015,
  SetDevicePropValue: 0x1016,
  NikonStartLiveView: 0x9201,
  NikonEndLiveView: 0x9202,
  NikonGetLiveViewImg: 0x9203,
  NikonDeviceReady: 0x90C8,
  NikonChangeApplicationMode: 0x9435,
  NikonAfDrive: 0x90C1,
  NikonInitiateCaptureRecInMedia: 0x9207,
};

const MAX_PROPERTY_DIAGNOSTICS = 50;
let propertyDiagnostics = [];

function nowMs() {
  try { return performance.now(); } catch { return Date.now(); }
}

function ptpHex(value) {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return `0x${Number(value).toString(16).padStart(4, '0').toUpperCase()}`;
}

function diagnosticTransport() {
  if (mobileSessionMode === 'usb') return 'USB';
  if (mobileSessionMode) return 'PTP/IP';
  return isNativeMobile() ? '原生直连' : '本机服务';
}

function recordDiagnostic(message, level = 'info', detail = null) {
  const record = {
    timestamp: Date.now(),
    level,
    message: String(message || ''),
    transport: diagnosticTransport(),
    brand: mobileSessionBrand || 'unknown',
    mode: mobileSessionMode || null,
    detail: detail || null,
  };
  diagnosticEvents = [record, ...diagnosticEvents].slice(0, MAX_DIAGNOSTIC_EVENTS);
  emit('diagnostic', record);
}

function clearAutoReconnect() {
  if (autoReconnectTimer) {
    clearTimeout(autoReconnectTimer);
    autoReconnectTimer = null;
  }
}

function scheduleAutoReconnect(reason = '连接已断开') {
  if (manualDisconnect || !lastConnectRequest || autoReconnectTimer) return;
  if (lastConnectRequest.mode === 'usb') {
    recordDiagnostic('USB 会话已断开。Android 无法安全模拟重新插拔，请拔下数据线后重新连接。', 'warn');
    return;
  }
  if (autoReconnectAttempts >= 2) {
    recordDiagnostic(`${reason}，自动恢复已达到重试上限。`, 'error');
    emit('status', { state: 'error', error: `${reason}，请检查相机无线设置后重试。` });
    return;
  }

  autoReconnectAttempts += 1;
  const delayMs = autoReconnectAttempts === 1 ? 1200 : 3200;
  recordDiagnostic(`${reason}，${Math.round(delayMs / 1000)} 秒后自动恢复（${autoReconnectAttempts}/2）…`, 'warn');
  emit('status', {
    state: 'reconnecting',
    mode: lastConnectRequest.mode,
    profile: lastConnectRequest.options?.profile || null,
  });
  autoReconnectTimer = setTimeout(async () => {
    autoReconnectTimer = null;
    if (manualDisconnect || !lastConnectRequest) return;
    const request = lastConnectRequest;
    const result = await camera.connectCamera(
      request.mode,
      request.host,
      request.port,
      request.options,
    ).catch(error => ({ success: false, error: error?.message || String(error) }));
    if (result?.success) {
      autoReconnectAttempts = 0;
      recordDiagnostic('相机连接已自动恢复。', 'success');
    } else {
      scheduleAutoReconnect(result?.error || reason);
    }
  }, delayMs);
}

function explicitBrand(brandId) {
  if (!brandId || brandId === 'auto') return null;
  return CAMERA_BRANDS[brandId] || null;
}

function readDeviceInfoVendorExtensionId(payload) {
  if (!payload || payload.length < 6) return null;
  return readU32LE(payload, 2);
}

function resolveCameraBrand(requestedBrand, model, vendorExtensionId = null) {
  return explicitBrand(requestedBrand)
    || detectCameraBrand({ model, vendorExtensionId });
}

function cameraInfo(brand, model) {
  return {
    ...brandSummary(brand),
    model,
  };
}

function assertCameraCapability(capability, actionLabel) {
  const { brand, capabilities } = getBrandCapabilities(mobileSessionBrand);
  if (capabilities[capability]) return brand;
  const error = new Error(`${brand.label} 当前未实现${actionLabel}，已阻止发送不兼容的私有命令。`);
  error.code = 'CAMERA_BRAND_CAPABILITY_UNSUPPORTED';
  error.brand = brand.id;
  error.capability = capability;
  throw error;
}

function emitPropertyDiagnostic(entry) {
  const record = {
    timestamp: Date.now(),
    property: ptpPropertyLabel(entry.propCode),
    propHex: ptpHex(entry.propCode),
    opHex: ptpHex(entry.opCode),
    responseHex: ptpHex(entry.responseCode),
    transport: diagnosticTransport(),
    brand: mobileSessionBrand || 'unknown',
    ...entry,
  };
  propertyDiagnostics = [record, ...propertyDiagnostics].slice(0, MAX_PROPERTY_DIAGNOSTICS);
  emit('property:diagnostic', record);
}

function readU32LE(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function parseU32List(payload) {
  const out = [];
  for (let offset = 0; offset + 4 <= payload.length; offset += 4) out.push(readU32LE(payload, offset));
  return out;
}

function readU16LE(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8)) >>> 0;
}

function readPtpString(bytes, offset) {
  if (offset >= bytes.length) return '';
  const chars = bytes[offset];
  if (!chars) return '';
  const start = offset + 1;
  let text = '';
  for (let i = 0; i < Math.max(0, chars - 1); i++) {
    const at = start + i * 2;
    if (at + 1 >= bytes.length) break;
    const code = readU16LE(bytes, at);
    if (code) text += String.fromCharCode(code);
  }
  return text;
}

function parseObjectInfo(payload) {
  if (!payload || payload.length < 52) return null;
  const nameOffset = 52;
  return {
    storageId: readU32LE(payload, 0),
    formatCode: readU16LE(payload, 4),
    protectionStatus: readU16LE(payload, 6),
    compressedSize: readU32LE(payload, 8),
    thumbFormat: readU16LE(payload, 12),
    thumbSize: readU32LE(payload, 14),
    thumbWidth: readU32LE(payload, 18),
    thumbHeight: readU32LE(payload, 22),
    width: readU32LE(payload, 26),
    height: readU32LE(payload, 30),
    parentObject: readU32LE(payload, 38),
    associationType: readU16LE(payload, 42),
    sequenceNumber: readU32LE(payload, 48),
    fileName: readPtpString(payload, nameOffset) || '',
  };
}

function hexPreview(bytes, max = 96) {
  if (!bytes || !bytes.length) return '';
  return Array.from(bytes.subarray(0, Math.min(bytes.length, max)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function isDirectoryObject(info) {
  return info?.formatCode === 0x3001
    || info?.associationType === 0x0001
    || info?.associationType === 0x0002;
}

function isImageObject(info) {
  if (!info || isDirectoryObject(info)) return false;
  const name = String(info.fileName || '').toUpperCase();
  if (/\.(JPE?G|NEF|NRW|TIF?F|PNG|HEIC|HEIF)$/.test(name)) return true;
  // Nikon returns NEF formats in the vendor range. Treat non-directory
  // objects with valid dimensions or a non-zero payload as images too.
  return info.width > 0 || info.height > 0 || info.compressedSize > 0;
}

function extractExifThumbnail(bytes) {
  if (!bytes || bytes.length < 128 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xFF) break;
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xD9 || marker === 0xDA) break;
    if (offset + 2 > bytes.length) break;
    const size = (bytes[offset] << 8) | bytes[offset + 1];
    if (size < 2 || offset + size > bytes.length) break;
    if (marker === 0xE1 && size >= 8
      && bytes[offset + 2] === 0x45 && bytes[offset + 3] === 0x78
      && bytes[offset + 4] === 0x69 && bytes[offset + 5] === 0x66) {
      const tiff = offset + 8;
      if (tiff + 8 > bytes.length) return null;
      const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
      const u16 = (at) => little
        ? ((bytes[at] | (bytes[at + 1] << 8)) >>> 0)
        : (((bytes[at] << 8) | bytes[at + 1]) >>> 0);
      const u32 = (at) => little
        ? ((bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0)
        : (((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0);
      if (u16(tiff + 2) !== 0x002A) return null;
      const ifd0 = tiff + u32(tiff + 4);
      if (ifd0 + 2 > bytes.length) return null;
      const count0 = u16(ifd0);
      const ifd1 = ifd0 + 2 + count0 * 12;
      if (ifd1 + 4 > bytes.length) return null;
      const count1 = u16(ifd1);
      let thumbOffset = 0;
      let thumbLength = 0;
      for (let i = 0; i < count1; i++) {
        const entry = ifd1 + 2 + i * 12;
        if (entry + 12 > bytes.length) break;
        const tag = u16(entry);
        if (tag === 0x0201) thumbOffset = tiff + u32(entry + 8);
        if (tag === 0x0202) thumbLength = u32(entry + 8);
      }
      if (thumbOffset && thumbLength && thumbOffset + thumbLength <= bytes.length) {
        return extractJpeg(bytes.subarray(thumbOffset, thumbOffset + thumbLength));
      }
    }
    offset += size;
  }
  return null;
}

async function readObjectInfo(session, handle) {
  const resp = await session.command(OC.GetObjectInfo, [handle], 6000);
  if (resp.responseCode !== 0x2001) {
    return { info: null, code: resp.responseCode, payload: resp.payload };
  }
  return { info: parseObjectInfo(resp.payload), code: resp.responseCode, payload: resp.payload };
}

async function readObjectHandles(session, storageId, association) {
  const attempts = association === 0xFFFFFFFF ? [0xFFFFFFFF, 0] : [association];
  let lastCode = 0;
  for (const value of attempts) {
    const resp = await session.command(OC.GetObjectHandles, [storageId, 0, value], 12000);
    lastCode = resp.responseCode;
    if (resp.responseCode === 0x2001) {
      return { handles: parseU32List(resp.payload), code: resp.responseCode, payload: resp.payload };
    }
  }
  return { handles: [], code: lastCode, payload: new Uint8Array(0) };
}

/**
 * Nikon stores return the root folder first. Walk the PTP association tree
 * instead of showing the DCIM folder as if it were a photo.
 */
async function enumerateImageObjects(session, storageId) {
  const images = [];
  const visitedAssociations = new Set();
  const visitedHandles = new Set();

  const walk = async (association, depth) => {
    if (depth > 4 || visitedAssociations.has(association)) return;
    visitedAssociations.add(association);
    const result = await readObjectHandles(session, storageId, association);
    if (result.code !== 0x2001) {
      console.log('[相机照片] 读取对象列表失败', {
        storageId: `0x${storageId.toString(16)}`,
        association: `0x${association.toString(16)}`,
        code: `0x${result.code.toString(16)}`,
      });
      return;
    }

    console.log('[相机照片] 对象列表', {
      storageId: `0x${storageId.toString(16)}`,
      association: `0x${association.toString(16)}`,
      handles: result.handles.map(h => `0x${h.toString(16)}`),
    });

    for (const handle of result.handles) {
      if (!handle || handle === 0xFFFFFFFF || visitedHandles.has(handle)) continue;
      visitedHandles.add(handle);
      const object = await readObjectInfo(session, handle).catch(() => ({ info: null, code: -1, payload: null }));
      console.log('[相机照片] 对象信息', {
        handle: `0x${handle.toString(16)}`,
        code: `0x${Number(object.code).toString(16)}`,
        payload: hexPreview(object.payload, 96),
        info: object.info,
      });
      if (!object.info) continue;
      if (isDirectoryObject(object.info)) {
        await walk(handle, depth + 1);
      } else if (isImageObject(object.info)) {
        images.push({ handle, info: object.info });
      }
    }
  };

  await walk(0xFFFFFFFF, 0);
  images.sort((a, b) => {
    const as = a.info.sequenceNumber || 0;
    const bs = b.info.sequenceNumber || 0;
    if (as !== bs) return bs - as;
    return b.handle - a.handle;
  });
  return images;
}

function bytesToDataUrl(bytes, mime = 'image/jpeg') {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(binary)}`;
}

function extractJpeg(payload) {
  if (!payload || payload.length < 4) return null;
  for (let start = 0; start + 2 < payload.length; start++) {
    if (payload[start] !== 0xFF || payload[start + 1] !== 0xD8) continue;
    for (let end = start + 2; end + 1 < payload.length; end++) {
      if (payload[end] === 0xFF && payload[end + 1] === 0xD9) return payload.subarray(start, end + 2);
    }
  }
  return null;
}

function formatConnectionError(error, { host, port, mode }) {
  const raw = error?.message || String(error);
  if (/EHOSTUNREACH|No route to host/i.test(raw)) {
    return mode === 'sta'
      ? `无法访问相机 ${host}:${port}。请确认手机和相机连接同一网络，并检查相机 IP 是否正确。`
      : '手机当前无法访问相机热点。请确认已连接相机 WiFi，并检查相机是否仍处于遥控模式。';
  }
  if (/ECONNREFUSED|Connection refused/i.test(raw)) {
    return `相机拒绝连接 ${host}:${port}。请确认相机已进入无线遥控模式，PTP/IP 端口为 ${port}。`;
  }
  if (/timeout|timed out|超时/i.test(raw)) {
    return `连接相机 ${host}:${port} 超时。请检查网络、相机 IP 和相机屏幕上的连接状态。`;
  }
  return raw;
}

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
  /** 原生取景页全屏控制（隐藏 Android 状态栏和导航栏） */
  async setFullscreen(enabled) {
    if (!isNativeMobile()) return { enabled: false, web: true };
    try {
      return await CameraUi.setFullscreen({ enabled: Boolean(enabled) });
    } catch (e) {
      return { enabled: false, error: e.message || String(e) };
    }
  },

  /** Android 原生活动方向。实时取景锁定横屏，退出时恢复竖屏。 */
  async setLandscape(enabled) {
    const next = Boolean(enabled);
    if (!isNativeMobile()) {
      try {
        if (next && screen.orientation?.lock) await screen.orientation.lock('landscape');
        else if (!next && screen.orientation?.unlock) screen.orientation.unlock();
      } catch {}
      return { enabled: next, web: true };
    }
    try {
      return await CameraUi.setLandscape({ enabled: next });
    } catch (e) {
      return { enabled: next, error: e.message || String(e) };
    }
  },

  /** 监视器模式：保持屏幕常亮 */
  async setKeepAwake(enabled) {
    const next = Boolean(enabled);
    if (!isNativeMobile()) return { enabled: next, web: true };
    try {
      return await CameraUi.setKeepAwake({ enabled: next });
    } catch (e) {
      return { enabled: next, error: e.message || String(e) };
    }
  },

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
  async connectCamera(mode, host, port, options = {}) {
    mode = mode || 'wifi';
    port = port || 15740;
    clearAutoReconnect();
    manualDisconnect = false;
    lastConnectRequest = { mode, host, port, options: { ...options }, timestamp: Date.now() };
    recordDiagnostic(`开始连接：${mode}${host ? ` · ${host}:${port}` : ''}`);
    const profile = mode === 'sta' ? (options.profile === 'device' ? 'device' : 'pc') : null;
    const brand = options.brand || 'auto';

    if (mode === 'demo') return this.connectDemo();

    if (isNativeMobile()) {
      if (mode === 'usb') {
        return this.connectUsbDirect(brand);
      }
      if (mode === 'sta') {
        const staHost = String(host || '').trim();
        if (!staHost) {
          const error = '请先填写相机在局域网中的 IP 地址。';
          emit('status', { state: 'error', mode, error });
          emit('error', { error, direct: true });
          return { success: false, error };
        }
        return this.connectWifiDirect(staHost, port, mode, profile, brand);
      }
      host = host || '192.168.1.1';
      return this.connectWifiDirect(host, port, mode, null, brand);
    }

    if (mode === 'usb') return this.connectUsb();
    return fetchJSON('POST', '/api/connect/wifi', { host, port });
  },

  /** 手机 App：在设备上用原生 TCP 直连相机 PTP/IP */
  async connectWifiDirect(host, port, mode = 'wifi', profile = null, requestedBrand = 'auto') {
    host = String(host || '192.168.1.1').trim();
    port = Number.parseInt(port, 10) || 15740;
    emit('status', { state: 'connecting', mode, profile, host, port, direct: true });
    const diag = (msg, level = 'info') => recordDiagnostic(msg, level);
    let session = null;
    try {
      const selectedBrand = explicitBrand(requestedBrand);
      const clientName = !selectedBrand || selectedBrand.id === 'nikon'
        ? (profile === 'pc' ? 'Nikon PC' : 'Nikon')
        : 'Nini PTP';
      session = await openSession(host, port, diag, null, message => {
        if (mobileSession !== session) return;
        mobileSession = null;
        mobileSessionMode = null;
        mobileSessionProfile = null;
        mobileSessionBrand = null;
        mobileSessionModel = null;
        emit('status', { state: 'error', mode, profile, host, port, error: message, direct: true });
        emit('error', { error: message, direct: true });
        scheduleAutoReconnect(message || '相机连接已断开');
      }, { clientName });
      mobileSession = session;
      mobileSessionMode = mode;
      mobileSessionProfile = profile;
      // 尝试读取设备信息以识别品牌（失败也不阻塞连接）。
      let model = selectedBrand ? `${selectedBrand.label} PTP/IP` : 'Nikon PTP/IP';
      let vendorExtensionId = null;
      try {
        const dev = await session.command(OC.GetDeviceInfo, [], 5000);
        vendorExtensionId = readDeviceInfoVendorExtensionId(dev?.payload);
      } catch {}
      const brand = resolveCameraBrand(requestedBrand, model, vendorExtensionId);
      mobileSessionBrand = brand.id;
      mobileSessionModel = model;
      if (brand.id === 'nikon' && typeof session.prepareForControl === 'function') {
        await session.prepareForControl({
          applicationMode: !(mode === 'sta' && profile === 'device'),
        }).catch(() => {});
      }
      emit('status', {
        state: 'session_open',
        mode,
        profile,
        host,
        port,
        brand: brand.id,
        brandLabel: brand.label,
        direct: true,
      });
      emit('camera_info', {
        ...cameraInfo(brand, model),
        model,
        connection: mode === 'sta'
          ? (profile === 'device' ? 'STA · 智能设备传输' : 'STA · PC 控制')
          : 'WiFi',
        ip: host,
      });
      autoReconnectAttempts = 0;
      recordDiagnostic(`连接成功：${mode}${host ? ` · ${host}:${port}` : ''}`, 'success');
      return { success: true, model, brand: brand.id, brandLabel: brand.label };
    } catch (e) {
      const rawError = e?.message || String(e);
      const message = formatConnectionError(e, { host, port, mode });
      diag(`连接失败：${rawError}`);
      emit('status', { state: 'error', mode, profile, host, port, error: message, rawError });
      emit('error', { error: message, rawError, direct: true });
      return { success: false, error: message, rawError };
    }
  },

  /** USB 连接（桌面） */
  async connectUsb() { return fetchJSON('POST', '/api/connect/usb'); },

  /** 手机 App：Type-C / OTG 原生 USB 直连 */
  async connectUsbDirect(requestedBrand = 'auto') {
    emit('status', { state: 'connecting', mode: 'usb', direct: true });
    const diag = (msg, level = 'info') => recordDiagnostic(msg, level);
    try {
      const session = await openUsbSession(diag);
      const brand = explicitBrand(requestedBrand) || CAMERA_BRANDS.nikon;
      if (brand.id === 'nikon' && typeof session.prepareForControl === 'function') {
        await session.prepareForControl({ applicationMode: true }).catch(() => {});
      }
      mobileSession = session;
      mobileSessionMode = 'usb';
      mobileSessionProfile = null;
      mobileSessionBrand = brand.id;
      mobileSessionModel = `${brand.label} (USB)`;
      emit('status', { state: 'session_open', mode: 'usb', brand: brand.id, brandLabel: brand.label, direct: true });
      emit('camera_info', {
        ...cameraInfo(brand, mobileSessionModel),
        model: mobileSessionModel,
        connection: 'USB',
        ip: 'USB',
      });
      autoReconnectAttempts = 0;
      recordDiagnostic('USB 相机连接成功。', 'success');
      return { success: true, model: mobileSessionModel, brand: brand.id, brandLabel: brand.label };
    } catch (e) {
      emit('status', { state: 'error', mode: 'usb', error: e.message || String(e) });
      emit('error', { error: e.message || String(e), direct: true });
      return { success: false, error: e.message || String(e) };
    }
  },

  /** 断开 */
  async disconnect() {
    manualDisconnect = true;
    clearAutoReconnect();
    autoReconnectAttempts = 0;
    recordDiagnostic('用户主动断开相机连接。');
    if (demoCam) { try { await demoCam.disconnect(); } catch {} demoCam = null; }
    if (mobileSession) {
      try { await mobileSession.close(); } catch {}
      mobileSession = null;
      mobileSessionMode = null;
      mobileSessionProfile = null;
      mobileSessionBrand = null;
      mobileSessionModel = null;
    }
    emit('status', { state: 'disconnected' });
    if (isNativeMobile()) return { success: true, direct: true };
    return fetchJSON('POST', '/api/disconnect');
  },

  /** 状态 */
  async getStatus() {
    if (demoCam) return { connected: true, mode: 'demo', direct: true };
    if (mobileSession) {
      return {
        connected: true,
        mode: mobileSessionMode || 'wifi',
        profile: mobileSessionProfile,
        brand: mobileSessionBrand,
        model: mobileSessionModel,
        direct: true,
      };
    }
    return fetchJSON('GET', '/api/status');
  },

  /** 扫描（桌面/后端；原生下不扫描） */
  async scan() { return fetchJSON('GET', '/api/scan'); },

  /** 遥控拍摄 */
  async capture() {
    if (demoCam) return demoCam.capture();
    if (mobileSession) {
      assertCameraCapability('capture', '遥控拍照');
      if (mobileSessionMode === 'sta' && mobileSessionProfile === 'device') {
        const error = new Error('当前是 STA 智能设备传输模式，不能遥控拍照。请在相机端选择“连接到电脑”，并在 App 中选择“PC 控制”。');
        error.code = 'STA_CAPTURE_UNSUPPORTED';
        throw error;
      }
      const attempts = [
        [0xFFFFFFFF, 0],
        [0xFFFFFFFF, 0xFFFFFFFF],
        [],
      ];
      let lastCode = 0;
      for (const params of attempts) {
        const resp = await mobileSession.command(OC.NikonInitiateCaptureRecInMedia, params, 12000);
        lastCode = resp.responseCode;
        if (resp.responseCode === 0x2001) {
          emit('captured', { success: true, time: Date.now() });
          return { success: true, code: resp.responseCode };
        }
        // 0x2019 is transient on some Z-series firmware while live view is
        // actively streaming. Give the camera a short window before retrying.
        if (resp.responseCode !== 0x2019) break;
        await new Promise(resolve => setTimeout(resolve, 260));
      }
      emit('captured', { success: false, time: Date.now(), code: lastCode });
      return { success: false, code: lastCode };
    }
    return fetchJSON('POST', '/api/capture');
  },

  /** 读取属性 */
  async getProp(propCode) {
    if (demoCam) return demoCam.getProp(propCode);
    if (mobileSession) {
      const startedAt = nowMs();
      try {
        const resp = await mobileSession.command(OC.GetDevicePropValue, [propCode]);
        const value = resp.responseCode === 0x2001
          ? decodePropValue(resp.payload, propCode)
          : null;
        emitPropertyDiagnostic({
          operation: 'read',
          opCode: OC.GetDevicePropValue,
          propCode,
          responseCode: resp.responseCode,
          elapsedMs: Math.round(nowMs() - startedAt),
          rawHex: hexPreview(resp.payload, 24),
          value,
          ok: resp.responseCode === 0x2001,
        });
        return { value, code: resp.responseCode, raw: resp.payload };
      } catch (e) {
        emitPropertyDiagnostic({
          operation: 'read',
          opCode: OC.GetDevicePropValue,
          propCode,
          responseCode: null,
          elapsedMs: Math.round(nowMs() - startedAt),
          error: e.message || String(e),
          ok: false,
        });
        throw e;
      }
    }
    return fetchJSON('POST', '/api/prop/get', { propCode });
  },

  /** 读取相机声明的属性能力、当前值和可调范围 */
  async getPropDesc(propCode) {
    if (!mobileSession) return fetchJSON('POST', '/api/prop/desc', { propCode });
    const startedAt = nowMs();
    try {
      const resp = await mobileSession.command(OC.GetDevicePropDesc, [propCode], 8000);
      let descriptor = null;
      if (resp.responseCode === 0x2001) descriptor = parseDevicePropDesc(resp.payload);
      emitPropertyDiagnostic({
        operation: 'descriptor',
        opCode: OC.GetDevicePropDesc,
        propCode,
        responseCode: resp.responseCode,
        elapsedMs: Math.round(nowMs() - startedAt),
        rawHex: hexPreview(resp.payload, 32),
        value: descriptor,
        ok: resp.responseCode === 0x2001,
      });
      return { ...descriptor, responseCode: resp.responseCode };
    } catch (e) {
      emitPropertyDiagnostic({
        operation: 'descriptor',
        opCode: OC.GetDevicePropDesc,
        propCode,
        responseCode: null,
        elapsedMs: Math.round(nowMs() - startedAt),
        error: e.message || String(e),
        ok: false,
      });
      return { responseCode: null, error: e.message || String(e) };
    }
  },

  /** 设置属性 */
  async setProp(propCode, value) {
    if (demoCam) return demoCam.setProp(propCode, value);
    if (mobileSession) {
      const data = encodePropValue(propCode, value);
      const startedAt = nowMs();
      try {
        const resp = await mobileSession.command(OC.SetDevicePropValue, [propCode], 8000, data);
        const success = resp.responseCode === 0x2001;
        let readbackCode = null;
        let readbackValue = null;
        let readbackRaw = null;
        let readbackError = '';
        let matches = false;

        if (success) {
          try {
            const readback = await mobileSession.command(OC.GetDevicePropValue, [propCode], 3000);
            readbackCode = readback.responseCode;
            readbackRaw = readback.payload;
            if (readback.responseCode === 0x2001) {
              readbackValue = decodePropValue(readback.payload, propCode);
              matches = Number(readbackValue) === Number(value);
            }
          } catch (e) {
            readbackError = e.message || String(e);
          }
        }

        emitPropertyDiagnostic({
          operation: 'write',
          opCode: OC.SetDevicePropValue,
          propCode,
          responseCode: resp.responseCode,
          elapsedMs: Math.round(nowMs() - startedAt),
          requestedValue: value,
          rawHex: hexPreview(data, 24),
          readbackCode,
          readbackValue,
          readbackRawHex: hexPreview(readbackRaw, 24),
          readbackError,
          matches,
          ok: success && readbackCode === 0x2001 && matches,
        });

        return {
          success,
          code: resp.responseCode,
          verified: success && readbackCode === 0x2001 && matches,
          readbackCode,
          readbackValue,
          readbackError,
        };
      } catch (e) {
        emitPropertyDiagnostic({
          operation: 'write',
          opCode: OC.SetDevicePropValue,
          propCode,
          responseCode: null,
          elapsedMs: Math.round(nowMs() - startedAt),
          requestedValue: value,
          rawHex: hexPreview(data, 24),
          error: e.message || String(e),
          ok: false,
        });
        throw e;
      }
    }
    return fetchJSON('POST', '/api/prop/set', { propCode, value });
  },

  /** 开始取景 */
  async startLiveView() {
    if (demoCam) return demoCam.startLiveView();
    if (mobileSession) {
      assertCameraCapability('liveView', '实时取景');
      if (mobileSessionMode === 'sta') {
        const error = new Error('Nikon Z30 在 STA 模式下启动实时取景会退出当前网络。实时取景请使用相机 WiFi 热点或 USB Type-C；STA 继续用于照片传输和控制。');
        error.code = 'STA_LIVEVIEW_UNSUPPORTED';
        throw error;
      }
      let resp = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        resp = await mobileSession.command(OC.NikonStartLiveView, [], 10000);
        if (resp.responseCode === 0x2001 || resp.responseCode === 0x201E) break;
        if (resp.responseCode !== 0x2019) break;
        await new Promise(resolve => setTimeout(resolve, 220));
      }
      const success = resp.responseCode === 0x2001 || resp.responseCode === 0x201E;
      emit('liveview', { running: success });
      if (!success) throw new Error(`启动实时取景失败：PTP 0x${Number(resp.responseCode).toString(16)}`);
      if (typeof mobileSession.waitForDeviceReady === 'function') {
        const readiness = await mobileSession.waitForDeviceReady(4500);
        if (!readiness?.ready) {
          recordDiagnostic(`Nikon DeviceReady 未确认${readiness?.code ? `（PTP 0x${Number(readiness.code).toString(16)}）` : ''}，继续尝试读取取景帧`, 'warn');
        }
      }
      return { success: true };
    }
    return fetchJSON('POST', '/api/liveview/start');
  },

  /** 停止取景 */
  async stopLiveView() {
    if (demoCam) return demoCam.stopLiveView();
    if (mobileSession) {
      if (getBrandCapabilities(mobileSessionBrand).capabilities.liveView) {
        try { await mobileSession.command(OC.NikonEndLiveView, [], 3000); } catch {}
      }
      emit('liveview', { running: false });
      return { success: true };
    }
    return fetchJSON('POST', '/api/liveview/stop');
  },

  /** 获取 Nikon 实时取景 JPEG 帧 */
  async getLiveViewFrame() {
    if (demoCam) return demoCam.getLiveViewFrame();
    if (mobileSession) {
      assertCameraCapability('liveView', '实时取景');
      let resp = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        resp = await mobileSession.command(OC.NikonGetLiveViewImg, [], 12000);
        if (resp.responseCode === 0x2001 || resp.responseCode !== 0x2019) break;
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      if (resp.responseCode !== 0x2001) return { frame: null, code: resp.responseCode, direct: true };
      const jpeg = extractJpeg(resp.payload);
      if (!jpeg) return { frame: null, direct: true };
      return { frame: bytesToDataUrl(jpeg, 'image/jpeg'), direct: true };
    }
    return fetchJSON('GET', '/api/liveview/frame');
  },

  /** 自动对焦 */
  async autoFocus() {
    if (demoCam) return demoCam.autofocus();
    if (mobileSession) {
      assertCameraCapability('autofocus', '自动对焦');
      if (mobileSessionMode === 'sta' && mobileSessionProfile === 'device') {
        const error = new Error('当前是 STA 智能设备传输模式，不能遥控对焦。请在相机端选择“连接到电脑”，并在 App 中选择“PC 控制”。');
        error.code = 'STA_AF_UNSUPPORTED';
        throw error;
      }
      const resp = await mobileSession.command(OC.NikonAfDrive, []);
      const ok = resp.responseCode === 0x2001;
      if (!ok) throw new Error(`自动对焦失败：PTP 0x${resp.responseCode.toString(16)}`);
      return { success: true };
    }
    return fetchJSON('POST', '/api/autofocus');
  },

  /** 获取图片列表 */
  async getImages() {
    if (demoCam) return demoCam.getImages();
    if (mobileSession) {
      const sResp = await mobileSession.command(OC.GetStorageIDs, [], 8000);
      if (sResp.responseCode !== 0x2001) {
        throw new Error(`读取相机存储卡失败：PTP 0x${sResp.responseCode.toString(16)}`);
      }
      const storageIds = parseU32List(sResp.payload).filter(id => id && id !== 0xFFFFFFFF);
      if (!storageIds.length) return [];
      console.log('[相机照片] 存储卡', storageIds.map(id => `0x${id.toString(16)}`));

      const objects = [];
      for (const storageId of storageIds) {
        try {
          objects.push(...await enumerateImageObjects(mobileSession, storageId));
        } catch (e) {
          console.log('[相机照片] 存储卡读取失败', {
            storageId: `0x${storageId.toString(16)}`,
            error: e.message || String(e),
          });
        }
      }
      return objects.map(({ handle, info }) => ({
        handle,
        fileName: info.fileName || `DSC_${handle}.JPG`,
        size: info.compressedSize || 0,
        width: info.width || 0,
        height: info.height || 0,
        formatCode: info.formatCode || 0,
        thumbSize: info.thumbSize || 0,
        sequenceNumber: info.sequenceNumber || 0,
      }));
    }
    return fetchJSON('GET', '/api/images');
  },

  /** 只读取缩略图；比拉取原图快，用于相机照片列表。 */
  async getThumbnail(handle) {
    if (demoCam) return demoCam.getImageData(handle);
    if (mobileSession) {
      let lastCode = 0;
      try {
        const resp = await mobileSession.command(OC.GetThumbnail, [handle], 20000);
        lastCode = resp.responseCode;
        if (resp.responseCode === 0x2001) {
          const jpeg = extractJpeg(resp.payload);
          if (jpeg) return { dataUrl: bytesToDataUrl(jpeg, 'image/jpeg'), size: jpeg.length };
        }
      } catch {}

      // Z30 may report NoThumbnailPresent through 0x100a. Read the JPEG
      // header + EXIF thumbnail instead of downloading the full RAW file.
      for (const params of [[handle, 0, 512 * 1024], [handle, 0, 1024 * 1024]]) {
        try {
          const partial = await mobileSession.command(OC.GetObject, params, 30000);
          lastCode = partial.responseCode;
          if (partial.responseCode !== 0x2001 || !partial.payload?.length) continue;
          const jpeg = extractJpeg(partial.payload) || extractExifThumbnail(partial.payload);
          if (jpeg) return { dataUrl: bytesToDataUrl(jpeg, 'image/jpeg'), size: jpeg.length };
        } catch {}
      }

      try {
        const full = await mobileSession.command(OC.GetObject, [handle], 90000);
        lastCode = full.responseCode;
        if (full.responseCode === 0x2001) {
          const jpeg = extractJpeg(full.payload) || extractExifThumbnail(full.payload);
          if (jpeg) return { dataUrl: bytesToDataUrl(jpeg, 'image/jpeg'), size: jpeg.length };
        }
      } catch {}
      throw new Error(`读取缩略图失败：PTP 0x${Number(lastCode).toString(16)}`);
    }
    return fetchJSON('GET', `/api/thumbnail?handle=${handle}`);
  },

  /** 获取某张图片的真实数据（用于相册缩略图 / 修图入口） */
  async getImageData(handle) {
    if (demoCam) return demoCam.getImageData(handle);
    if (mobileSession) {
      let payload = null;
      try {
        const thumb = await mobileSession.command(OC.GetThumbnail, [handle], 15000);
        if (thumb.responseCode === 0x2001 && thumb.payload && thumb.payload.length) payload = thumb.payload;
      } catch {}
      if (!payload) {
        const full = await mobileSession.command(OC.GetObject, [handle], 90000);
        if (full.responseCode !== 0x2001 || !full.payload || !full.payload.length) {
          throw new Error(`读取照片失败：PTP 0x${full.responseCode.toString(16)}`);
        }
        payload = full.payload;
      }
      const isJpeg = payload.length >= 2 && payload[0] === 0xFF && payload[1] === 0xD8;
      return { dataUrl: bytesToDataUrl(payload, isJpeg ? 'image/jpeg' : 'application/octet-stream'), size: payload.length };
    }
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
  onUsbDevices(fn) {
    if (!isNativeMobile()) return () => {};
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const r = await UsbPtp.listDevices();
        if (!stopped) fn(r);
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 1200);
    return () => { stopped = true; clearInterval(iv); };
  },

  /** 提交诊断日志回调（真机验证时展示握手细节） */
  onDiagnostic: (fn) => on('diagnostic', fn),

  /** 参数读写握手、耗时和写后读回诊断 */
  onPropertyDiagnostic: (fn) => on('property:diagnostic', fn),
  getPropertyDiagnostics: () => propertyDiagnostics.slice(),
  clearPropertyDiagnostics() {
    propertyDiagnostics = [];
    emit('property:diagnostic:clear');
  },
  getDiagnostics() {
    return {
      generatedAt: new Date().toISOString(),
      platform: isNativeMobile() ? 'android-native' : 'web',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      session: {
        mode: mobileSessionMode,
        profile: mobileSessionProfile,
        brand: mobileSessionBrand,
        model: mobileSessionModel,
        connected: Boolean(mobileSession),
      },
      lastConnectRequest,
      events: diagnosticEvents.slice(),
      propertyEvents: propertyDiagnostics.slice(),
    };
  },
  clearDiagnostics() {
    diagnosticEvents = [];
    propertyDiagnostics = [];
    emit('property:diagnostic:clear');
  },

  /** 事件监听 */
  on,
};

// 自动初始化
connectWS();
