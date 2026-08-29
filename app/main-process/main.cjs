/**
 * Nikon Camera Control - Electron 主进程
 *
 * 支持两种连接方式：
 * 1. WiFi 无线 — PTP/IP over TCP (端口 15740)
 * 2. USB 有线   — PTP over USB (使用 libusb/node-usb)
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const net = require('net');

// 调试：检查 electron 模块
if (!app) {
  console.error('ERROR: electron.app is undefined!');
  console.error('electron exports:', Object.keys(require('electron')));
  process.exit(1);
}

// ─── 全局状态 ──────────────────────────────────────
let mainWindow = null;
let cameraSocket = null;      // TCP socket (WiFi)
let usbDevice = null;         // USB device (有线)
let connectionMode = null;    // 'wifi' | 'usb'
let sessionId = 0;
let transactionId = 0;
let pendingResolver = null;
let recvBuffer = Buffer.alloc(0);
let dataWaiters = [];

// ─── PTP/IP 协议编解码 ──────────────────────────────

/** 小端序写 uint32 */
function writeU32LE(buf, offset, value) {
  buf[offset] = value & 0xFF;
  buf[offset + 1] = (value >> 8) & 0xFF;
  buf[offset + 2] = (value >> 16) & 0xFF;
  buf[offset + 3] = (value >> 24) & 0xFF;
}

/** 小端序读 uint32 */
function readU32LE(data, offset) {
  return (data[offset] & 0xFF) | ((data[offset + 1] & 0xFF) << 8) |
         ((data[offset + 2] & 0xFF) << 16) | ((data[offset + 3] & 0xFF) << 24);
}

/** 大端序写 uint32 */
function writeU32BE(buf, offset, value) {
  buf[offset] = (value >> 24) & 0xFF;
  buf[offset + 1] = (value >> 16) & 0xFF;
  buf[offset + 2] = (value >> 8) & 0xFF;
  buf[offset + 3] = value & 0xFF;
}

/** 构建 PTP/IP 命令包 */
function buildPtpCmd(opCode, params = []) {
  // PTP 命令体 30 字节 (小端序)
  const ptpBuf = Buffer.alloc(30);
  let off = 0;

  // opCode (2 bytes LE)
  ptpBuf[off++] = opCode & 0xFF;
  ptpBuf[off++] = (opCode >> 8) & 0xFF;

  // sessionId (4 bytes LE)
  writeU32LE(ptpBuf, off, sessionId); off += 4;
  // transactionId (4 bytes LE)
  transactionId++;
  writeU32LE(ptpBuf, off, transactionId); off += 4;

  // params[0..4] (each 4 bytes LE)
  for (let i = 0; i < 5; i++) {
    writeU32LE(ptpBuf, off, params[i] || 0);
    off += 4;
  }

  // PTP/IP 头 (12 字节，大端序)
  const header = Buffer.alloc(12);
  writeU32BE(header, 0, 12 + ptpBuf.length); // payloadLength
  writeU32BE(header, 4, 1);                   // packetType=CMD_REQUEST

  return Buffer.concat([header, ptpBuf]);
}

/** 解析 PTP 响应 */
function parsePtpResp(data) {
  const off = 8; // 跳过 IP 头
  return {
    respCode: data[off] | (data[off + 1] << 8),
    sessionId: readU32LE(data, off + 2),
    transactionId: readU32LE(data, off + 6),
    params: [readU32LE(data, off + 10), readU32LE(data, off + 14),
             readU32LE(data, off + 18), readU32LE(data, off + 22), readU32LE(data, off + 26)],
  };
}

// ─── TCP 无线连接 ──────────────────────────────────

