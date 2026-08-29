/**
 * Nikon Camera Control - Node.js 后端服务器
 *
 * 主连接：PTP/IP over WiFi 无线遥控（相机热点 192.168.1.1:15740）。
 * 备选：USB 有线控制；WiFi 图片传输为补充功能。
 *
 * 功能：
 * 1. PTP over USB — 与 Nikon Z30 有线通信（需要WinUSB驱动）
 * 2. HTTP/FTP 照片接收 — WiFi 接收相机推送的照片
 * 3. WebSocket 服务 — 与浏览器 UI 实时通信
 * 4. HTTP REST API — 供 CLI 工具调用
 *
 * 启动: node server.cjs
 * 端口: 19570 (HTTP API) + 19571 (WebSocket)
 */

const net = require('net');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');

// ─── 配置 ──────────────────────────────────────────
const HTTP_PORT = 19570;
const WS_PORT = 19571;
const PTP_PORT = 15740;

// ─── 全局状态 ──────────────────────────────────────
let cameraSocket = null;
let connectionMode = null;
let sessionId = 0;
let transactionId = 0;
let pendingResolver = null;
let recvBuffer = Buffer.alloc(0);
let dataWaiters = [];
let wsClients = new Set();

// ─── PTP/IP 协议 ───────────────────────────────────

function writeU32LE(buf, offset, value) {
  buf[offset] = value & 0xFF;
  buf[offset+1] = (value>>8) & 0xFF;
  buf[offset+2] = (value>>16) & 0xFF;
  buf[offset+3] = (value>>24) & 0xFF;
}

function readU32LE(data, offset) {
  return (data[offset]&0xFF) | ((data[offset+1]&0xFF)<<8) | ((data[offset+2]&0xFF)<<16) | ((data[offset+3]&0xFF)<<24);
}

function writeU32BE(buf, offset, value) {
  buf[offset] = (value>>24)&0xFF;
  buf[offset+1] = (value>>16)&0xFF;
  buf[offset+2] = (value>>8)&0xFF;
  buf[offset+3] = value&0xFF;
}

function readU32BE(data, offset) {
  return ((data[offset]&0xFF)<<24) | ((data[offset+1]&0xFF)<<16) | ((data[offset+2]&0xFF)<<8) | (data[offset+3]&0xFF);
}

function buildPtpCmd(opCode, params = []) {
  const ptpBuf = Buffer.alloc(30);
  let off = 0;
  ptpBuf[off++] = opCode & 0xFF;
  ptpBuf[off++] = (opCode>>8) & 0xFF;
  writeU32LE(ptpBuf, off, sessionId); off+=4;
  transactionId++;
  writeU32LE(ptpBuf, off, transactionId); off+=4;
  for (let i = 0; i < 5; i++) {
    writeU32LE(ptpBuf, off, params[i]||0);
    off+=4;
  }
  const header = Buffer.alloc(12);
  writeU32BE(header, 0, 12+ptpBuf.length);
  writeU32BE(header, 4, 1);
  return Buffer.concat([header, ptpBuf]);
}

function parsePtpResp(data) {
  const off = 8;
  return {
    respCode: data[off]|(data[off+1]<<8),
    sessionId: readU32LE(data, off+2),
    transactionId: readU32LE(data, off+6),
    params: [readU32LE(data,off+10),readU32LE(data,off+14),readU32LE(data,off+18),readU32LE(data,off+22),readU32LE(data,off+26)]
  };
}

// ─── 广播消息 ──────────────────────────────────────

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  wsClients.forEach(ws => {
    try { if (ws.readyState === 1) ws.send(msg); } catch {}
  });
}

// ─── WiFi 无线连接 ─────────────────────────────────

