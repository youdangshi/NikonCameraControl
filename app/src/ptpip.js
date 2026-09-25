/**
 * PTP/IP 协议核心（手机直连相机用）
 *
 * 手机浏览器没有 raw socket，唯一能直连相机 PTP/IP 端口（192.168.1.1:15740）
 * 的方式是通过 Capacitor 原生 TCP 插件。本模块负责：
 *   - 传输抽象：原生用 Capacitor TcpSocket 插件，网页走后端（不于此直连）
 *   - PTP/IP 包编解码与会话管理（Init → OpenSession → 命令/响应）
 *   - 逐包诊断日志，便于真机验证时定位握手细节
 *
 * 说明：PTP/IP 握手与 Nikon 厂商扩展并无官方文档，以下按 ISO 15740 / mmattes ptpip
 * 的常见做法实现，并保留完整诊断输出。真机验证后据实修正。
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

// ─── 判断是否在原生 App 里 ─────────────────────────────
export function isNativeMobile() {
  return Capacitor.isNativePlatform();
}

// ─── 字节 ↔ base64 ─────────────────────────────────────
export function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ─── 字节序工具 ───────────────────────────────────────
function writeU32BE(buf, off, v) {
  buf[off] = (v >> 24) & 0xff; buf[off + 1] = (v >> 16) & 0xff;
  buf[off + 2] = (v >> 8) & 0xff; buf[off + 3] = v & 0xff;
}
function readU32BE(buf, off) {
  return (buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3];
}
function writeU32LE(buf, off, v) {
  buf[off] = v & 0xff; buf[off + 1] = (v >> 8) & 0xff;
  buf[off + 2] = (v >> 16) & 0xff; buf[off + 3] = (v >> 24) & 0xff;
}
function readU32LE(buf, off) {
  return (buf[off] & 0xff) | ((buf[off + 1] & 0xff) << 8) | ((buf[off + 2] & 0xff) << 16) | ((buf[off + 3] & 0xff) << 24);
}
function writeU16LE(buf, off, v) {
  buf[off] = v & 0xff; buf[off + 1] = (v >> 8) & 0xff;
}
function readU16LE(buf, off) {
  return (buf[off] & 0xff) | ((buf[off + 1] & 0xff) << 8);
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Nikon StartLiveView is asynchronous. DeviceReady (0x90C8) is the official
 * handshake used to confirm that the live-view sensor has finished activating.
 */
async function waitNikonDeviceReady(session, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastCode = null;
  while (Date.now() < deadline) {
    try {
      const ready = await session.command(0x90C8, [], 1500);
      lastCode = ready.responseCode;
      if (ready.responseCode === 0x2001) return { ready: true, code: lastCode };
      if (ready.responseCode !== 0x2019) break;
    } catch {}
    await delay(180);
  }
  return { ready: false, code: lastCode };
}

// ─── 字节队列（读取定长数据） ──────────────────────────
class ByteBuffer {
  constructor() { this.chunks = []; this.available = 0; this.waiters = []; }
  push(chunk) {
    if (!chunk || chunk.length === 0) return;
    this.chunks.push(chunk);
    this.available += chunk.length;
    this._flush();
  }
  _flush() {
    while (this.waiters.length) {
      const w = this.waiters[0];
      if (this.available >= w.n) { this.waiters.shift(); w.resolve(); }
      else break;
    }
  }
  async ensure(n) {
    while (this.available < n) {
      await new Promise(resolve => this.waiters.push({ n, resolve }));
    }
  }
  consume(n) {
    const out = new Uint8Array(n);
    let off = 0;
    while (n > 0) {
      const head = this.chunks[0];
      const take = Math.min(head.length, n);
      out.set(head.subarray(0, take), off);
      off += take; n -= take;
      if (take === head.length) this.chunks.shift();
      else this.chunks[0] = head.subarray(take);
      this.available -= take;
    }
    return out;
  }
  async readExact(n) { await this.ensure(n); return this.consume(n); }
}

