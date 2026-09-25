/**
 * Nikon Z-series capability catalog.
 *
 * The catalog separates "the camera answered PTP" from "this body and firmware
 * have actually been validated". Z30 is the only currently verified model, so
 * other bodies receive conservative limits until real hardware testing.
 */
export const NIKON_MODELS = Object.freeze({
  z30: Object.freeze({
    id: 'z30',
    label: 'Nikon Z 30',
    aliases: ['z 30', 'z30'],
    status: 'verified',
    liveViewMaxFps: 30,
    transports: Object.freeze({ usb: true, hotspot: true, staPc: true, staDevice: false }),
    notes: 'USB 与相机热点实时取景已真机验证；STA 智能设备模式仅传图。',
  }),
  z50: Object.freeze({
    id: 'z50',
    label: 'Nikon Z 50',
    aliases: ['z 50', 'z50'],
    status: 'experimental',
    liveViewMaxFps: 15,
    transports: Object.freeze({ usb: true, hotspot: true, staPc: true, staDevice: false }),
    notes: '共用 Nikon Z 系列厂商命令，参数范围和取景格式需要真机确认。',
  }),
  zfc: Object.freeze({
    id: 'zfc',
    label: 'Nikon Z fc',
    aliases: ['z fc', 'zfc'],
    status: 'experimental',
    liveViewMaxFps: 15,
    transports: Object.freeze({ usb: true, hotspot: true, staPc: true, staDevice: false }),
    notes: '共用 Z 系列命令；固件可能影响 ChangeApplicationMode 与属性枚举。',
  }),
  z6ii: Object.freeze({
    id: 'z6ii',
    label: 'Nikon Z 6II',
    aliases: ['z 6_2', 'z6ii', 'z 6 ii'],
    status: 'experimental',
    liveViewMaxFps: 15,
    transports: Object.freeze({ usb: true, hotspot: true, staPc: true, staDevice: false }),
    notes: '支持 Nikon 标准与扩展操作码；需要逐项验证双卡存储和对象句柄。',
  }),
  z7ii: Object.freeze({
    id: 'z7ii',
    label: 'Nikon Z 7II',
    aliases: ['z 7_2', 'z7ii', 'z 7 ii'],
    status: 'experimental',
    liveViewMaxFps: 15,
    transports: Object.freeze({ usb: true, hotspot: true, staPc: true, staDevice: false }),
    notes: 'Nikon PTP 扩展大体兼容，但高像素 JPEG 帧和双卡枚举需要单独测试。',
  }),
  z8: Object.freeze({
    id: 'z8',
    label: 'Nikon Z 8',
    aliases: ['z 8', 'z8'],
    status: 'experimental',
    liveViewMaxFps: 15,
    transports: Object.freeze({ usb: true, hotspot: true, staPc: true, staDevice: false }),
    notes: '可能提供 GetLiveViewImageEx 等扩展；未验证前仍使用标准 0x9203。',
  }),
  z9: Object.freeze({
    id: 'z9',
    label: 'Nikon Z 9',
    aliases: ['z 9', 'z9'],
    status: 'experimental',
    liveViewMaxFps: 15,
    transports: Object.freeze({ usb: true, hotspot: true, staPc: true, staDevice: false }),
    notes: 'libgphoto2 记录支持 GetLiveViewImageEx、追踪和扩展事件；未验证前不主动启用。',
  }),
  generic: Object.freeze({
    id: 'nikon-generic',
    label: 'Nikon Z 系列（未指定）',
    aliases: [],
    status: 'generic',
    liveViewMaxFps: 10,
    transports: Object.freeze({ usb: true, hotspot: true, staPc: true, staDevice: false }),
    notes: '仅使用已验证的 Nikon 基础操作码，不假设新机型支持扩展。',
  }),
});

function normalized(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function detectNikonModel(modelText) {
  const text = normalized(modelText);
  const model = Object.values(NIKON_MODELS).find(item =>
    item.aliases.some(alias => text.includes(alias))
  );
  return model || NIKON_MODELS.generic;
}

export function getNikonModelCatalog() {
  return Object.values(NIKON_MODELS);
}

/**
 * PTP DeviceInfo stores Unicode strings in PTP string format. Scanning for
 * printable UTF-16LE runs is intentionally defensive because vendor-extension
 * layout differs between Nikon bodies.
 */
export function extractPtpStrings(payload) {
  if (!payload || payload.length < 2) return [];
  const strings = [];
  let current = '';
  for (let offset = 0; offset + 1 < payload.length; offset += 2) {
    const code = payload[offset] | (payload[offset + 1] << 8);
    const printable = code === 0
      ? false
      : (code >= 0x20 && code <= 0x7e) || (code >= 0x4e00 && code <= 0x9fff);
    if (printable) {
      current += String.fromCharCode(code);
    } else {
      if (current.length >= 2) strings.push(current);
      current = '';
    }
  }
  if (current.length >= 2) strings.push(current);
  return strings;
}