function wifiConnect(host, port) {
  return new Promise((resolve, reject) => {
    broadcast('status', { state: 'connecting', mode: 'wifi', host, port });

    cameraSocket = new net.Socket();
    cameraSocket.setTimeout(8000);

    cameraSocket.connect(port, host, () => {
      connectionMode = 'wifi';

      // PTP/IP 握手
      const initCmd = Buffer.alloc(12);
      writeU32BE(initCmd, 0, 12); writeU32BE(initCmd, 4, 1);
      cameraSocket.write(initCmd);
      const initEvt = Buffer.alloc(12);
      writeU32BE(initEvt, 0, 12); writeU32BE(initEvt, 4, 3);
      cameraSocket.write(initEvt);

      setTimeout(async () => {
        try {
          const resp = await sendPtpCmd(0x1002, [1]); // OpenSession
          if (resp && resp.respCode === 0x2001) {
            sessionId = resp.sessionId || 1;
            connectionMode = 'wifi';
            broadcast('status', { state: 'session_open', mode: 'wifi', host, port });
            broadcast('camera_info', { model: 'Nikon Z30', connection: 'WiFi', ip: host });
            resolve(true);
          } else {
            broadcast('error', 'OpenSession 失败: 相机可能不支持此命令');
            reject(new Error('OpenSession failed'));
          }
        } catch (err) { reject(err); }
      }, 300);
    });

    cameraSocket.on('data', (chunk) => {
      recvBuffer = Buffer.concat([recvBuffer, chunk]);
      while (dataWaiters.length > 0) {
        const w = dataWaiters[0];
        if (recvBuffer.length >= w.length) {
          const data = recvBuffer.subarray(0, w.length);
          recvBuffer = recvBuffer.subarray(w.length);
          dataWaiters.shift();
          w.resolve(data);
        } else break;
      }

      if (recvBuffer.length >= 8) {
        const pktType = readU32BE(recvBuffer, 4);
        if (pktType === 2 && pendingResolver) {
          const resolve = pendingResolver;
          pendingResolver = null;
          resolve(parsePtpResp(recvBuffer));
          recvBuffer = Buffer.alloc(0);
        } else if (pktType === 3) {
          const evt = parsePtpResp(recvBuffer);
          broadcast('camera_event', { code: evt.respCode, params: evt.params });
          recvBuffer = Buffer.alloc(0);
        }
      }
    });

    cameraSocket.on('error', (err) => {
      broadcast('status', { state: 'error', error: err.message });
      reject(err);
    });

    cameraSocket.on('close', () => {
      connectionMode = null; cameraSocket = null; sessionId = 0;
      broadcast('status', { state: 'disconnected' });
    });

    cameraSocket.on('timeout', () => reject(new Error('连接超时')));
  });
}

function sendPtpCmd(opCode, params = []) {
  return new Promise((resolve, reject) => {
    if (!cameraSocket) return reject(new Error('未连接'));
    const packet = buildPtpCmd(opCode, params);
    cameraSocket.write(packet);
    const timeout = setTimeout(() => {
      pendingResolver = null;
      reject(new Error(`命令超时 (0x${opCode.toString(16)})`));
    }, 10000);
    pendingResolver = (resp) => {
      clearTimeout(timeout);
      resolve(resp);
    };
  });
}

// ─── USB 有线连接 ─────────────────────────────────