// ─── Capacitor 原生传输 ───────────────────────────────
const TcpSocket = registerPlugin('TcpSocket');
export const UsbPtp = registerPlugin('UsbPtp');

/**
 * Capacitor 的 addListener 返回 Promise<PluginListenerHandle>，不是取消订阅函数。
 * 统一包装成同步清理函数，并在 resolve 后调用 handle.remove()，避免把 Promise
 * 当函数执行导致 React 组件树崩溃。
 */
function listenerCleanup(listenerPromise) {
  let removed = false;
  const pending = Promise.resolve(listenerPromise).catch(() => null);
  return () => {
    if (removed) return;
    removed = true;
    pending.then((handle) => {
      try {
        if (handle && typeof handle.remove === 'function') handle.remove();
        else if (typeof handle === 'function') handle();
      } catch {}
    });
  };
}

function createNativeTransport() {
  const makeChannel = (name) => {
    let dataCb = null;
    return {
      async connect(host, port) { await TcpSocket.connect({ host, port, channel: name }); },
      async write(bytes) { await TcpSocket.write({ data: bytesToB64(bytes), channel: name }); },
      close() { try { TcpSocket.disconnect({ channel: name }); } catch {} },
      onData(cb) {
        dataCb = cb;
        return listenerCleanup(TcpSocket.addListener('data', (d) => {
          if ((d.channel || 'command') !== name) return;
          if (dataCb) dataCb(b64ToBytes(d.data));
        }));
      },
      onState(cb) {
        return listenerCleanup(TcpSocket.addListener('state', (d) => {
          if ((d.channel || 'command') === name) cb(d);
        }));
      },
    };
  };

  const command = makeChannel('command');
  const event = makeChannel('event');
  return {
    connect: (host, port) => command.connect(host, port),
    connectEvent: (host, port) => event.connect(host, port),
    write: (bytes) => command.write(bytes),
    writeEvent: (bytes) => event.write(bytes),
    close() { command.close(); event.close(); },
    onData: (cb) => command.onData(cb),
    onEventData: (cb) => event.onData(cb),
    onState: (cb) => command.onState(cb),
    onEventState: (cb) => event.onState(cb),
  };
}

/**
 * 创建传输。仅原生 App 支持直连；在浏览器中调用会抛错，
 * 前端应改用 PC 后端中转（走 HTTP/WS）。
 */
export function createTransport() {
  if (isNativeMobile()) return createNativeTransport();
  throw new Error('当前浏览器无法直连相机，请改用手机 App 或通过电脑后端中转');
}

/**
 * 原生 USB PTP 传输（手机 Type-C / OTG）
 */
function createUsbTransport() {
  return {
    async connect() {
      try {
        return await UsbPtp.connect();
      } catch (first) {
        // 相机侧可能残留上一次主机留下的 PTP 会话，释放接口重新占用后再试一次。
        try {
          await UsbPtp.resetUsb();
          return { connected: true, viaReset: true };
        } catch (second) {
          throw first;
        }
      }
    },
    async reset() { await UsbPtp.resetUsb(); },
    async drain(idleMs) {
      const r = await UsbPtp.drainInput({ idleMs: idleMs || 250 });
      return r && typeof r.drained === 'number' ? r.drained : 0;
    },
    async request(bytes, timeoutMs, dataOut, transactionId) {
      const result = await UsbPtp.request({
        data: bytesToB64(bytes),
        dataOut: dataOut && dataOut.length ? bytesToB64(dataOut) : undefined,
        timeoutMs: timeoutMs || 8000,
        transactionId: transactionId || 0,
      });
      return {
        bytes: b64ToBytes(result.data || ''),
        complete: !!result.complete,
      };
    },
    close() {
      UsbPtp.disconnect();
    },
    onData() { return () => {}; },
    onState(cb) { return () => {}; },
  };
}

// ─── PTP/IP 会话 ──────────────────────────────────────

function utf16leBytes(text) {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) writeU16LE(out, i * 2, text.charCodeAt(i));
  return out;
}