function wifiConnect(host, port) {
  return new Promise((resolve, reject) => {
    cameraSocket = new net.Socket();
    cameraSocket.setTimeout(8000);

    cameraSocket.connect(port, host, () => {
      connectionMode = 'wifi';
      sendToRenderer('connection:state', 'connected');

      // PTP/IP 协议握手
      const initCmd = Buffer.alloc(12);
      writeU32BE(initCmd, 0, 12);
      writeU32BE(initCmd, 4, 1); // CMD_REQUEST
      cameraSocket.write(initCmd);

      const initEvt = Buffer.alloc(12);
      writeU32BE(initEvt, 0, 12);
      writeU32BE(initEvt, 4, 3); // EVENT
      cameraSocket.write(initEvt);

      // 打开 PTP 会话
      setTimeout(async () => {
        try {
          const resp = await sendPtpCommand(0x1002, [1]); // OpenSession
          if (resp.respCode === 0x2001) {
            sessionId = resp.sessionId || 1;
            sendToRenderer('connection:state', 'session_open');
            sendToRenderer('camera:info', { model: 'Nikon Z30', connection: 'WiFi' });
            resolve(true);
          } else {
            reject(new Error(`OpenSession failed: 0x${resp.respCode.toString(16)}`));
          }
        } catch (err) {
          reject(err);
        }
      }, 300);

      resolve(true);
    });

    cameraSocket.on('data', (chunk) => {
      recvBuffer = Buffer.concat([recvBuffer, chunk]);

      // 检查待处理的数据请求
      while (dataWaiters.length > 0) {
        const w = dataWaiters[0];
        if (recvBuffer.length >= w.length) {
          const data = recvBuffer.subarray(0, w.length);
          recvBuffer = recvBuffer.subarray(w.length);
          dataWaiters.shift();
          w.resolve(data);
        } else {
          break;
        }
      }

      // 处理 PTP 事件
      if (recvBuffer.length >= 8) {
        const pktType = (recvBuffer[4] << 24) | (recvBuffer[5] << 16) | (recvBuffer[6] << 8) | recvBuffer[7];
        if (pktType === 2 && pendingResolver) { // CMD_RESPONSE
          const resolve = pendingResolver;
          pendingResolver = null;
          const resp = parsePtpResp(recvBuffer);
          recvBuffer = recvBuffer.subarray(0); // reset buffer
          resolve(resp);
        } else if (pktType === 3) { // EVENT
          const evt = parsePtpResp(recvBuffer);
          sendToRenderer('camera:event', { code: evt.respCode, params: evt.params });
          recvBuffer = recvBuffer.subarray(0);
        }
      }
    });

    cameraSocket.on('error', (err) => {
      sendToRenderer('connection:state', 'error');
      sendToRenderer('connection:error', err.message);
      reject(err);
    });

    cameraSocket.on('close', () => {
      connectionMode = null;
      cameraSocket = null;
      sessionId = 0;
      sendToRenderer('connection:state', 'disconnected');
    });

    cameraSocket.on('timeout', () => {
      reject(new Error('连接超时'));
    });
  });
}

function sendPtpCommand(opCode, params = []) {
  return new Promise((resolve, reject) => {
    if (!cameraSocket) return reject(new Error('未连接'));

    const packet = buildPtpCmd(opCode, params);
    cameraSocket.write(packet);

    const tid = transactionId;
    const timeout = setTimeout(() => {
      pendingResolver = null;
      reject(new Error(`命令超时 (op=0x${opCode.toString(16)})`));
    }, 10000);

    pendingResolver = (resp) => {
      clearTimeout(timeout);
      resolve(resp);
    };
  });
}

// ─── USB 有线连接 ──────────────────────────────────

async function usbConnect() {
  try {
    const usb = require('usb');
    const devices = usb.getDeviceList();

    // 查找 Nikon 相机 (VID=0x04B0)
    const nikonDev = devices.find(d =>
      d.deviceDescriptor.idVendor === 0x04B0 &&
      (d.deviceDescriptor.idProduct === 0x0444 || // Z30
       d.deviceDescriptor.idProduct === 0x0440 || // Z50
       d.deviceDescriptor.idProduct === 0x0445)   // Zfc
    );

    if (!nikonDev) {
      throw new Error('未检测到 Nikon Z30 USB 设备。请确保：\n1. 相机已开机\n2. USB 线已连接\n3. 相机 USB 模式设为 MTP/PTP');
    }

    nikonDev.open();
    const iface = nikonDev.interfaces[0];
    iface.claim();

    const inEp = iface.endpoints.find(ep => ep.direction === 'in');
    const outEp = iface.endpoints.find(ep => ep.direction === 'out');

    if (!inEp || !outEp) {
      throw new Error('无法找到 USB 端点');
    }

    usbDevice = { device: nikonDev, iface, inEp, outEp };
    connectionMode = 'usb';
    sendToRenderer('connection:state', 'connected');

    // USB PTP 初始化
    // TODO: USB PTP 有额外的封装层 (CMD/Data/Response 阶段)
    // 这里先通过标准 PTP 命令打开会话
    const resp = await sendUsbCommand(0x1002, [1]); // OpenSession
    if (resp && resp.respCode === 0x2001) {
      sessionId = resp.sessionId || 1;
      sendToRenderer('connection:state', 'session_open');
      sendToRenderer('camera:info', { model: 'Nikon Z30', connection: 'USB' });
    }

    return true;
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      throw new Error('USB 模块未安装。请运行: npm install usb');
    }
    throw err;
  }
}