function usbConnect() {
  return new Promise((resolve, reject) => {
    try {
      const usb = require('usb');
      const devices = usb.getDeviceList();
      broadcast('status', { state: 'connecting', mode: 'usb', devicesFound: devices.length });

      const nikonDev = devices.find(d =>
        d.deviceDescriptor.idVendor === 0x04B0 &&
        true // 接受所有 Nikon 设备 (Z30=0x0452, Z50=0x0440, Zfc=0x0445, Z6/Z7等)
      );

      if (!nikonDev) {
        const devList = devices.map(d => ({
          vendor: '0x' + d.deviceDescriptor.idVendor.toString(16),
          product: '0x' + d.deviceDescriptor.idProduct.toString(16)
        }));
        broadcast('usb_devices', devList);
        reject(new Error('未检测到 Nikon 相机。\n请确认：\n1. 相机已开机\n2. USB 线已连接\n3. 相机 USB 模式设为 MTP/PTP'));
        return;
      }

      nikonDev.open();

      // Windows: MTP 驱动可能占用了设备，需要先用 Zadig 替换驱动
      const iface = nikonDev.interfaces[0];
      try {
        iface.claim();
      } catch (claimErr) {
        nikonDev.close();
        if (claimErr.message && claimErr.message.includes('ACCESS')) {
          reject(new Error(
            '无法访问相机 USB（驱动被占用）。\n\n' +
            '解决方法：\n' +
            '1. 下载 Zadig: https://zadig.akeo.ie/\n' +
            '2. 打开 Zadig → Options → List All Devices\n' +
            '3. 选择 Nikon 相机\n' +
            '4. 替换驱动为 WinUSB\n' +
            '5. 重新插拔 USB 后重试\n\n' +
            '临时方案：使用 WiFi 无线连接！'
          ));
        } else {
          reject(new Error('USB 接口声明失败: ' + claimErr.message));
        }
        return;
      }
      const inEp = iface.endpoints.find(ep => ep.direction === 'in');
      const outEp = iface.endpoints.find(ep => ep.direction === 'out');

      if (!inEp || !outEp) {
        reject(new Error('无法找到 USB 端点'));
        return;
      }

      // 保存 USB 设备引用
      global.usbDevice = { device: nikonDev, iface, inEp, outEp };
      connectionMode = 'usb';
      broadcast('status', { state: 'connected', mode: 'usb' });

      // 发送 OpenSession
      setTimeout(async () => {
        try {
          const cmdBuf = Buffer.alloc(32);
          writeU32LE(cmdBuf, 0, 12 + 4); // length
          writeU32LE(cmdBuf, 4, 1);      // type=Command
          cmdBuf[8] = 0x02; cmdBuf[9] = 0x10; // OpenSession 0x1002
          writeU32LE(cmdBuf, 10, ++transactionId);
          writeU32LE(cmdBuf, 14, 1); // param1=1

          outEp.transfer(cmdBuf, (err) => {
            if (err) { reject(err); return; }
            inEp.transfer(1024, (err2, data) => {
              if (err2) { reject(err2); return; }
              const resp = parsePtpResp(data);
              if (resp && resp.respCode === 0x2001) {
                sessionId = 1;
                broadcast('status', { state: 'session_open', mode: 'usb' });
                broadcast('camera_info', { model: 'Nikon Z30', connection: 'USB' });
                resolve(true);
              } else {
                reject(new Error('USB OpenSession failed'));
              }
            });
          });
        } catch (err) { reject(err); }
      }, 300);
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        reject(new Error('USB 模块未安装。请运行: npm install usb'));
      } else {
        reject(err);
      }
    }
  });
}

// ─── HTTP API ──────────────────────────────────────

// ─── 静态文件服务 ──────────────────────────────────