function ptpClientGuid() {
  const key = 'nini_ptp_client_guid';
  try {
    const saved = localStorage.getItem(key);
    if (saved) return b64ToBytes(saved);
  } catch {}
  const guid = new Uint8Array(16);
  try { crypto.getRandomValues(guid); } catch {
    for (let i = 0; i < guid.length; i++) guid[i] = Math.floor(Math.random() * 256);
  }
  try { localStorage.setItem(key, bytesToB64(guid)); } catch {}
  return guid;
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, b) => sum + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => { out.set(chunk, offset); offset += chunk.length; });
  return out;
}

function parseUsbContainers(bytes) {
  const containers = [];
  let offset = 0;
  while (offset + 12 <= bytes.length) {
    const length = readU32LE(bytes, offset);
    const type = readU16LE(bytes, offset + 4);
    // 相机 IN 端点里偶尔会残留填充/陈旧字节，逐字节重新对齐，别直接判失败。
    if (length < 12 || type < 1 || type > 4) {
      offset += 1;
      continue;
    }
    if (offset + length > bytes.length) break; // 尾部不完整，等下一批数据
    containers.push({
      length,
      type,
      code: readU16LE(bytes, offset + 6),
      transactionId: readU32LE(bytes, offset + 8),
      payload: bytes.subarray(offset + 12, offset + length),
    });
    offset += length;
  }
  return containers;
}

export class PtpIpSession {
  /** @param {{onDiagnose?: (msg: string)=>void, onError?: (msg: string)=>void, onLost?: (msg: string)=>void}} opts */
  constructor(transport, opts = {}) {
    this.transport = transport;
    this.buffer = new ByteBuffer();
    this.eventBuffer = new ByteBuffer();
    this.sessionId = 0;
    this.transactionId = 0;
    this.onDiagnose = opts.onDiagnose || (() => {});
    this.onLost = opts.onLost || (() => {});
    this.clientName = opts.clientName || 'Nini';
    this._unsubs = [];
    this._commandQueue = Promise.resolve();
    this.closed = false;
    this.opened = false;
    this.intentionalClose = false;
  }

  _diag(msg) { this.onDiagnose(msg); try { console.log('[PTP/IP]', msg); } catch {} }
  _hex(buf) { return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join(''); }

  diagPacket(label, pkt) {
    this._diag(`${label}: type=${pkt.type} len=${pkt.length} hex=${this._hex(pkt.payload)}`);
  }

  sendPacket(type, payload) {
    payload = payload || new Uint8Array(0);
    const out = new Uint8Array(8 + payload.length);
    writeU32LE(out, 0, out.length);
    writeU32LE(out, 4, type);
    out.set(payload, 8);
    return out;
  }

  async nextPacket(buffer = this.buffer) {
    const lenHdr = await buffer.readExact(4);
    const length = readU32LE(lenHdr, 0);
    if (length < 8 || length > 128 * 1024 * 1024) throw new Error('非法 PTP/IP 包长: ' + length);
    const rest = await buffer.readExact(length - 4);
    const type = readU32LE(rest, 0);
    const payload = rest.subarray(4);
    return { length, type, payload };
  }

