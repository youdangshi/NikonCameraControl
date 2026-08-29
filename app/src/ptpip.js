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
const UsbPtp = registerPlugin('UsbPtp');

function createNativeTransport() {
  let dataCb = null;
  return {
    async connect(host, port) { await TcpSocket.connect({ host, port }); },
    async write(bytes) { await TcpSocket.write({ data: bytesToB64(bytes) }); },
    close() { TcpSocket.disconnect(); },
    onData(cb) {
      dataCb = cb;
      return TcpSocket.addListener('data', (d) => { if (dataCb) dataCb(b64ToBytes(d.data)); });
    },
    onState(cb) { return TcpSocket.addListener('state', cb); },
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
  let dataCb = null;
  return {
    async connect() { await UsbPtp.connect(); },
    async write(bytes) { await UsbPtp.write({ data: bytesToB64(bytes) }); },
    close() { UsbPtp.disconnect(); },
    onData(cb) {
      dataCb = cb;
      return UsbPtp.addListener('data', (d) => { if (dataCb) dataCb(b64ToBytes(d.data)); });
    },
    onState(cb) { return UsbPtp.addListener('state', cb); },
  };
}

// ─── PTP/IP 会话 ──────────────────────────────────────
export class PtpIpSession {
  /** @param {{onDiagnose?: (msg: string)=>void, onError?: (msg: string)=>void}} opts */
  constructor(transport, opts = {}) {
    this.transport = transport;
    this.buffer = new ByteBuffer();
    this.sessionId = 0;
    this.transactionId = 0;
    this.onDiagnose = opts.onDiagnose || (() => {});
    this._unsubs = [];
    this.closed = false;
  }

  _diag(msg) { this.onDiagnose(msg); try { console.log('[PTP/IP]', msg); } catch {} }
  _hex(buf) { return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join(''); }

  diagPacket(label, pkt) {
    this._diag(`${label}: type=${pkt.type} len=${pkt.length} hex=${this._hex(pkt.payload)}`);
  }

  sendPacket(type, payload) {
    payload = payload || new Uint8Array(0);
    const header = new Uint8Array(12);
    writeU32BE(header, 0, 12 + payload.length);
    writeU32BE(header, 4, type);
    const out = new Uint8Array(12 + payload.length);
    out.set(header, 0);
    out.set(payload, 12);
    return out;
  }

  async nextPacket() {
    const lenHdr = await this.buffer.readExact(4);
    const length = readU32BE(lenHdr, 0);
    if (length < 8) throw new Error('非法 PTP/IP 包长: ' + length);
    const rest = await this.buffer.readExact(length - 4);
    const type = readU32BE(rest, 0);
    const payload = rest.subarray(8); // 跳过 type(4) + reserved(4)
    return { length, type, payload };
  }

  buildPtpCmd(opCode, headerSessionId, tx, params) {
    const cmd = new Uint8Array(30);
    cmd[0] = opCode & 0xff; cmd[1] = (opCode >> 8) & 0xff;
    writeU32LE(cmd, 2, headerSessionId);
    writeU32LE(cmd, 6, tx);
    for (let i = 0; i < 5; i++) writeU32LE(cmd, 10 + i * 4, (params[i] || 0) >>> 0);
    return cmd;
  }

  /**
   * 发送一条 PTP 命令并等待响应。
   * @returns {{type:number,length:number,payload:Uint8Array,
   *   responseCode:number,sessionId:number,transactionId:number,params:number[]}}
   */
  async command(opCode, params = [], headerSessionId = this.sessionId) {
    const tx = ++this.transactionId;
    const cmd = this.buildPtpCmd(opCode, headerSessionId, tx, params);
    this._diag(`发送命令 0x${opCode.toString(16).padStart(4, '0')} tx=${tx}`);
    await this.transport.write(this.sendPacket(1, cmd));
    const pkt = await this.nextPacket();
    this.diagPacket('响应', pkt);
    if (pkt.payload.length < 10) throw new Error('响应过短: ' + pkt.payload.length);
    return {
      ...pkt,
      responseCode: pkt.payload[0] | (pkt.payload[1] << 8),
      sessionId: readU32LE(pkt.payload, 2),
      transactionId: readU32LE(pkt.payload, 6),
      params: [
        readU32LE(pkt.payload, 10), readU32LE(pkt.payload, 14),
        readU32LE(pkt.payload, 18), readU32LE(pkt.payload, 22),
        readU32LE(pkt.payload, 26),
      ],
    };
  }

  /** 从 Init Event ACK 里尽可能猜出相机下发的 sessionId */
  extractSessionId(payload) {
    if (!payload || payload.length < 4) return null;
    try { return readU32LE(payload, 0); } catch { return null; }
  }

  /**
   * 建立会话：TCP 连接 → Init Command → Init Event → OpenSession。
   * 成功后 this.sessionId 即当前会话号，可继续发命令。
   */
  async open(host, port) {
    this._unsubs.push(this.transport.onData(c => this.buffer.push(c)));
    this._diag(`连接 ${host}:${port} ...`);
    await this.transport.connect(host, port);
    this._diag('TCP 已连接，发送 Init Command Request');

    await this.transport.write(this.sendPacket(1)); // Init Command Request
    const ack1 = await this.nextPacket();
    this.diagPacket('Init Command ACK', ack1);

    this._diag('发送 Init Event Request');
    await this.transport.write(this.sendPacket(3)); // Init Event Request
    const ack2 = await this.nextPacket();
    this.diagPacket('Init Event ACK', ack2);

    const candidate = this.extractSessionId(ack2.payload) || 1;
    this._diag(`推测 sessionId = ${candidate}`);

    // OpenSession: header sessionId = 0，param1 = 会话号
    this.transactionId = 0;
    const resp = await this.command(0x1002, [candidate, 0, 0, 0, 0], 0);
    if (resp.responseCode === 0x2001) {
      this.sessionId = candidate;
      this._diag(`OpenSession 成功，sessionId=${this.sessionId}`);
    } else {
      this._diag(`OpenSession 返回 0x${resp.responseCode.toString(16)}`);
    }
    return resp;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this._unsubs.forEach(u => { try { u && u(); } catch {} });
    try { await this.transport.close(); } catch {}
  }
}

// ─── 常用命令便捷封装 ──────────────────────────────────
export async function openSession(host, port, onDiagnose, onError) {
  const transport = createTransport();
  const session = new PtpIpSession(transport, { onDiagnose, onError });
  try {
    await session.open(host, port);
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
    this.closed = false;
  }

  _diag(msg) { this.onDiagnose(msg); try { console.log('[PTP-USB]', msg); } catch {} }

  buildUsbCmd(opCode, params = []) {
    const buf = new Uint8Array(32);
    writeU32LE(buf, 0, 32);            // 包头长度
    writeU16LE(buf, 4, 1);             // 类型 = Command
    writeU16LE(buf, 6, opCode);        // 操作码
    writeU32LE(buf, 8, ++this.transactionId); // 事务 ID
    for (let i = 0; i < 5; i++) writeU32LE(buf, 12 + i * 4, (params[i] || 0) >>> 0);
    return buf;
  }

  async nextResponse() {
    const buf = await this.buffer.readExact(32);
    if (buf.length < 32) throw new Error('USB PTP 响应过短');
    const responseCode = readU16LE(buf, 6);
    const transactionId = readU32LE(buf, 8);
    return {
      type: readU16LE(buf, 4),
      responseCode,
      transactionId,
      params: [
        readU32LE(buf, 12), readU32LE(buf, 16), readU32LE(buf, 20),
        readU32LE(buf, 24), readU32LE(buf, 28),
      ],
    };
  }

  async command(opCode, params = []) {
    const cmd = this.buildUsbCmd(opCode, params);
    this._diag(`USB 命令 0x${opCode.toString(16).padStart(4, '0')} tx=${this.transactionId}`);
    await this.transport.write(cmd);
    const resp = await this.nextResponse();
    this._diag(`USB 响应 0x${resp.responseCode.toString(16)}`);
    return resp;
  }

  async open() {
    this._unsubs.push(this.transport.onData(c => this.buffer.push(c)));
    this._diag('打开 USB 设备...');
    await this.transport.connect();
    const resp = await this.command(0x1002, [1]); // OpenSession
    if (resp.responseCode !== 0x2001) {
      throw new Error(`USB OpenSession 返回 0x${resp.responseCode.toString(16)}`);
    }
    this._diag('USB 会话已打开');
    return resp;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this._unsubs.forEach(u => { try { u && u(); } catch {} });
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