const DIST_DIR = path.join(__dirname, 'dist');
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const fullPath = path.join(DIST_DIR, filePath);

  // SPA fallback: non-API, non-file paths -> index.html
  const ext = path.extname(fullPath);
  if (!ext || !MIME[ext]) {
    filePath = '/index.html';
  }

  const finalPath = path.join(DIST_DIR, filePath);
  if (fs.existsSync(finalPath) && fs.statSync(finalPath).isFile()) {
    const ext2 = path.extname(finalPath);
    res.writeHead(200, {
      'Content-Type': MIME[ext2] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(fs.readFileSync(finalPath));
    return true;
  }
  return false;
}

function handleHTTP(req, res) {
  // 先尝试静态文件
  if (req.method === 'GET' && !req.url.startsWith('/api/')) {
    if (serveStatic(req, res)) return;
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    let json = {};
    try { json = JSON.parse(body); } catch {}

    const url = req.url;
    const method = req.method;

    try {
      let result = {};

      if (url === '/api/connect/wifi' && method === 'POST') {
        result = { success: await wifiConnect(json.host||'192.168.1.1', json.port||15740) };
      } else if (url === '/api/connect/usb' && method === 'POST') {
        result = { success: await usbConnect() };
      } else if (url === '/api/disconnect' && method === 'POST') {
        if (cameraSocket) { cameraSocket.destroy(); cameraSocket = null; }
        if (global.usbDevice) {
          try { global.usbDevice.iface.release(true, ()=>{}); global.usbDevice.device.close(); } catch {}
          global.usbDevice = null;
        }
        connectionMode = null; sessionId = 0;
        broadcast('status', { state: 'disconnected' });
        result = { success: true };
      } else if (url === '/api/status' && method === 'GET') {
        result = { connected: !!connectionMode, mode: connectionMode, sessionId };
      } else if (url === '/api/scan' && method === 'GET') {
        result = await scanNetwork();
      } else if (url === '/api/capture' && method === 'POST') {
        const op = 0x9207;
        const resp = connectionMode === 'wifi'
          ? await sendPtpCmd(op, [0xFFFFFFFF, 0])
          : await sendUsbCmd(op, [0xFFFFFFFF, 0]);
        result = { success: resp && resp.respCode === 0x2001 };
        broadcast('captured', { success: result.success, time: Date.now() });
      } else if (url === '/api/prop/get' && method === 'POST') {
        const resp = connectionMode === 'wifi'
          ? await sendPtpCmd(0x1015, [json.propCode])
          : await sendUsbCmd(0x1015, [json.propCode]);
        result = { value: resp?.params?.[0] || 0 };
      } else if (url === '/api/prop/set' && method === 'POST') {
        const resp = connectionMode === 'wifi'
          ? await sendPtpCmd(0x1016, [json.propCode, json.value])
          : await sendUsbCmd(0x1016, [json.propCode, json.value]);
        result = { success: resp && resp.respCode === 0x2001 };
      } else if (url === '/api/liveview/start' && method === 'POST') {
        const resp = connectionMode === 'wifi'
          ? await sendPtpCmd(0x9201)
          : await sendUsbCmd(0x9201);
        result = { success: true };
        broadcast('liveview', { running: true });
      } else if (url === '/api/liveview/stop' && method === 'POST') {
        try { await sendPtpCmd(0x9202); } catch {}
        result = { success: true };
        broadcast('liveview', { running: false });
      } else if (url === '/api/liveview/frame' && method === 'GET') {
        try {
          const resp = connectionMode === 'wifi'
            ? await sendPtpCmd(0x9203)
            : await sendUsbCmd(0x9203);
          if (resp && resp.params[0] > 0) {
            const data = await receiveData(resp.params[0]);
            result = { frame: data.toString('base64'), size: resp.params[0] };
          } else { result = { frame: null }; }
        } catch { result = { frame: null }; }
      } else if (url === '/api/autofocus' && method === 'POST') {
        const resp = connectionMode === 'wifi'
          ? await sendPtpCmd(0x9205, [0x0001])
          : await sendUsbCmd(0x9205, [0x0001]);
        result = { success: true };
      } else if (url === '/api/images' && method === 'GET') {
        try {
          const resp = connectionMode === 'wifi'
            ? await sendPtpCmd(0x1004)
            : await sendUsbCmd(0x1004);
          const sid = resp?.params?.[0];
          if (sid) {
            const hResp = connectionMode === 'wifi'
              ? await sendPtpCmd(0x1007, [sid, 0, 0xFFFFFFFF])
              : await sendUsbCmd(0x1007, [sid, 0, 0xFFFFFFFF]);
            result = (hResp?.params || []).filter(p => p).map(h => ({
              handle: h, fileName: `DSC_${h}.NEF`, size: 0
            }));
          } else { result = []; }
        } catch { result = []; }
      } else if (url === '/api/health') {
        result = { status: 'ok', connected: !!connectionMode, mode: connectionMode };
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

function sendUsbCmd(opCode, params = []) {
  return new Promise((resolve, reject) => {
    if (!global.usbDevice) return reject(new Error('USB 未连接'));
    const cmdBuf = Buffer.alloc(32);
    writeU32LE(cmdBuf, 0, 12 + Math.max(params.length, 1) * 4);
    writeU32LE(cmdBuf, 4, 1);
    cmdBuf[8] = opCode & 0xFF;
    cmdBuf[9] = (opCode>>8) & 0xFF;
    writeU32LE(cmdBuf, 10, ++transactionId);
    params.forEach((p, i) => writeU32LE(cmdBuf, 12 + i*4, p));
    global.usbDevice.outEp.transfer(cmdBuf, (err) => {
      if (err) return reject(err);
      global.usbDevice.inEp.transfer(1024, (err2, data) => {
        if (err2) return reject(err2);
        resolve(parsePtpResp(data));
      });
    });
  });
}

function receiveData(size) {
  return new Promise((resolve, reject) => {
    if (recvBuffer.length >= size) {
      resolve(recvBuffer.subarray(0, size));
      recvBuffer = recvBuffer.subarray(size);
    } else {
      dataWaiters.push({ length: size, resolve, reject });
      setTimeout(() => {
        const i = dataWaiters.findIndex(w => w.resolve===resolve);
        if (i>=0) { dataWaiters.splice(i,1); reject(new Error('接收超时')); }
      }, 5000);
    }
  });
}

async function scanNetwork() {
  // 扫描常见 Nikon 相机 IP 范围
  const candidates = [];
  for (let i = 1; i <= 5; i++) {
    candidates.push(`192.168.1.${i}`);
    candidates.push(`192.168.0.${i}`);
  }

  const results = [];

  for (const ip of candidates) {
    try {
      const reachable = await new Promise((resolve) => {
        const s = new net.Socket();
        s.setTimeout(800);
        s.connect(15740, ip, () => { s.destroy(); resolve(true); });
        s.on('error', () => { s.destroy(); resolve(false); });
        s.on('timeout', () => { s.destroy(); resolve(false); });
      });

      if (!reachable) continue;

      // TCP 通了，进一步验证是否是 Nikon 相机：发送 PTP/IP Init Command
      const isCamera = await new Promise((resolve) => {
        try {
          const s = new net.Socket();
          s.setTimeout(2000);
          let buf = Buffer.alloc(0);

          s.connect(15740, ip, () => {
            // 发送 PTP/IP Init Command Request
            const init = Buffer.alloc(12);
            writeU32BE(init, 0, 12);
            writeU32BE(init, 4, 1); // CMD_REQUEST
            s.write(init);
          });

          s.on('data', (chunk) => {
            buf = Buffer.concat([buf, chunk]);
            if (buf.length >= 8) {
              const pktType = readU32BE(buf, 4);
              // 1=CMD_REQ, 2=CMD_RESP, 3=EVENT => 说明支持 PTP/IP
              if (pktType >= 1 && pktType <= 9) {
                s.destroy();
                resolve(true);
              }
            }
          });

          s.on('error', () => { s.destroy(); resolve(false); });
          s.on('timeout', () => { s.destroy(); resolve(false); });
          setTimeout(() => { s.destroy(); resolve(false); }, 2500);
        } catch { resolve(false); }
      });

      if (isCamera) {
        results.push({ name: 'Nikon Camera', ip, port: 15740, source: 'ptpip' });
      }
    } catch {}
  }

  return results;
}

// ─── 启动服务器（单端口：HTTP API + 静态文件 + WebSocket）───

const httpServer = http.createServer(handleHTTP);

// WebSocket 挂载到同一个 HTTP 服务器
const { WebSocketServer: WSS } = require('ws');
const wsServer = new WSS({ server: httpServer });

wsServer.on('connection', (ws) => {
  wsClients.add(ws);
  console.log('🔗 客户端已连接 (共 ' + wsClients.size + ' 个)');

  ws.send(JSON.stringify({
    type: 'welcome',
    data: { message: 'Nikon Camera Control', version: '1.0.0', mode: connectionMode }
  }));

  ws.on('close', () => { wsClients.delete(ws); });
  ws.on('error', () => { wsClients.delete(ws); });
});

const PORT = process.env.PORT || 19570;
httpServer.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   📷 Nikon Camera Control v1.0          ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║   🌐 在浏览器中打开:                     ║');
  console.log('║   本机: http://localhost:' + PORT + '           ║');

  // 列出所有局域网 IP
  Object.values(ifaces).forEach(iface => {
    iface.forEach(addr => {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log('║   手机: http://' + addr.address + ':' + PORT + '     ║');
      }
    });
  });

  console.log('║                                          ║');
  console.log('║   📶 WiFi: 先连相机热点再点\"WiFi连接\"     ║');
  console.log('║   🔌 USB:  插线→相机设MTP/PTP→点\"USB\"   ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});