  async awaitPacket(buffer, timeoutMs, label) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label || 'PTP/IP 数据包'}超时（${timeoutMs}ms）`)), timeoutMs);
    });
    try {
      return await Promise.race([this.nextPacket(buffer), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  buildCommand(opCode, tx, params = [], hasDataOut = false) {
    const values = params.map(v => (v || 0) >>> 0);
    const payload = new Uint8Array(10 + values.length * 4);
    writeU32LE(payload, 0, hasDataOut ? 2 : 1);
    writeU16LE(payload, 4, opCode);
    writeU32LE(payload, 6, tx);
    values.forEach((v, i) => writeU32LE(payload, 10 + i * 4, v));
    return payload;
  }

  buildDataOutPackets(tx, data) {
    const start = new Uint8Array(12);
    writeU32LE(start, 0, tx);
    writeU32LE(start, 4, data.length);
    const packets = [this.sendPacket(9, start)];

    if (data.length < 128) {
      const end = new Uint8Array(4 + data.length);
      writeU32LE(end, 0, tx);
      end.set(data, 4);
      packets.push(this.sendPacket(12, end));
    } else {
      const middle = new Uint8Array(4 + data.length);
      writeU32LE(middle, 0, tx);
      middle.set(data, 4);
      packets.push(this.sendPacket(10, middle));
      const end = new Uint8Array(4);
      writeU32LE(end, 0, tx);
      packets.push(this.sendPacket(12, end));
    }
    return packets;
  }

  buildInitCommand() {
    const guid = ptpClientGuid();
    const name = utf16leBytes(this.clientName);
    const payload = new Uint8Array(16 + name.length + 2 + 4);
    payload.set(guid, 0);
    payload.set(name, 16);
    writeU16LE(payload, 16 + name.length, 0); // UTF-16LE null terminator
    writeU16LE(payload, 16 + name.length + 2, 0); // protocol version minor
    writeU16LE(payload, 16 + name.length + 4, 1); // protocol version major
    return payload;
  }

  parseInitResponse(payload) {
    if (!payload || payload.length < 20) throw new Error('PTP/IP 初始化响应过短');
    const sessionId = readU32LE(payload, 0);
    let name = '';
    for (let offset = 20; offset + 1 < payload.length; offset += 2) {
      const code = readU16LE(payload, offset);
      if (code === 0) break;
      name += String.fromCharCode(code);
    }
    return { sessionId, name };
  }

  /**
   * 发送一条 PTP/IP 命令并等待响应；命令产生 Data 阶段时一并返回 payload。
   */
  command(opCode, params = [], timeoutMs = 8000, dataOut = null) {
    const run = () => this._command(opCode, params, timeoutMs, dataOut);
    const result = this._commandQueue.then(run, run);
    this._commandQueue = result.catch(() => {});
    return result;
  }

  async _command(opCode, params = [], timeoutMs = 8000, dataOut = null) {
    const tx = ++this.transactionId;
    this._diag(`发送命令 0x${opCode.toString(16).padStart(4, '0')} tx=${tx}`);
    await this.transport.write(this.sendPacket(6, this.buildCommand(opCode, tx, params, dataOut !== null)));
    if (dataOut !== null) {
      const packets = this.buildDataOutPackets(tx, dataOut || new Uint8Array(0));
      for (const packet of packets) await this.transport.write(packet);
    }

    const dataChunks = [];
    for (let i = 0; i < 64; i++) {
      const pkt = await this.awaitPacket(this.buffer, timeoutMs, `命令 0x${opCode.toString(16)} 响应`);
      if (pkt.type === 8) continue; // Event
      if (pkt.type === 9) continue; // StartData
      if (pkt.type === 10 || pkt.type === 12) {
        if (pkt.payload.length >= 4 && readU32LE(pkt.payload, 0) === tx) {
          dataChunks.push(pkt.payload.subarray(4));
        }
        continue;
      }
      if (pkt.type !== 7) throw new Error(`意外的 PTP/IP 包类型: ${pkt.type}`);
      if (pkt.payload.length < 6) throw new Error('PTP/IP 命令响应过短');
      const responseTx = readU32LE(pkt.payload, 2);
      if (responseTx !== tx) {
        this._diag(`忽略过期响应 tx=${responseTx}，期望 tx=${tx}`);
        continue;
      }
      const responseCode = readU16LE(pkt.payload, 0);
      const paramsOut = [];
      for (let off = 6; off + 4 <= pkt.payload.length; off += 4) paramsOut.push(readU32LE(pkt.payload, off));
      const result = {
        type: pkt.type,
        responseCode,
        transactionId: responseTx,
        params: paramsOut,
        payload: dataChunks.length ? concatBytes(dataChunks) : new Uint8Array(0),
      };
      this._diag(`命令响应 0x${responseCode.toString(16)} tx=${responseTx}`);
      return result;
    }
    throw new Error('PTP/IP 连续收到过多非响应包');
  }

  /**
   * 建立会话：命令通道 Init → 事件通道 Init → Ping → GetDeviceInfo → OpenSession。
   */
  async open(host, port) {
    this._unsubs.push(this.transport.onData(c => this.buffer.push(c)));
    this._unsubs.push(this.transport.onEventData(c => this.eventBuffer.push(c)));
    this._diag(`连接 ${host}:${port} ...`);
    await this.transport.connect(host, port);
    this._diag('命令通道已连接，发送 Init Command Request');

    await this.transport.write(this.sendPacket(1, this.buildInitCommand()));
    const init = await this.awaitPacket(this.buffer, 12000, 'PTP/IP Init Response');
    this.diagPacket('Init Response', init);
    if (init.type === 5) {
      const reason = init.payload.length >= 4 ? readU32LE(init.payload, 0) : 0;
      throw new Error(`相机拒绝 PTP/IP 握手（原因 0x${reason.toString(16)}）`);
    }
    if (init.type !== 2) throw new Error(`期待 Init Response(2)，收到 ${init.type}`);
    const parsed = this.parseInitResponse(init.payload);
    this.sessionId = parsed.sessionId;
    this._diag(`Init 成功，相机=${parsed.name || 'Nikon'} sessionId=${this.sessionId}`);

    this._diag('建立事件通道...');
    await this.transport.connectEvent(host, port);
    const eventInit = new Uint8Array(4);
    writeU32LE(eventInit, 0, this.sessionId);
    await this.transport.writeEvent(this.sendPacket(3, eventInit));
    const ack = await this.awaitPacket(this.eventBuffer, 6000, 'PTP/IP Init Event ACK');
    this.diagPacket('Init Event ACK', ack);
    if (ack.type !== 4) throw new Error(`期待 Init Event ACK(4)，收到 ${ack.type}`);

    // 部分机型需要 PING/PONG 才保持事件通道；失败不阻断会话。
    try {
      await this.transport.writeEvent(this.sendPacket(13));
      const pong = await this.awaitPacket(this.eventBuffer, 1500, 'PTP/IP Ping');
      if (pong.type !== 14) this._diag(`Ping 返回 ${pong.type}，继续连接`);
    } catch (e) {
      this._diag(`Ping 未响应：${e.message || e}`);
    }

    try {
      await this.command(0x1001, [], 5000); // GetDeviceInfo，帮助相机进入遥控状态
    } catch (e) {
      this._diag(`GetDeviceInfo 非致命失败：${e.message || e}`);
    }

    const resp = await this.command(0x1002, [1], 10000); // OpenSession
    if (resp.responseCode !== 0x2001 && resp.responseCode !== 0x201E) {
      throw new Error(`OpenSession 返回 0x${resp.responseCode.toString(16)}`);
    }
    this._diag(`OpenSession 成功，sessionId=${this.sessionId}`);
    return resp;
  }

  /**
   * Unlock Nikon vendor extensions and activate application-control mode.
   * This is non-fatal because some bodies and transfer-only workflows reject it.
   */
  async prepareForControl({ applicationMode = true } = {}) {
    let info = null;
    let appMode = null;
    try {
      info = await this.command(0x1001, [], 5000);
      this._diag(`Nikon GetDeviceInfo：0x${info.responseCode.toString(16)}，${info.payload.length} 字节`);
    } catch (e) {
      this._diag(`Nikon GetDeviceInfo 非致命失败：${e.message || e}`);
    }
    if (applicationMode) {
      try {
        appMode = await this.command(0x9435, [1], 3000);
        this._diag(`Nikon ChangeApplicationMode：0x${appMode.responseCode.toString(16)}`);
      } catch (e) {
        this._diag(`Nikon ChangeApplicationMode 非致命失败：${e.message || e}`);
      }
    }
    return { info, appMode };
  }

  async waitForDeviceReady(timeoutMs = 5000) {
    return waitNikonDeviceReady(this, timeoutMs);
  }

  async close() {
    if (this.closed) return;
    this.intentionalClose = true;
    if (this.sessionId) {
      try { await this.command(0x1003, [], 1500); } catch {}
    }
    this.closed = true;
    this._unsubs.forEach(u => { try { if (typeof u === 'function') u(); } catch {} });
    try { await this.transport.close(); } catch {}
  }
}

// ─── 常用命令便捷封装 ──────────────────────────────────
export async function openSession(host, port, onDiagnose, onError, onLost, options = {}) {
  const transport = createTransport();
  const session = new PtpIpSession(transport, {
    onDiagnose,
    onError,
    onLost,
    clientName: options.clientName,
  });
  try {
    await session.open(host, port);
    if (typeof transport.onState === 'function') {
      session._unsubs.push(transport.onState(event => {
        if (session.closed || session.intentionalClose) return;
        if (event?.state === 'disconnected' || event?.state === 'error') {
          session.closed = true;
          onLost?.('相机连接已断开，请重新连接。');
        }
      }));
    }
    return session;
  } catch (e) {
    if (onError) onError(e.message || String(e));
    await session.close().catch(() => {});
    throw e;
  }
}

// ─── PTP over USB（手机 Type-C / OTG）会话 ─────────────

export class PtpUsbSession {
  constructor(transport, opts = {}) {
    this.transport = transport;
    this.buffer = new ByteBuffer();
    this.transactionId = 0;
    this.onDiagnose = opts.onDiagnose || (() => {});
    this._unsubs = [];
    this._commandQueue = Promise.resolve();
    this.closed = false;
    this.opened = false;
  }

  _diag(msg) { this.onDiagnose(msg); try { console.log('[PTP-USB]', msg); } catch {} }

  buildUsbContainer(type, code, tx, payload = new Uint8Array(0)) {
    const buf = new Uint8Array(12 + payload.length);
    writeU32LE(buf, 0, buf.length);
    writeU16LE(buf, 4, type);
    writeU16LE(buf, 6, code);
    writeU32LE(buf, 8, tx);
    buf.set(payload, 12);
    return buf;
  }

  buildUsbCmd(opCode, params = []) {
    const values = params.map(v => (v || 0) >>> 0);
    const payload = new Uint8Array(values.length * 4);
    values.forEach((v, i) => writeU32LE(payload, i * 4, v));
    return this.buildUsbContainer(1, opCode, ++this.transactionId, payload);
  }

  async nextContainer() {
    const header = await this.buffer.readExact(12);
    const length = readU32LE(header, 0);
    if (length < 12 || length > 64 * 1024 * 1024) {
      throw new Error(`非法 USB PTP 容器长度: ${length}`);
    }
    const payload = length > 12
      ? await this.buffer.readExact(length - 12)
      : new Uint8Array(0);
    return {
      length,
      type: readU16LE(header, 4),
      code: readU16LE(header, 6),
      transactionId: readU32LE(header, 8),
      payload,
    };
  }

  async nextResponse(timeoutMs = 8000) {
    let data = null;
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`USB PTP 响应超时（${timeoutMs}ms）`)), timeoutMs);
    });
    try {
      for (let i = 0; i < 8; i++) {
        const c = await Promise.race([this.nextContainer(), timeout]);
        if (c.type === 4) continue; // 事件容器，跳过
        if (c.type === 2) { data = c.payload; continue; } // Data 容器，读取后继续等 Response
        if (c.type !== 3) throw new Error(`意外的 USB PTP 容器类型: ${c.type}`);
        const params = [];
        for (let off = 0; off + 4 <= c.payload.length; off += 4) params.push(readU32LE(c.payload, off));
        return {
          type: c.type,
          responseCode: c.code,
          transactionId: c.transactionId,
          params,
          payload: data || new Uint8Array(0),
        };
      }
      throw new Error('USB PTP 连续收到过多事件容器');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  command(opCode, params = [], timeoutMs = 8000, dataOut = null) {
    const run = () => this._command(opCode, params, timeoutMs, dataOut);
    const result = this._commandQueue.then(run, run);
    this._commandQueue = result.catch(() => {});
    return result;
  }

  async _command(opCode, params = [], timeoutMs = 8000, dataOut = null) {
    const cmd = this.buildUsbCmd(opCode, params);
    this._diag(`USB 命令 0x${opCode.toString(16).padStart(4, '0')} tx=${this.transactionId}`);

    if (typeof this.transport.request === 'function') {
      const dataContainer = dataOut && dataOut.length
        ? this.buildUsbContainer(2, opCode, this.transactionId, dataOut)
        : null;
      const exchange = await this.transport.request(cmd, timeoutMs, dataContainer, this.transactionId);
      const containers = parseUsbContainers(exchange.bytes || new Uint8Array(0));
      let data = null;
      let response = null;

      for (const container of containers) {
        if (container.type === 2) {
          data = data ? concatBytes([data, container.payload]) : container.payload;
        } else if (container.type === 3) {
          // 优先采用本次事务的响应，避免上一次超时后迟到的响应当成本次结果。
          if (!response || container.transactionId === this.transactionId) {
            response = container;
          }
        }
      }

      if (!response) {
        throw new Error(`USB PTP 响应超时或会话中断（${timeoutMs}ms）`);
      }

      const responseParams = [];
      for (let off = 0; off + 4 <= response.payload.length; off += 4) {
        responseParams.push(readU32LE(response.payload, off));
      }
      this._diag(`USB 响应 0x${response.code.toString(16)}`);
      return {
        type: response.type,
        responseCode: response.code,
        transactionId: response.transactionId,
        params: responseParams,
        payload: data || new Uint8Array(0),
      };
    }

    await this.transport.write(cmd);
    if (dataOut && dataOut.length) {
      await this.transport.write(this.buildUsbContainer(2, opCode, this.transactionId, dataOut));
    }
    const resp = await this.nextResponse(timeoutMs);
    this._diag(`USB 响应 0x${resp.responseCode.toString(16)}`);
    return resp;
  }

  async open() {
    this._unsubs.push(this.transport.onData(c => this.buffer.push(c)));
    this._diag('打开 USB 设备...');
    await this.transport.connect();

    // 相机 IN 端点里可能留着上一次主机没读完的响应，先清干净再握手。
    if (typeof this.transport.drain === 'function') {
      try {
        const drained = await this.transport.drain(250);
        if (drained > 0) this._diag(`清空相机侧残留数据 ${drained} 字节`);
      } catch (e) {
        this._diag(`清空残留数据失败：${e.message || e}`);
      }
    }

    const sendOpen = async (label, timeoutMs) => {
      try {
        const r = await this.command(0x1002, [1], timeoutMs);
        this._diag(`${label}：响应 0x${r.responseCode.toString(16).padStart(4, '0')}`);
        return r;
      } catch (e) {
        this._diag(`${label}：${e.message || e}`);
        return null;
      }
    };

    // 相机侧还留着上一次主机的会话时，标准做法是 CloseSession 后重新 OpenSession。
    const tryOpenWithCleanup = async (label, timeoutMs) => {
      let r = await sendOpen(label, timeoutMs);
      if (r && (r.responseCode === 0x2019 || r.responseCode === 0x201E)) {
        this._diag(`相机报告会话被占用（0x${r.responseCode.toString(16)}），先关闭旧会话`);
        try {
          const closed = await this.command(0x1003, [], 3000);
          this._diag(`CloseSession 响应 0x${closed.responseCode.toString(16).padStart(4, '0')}`);
        } catch (e) {
          this._diag(`CloseSession 无响应：${e.message || e}`);
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        r = await sendOpen(`${label}（关闭旧会话后）`, timeoutMs);
      }
      return r;
    };

    let resp = await tryOpenWithCleanup('OpenSession', 6000);

    if (!resp || resp.responseCode !== 0x2001) {
      // 相机 PTP 引擎可能被上一次失败的主机请求卡住，先复位再试。
      this._diag('会话仍未建立，尝试 PTP DeviceReset(0x1010) 复位相机 PTP 引擎');
      try {
        const rst = await this.command(0x1010, [], 2500);
        this._diag(`DeviceReset 响应 0x${rst.responseCode.toString(16).padStart(4, '0')}`);
      } catch (e) {
        this._diag(`DeviceReset 无响应：${e.message || e}`);
      }
      await new Promise(resolve => setTimeout(resolve, 400));
      resp = await tryOpenWithCleanup('DeviceReset 后 OpenSession', 8000);
    }

    if (!resp || resp.responseCode !== 0x2001) {
      // 软件层面能做到的“重新插拔”：释放接口重新占用，再开一次会话。
      if (typeof this.transport.reset === 'function') {
        this._diag('重新占用 USB 接口后再试一次');
        try {
          await this.transport.reset();
          if (typeof this.transport.drain === 'function') {
            const again = await this.transport.drain(250);
            if (again > 0) this._diag(`重新占用接口后又清掉 ${again} 字节残留`);
          }
          await new Promise(resolve => setTimeout(resolve, 300));
          resp = await tryOpenWithCleanup('重新占用接口后 OpenSession', 8000);
        } catch (e) {
          this._diag(`重新占用接口失败：${e.message || e}`);
        }
      }
    }

    if (!resp || resp.responseCode !== 0x2001) {
      // 探活：个别相机在没有会话时仍会回 GetDeviceInfo，用来区分
      // “相机完全不回数据”和“只是会话没打开”。
      try {
        const info = await this.command(0x1001, [], 2500);
        this._diag(`诊断 GetDeviceInfo 响应 0x${info.responseCode.toString(16)}，${info.payload.length} 字节`);
      } catch (e) {
        this._diag(`诊断 GetDeviceInfo 无响应：${e.message || e}`);
      }
      throw new Error('相机没有响应 PTP 会话请求。请拔掉数据线重新插入相机（或重启相机）后再连接。');
    }

    this.sessionId = 1;
    this.opened = true;
    this._diag('USB 会话已打开');
    return resp;
  }

  async prepareForControl({ applicationMode = true } = {}) {
    let info = null;
    let appMode = null;
    try {
      info = await this.command(0x1001, [], 5000);
      this._diag(`Nikon USB GetDeviceInfo：0x${info.responseCode.toString(16)}，${info.payload.length} 字节`);
    } catch (e) {
      this._diag(`Nikon USB GetDeviceInfo 非致命失败：${e.message || e}`);
    }
    if (applicationMode) {
      try {
        appMode = await this.command(0x9435, [1], 3000);
        this._diag(`Nikon USB ChangeApplicationMode：0x${appMode.responseCode.toString(16)}`);
      } catch (e) {
        this._diag(`Nikon USB ChangeApplicationMode 非致命失败：${e.message || e}`);
      }
    }
    return { info, appMode };
  }

  async waitForDeviceReady(timeoutMs = 5000) {
    return waitNikonDeviceReady(this, timeoutMs);
  }

  async close() {
    if (this.closed) return;
    if (this.opened) {
      try { await this.command(0x1003, [], 1500); } catch {}
      this.opened = false;
    }
    this.closed = true;
    this._unsubs.forEach(u => { try { if (typeof u === 'function') u(); } catch {} });
    try { await this.transport.close(); } catch {}
  }
}

/**
 * 手机原生 USB 连接入口。
 */
export async function openUsbSession(onDiagnose, onError) {
  const transport = createUsbTransport();
  const session = new PtpUsbSession(transport, { onDiagnose, onError });
  try {
    await session.open();
    return session;
  } catch (e) {
    if (onError) onError(e.message || String(e));
    await session.close().catch(() => {});
    throw e;
  }
}
