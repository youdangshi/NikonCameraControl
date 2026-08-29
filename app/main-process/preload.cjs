/**
 * Electron Preload — 安全 IPC 桥
 *
 * 向渲染进程暴露相机控制和连接 API
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nikonCamera', {
  // ── 连接（WiFi + USB） ──
  connectWifi: (host, port) => ipcRenderer.invoke('connect:wifi', host, port),
  connectUsb: () => ipcRenderer.invoke('connect:usb'),
  disconnect: () => ipcRenderer.invoke('connect:disconnect'),
  getStatus: () => ipcRenderer.invoke('connect:status'),

  // ── 扫描 ──
  scan: () => ipcRenderer.invoke('camera:scan'),

  // ── 拍摄 ──
  capture: () => ipcRenderer.invoke('camera:capture'),

  // ── 参数 ──
  getProp: (propCode) => ipcRenderer.invoke('camera:getProp', propCode),
  setProp: (propCode, value) => ipcRenderer.invoke('camera:setProp', propCode, value),

  // ── 实时取景 ──
  startLiveView: () => ipcRenderer.invoke('camera:startLiveView'),
  stopLiveView: () => ipcRenderer.invoke('camera:stopLiveView'),
  getLiveViewFrame: () => ipcRenderer.invoke('camera:getLiveViewFrame'),

  // ── 对焦 ──
  autoFocus: () => ipcRenderer.invoke('camera:autoFocus'),
  touchFocus: (x, y) => ipcRenderer.invoke('camera:touchFocus', x, y),

  // ── 图像 ──
  getImages: () => ipcRenderer.invoke('camera:getImages'),
  downloadImage: (handle) => ipcRenderer.invoke('camera:downloadImage', handle),

  // ── 事件监听 ──
  on: (channel, callback) => {
    const validChannels = [
      'connection:state', 'connection:error',
      'camera:info', 'camera:event',
    ];
    if (validChannels.includes(channel)) {
      const listener = (_, data) => callback(data);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    }
    return () => {};
  },
});

contextBridge.exposeInMainWorld('nikonApp', {
  platform: process.platform,
  quit: () => ipcRenderer.send('app:quit'),
});