function sendUsbCommand(opCode, params = []) {
  return new Promise((resolve, reject) => {
    if (!usbDevice) return reject(new Error('USB 未连接'));

    // USB PTP 命令需要通过 BULK OUT 发送
    // 这里构建标准 PTP 命令包（无 IP 封装层）
    const cmdBuf = Buffer.alloc(32);
    // USB PTP 容器格式:
    // [4B length] [2B type=1(cmd)] [2B opCode] [4B transId] [params...]
    const length = 12 + params.length * 4;
    writeU32LE(cmdBuf, 0, length);
    writeU32LE(cmdBuf, 4, 1); // type=Command
    cmdBuf[8] = opCode & 0xFF;
    cmdBuf[9] = (opCode >> 8) & 0xFF;
    writeU32LE(cmdBuf, 10, ++transactionId);

    params.forEach((p, i) => writeU32LE(cmdBuf, 12 + i * 4, p));

    usbDevice.outEp.transfer(cmdBuf, (err) => {
      if (err) return reject(err);
      // 读取响应
      usbDevice.inEp.transfer(1024, (err2, data) => {
        if (err2) return reject(err2);
        resolve(parsePtpResp(data));
      });
    });
  });
}

// ─── Electron 窗口 ────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 400, minHeight: 600,
    title: 'Nikon Camera Control',
    backgroundColor: '#030712',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 开发模式加载 Vite，生产模式加载打包文件
  const isDev = process.argv.includes('--dev');
  if (isDev) {
    mainWindow.loadURL('http://localhost:5174');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── IPC 处理 ─────────────────────────────────────

function setupIPC() {
  // 连接
  ipcMain.handle('connect:wifi', async (_, host, port) => {
    try {
      await wifiConnect(host, port || 15740);
      return { success: true, mode: 'wifi' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('connect:usb', async () => {
    try {
      await usbConnect();
      return { success: true, mode: 'usb' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('connect:disconnect', async () => {
    try {
      if (cameraSocket) { cameraSocket.destroy(); cameraSocket = null; }
      if (usbDevice) {
        usbDevice.iface.release(true, () => {});
        usbDevice.device.close();
        usbDevice = null;
      }
      connectionMode = null;
      sessionId = 0;
      sendToRenderer('connection:state', 'disconnected');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('connect:status', () => ({
    connected: !!connectionMode,
    mode: connectionMode,
    sessionId,
  }));

  // 扫描 WiFi 相机
  ipcMain.handle('camera:scan', async () => {
    // 尝试常见 Nikon IP
    const results = [];
    const ips = ['192.168.1.1', '192.168.0.1'];
    for (const ip of ips) {
      try {
        await new Promise((resolve, reject) => {
          const s = new net.Socket();
          s.setTimeout(1500);
          s.connect(15740, ip, () => { s.destroy(); resolve(true); });
          s.on('error', () => { s.destroy(); resolve(false); });
          s.on('timeout', () => { s.destroy(); resolve(false); });
        });
        results.push({ name: 'Nikon Z30', ip, port: 15740, source: 'mdns' });
      } catch {}
    }
    return results;
  });

  // 拍摄
  ipcMain.handle('camera:capture', async () => {
    try {
      const op = 0x9207; // Nikon InitiateCaptureRecInMedia
      const resp = connectionMode === 'wifi'
        ? await sendPtpCommand(op, [0xFFFFFFFF, 0])
        : await sendUsbCommand(op, [0xFFFFFFFF, 0]);
      return { success: resp && resp.respCode === 0x2001, objectIds: resp?.params || [] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 获取/设置参数
  ipcMain.handle('camera:getProp', async (_, propCode) => {
    try {
      const resp = connectionMode === 'wifi'
        ? await sendPtpCommand(0x1015, [propCode]) // GetDevicePropValue
        : await sendUsbCommand(0x1015, [propCode]);
      return { value: resp?.params?.[0] || 0 };
    } catch (err) {
      return { value: 0, error: err.message };
    }
  });

  ipcMain.handle('camera:setProp', async (_, propCode, value) => {
    try {
      const resp = connectionMode === 'wifi'
        ? await sendPtpCommand(0x1016, [propCode, value]) // SetDevicePropValue
        : await sendUsbCommand(0x1016, [propCode, value]);
      return { success: resp && resp.respCode === 0x2001 };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 实时取景
  ipcMain.handle('camera:startLiveView', async () => {
    try {
      // Nikon StartLiveView (0x9201)
      const resp = connectionMode === 'wifi'
        ? await sendPtpCommand(0x9201)
        : await sendUsbCommand(0x9201);
      return { success: resp && resp.respCode === 0x2001 };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('camera:stopLiveView', async () => {
    try {
      const resp = connectionMode === 'wifi'
        ? await sendPtpCommand(0x9202)
        : await sendUsbCommand(0x9202);
      return { success: true };
    } catch (err) {
      return { success: true };
    }
  });

  ipcMain.handle('camera:getLiveViewFrame', async () => {
    try {
      // Nikon GetLiveViewImg (0x9203)
      const resp = connectionMode === 'wifi'
        ? await sendPtpCommand(0x9203)
        : await sendUsbCommand(0x9203);
      if (resp && resp.params[0] > 0) {
        const size = resp.params[0];
        const data = await receiveData(size);
        return { frame: data.toString('base64'), size };
      }
      return { frame: null };
    } catch (err) {
      return { frame: null };
    }
  });

  // 自动对焦
  ipcMain.handle('camera:autoFocus', async () => {
    try {
      // Nikon AfDrive (0x9205)
      const resp = connectionMode === 'wifi'
        ? await sendPtpCommand(0x9205, [0x0001])
        : await sendUsbCommand(0x9205, [0x0001]);
      return { success: resp && resp.respCode === 0x2001 };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 触摸对焦
  ipcMain.handle('camera:touchFocus', async (_, x, y) => {
    try {
      const afX = Math.round(x * 10000);
      const afY = Math.round(y * 10000);
      const resp = connectionMode === 'wifi'
        ? await sendPtpCommand(0x9205, [0x0002, afX, afY])
        : await sendUsbCommand(0x9205, [0x0002, afX, afY]);
      return { success: true };
    } catch (err) {
      return { success: false };
    }
  });

  // 获取图像列表
  ipcMain.handle('camera:getImages', async () => {
    try {
      // 获取存储 ID
      const storageResp = connectionMode === 'wifi'
        ? await sendPtpCommand(0x1004)
        : await sendUsbCommand(0x1004);
      const storageId = storageResp?.params?.[0];

      if (!storageId) return [];

      // 获取对象句柄
      const handlesResp = connectionMode === 'wifi'
        ? await sendPtpCommand(0x1007, [storageId, 0, 0xFFFFFFFF])
        : await sendUsbCommand(0x1007, [storageId, 0, 0xFFFFFFFF]);

      return handlesResp?.params?.filter(p => p !== 0).map(h => ({
        handle: h, fileName: `DSC_${h}.NEF`, size: 0
      })) || [];
    } catch (err) {
      return [];
    }
  });

  // 下载图像
  ipcMain.handle('camera:downloadImage', async (_, handle) => {
    try {
      const resp = connectionMode === 'wifi'
        ? await sendPtpCommand(0x1009, [handle])
        : await sendUsbCommand(0x1009, [handle]);

      if (resp && resp.respCode === 0x2001) {
        const chunks = [];
        // 接收数据阶段...
        const data = Buffer.concat(chunks);
        return { data: data.toString('base64') };
      }
      return { data: null };
    } catch (err) {
      return { data: null, error: err.message };
    }
  });
}

function receiveData(size) {
  return new Promise((resolve, reject) => {
    if (recvBuffer.length >= size) {
      const data = recvBuffer.subarray(0, size);
      recvBuffer = recvBuffer.subarray(size);
      resolve(data);
    } else {
      dataWaiters.push({ length: size, resolve, reject });
      setTimeout(() => {
        const idx = dataWaiters.findIndex(w => w.resolve === resolve);
        if (idx >= 0) { dataWaiters.splice(idx, 1); reject(new Error('接收超时')); }
      }, 5000);
    }
  });
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// ─── 启动 ─────────────────────────────────────────

app.whenReady().then(() => {
  setupIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  if (cameraSocket) cameraSocket.destroy();
  if (usbDevice) {
    try { usbDevice.iface.release(true, () => {}); usbDevice.device.close(); } catch {}
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// 防止多实例
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
