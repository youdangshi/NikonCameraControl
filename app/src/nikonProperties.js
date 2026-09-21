/**
 * Nikon Z30 PTP property codes and value conversions.
 *
 * The value tables below follow the property summaries published by
 * libgphoto2 for the Nikon Z30. Keep protocol-level values separate from the
 * labels shown in the UI so a label can never be written to the camera.
 */

export const PTP_PROP = Object.freeze({
  WhiteBalance: 0x5005,
  FNumber: 0x5007,
  FocusMode: 0x500A,
  ExposureMeteringMode: 0x500B,
  ExposureTime: 0x500D,
  ExposureProgramMode: 0x500E,
  ExposureIndex: 0x500F,
  ExposureBiasCompensation: 0x5010,
  StillCaptureMode: 0x5013,
  NikonRecordingMedia: 0xD10B,
  NikonLiveViewSelector: 0xD1A6,
  NikonApplicationMode: 0xD1F0,
});

export const PTP_PROP_NAMES = Object.freeze({
  [PTP_PROP.WhiteBalance]: '白平衡',
  [PTP_PROP.FNumber]: '光圈',
  [PTP_PROP.FocusMode]: '对焦模式',
  [PTP_PROP.ExposureMeteringMode]: '测光模式',
  [PTP_PROP.ExposureTime]: '快门速度',
  [PTP_PROP.ExposureProgramMode]: '曝光模式',
  [PTP_PROP.ExposureIndex]: 'ISO',
  [PTP_PROP.ExposureBiasCompensation]: '曝光补偿',
  [PTP_PROP.StillCaptureMode]: '驱动模式',
  [PTP_PROP.NikonRecordingMedia]: '记录介质',
  [PTP_PROP.NikonLiveViewSelector]: '实时取景选择器',
  [PTP_PROP.NikonApplicationMode]: '应用模式',
});

export function ptpPropertyLabel(propCode) {
  const code = Number(propCode);
  return PTP_PROP_NAMES[code] || `相机属性 0x${code.toString(16).padStart(4, '0').toUpperCase()}`;
}

export const EXPOSURE_PROGRAM_CODES = Object.freeze({
  M: 1,
  P: 2,
  A: 3,
  S: 4,
  AUTO: 32784,
  U1: 32848,
  U2: 32849,
  U3: 32850,
});

export const EXPOSURE_PROGRAM_LABELS = Object.freeze({
  1: 'M',
  2: 'P',
  3: 'A',
  4: 'S',
  5: 'P',
  32784: 'AUTO',
  32848: 'U1',
  32849: 'U2',
  32850: 'U3',
});

export const WHITE_BALANCE_CODES = Object.freeze({
  AUTO: 2,
  INCANDESCENT: 4,
  FLUORESCENT: 5,
  DIRECT_SUNLIGHT: 6,
  FLASH: 7,
  CLOUDY: 32784,
  SHADE: 32785,
  COLOR_TEMP: 32786,
  PRESET: 32787,
  AUTO_NATURAL: 32790,
});

export const METERING_CODES = Object.freeze({
  CENTER_WEIGHTED: 2,
  MATRIX: 3,
  SPOT: 4,
  HIGHLIGHT_WEIGHTED: 32784,
});

export const FOCUS_MODE_CODES = Object.freeze({
  MF: 1,
  'AF-S': 32784,
  'AF-C': 32785,
  'AF-A': 32786,
});

export const DRIVE_MODE_CODES = Object.freeze({
  S: 1,
  CH: 2,
  CL: 32784,
  Q: 32785,
  TIMER: 32793,
});

// Z30 reports these values as UINT16.
const UINT16_PROPS = new Set([
  PTP_PROP.WhiteBalance,
  PTP_PROP.FNumber,
  PTP_PROP.FocusMode,
  PTP_PROP.ExposureMeteringMode,
  PTP_PROP.ExposureProgramMode,
  PTP_PROP.ExposureIndex,
  PTP_PROP.StillCaptureMode,
]);

const UINT8_PROPS = new Set([
  PTP_PROP.NikonRecordingMedia,
  PTP_PROP.NikonLiveViewSelector,
  PTP_PROP.NikonApplicationMode,
]);

function toUnsigned(value, bits) {
  const max = 2 ** bits;
  return ((Number(value) % max) + max) % max;
}

function writeLittleEndian(value, byteLength) {
  const out = new Uint8Array(byteLength);
  const unsigned = toUnsigned(value, byteLength * 8);
  for (let i = 0; i < byteLength; i++) out[i] = (unsigned >>> (i * 8)) & 0xff;
  return out;
}

export function encodePropValue(propCode, value) {
  if (propCode === PTP_PROP.ExposureBiasCompensation) {
    return writeLittleEndian(Math.round(value), 2);
  }
  if (UINT8_PROPS.has(propCode)) {
    return writeLittleEndian(Math.round(value), 1);
  }
  if (UINT16_PROPS.has(propCode)) {
    return writeLittleEndian(Math.round(value), 2);
  }
  return writeLittleEndian(Math.round(value), 4);
}

function readU16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32LE(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

export function decodePropValue(payload, propCode) {
  if (!payload || payload.length === 0) return 0;
  if (propCode === PTP_PROP.ExposureBiasCompensation && payload.length >= 2) {
    const value = readU16LE(payload, 0);
    return value >= 0x8000 ? value - 0x10000 : value;
  }
  if (UINT16_PROPS.has(propCode) && payload.length >= 2) return readU16LE(payload, 0);
  return payload.length >= 4 ? readU32LE(payload, 0) : payload[0];
}

export function shutterLabelToMicros(label) {
  const text = String(label || '').trim();
  const fraction = text.match(/^1\/(\d+(?:\.\d+)?)$/);
  if (fraction) return Math.max(1, Math.round(1_000_000 / Number(fraction[1])));
  const seconds = text.match(/^(\d+(?:\.\d+)?)"$/);
  if (seconds) return Math.round(Number(seconds[1]) * 1_000_000);
  throw new Error(`Unsupported shutter label: ${text}`);
}

export function apertureLabelToHundredths(label) {
  const text = String(label || '').trim().replace(/^F/i, '');
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Unsupported aperture label: ${label}`);
  return Math.round(value * 100);
}

export function exposureCompensationToMilliEv(stops) {
  return Math.round(Number(stops) * 1000);
}

export function exposureProgramLabel(value) {
  return EXPOSURE_PROGRAM_LABELS[Number(value)] || `0x${Number(value).toString(16).toUpperCase()}`;
}

export function exposureTimeMicrosToLabel(value) {
  const micros = Number(value) >>> 0;
  if (micros === 0xFFFFFFFF) return 'Bulb';
  if (micros <= 0) return '--';
  if (micros >= 1_000_000) {
    const seconds = micros / 1_000_000;
    return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)}"`;
  }
  const denominator = 1_000_000 / micros;
  return `1/${denominator >= 10 ? Math.round(denominator) : denominator.toFixed(1).replace(/\.0$/, '')}`;
}

export function fNumberLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '--';
  const f = number / 100;
  return `F${Number.isInteger(f) ? f.toFixed(0) : f.toFixed(1)}`;
}

export function reverseEnumCode(table, key) {
  const value = table?.[key];
  return typeof value === 'number' ? value : null;
}
